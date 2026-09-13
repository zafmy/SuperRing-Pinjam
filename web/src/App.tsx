import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';
import type { Observation, ObservationRequest, Participant, SessionEvent, SessionView } from '../../shared/contracts';
import { api, ApiError } from './api';

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
  return window.crypto.randomUUID();
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
  return new Intl.DateTimeFormat('ms-MY', { hour: '2-digit', minute: '2-digit' }).format(date);
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
      {events.slice(0, 5).map((event) => (
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
  const [screen, setScreen] = useState<Screen>(() => routeCode && !initialSaved ? 'join' : initialSaved ? 'session' : 'home');
  const [credential, setCredential] = useState<SavedSession | null>(() => initialSaved);
  const [session, setSession] = useState<SessionView | null>(null);
  const [connection, setConnection] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [title, setTitle] = useState('Meja workshop');
  const [name, setName] = useState('');
  const [zone, setZone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!credential) return;

    let disposed = false;
    let inFlight = false;
    let activeController: AbortController | null = null;

    const refresh = async () => {
      if (disposed || inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      const controller = new AbortController();
      activeController = controller;
      try {
        const result = await api.getSession(credential.code, credential.token, controller.signal);
        if (!disposed) {
          setSession(result.session);
          setConnection('Diselaraskan');
        }
      } catch (error: unknown) {
        if (!disposed && !controller.signal.aborted) {
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
  }, [credential]);

  const activate = (next: SavedSession, view: SessionView) => {
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

  const leaveThisDevice = () => {
    if (credential) forgetSession(credential);
    setCredential(null);
    setSession(null);
    setConnection('');
    setStorageWarning(false);
    openHome();
  };

  if (screen === 'host') {
    return (
      <Page>
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
      <Page>
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
      <Page wide>
        {!session ? (
          <section className="form-panel loading-panel" aria-live="polite">
            <p className="eyebrow">MEMULIHKAN SESI</p>
            <h1>Menyambung semula…</h1>
            <p>{connection || 'Menyemak akses selamat pada peranti ini.'}</p>
            <button className="secondary-button" onClick={leaveThisDevice} type="button">Gunakan sesi lain</button>
          </section>
        ) : (
          <SessionDashboard
            connection={connection}
            credential={credential}
            leaveThisDevice={leaveThisDevice}
            onSession={setSession}
            session={session}
            storageWarning={storageWarning}
          />
        )}
      </Page>
    );
  }

  return (
    <Page>
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
          <p className="fine-print">Pautan peserta berbentuk <code>/join/KOD</code>.</p>
        </section>
      </div>
      <p className="capability-note"><strong>Untuk sekarang:</strong> sesi, jemputan dan status peserta tersedia. Permintaan gambar, tugasan dan semakan AI belum diaktifkan.</p>
    </Page>
  );
}

function Page({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <main className={wide ? 'app-shell app-shell-wide' : 'app-shell'}>{children}</main>;
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

      {!isHost && (
        <RequestInbox
          code={session.code}
          participantId={credential.participantId}
          requests={session.requests}
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
                </li>
              ))}
            </ul>
          )}
        </section>

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
              <p className="empty-state">Penyelaras masih boleh menghantar permintaan gambar atau soalan untuk mengumpul bukti sebenar.</p>
            </>
          )}
          <p className="fine-print">Bukti yang diterima belum disemak AI dan tidak mengesahkan kerja telah selesai.</p>
        </section>

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
          <select id="request-participant" value={participantId} onChange={(event) => { setParticipantId(event.target.value); changeRequest(); }}>
            {participants.map((participant) => <option key={participant.id} value={participant.id}>{participantLabel(participant)}</option>)}
          </select>
          <label htmlFor="request-kind">Jenis permintaan</label>
          <select id="request-kind" value={kind} onChange={(event) => { setKind(event.target.value as ObservationRequest['kind']); changeRequest(); }}>
            <option value="photo">Gambar</option>
            <option value="question">Soalan</option>
          </select>
          <label htmlFor="request-prompt">Arahan jelas</label>
          <textarea id="request-prompt" value={prompt} onChange={(event) => { setPrompt(event.target.value); changeRequest(); }} placeholder={kind === 'photo' ? 'Contoh: Ambil gambar sudut kiri meja.' : 'Contoh: Berapa buah pen yang anda nampak?'} maxLength={2000} required />
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
            <input id={`image-${request.id}`} className="file-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} />
            <p className="fine-print">JPEG, PNG atau WebP sahaja, maksimum 5 MiB. Gambar menjadi bukti dihantar, bukan pengesahan AI.</p>
          </>
        )}
        <label htmlFor={`answer-${request.id}`}>{isPhoto ? 'Nota (pilihan)' : 'Jawapan anda'}</label>
        <textarea id={`answer-${request.id}`} value={text} onChange={(event) => changeText(event.target.value)} placeholder={isPhoto ? 'Terangkan apa yang kelihatan, jika membantu.' : 'Taip jawapan yang anda lihat.'} maxLength={2000} required={!isPhoto} />
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
                <p className="fine-print">Bukti diterima oleh sesi; ia belum disahkan secara visual atau menandakan misi selesai.</p>
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
