import { useEffect, useState } from 'react';
import { api } from './api';

/** Temporary development check. The frontend owner replaces this with the participant/host flows. */
export default function App() {
  const [status, setStatus] = useState('Menyemak sambungan…');
  useEffect(() => {
    const controller = new AbortController();
    api.health(controller.signal)
      .then(() => setStatus('API tersambung.'))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setStatus(error instanceof Error ? error.message : 'Sambungan gagal.');
      });
    return () => controller.abort();
  }, []);

  return <main>
    <p className="eyebrow">SuperRing · Development starter</p>
    <h1>PINJAM</h1>
    <p>Asas bersama untuk agent yang menyelaras kerja fizikal melalui telefon peserta.</p>
    <p role="status">{status}</p>
    <hr />
    <h2>Handoff untuk frontend</h2>
    <p>Paparan peserta dan penyelaras akan dibina di sini. Agent, pemeriksaan gambar dan tugasan belum aktif.</p>
    <p>Mulakan dengan <code>docs/FRONTEND_HANDOFF.md</code>. Jenis data, data contoh dan API client sudah tersedia.</p>
  </main>;
}
