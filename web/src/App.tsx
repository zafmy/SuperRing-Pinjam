import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Observation, ObservationRequest, Participant, Requirement, RespondToTaskInput,
  SessionEvent, SessionView, Task,
} from '../../shared/contracts';
import { api, ApiError } from './api';
import { AutomationPanel } from './AutomationPanel';
import { NotificationCenter, removeDevicePush } from './NotificationCenter';
import { localizePage, readLanguage, saveLanguage, type Language } from './i18n';

type Role = 'host' | 'participant';

type SavedSession = {
  code: string;
  token: string;
  role: Role;
  participantId?: string;
};

type Screen = 'home' | 'host' | 'join' | 'session';

const savedSessionsKey = 'pinjam.saved-sessions.v1';
const activeSessionKey = 'pinjam.active-session.v1';
const maxImageBytes = 5 * 1024 * 1024;
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

function newIdempotencyKey() {
  // getRandomValues also works on a phone using the laptop's HTTP LAN address.
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function newRequirement(label = '', quantity = 1): Requirement {
  return { id: `requirement-${newIdempotencyKey().slice(0, 12)}`, label, quantity };
}

function pendingAgentStepKey(code: string) {
  return `pinjam.pending-agent-step.v1:host:${code.toLowerCase()}`;
}

function readPendingAgentStep(code: string) {
  try {
    return window.sessionStorage.getItem(pendingAgentStepKey(code));
  } catch {
    return null;
  }
}

function savePendingAgentStep(code: string, key: string) {
  try {
    window.sessionStorage.setItem(pendingAgentStepKey(code), key);
  } catch {
    // The in-memory click still completes; persistence only protects an uncertain retry after reload.
  }
}

function clearPendingAgentStep(code: string) {
  try {
    window.sessionStorage.removeItem(pendingAgentStepKey(code));
  } catch {
    // Nothing further is required when session storage is unavailable.
  }
}

function invitedCode() {
  const match = window.location.pathname.match(/^\/join\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]).trim() : null;
}

function isSavedSession(value: unknown): value is SavedSession {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value && typeof value.code === 'string' &&
    'token' in value && typeof value.token === 'string' &&
    'role' in value && (value.role === 'host' || value.role === 'participant')
  );
}

function sessionKey(role: Role, code: string) {
  return `${role}:${code.toLowerCase()}`;
}

function readSavedSessions(): Record<string, SavedSession> {
  try {
    const raw = window.localStorage.getItem(savedSessionsKey);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      return Object.fromEntries(
        Object.entries(parsed).filter(([, value]) => isSavedSession(value)),
      );
    }
  } catch {
    // A malformed or unavailable local store should not prevent a new session.
  }
  return {};
}

function readSavedSession(joinCode: string | null): SavedSession | null {
  const savedSessions = readSavedSessions();
  const hostCode = new URLSearchParams(window.location.search).get('host');
  if (hostCode && !joinCode) return savedSessions[sessionKey('host', hostCode)] ?? null;
  if (joinCode) {
    // An invite link resumes only the participant who previously joined it.
    return savedSessions[sessionKey('participant', joinCode)] ?? null;
  }

  try {
    const raw = window.sessionStorage.getItem(activeSessionKey);
    const active: unknown = raw ? JSON.parse(raw) : null;
    return isSavedSession(active) ? savedSessions[sessionKey(active.role, active.code)] ?? null : null;
  } catch {
    return null;
  }
}

function saveSession(saved: SavedSession) {
  try {
    const savedSessions = readSavedSessions();
    savedSessions[sessionKey(saved.role, saved.code)] = saved;
    window.localStorage.setItem(savedSessionsKey, JSON.stringify(savedSessions));
    window.sessionStorage.setItem(activeSessionKey, JSON.stringify(saved));
    return true;
  } catch {
    return false;
  }
}

function forgetSession(current: SavedSession) {
  try {
    const savedSessions = readSavedSessions();
    delete savedSessions[sessionKey(current.role, current.code)];
    window.localStorage.setItem(savedSessionsKey, JSON.stringify(savedSessions));
    window.sessionStorage.removeItem(activeSessionKey);
  } catch {
    // The in-memory session is still cleared below.
  }
}

function describeError(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Sambungan tidak dapat diselesaikan. Cuba lagi.';
}

function relativeTime(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'baru sahaja';
  return new Intl.DateTimeFormat(document.documentElement.lang === 'en' ? 'en-MY' : 'ms-MY', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function participantLabel(participant: Participant) {
  return `${participant.name} · ${participant.zone}`;
}

function Activity({ events }: { events: SessionEvent[] }) {
  if (events.length === 0) {
    return <p className="muted">Belum ada kemas kini daripada ruang kerja ini.</p>;
  }

  return (
    <ol className="activity-list">
      {events.slice(-5).reverse().map((event) => (
        <li key={event.id}>
          <span>{event.summary}</span>
          <time dateTime={event.createdAt}>{relativeTime(event.createdAt)}</time>
        </li>
      ))}
    </ol>
  );
}

export default function App() {
  const routeCode = useMemo(invitedCode, []);
  const initialSaved = useMemo(() => readSavedSession(routeCode), [routeCode]);
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [screen, setScreen] = useState<Screen>(() => routeCode && !initialSaved ? 'join' : initialSaved ? 'session' : 'home');
  const [credential, setCredential] = useState<SavedSession | null>(() => initialSaved);
  const [session, setSession] = useState<SessionView | null>(null);
  const [connection, setConnection] = useState('');
  const [accessLost, setAccessLost] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [title, setTitle] = useState(() => readLanguage() === 'en' ? 'Workshop table' : 'Meja workshop');
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    localizePage(language);
    const observer = new MutationObserver(() => localizePage(language));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label', 'placeholder', 'alt', 'title'] });
    return () => observer.disconnect();
  }, [language]);

  const chooseLanguage = (next: Language) => {
    setLanguage(next);
    saveLanguage(next);
  };

  useEffect(() => {
    if (!credential) return;

    let disposed = false;
    let inFlight = false;
    let activeController: AbortController | null = null;

    const refresh = async () => {
      if (disposed || inFlight || accessLost || document.visibilityState !== 'visible') return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const result = await api.getSession(credential.code, credential.token, controller.signal);
        if (!disposed) {
          setSession((current) => current && current.id === result.session.id && current.revision > result.session.revision ? current : result.session);
          setConnection('Diselaraskan');
        }
      } catch (error: unknown) {
        if (!disposed && !controller.signal.aborted) {
          if (error instanceof ApiError && error.status === 401) { setSession(null); setAccessLost(true); }
          setConnection(`Tidak dapat menyegerakkan: ${describeError(error)}`);
        }
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 2_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      activeController?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [credential, accessLost]);

  const activate = (next: SavedSession, view: SessionView) => {
    setAccessLost(false);
    setStorageWarning(!saveSession(next));
    setCredential(next);
    setSession(view);
    setConnection('Diselaraskan');
    setScreen('session');
  };

  const openHome = () => {
    window.history.replaceState({}, '', '/');
    setFormError('');
    setScreen('home');
  };

  const createSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      const result = await api.createSession({ title: title.trim() || undefined });
      window.history.replaceState({}, '', '/');
      activate({ code: result.session.code, token: result.hostToken, role: 'host' }, result.session);
    } catch (error: unknown) {
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const joinSession = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!routeCode) return;
    setSubmitting(true);
    setFormError('');
    try {
      const result = await api.joinSession(routeCode, { name: name.trim(), zone: zone.trim() });
      activate(
        {
          code: result.session.code,
          token: result.participantToken,
          role: 'participant',
          participantId: result.participantId,
        },
        result.session,
      );
    } catch (error: unknown) {
      setFormError(describeError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const leaveThisDevice = async () => {
    if (credential) {
      try { await removeDevicePush(credential.code, credential.token); } catch { /* Browser permissions can also revoke push independently. */ }
      forgetSession(credential);
    }
    setAccessLost(false);
    setCredential(null);
    setSession(null);
    setConnection('');
    setStorageWarning(false);
    openHome();
  };

  if (screen === 'host') {
    return (
      <Page language={language} onLanguageChange={chooseLanguage}>
        <button className="text-button" onClick={openHome} type="button">← Kembali</button>
        <section className="form-panel">
          <p className="eyebrow">PENYELARAS</p>
          <h1>Buka ruang bantuan</h1>
          <p>Anda akan menerima kod jemputan dan boleh melihat peserta yang masuk dari telefon mereka.</p>
          <form onSubmit={createSession}>
            <label htmlFor="title">Nama ringkas sesi</label>
            <input id="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} autoComplete="off" />
            {formError && <p className="error" role="alert">{formError}</p>}
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Membuka sesi…' : 'Cipta sesi'}
            </button>
          </form>
          <p className="fine-print">Token penyelaras disimpan pada peranti ini sahaja dan tidak dimasukkan dalam pautan jemputan.</p>
        </section>
      </Page>
    );
  }

  if (screen === 'join') {
    return (
      <Page language={language} onLanguageChange={chooseLanguage}>
        <button className="text-button" onClick={openHome} type="button">← Kembali</button>
        <section className="form-panel">
          <p className="eyebrow">SERTAI RUANG</p>
          <h1>Anda di mana sekarang?</h1>
          <p>Anda sedang menyertai sesi <strong>{routeCode}</strong>. Beritahu penyelaras kawasan yang anda boleh lihat.</p>
          <form onSubmit={joinSession}>
            <label htmlFor="name">Nama anda</label>
            <input id="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" required />
            <label htmlFor="zone">Lokasi atau kawasan anda</label>
            <input id="zone" value={zone} onChange={(event) => setZone(event.target.value)} placeholder="Contoh: Meja bekalan" maxLength={100} autoComplete="off" required />
            {formError && <p className="error" role="alert">{formError}</p>}
            <button className="primary-button" disabled={submitting} type="submit">
              {submitting ? 'Menyertai…' : 'Sertai sesi'}
            </button>
          </form>
          <p className="fine-print">Maklumat ini hanya dikongsi dengan orang dalam sesi ini.</p>
        </section>
      </Page>
    );
  }

  if (screen === 'session' && credential) {
    return (
      <Page wide language={language} onLanguageChange={chooseLanguage}>
        {!session || accessLost ? (
          <section className="form-panel loading-panel" aria-live="polite">
            <p className="eyebrow">MEMULIHKAN SESI</p>
            <h1>{accessLost ? "Akses sesi telah ditamatkan" : "Menyambung semula…"}</h1>
            <p>{accessLost ? 'Anda mungkin telah dikeluarkan oleh penyelaras. Hubungi penyelaras untuk menyertai semula.' : connection || 'Menyemak akses selamat pada peranti ini.'}</p>
            <button className="secondary-button" onClick={leaveThisDevice} type="button">Gunakan sesi lain</button>
          </section>
        ) : (
          <SessionDashboard
            connection={connection}
            credential={credential}
            leaveThisDevice={leaveThisDevice}
            onSession={(next) => setSession((current) => current && current.id === next.id && current.revision > next.revision ? current : next)}
            session={session}
            storageWarning={storageWarning}
          />
        )}
      </Page>
    );
  }

  return (
    <Page language={language} onLanguageChange={chooseLanguage}>
      <section className="hero">
        <p className="eyebrow">PINJAM · SUPER RING</p>
        <h1>Satu ruang. Dua pandangan.</h1>
        <p>Selaras bantuan ringkas di meja workshop tanpa kehilangan konteks di antara telefon dan laptop.</p>
      </section>
      <div className="choice-grid">
        <section className="choice-card">
          <span className="choice-number">01</span>
          <h2>Saya penyelaras</h2>
          <p>Cipta ruang, kongsi pautan jemputan, dan lihat siapa yang sudah bersedia membantu.</p>
          <button className="primary-button" onClick={() => setScreen('host')} type="button">Cipta sesi</button>
        </section>
        <section className="choice-card muted-card">
          <span className="choice-number">02</span>
          <h2>Saya peserta</h2>
          <p>Buka pautan jemputan yang dikongsi oleh penyelaras untuk masuk ke ruang yang betul.</p>
          <form onSubmit={(event) => { event.preventDefault(); const code = joinCodeInput.trim(); if (/^[a-fA-F0-9]{6}$/.test(code)) window.location.assign(`/join/${encodeURIComponent(code)}`); }}>
            <label htmlFor="join-code">Atau masukkan kod sesi</label>
            <input id="join-code" value={joinCodeInput} onChange={(event) => setJoinCodeInput(event.target.value.toUpperCase())} pattern="[a-fA-F0-9]{6}" minLength={6} maxLength={6} autoCapitalize="characters" required />
            <button className="secondary-button" type="submit">Masuk dengan kod</button>
          </form>
        </section>
      </div>
      <p className="capability-note"><strong>Untuk sekarang:</strong> sesi, misi, jemputan, bukti dan tugasan peserta tersedia. Penyelaras boleh menjalankan agent secara automatik, memantau kemajuan dan menghentikannya.</p>
    </Page>
  );
}

function Page({ children, wide = false, language, onLanguageChange }: { children: ReactNode; wide?: boolean; language: Language; onLanguageChange: (language: Language) => void }) {
  return <main className={wide ? 'app-shell app-shell-wide' : 'app-shell'}>
    <div className="language-picker" role="group" aria-label="Pilih bahasa">
      <button className={language === 'ms' ? 'language-active' : ''} type="button" aria-pressed={language === 'ms'} onClick={() => onLanguageChange('ms')}>BM</button>
      <button className={language === 'en' ? 'language-active' : ''} type="button" aria-pressed={language === 'en'} onClick={() => onLanguageChange('en')}>EN</button>
    </div>
    {children}
  </main>;
}

function SessionDashboard({
  connection,
  credential,
  leaveThisDevice,
  onSession,
  session,
  storageWarning,
}: {
  connection: string;
  credential: SavedSession;
  leaveThisDevice: () => void;
  onSession: (session: SessionView) => void;
  session: SessionView;
  storageWarning: boolean;
}) {
  const inviteUrl = new URL(`/join/${encodeURIComponent(session.code)}`, window.location.origin).toString();
  const isHost = credential.role === 'host';
  const self = credential.participantId ? session.participants.find((participant) => participant.id === credential.participantId) : null;

  return (
    <>
      <header className="session-header">
        <div>
          <p className="eyebrow">{isHost ? 'PENYELARAS' : 'PESERTA'}</p>
          <h1>{session.title}</h1>
        </div>
        <div className="sync-state" aria-live="polite"><span aria-hidden="true">●</span> {connection || 'Menyambung…'}</div>
      </header>

      {storageWarning && <p className="warning" role="status">Browser ini tidak dapat menyimpan akses sesi. Jangan tutup halaman ini jika anda mahu kekal dalam sesi.</p>}

      {isHost ? (
        <section className="invite-card" aria-label="Jemput peserta">
          <div>
            <p className="eyebrow">KOD JEMPUTAN</p>
            <strong className="session-code">{session.code}</strong>
          </div>
          <div className="invite-url">
            <label htmlFor="invite-url">Pautan untuk peserta</label>
            <input id="invite-url" value={inviteUrl} readOnly onFocus={(event) => event.currentTarget.select()} />
            <p>Salin atau kongsi pautan ini. Ia tidak mengandungi token penyelaras.</p>
          </div>
        </section>
      ) : (
        <section className="participant-banner">
          <p className="eyebrow">ANDA DISAMBUNGKAN</p>
          <strong>{self ? participantLabel(self) : 'Peserta sesi'}</strong>
          <p>Penyelaras boleh melihat bahawa anda tersedia di kawasan ini.</p>
        </section>
      )}

      <NotificationCenter key={`${session.code}:${credential.participantId ?? 'host'}`} session={session} token={credential.token} participantId={credential.participantId} />

      {!isHost && (
        <RequestInbox
          code={session.code}
          participantId={credential.participantId}
          requests={session.requests}
          token={credential.token}
          onSession={onSession}
        />
      )}

      {!isHost && (
        <TaskInbox
          code={session.code}
          participantId={credential.participantId}
          tasks={session.tasks}
          token={credential.token}
          onSession={onSession}
        />
      )}

      <div className="dashboard-grid">
        <section className="dashboard-card participants-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">ORANG DALAM RUANG</p>
              <h2>{session.participants.length} peserta bersedia</h2>
            </div>
            <span className="count-badge">{session.participants.length}/2</span>
          </div>
          {session.participants.length === 0 ? (
            <p className="empty-state">Kongsi pautan jemputan untuk mula mengumpulkan pandangan daripada lokasi lain.</p>
          ) : (
            <ul className="participant-list">
              {session.participants.map((participant) => (
                <li key={participant.id}>
                  <span className="avatar" aria-hidden="true">{participant.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{participant.name}</strong>
                    <span>{participant.zone}</span>
                  </div>
                  <time dateTime={participant.joinedAt}>Masuk {relativeTime(participant.joinedAt)}</time>
                  {isHost && <RemoveParticipant code={session.code} token={credential.token} participant={participant} onSession={onSession} />}
                </li>
              ))}
            </ul>
          )}
        </section>

        {isHost && !session.mission && <MissionForm code={session.code} token={credential.token} onSession={onSession} />}

        {(!isHost || session.mission) && (
          <section className="dashboard-card">
            <p className="eyebrow">STATUS MISI</p>
            {session.mission ? (
              <>
                <h2>{session.mission.goal}</h2>
                <p className="mission-status">Status: {session.mission.status}</p>
                <ul className="requirement-list">
                  {session.mission.requirements.map((requirement) => <li key={requirement.id}>{requirement.quantity} × {requirement.label}</li>)}
                </ul>
              </>
            ) : (
              <>
                <h2>Belum ada misi</h2>
                <p className="empty-state">Penyelaras belum menetapkan misi untuk ruang ini.</p>
              </>
            )}
            <p className="fine-print">Penerimaan bukti sahaja tidak mengesahkan kerja selesai. Rujuk status misi dan keputusan agent.</p>
          </section>
        )}

        {isHost && session.mission && (
          <AgentControls
            key={session.mission.id}
            missionId={session.mission.id}
            automation={session.automation}
            code={session.code}
            hasParticipant={session.participants.length > 0}
            missionStatus={session.mission.status}
            events={session.events}
            token={credential.token}
            onSession={onSession}
          />
        )}

        {isHost && (
          <RequestComposer
            code={session.code}
            participants={session.participants}
            requests={session.requests}
            token={credential.token}
            onSession={onSession}
          />
        )}

        <EvidenceList
          code={session.code}
          observations={session.observations}
          participants={session.participants}
          requests={session.requests}
          token={credential.token}
        />

        <section className="dashboard-card activity-card">
          <p className="eyebrow">AKTIVITI RUANG</p>
          <h2>Kemas kini terbaru</h2>
          <Activity events={session.events} />
        </section>
      </div>

      <footer className="session-footer">
        <span>Versi sesi {session.revision}</span>
        <button className="text-button" onClick={leaveThisDevice} type="button">Keluarkan akses daripada peranti ini</button>
      </footer>
    </>
  );
}

function MissionForm({
  code,
  token,
  onSession,
}: {
  code: string;
  token: string;
  onSession: (session: SessionView) => void;
}) {
  const [goal, setGoal] = useState('Sediakan meja workshop untuk 3 peserta');
  const [requirements, setRequirements] = useState<Requirement[]>(() => [
    newRequirement('Buku nota', 3),
    newRequirement('Pen', 3),
    newRequirement('Tanda nama', 3),
  ]);
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const changeMission = () => {
    setError('');
    setIdempotencyKey(newIdempotencyKey());
  };

  const updateRequirement = (id: string, update: Partial<Requirement>) => {
    setRequirements((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
    changeMission();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedGoal = goal.trim();
    const normalizedRequirements = requirements.map((item) => ({ ...item, label: item.label.trim() }));
    if (!normalizedGoal || normalizedRequirements.some((item) => !item.label || !Number.isInteger(item.quantity) || item.quantity < 1)) {
      setError('Masukkan matlamat serta nama dan kuantiti yang sah untuk setiap barang.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const result = await api.createMission(code, token, idempotencyKey, { goal: normalizedGoal, requirements: normalizedRequirements });
      onSession(result.session);
    } catch (missionError: unknown) {
      if (missionError instanceof ApiError && missionError.code === 'MISSION_EXISTS') {
        try {
          const current = await api.getSession(code, token);
          onSession(current.session);
        } catch {
          // Keep the original API error visible if the refresh cannot complete.
        }
      }
      setError(describeError(missionError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="dashboard-card mission-form-card">
      <p className="eyebrow">TETAPKAN MISI</p>
      <h2>Apa yang perlu disediakan?</h2>
      <p className="empty-state">Sahkan matlamat dan barang yang diperlukan. Anda boleh reset misi kemudian tanpa menukar pautan peserta.</p>
      <form onSubmit={submit}>
        <label htmlFor="mission-goal">Matlamat</label>
        <textarea disabled={submitting} id="mission-goal" value={goal} maxLength={2000} onChange={(event) => { setGoal(event.target.value); changeMission(); }} required />
        <div className="requirement-editor-heading">
          <label>Barang diperlukan</label>
          <span>{requirements.length}/20</span>
        </div>
        <div className="requirement-editor">
          {requirements.map((requirement, index) => (
            <div className="requirement-row" key={requirement.id}>
              <label className="sr-only" htmlFor={`requirement-label-${requirement.id}`}>Barang {index + 1}</label>
              <input disabled={submitting} id={`requirement-label-${requirement.id}`} value={requirement.label} onChange={(event) => updateRequirement(requirement.id, { label: event.target.value })} placeholder="Contoh: Pen" maxLength={120} required />
              <label className="sr-only" htmlFor={`requirement-quantity-${requirement.id}`}>Kuantiti {index + 1}</label>
              <input disabled={submitting} id={`requirement-quantity-${requirement.id}`} type="number" min="1" max="100" step="1" value={requirement.quantity} onChange={(event) => updateRequirement(requirement.id, { quantity: Number(event.target.value) })} required />
              <button className="icon-button" disabled={submitting || requirements.length === 1} type="button" onClick={() => { setRequirements((current) => current.filter((item) => item.id !== requirement.id)); changeMission(); }} aria-label={`Buang ${requirement.label || `barang ${index + 1}`}`}>×</button>
            </div>
          ))}
        </div>
        <button className="secondary-button add-requirement-button" disabled={submitting || requirements.length >= 20} type="button" onClick={() => { setRequirements((current) => [...current, newRequirement()]); changeMission(); }}>+ Tambah barang</button>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary-button" disabled={submitting} type="submit">{submitting ? 'Mengesahkan…' : 'Sahkan misi'}</button>
      </form>
    </section>
  );
}

function AgentControls({
  missionId,
  automation,
  code,
  events,
  hasParticipant,
  missionStatus,
  token,
  onSession,
}: {
  code: string;
  events: SessionEvent[];
  hasParticipant: boolean;
  missionStatus: NonNullable<SessionView['mission']>['status'];
  missionId: string;
  automation?: SessionView['automation'];
  token: string;
  onSession: (session: SessionView) => void;
}) {
  const [health, setHealth] = useState<'checking' | 'configured' | 'not_configured' | 'error'>('checking');
  const [healthError, setHealthError] = useState('');
  const [stepping, setStepping] = useState(false);
  const [stepError, setStepError] = useState('');
  const pendingKey = useRef<string | null>(readPendingAgentStep(`${code}:${missionId}`));
  const latestStep = [...events].reverse().find((event) => event.kind === 'agent_step');
  const summary = latestStep?.summary ?? '';
  const hasStepped = events.some((event) => event.kind === 'agent_step');
  const missionComplete = missionStatus === 'completed';

  useEffect(() => {
    const controller = new AbortController();
    api.health(controller.signal)
      .then((result) => setHealth(result.agent))
      .catch((healthCheckError: unknown) => {
        if (!controller.signal.aborted) {
          setHealth('error');
          setHealthError(describeError(healthCheckError));
        }
      });
    return () => controller.abort();
  }, []);

  const step = async () => {
    if (stepping) return;
    const key = pendingKey.current ?? readPendingAgentStep(`${code}:${missionId}`) ?? newIdempotencyKey();
    pendingKey.current = key;
    savePendingAgentStep(`${code}:${missionId}`, key);
    setStepping(true);
    setStepError('');
    try {
      const result = await api.stepAgent(code, token, key);
      clearPendingAgentStep(`${code}:${missionId}`);
      pendingKey.current = null;
      onSession(result.session);
    } catch (agentError: unknown) {
      if (agentError instanceof ApiError && agentError.code === 'AGENT_STALE') {
        clearPendingAgentStep(`${code}:${missionId}`);
        pendingKey.current = null;
        try {
          const current = await api.getSession(code, token);
          onSession(current.session);
        } catch {
          // The primary API error is more useful than a secondary refresh failure.
        }
      }
      setStepError(describeError(agentError));
    } finally {
      setStepping(false);
    }
  };

  const disabled = Boolean(automation?.enabled) || stepping || health !== 'configured' || !hasParticipant || missionComplete;
  let stateMessage = hasStepped
    ? 'Langkah terakhir selesai. Semak respons peserta, kemudian cetus langkah seterusnya apabila bersedia.'
    : 'Agent belum dimulakan. Misi yang aktif tidak bermaksud agent berjalan sendiri.';
  if (health === 'checking') stateMessage = 'Menyemak konfigurasi AI pada pelayan…';
  if (health === 'not_configured') stateMessage = 'Sambungan AI belum dikonfigurasi pada pelayan.';
  if (health === 'error') stateMessage = `Tidak dapat menyemak sambungan AI: ${healthError}`;
  if (!hasParticipant) stateMessage = 'Tunggu sekurang-kurangnya seorang peserta sebelum memulakan agent.';
  if (missionComplete) stateMessage = 'Misi telah selesai. Tiada langkah agent lagi diperlukan.';
  if (automation?.enabled) stateMessage = 'Mod automatik aktif. Langkah manual dikunci; pantau status di bawah.';
  if (stepping) stateMessage = 'Agent sedang menilai… Satu keputusan sedang berjalan.';

  return (
    <section className="dashboard-card agent-controls">
      <p className="eyebrow">KAWALAN AGENT</p>
      <h2>{hasStepped ? 'Teruskan dengan bukti baharu' : 'Mulakan keputusan pertama'}</h2>
      <p className="agent-state" aria-live="polite">{stateMessage}</p>
      {summary && <p className="agent-summary"><strong>Keputusan terakhir:</strong> {summary}</p>}
      {stepError && <p className="error" role="alert">{stepError}</p>}
      <button className="primary-button" disabled={disabled} onClick={() => void step()} type="button">
        {stepping ? 'Agent sedang menilai…' : hasStepped ? 'Langkah agent seterusnya' : 'Mulakan agent'}
      </button>
      <p className="fine-print">Butang di atas menjalankan satu langkah manual. Gunakan mod automatik di bawah untuk meneruskan tanpa klik berulang.</p>
      <AutomationPanel code={code} token={token} missionId={missionId} automation={automation} configured={health === 'configured' && hasParticipant} complete={missionComplete} onSession={onSession} onReset={() => { clearPendingAgentStep(`${code}:${missionId}`); pendingKey.current = null; }} />
    </section>
  );
}

function TaskInbox({
  code,
  participantId,
  tasks,
  token,
  onSession,
}: {
  code: string;
  participantId: string | undefined;
  tasks: Task[];
  token: string;
  onSession: (session: SessionView) => void;
}) {
  const ownTasks = tasks.filter((task) => task.participantId === participantId);
  return (
    <section className="task-inbox">
      <p className="eyebrow">TUGASAN SAYA</p>
      <h2>{ownTasks.length > 0 ? `${ownTasks.length} tugasan untuk anda` : 'Tiada tugasan baharu'}</h2>
      {ownTasks.length === 0 ? (
        <p className="empty-state">Agent mungkin meminta bukti atau menawarkan tugasan selepas langkah penyelaras yang seterusnya.</p>
      ) : (
        <div className="task-stack">
          {ownTasks.map((task) => <ParticipantTaskCard key={task.id} code={code} task={task} token={token} onSession={onSession} />)}
        </div>
      )}
    </section>
  );
}

function ParticipantTaskCard({
  code,
  task,
  token,
  onSession,
}: {
  code: string;
  task: Task;
  token: string;
  onSession: (session: SessionView) => void;
}) {
  const [note, setNote] = useState('');
  const [actionKeys, setActionKeys] = useState<Partial<Record<RespondToTaskInput['action'], string>>>({});
  const [submitting, setSubmitting] = useState<RespondToTaskInput['action'] | null>(null);
  const [error, setError] = useState('');
  const canDecline = task.status === 'offered' || task.status === 'accepted' || task.status === 'in_progress';

  const respond = async (action: RespondToTaskInput['action']) => {
    const key = actionKeys[action] ?? newIdempotencyKey();
    if (!actionKeys[action]) setActionKeys((current) => ({ ...current, [action]: key }));
    setSubmitting(action);
    setError('');
    try {
      const result = await api.respondToTask(code, token, task.id, key, {
        action,
        ...(action === 'decline' && note.trim() ? { note: note.trim() } : {}),
      });
      onSession(result.session);
    } catch (taskError: unknown) {
      setError(describeError(taskError));
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <article className="task-card">
      <div className="task-card-heading">
        <span className={`task-status task-status-${task.status}`}>{task.status.replaceAll('_', ' ')}</span>
        <span>{relativeTime(task.updatedAt)}</span>
      </div>
      <h3>{task.title}</h3>
      {task.note && <p>{task.note}</p>}
      {task.status === 'needs_verification' && <p className="task-waiting">Menunggu semakan bukti oleh agent.</p>}
      {task.status === 'completed' && <p className="task-complete">Selesai disemak oleh agent.</p>}
      {task.status === 'declined' && <p className="task-declined">Tugasan ini kekal ditolak.</p>}
      {canDecline && (
        <>
          <label htmlFor={`task-note-${task.id}`}>Nota halangan (pilihan)</label>
          <textarea disabled={submitting !== null} id={`task-note-${task.id}`} value={note} onChange={(event) => { setNote(event.target.value); setActionKeys((current) => ({ ...current, decline: undefined })); }} placeholder="Contoh: Saya tidak dapat capai kawasan itu." maxLength={2000} />
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="task-actions">
        {task.status === 'offered' && <button className="primary-button" disabled={submitting !== null} onClick={() => void respond('accept')} type="button">{submitting === 'accept' ? 'Menerima…' : 'Terima'}</button>}
        {task.status === 'accepted' && <button className="primary-button" disabled={submitting !== null} onClick={() => void respond('start')} type="button">{submitting === 'start' ? 'Memulakan…' : 'Mula'}</button>}
        {(task.status === 'accepted' || task.status === 'in_progress') && <button className="secondary-button" disabled={submitting !== null} onClick={() => void respond('report_done')} type="button">{submitting === 'report_done' ? 'Melapor…' : 'Lapor siap'}</button>}
        {canDecline && <button className="text-button task-decline-button" disabled={submitting !== null} onClick={() => void respond('decline')} type="button">{submitting === 'decline' ? 'Menghantar…' : task.status === 'offered' ? 'Tolak' : 'Tak dapat teruskan'}</button>}
      </div>
    </article>
  );
}

function RequestComposer({
  code,
  participants,
  requests,
  token,
  onSession,
}: {
  code: string;
  participants: Participant[];
  requests: ObservationRequest[];
  token: string;
  onSession: (session: SessionView) => void;
}) {
  const [participantId, setParticipantId] = useState('');
  const [kind, setKind] = useState<ObservationRequest['kind']>('photo');
  const [prompt, setPrompt] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!participants.some((participant) => participant.id === participantId)) {
      setParticipantId(participants[0]?.id ?? '');
    }
  }, [participantId, participants]);

  const changeRequest = () => {
    setError('');
    setIdempotencyKey(newIdempotencyKey());
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!participantId || !prompt.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const result = await api.createRequest(code, token, idempotencyKey, {
        participantId,
        kind,
        prompt: prompt.trim(),
      });
      onSession(result.session);
      setPrompt('');
      setIdempotencyKey(newIdempotencyKey());
    } catch (requestError: unknown) {
      setError(describeError(requestError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="dashboard-card request-composer">
      <p className="eyebrow">PERMINTAAN PENYELARAS</p>
      <h2>Minta pandangan peserta</h2>
      {participants.length === 0 ? (
        <p className="empty-state">Tunggu sekurang-kurangnya seorang peserta menyertai sesi sebelum menghantar permintaan.</p>
      ) : (
        <form onSubmit={submit}>
          <label htmlFor="request-participant">Hantar kepada</label>
          <select disabled={submitting} id="request-participant" value={participantId} onChange={(event) => { setParticipantId(event.target.value); changeRequest(); }}>
            {participants.map((participant) => <option key={participant.id} value={participant.id}>{participantLabel(participant)}</option>)}
          </select>
          <label htmlFor="request-kind">Jenis permintaan</label>
          <select disabled={submitting} id="request-kind" value={kind} onChange={(event) => { setKind(event.target.value as ObservationRequest['kind']); changeRequest(); }}>
            <option value="photo">Gambar</option>
            <option value="question">Soalan</option>
          </select>
          <label htmlFor="request-prompt">Arahan jelas</label>
          <textarea disabled={submitting} id="request-prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); changeRequest(); }} placeholder={kind === 'photo' ? 'Contoh: Ambil gambar sudut kiri meja.' : 'Contoh: Berapa buah pen yang anda nampak?'} maxLength={2000} required />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="primary-button" disabled={submitting || !participantId || !prompt.trim()} type="submit">
            {submitting ? 'Menghantar…' : 'Hantar permintaan'}
          </button>
        </form>
      )}
      {requests.length > 0 && (
        <ul className="request-summary">
          {requests.slice(-3).reverse().map((request) => {
            const participant = participants.find((entry) => entry.id === request.participantId);
            return <li key={request.id}><span>{request.kind === 'photo' ? 'Gambar' : 'Soalan'} · {participant?.name ?? 'Peserta'}</span><strong>{request.status === 'answered' ? 'Dijawab' : 'Menunggu'}</strong></li>;
          })}
        </ul>
      )}
      <p className="fine-print">Permintaan ini dihantar oleh penyelaras, bukan oleh agent automatik.</p>
    </section>
  );
}

function RequestInbox({
  code,
  participantId,
  requests,
  token,
  onSession,
}: {
  code: string;
  participantId: string | undefined;
  requests: ObservationRequest[];
  token: string;
  onSession: (session: SessionView) => void;
}) {
  const pending = requests.filter((request) => request.participantId === participantId && request.status === 'pending');
  return (
    <section className="request-inbox">
      <p className="eyebrow">TINDAKAN ANDA</p>
      <h2>{pending.length > 0 ? `${pending.length} permintaan menunggu` : 'Tiada permintaan baharu'}</h2>
      {pending.length === 0 ? (
        <p className="empty-state">Apabila penyelaras meminta gambar atau jawapan, tindakan akan muncul di sini.</p>
      ) : (
        <div className="answer-stack">
          {pending.map((request) => <ParticipantRequestCard key={request.id} code={code} request={request} token={token} onSession={onSession} />)}
        </div>
      )}
    </section>
  );
}

function ParticipantRequestCard({
  code,
  request,
  token,
  onSession,
}: {
  code: string;
  request: ObservationRequest;
  token: string;
  onSession: (session: SessionView) => void;
}) {
  const isPhoto = request.kind === 'photo';
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(newIdempotencyKey);
  const [observationKey, setObservationKey] = useState(newIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const validImage = !file || (supportedImageTypes.has(file.type) && file.size <= maxImageBytes);
  const canSubmit = isPhoto ? Boolean(mediaId || (file && validImage)) : Boolean(text.trim());

  const changeText = (value: string) => {
    setText(value);
    setObservationKey(newIdempotencyKey());
    setError('');
  };

  const chooseFile = (nextFile: File | null) => {
    setFile(nextFile);
    setMediaId(null);
    setUploadKey(newIdempotencyKey());
    setObservationKey(newIdempotencyKey());
    if (nextFile && !supportedImageTypes.has(nextFile.type)) {
      setError('Pilih fail JPEG, PNG atau WebP.');
    } else if (nextFile && nextFile.size > maxImageBytes) {
      setError('Saiz gambar mestilah 5 MiB atau kurang.');
    } else {
      setError('');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      let attachedMediaId = mediaId;
      if (isPhoto && !attachedMediaId) {
        if (!file) throw new Error('Pilih gambar untuk dihantar.');
        const upload = await api.uploadMedia(code, token, uploadKey, file);
        attachedMediaId = upload.mediaId;
        setMediaId(attachedMediaId);
      }
      const result = await api.submitObservation(code, token, observationKey, {
        requestId: request.id,
        text: text.trim(),
        mediaId: isPhoto ? attachedMediaId : null,
      });
      onSession(result.session);
    } catch (submissionError: unknown) {
      setError(describeError(submissionError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="request-card">
      <div className="request-card-heading">
        <span className="kind-badge">{isPhoto ? 'GAMBAR' : 'SOALAN'}</span>
        <span>{relativeTime(request.createdAt)}</span>
      </div>
      <h3>{request.prompt}</h3>
      <form onSubmit={submit}>
        {isPhoto && (
          <>
            <label htmlFor={`image-${request.id}`}>Pilih satu gambar</label>
            <input disabled={submitting} id={`image-${request.id}`} className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
            <p className="fine-print">JPEG, PNG atau WebP sahaja, maksimum 5 MiB. Gambar menjadi bukti dihantar, bukan pengesahan AI.</p>
          </>
        )}
        <label htmlFor={`answer-${request.id}`}>{isPhoto ? 'Nota (pilihan)' : 'Jawapan anda'}</label>
        <textarea disabled={submitting} id={`answer-${request.id}`} value={text} onChange={(event) => changeText(event.target.value)} placeholder={isPhoto ? 'Terangkan apa yang kelihatan, jika membantu.' : 'Taip jawapan yang anda lihat.'} maxLength={2000} required={!isPhoto} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="primary-button" disabled={submitting || !canSubmit} type="submit">
          {submitting ? (isPhoto && !mediaId ? 'Memuat naik…' : 'Menghantar…') : isPhoto ? 'Hantar gambar' : 'Hantar jawapan'}
        </button>
      </form>
    </article>
  );
}

function EvidenceList({
  code,
  observations,
  participants,
  requests,
  token,
}: {
  code: string;
  observations: Observation[];
  participants: Participant[];
  requests: ObservationRequest[];
  token: string;
}) {
  return (
    <section className="dashboard-card evidence-card">
      <p className="eyebrow">BUKTI DITERIMA</p>
      <h2>Pemerhatian daripada ruang</h2>
      {observations.length === 0 ? (
        <p className="empty-state">Jawapan dan gambar peserta akan kelihatan di sini selepas diterima oleh sesi.</p>
      ) : (
        <div className="evidence-list">
          {observations.slice().reverse().map((observation) => {
            const participant = participants.find((entry) => entry.id === observation.participantId);
            const request = requests.find((entry) => entry.id === observation.requestId);
            return (
              <article className="evidence-item" key={observation.id}>
                <div className="evidence-meta">
                  <strong>{participant?.name ?? 'Peserta'} · {observation.zone}</strong>
                  <span>{request?.kind === 'photo' ? 'Gambar' : 'Jawapan'} · {relativeTime(observation.receivedAt)}</span>
                </div>
                {observation.text && <p>{observation.text}</p>}
                {observation.mediaId && <EvidenceImage code={code} mediaId={observation.mediaId} token={token} participantName={participant?.name ?? 'peserta'} />}
                <p className="fine-print">Bukti diterima oleh sesi. Rujuk keputusan agent untuk semakan; penerimaan gambar sahaja bukan pengesahan siap.</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function EvidenceImage({
  code,
  mediaId,
  participantName,
  token,
}: {
  code: string;
  mediaId: string;
  participantName: string;
  token: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    api.getMedia(code, token, mediaId, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((imageError: unknown) => {
        if (!controller.signal.aborted) setError(describeError(imageError));
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [code, mediaId, token]);

  if (error) return <p className="error" role="status">Gambar tidak dapat dimuat: {error}</p>;
  if (!url) return <p className="fine-print">Memuatkan bukti gambar…</p>;
  return <img className="evidence-image" src={url} alt={`Bukti gambar daripada ${participantName}`} />;
}

function RemoveParticipant({ code, token, participant, onSession }: {
  code: string; token: string; participant: Participant; onSession: (session: SessionView) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef(newIdempotencyKey());
  const remove = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { onSession((await api.removeParticipant(code, token, key.current, participant.id)).session); }
    catch (failure) { setError(describeError(failure)); }
    finally { setBusy(false); }
  };
  return <div className="remove-participant">
    {!confirm ? <button className="text-button" type="button" onClick={() => setConfirm(true)} aria-label={`Keluarkan ${participant.name}`}>Keluarkan</button> : <>
      <p>Keluarkan {participant.name}? Akses dan tugasan aktifnya akan dibatalkan.</p>
      <button className="text-button" type="button" disabled={busy} onClick={() => void remove()}>{busy ? 'Mengeluarkan…' : 'Ya, keluarkan'}</button>
      <button className="text-button" type="button" disabled={busy} onClick={() => setConfirm(false)}>Batal</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
