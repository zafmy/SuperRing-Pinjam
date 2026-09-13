import { useEffect, useMemo, useState } from 'react';
import type { SessionView } from '../../shared/contracts';
import { sessionNotices } from '../../shared/notifications';
import { api } from './api';

function readSeen(key: string): string[] { try { const value = JSON.parse(localStorage.getItem(key) ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; } catch { return []; } }
export async function removeDevicePush(code: string, token: string) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) await api.pushAction(code, token, 'unsubscribe', { endpoint: subscription.endpoint });
}
export function NotificationCenter({ session, token, participantId }: { session: SessionView; token: string; participantId?: string }) {
  const storageKey = `pinjam.seen-notices:${session.code}:${participantId ?? 'host'}`;
  const [seen, setSeen] = useState<string[]>(() => readSeen(storageKey));
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ registration: ServiceWorkerRegistration; publicKey: string } | null>(null);
  const notices = useMemo(() => sessionNotices(session, participantId), [session, participantId]);
  const unread = notices.filter((notice) => !seen.includes(notice.id));
  useEffect(() => {
    document.title = `${unread.length ? `(${unread.length}) ` : ''}PINJAM`;
    return () => { document.title = 'PINJAM'; };
  }, [unread.length]);
  useEffect(() => {
    let disposed = false;
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setMessage('Notifikasi telefon memerlukan HTTPS dan browser yang menyokong Push. Pada iPhone, tambah ke Home Screen dahulu.');
      return;
    }
    void (async () => {
      try {
        const [config] = await Promise.all([api.pushConfig(session.code, token), navigator.serviceWorker.register('/sw.js')]);
        const registration = await navigator.serviceWorker.ready;
        if (disposed) return;
        if (!config.enabled || !config.publicKey) { setMessage('Notifikasi telefon belum tersedia pada pelayan.'); return; }
        setReady({ registration, publicKey: config.publicKey });
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          const status = await api.pushAction(session.code, token, 'status', { endpoint: subscription.endpoint });
          if (!disposed) { setSubscribed(Boolean(status.subscribed)); if (status.lastError) setMessage(status.lastError); }
        }
      } catch (error) { if (!disposed) setMessage(error instanceof Error ? error.message : 'Tidak dapat menyediakan notifikasi.'); }
    })();
    return () => { disposed = true; };
  }, [session.code, token]);
  const enable = async () => {
    if (!ready || busy) return;
    setBusy(true); setMessage('');
    try {
      // This is the direct click handler; permission is never requested on page load.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notifikasi belum dibenarkan. Semak tetapan notifikasi browser.');
      const existing = await ready.registration.pushManager.getSubscription();
      const subscription = existing ?? await ready.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ready.publicKey });
      await api.pushAction(session.code, token, 'subscribe', subscription.toJSON());
      setSubscribed(true); setMessage('Notifikasi telefon diaktifkan untuk sesi ini.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Notifikasi gagal diaktifkan.'); }
    finally { setBusy(false); }
  };
  const pushAction = async (action: 'test' | 'unsubscribe') => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const subscription = await ready.registration.pushManager.getSubscription();
      if (!subscription) throw new Error('Aktifkan notifikasi semula.');
      await api.pushAction(session.code, token, action, { endpoint: subscription.endpoint });
      if (action === 'unsubscribe') { setSubscribed(false); setMessage('Notifikasi telefon untuk sesi ini dimatikan.'); }
      else setMessage('Ujian diterima perkhidmatan push. Semak notifikasi pada telefon anda.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Tindakan notifikasi gagal.'); }
    finally { setBusy(false); }
  };
  return <section className="notification-center" aria-label="Notifikasi">
    <div className="card-heading"><h2>Notifikasi {unread.length > 0 && <span className="count-badge">{unread.length}</span>}</h2>
      {unread.length > 0 && <button className="text-button" type="button" onClick={() => { const ids = notices.map((notice) => notice.id); setSeen(ids); try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch {} }}>Tandakan dibaca</button>}
    </div>
    <p className="sr-only" role="status" aria-live="polite">{unread.length} notifikasi belum dibaca.</p>
    {unread.length > 0 ? <ul className="notice-list">{unread.slice(-4).reverse().map((notice) => <li key={notice.id}><strong>{notice.title}</strong><span>{notice.body}</span></li>)}</ul> : <p>Tiada notifikasi baharu.</p>}
    <div className="task-actions">
      {!subscribed ? <button className="secondary-button" type="button" disabled={!ready || busy} onClick={() => void enable()}>Aktifkan notifikasi telefon</button> : <>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => void pushAction('test')}>Hantar ujian notifikasi</button>
        <button className="text-button" type="button" disabled={busy} onClick={() => void pushAction('unsubscribe')}>Matikan notifikasi telefon</button>
      </>}
    </div>
    {message && <p role="status">{message}</p>}
    <p className="fine-print">Untuk iPhone: Share → Add to Home Screen, buka PINJAM dari ikonnya, sertai sesi dan aktifkan notifikasi. Penghantaran bergantung pada kebenaran, sambungan dan tetapan telefon.</p>
  </section>;
}
