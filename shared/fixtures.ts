import type { SessionView } from './contracts';

/** Development fixture only. Never present this as a real agent run. */
export const demoSession: SessionView = {
  id: 'fixture-session', code: 'DEMO01', title: 'Meja workshop', revision: 1,
  createdAt: '2026-09-13T04:00:00.000Z', updatedAt: '2026-09-13T04:00:00.000Z',
  participants: [
    { id: 'fixture-ali', name: 'Ali', zone: 'Meja Bekalan', joinedAt: '2026-09-13T04:00:00.000Z' },
    { id: 'fixture-mira', name: 'Mira', zone: 'Meja Pendaftaran', joinedAt: '2026-09-13T04:00:00.000Z' },
  ],
  mission: {
    id: 'fixture-mission', goal: 'Siapkan meja workshop untuk tiga peserta.', status: 'waiting',
    requirements: [
      { id: 'notebook', label: 'Notebook', quantity: 3 },
      { id: 'pen', label: 'Pen', quantity: 3 },
      { id: 'name-tag', label: 'Name tag', quantity: 3 },
    ],
  },
  requests: [{ id: 'fixture-request', participantId: 'fixture-mira', kind: 'photo',
    prompt: 'Boleh tunjuk keadaan meja pendaftaran sekarang?', status: 'pending', createdAt: '2026-09-13T04:00:00.000Z' }],
  observations: [], tasks: [], events: [],
};
