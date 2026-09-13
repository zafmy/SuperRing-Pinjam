import { useRef, useState } from 'react';
import type { AutomationState, SessionView } from '../../shared/contracts';
import { api } from './api';

function newKey() { return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join(''); }
export function AutomationPanel({ code, token, missionId, automation, configured, complete, onSession, onReset }: {
  code: string; token: string; missionId: string; automation?: AutomationState; configured: boolean; complete: boolean;
  onSession: (session: SessionView) => void; onReset: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [maxSteps, setMaxSteps] = useState(30);
  const keys = useRef<Record<string, string>>({});
  const auto = automation?.missionId === missionId ? automation : undefined;
  const labels = { running: 'Sedang berjalan', waiting: 'Menunggu maklumat peserta', stopped: 'Dihentikan', completed: 'Misi selesai', error: 'Perlu perhatian', limit_reached: 'Had dicapai' };
  const perform = async (action: 'start' | 'stop' | 'reset') => {
    if (busy) return;
    const scope = `${missionId}:${action}:${action === 'start' ? maxSteps : ''}`;
    keys.current[scope] ??= newKey();
    setBusy(action); setError('');
    try {
      const result = action === 'start' ? await api.startAutomation(code, token, keys.current[scope], missionId, maxSteps) : action === 'stop' ? await api.stopAgent(code, token, keys.current[scope], missionId) : await api.resetMission(code, token, keys.current[scope], missionId);
      delete keys.current[scope];
      if (action === 'reset') onReset();
      onSession(result.session);
      setConfirmReset(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Tindakan gagal. Cuba lagi.'); }
    finally { setBusy(null); }
  };
  return <div className="automation-panel">
    <h3>Agent automatik</h3>
    <p>Agent menyambung sendiri apabila peserta menjawab, sehingga misi selesai atau anda menghentikannya.</p>
    <dl className="monitor-grid" aria-live="polite">
      <div><dt>Status</dt><dd>{auto ? labels[auto.status] : 'Belum dimulakan'}</dd></div>
      <div><dt>Langkah dicuba</dt><dd>{auto?.steps ?? 0} / {auto?.maxSteps ?? maxSteps}</dd></div>
      {auto && <div><dt>Had masa</dt><dd>{new Date(auto.deadlineAt).toLocaleTimeString('ms-MY', { hour: '2-digit', minute: '2-digit' })}</dd></div>}
    </dl>
    {auto && <p role="status">{auto.message}</p>}
    {!auto?.enabled && !complete && <label>Had langkah<input type="number" min={1} max={100} value={maxSteps} disabled={busy !== null} onChange={(event) => setMaxSteps(Number(event.target.value))} /></label>}
    <div className="task-actions">
      {!auto?.enabled && !complete && <button className="primary-button" type="button" disabled={busy !== null || !configured || !Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 100} onClick={() => void perform('start')}>{busy === 'start' ? 'Memulakan…' : 'Mulakan automatik'}</button>}
      <button className="secondary-button stop-agent" type="button" disabled={busy !== null} onClick={() => void perform('stop')}>{busy === 'stop' ? 'Menghentikan…' : 'Hentikan agent'}</button>
    </div>
    <p className="fine-print">Had masa setiap larian: 20 minit. Ketika menunggu peserta, tiada panggilan model baharu. Henti membatalkan hasil panggilan semasa; caj yang sudah diproses penyedia mungkin masih dikenakan.</p>
    <button className="text-button" type="button" disabled={busy !== null} onClick={() => setConfirmReset(!confirmReset)}>Reset misi</button>
    {confirmReset && <div className="reset-confirm" role="group" aria-label="Sahkan reset misi">
      <p>Hentikan agent dan kosongkan misi serta tugasan aktif? Rekod lama diarkibkan; peserta dan pautan sesi kekal.</p>
      <button className="secondary-button" type="button" disabled={busy !== null} onClick={() => void perform('reset')}>{busy === 'reset' ? 'Mereset…' : 'Ya, reset misi'}</button>
      <button className="text-button" type="button" disabled={busy !== null} onClick={() => setConfirmReset(false)}>Batal</button>
    </div>}
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
