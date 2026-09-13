# Untuk kawan: borang misi dan kawalan agent

Owner: frontend teammate, `feat/frontend`, edit `web/**`. Backend sudah menyediakan kontrak v0.3. Simpan/commit kerja sendiri, fetch origin dan merge origin/main ke branch sendiri; jangan reset atau overwrite kerja. Baca AGENTS.md dan docs/API_CONTRACT.md. Tiada dependency baharu diperlukan.

## 1. Dashboard penyelaras: Tetapkan misi

Letakkan kad ini sebelum permintaan manual, hanya apabila credential.role ialah host dan session.mission belum ada. Peserta tidak melihat borang.

- Matlamat (required, maksimum 2000 aksara).
- Senarai keperluan: nama (1–120 aksara), kuantiti integer 1–100, 1–20 baris. Setiap baris ada ID stabil unik, maksimum 80 aksara; gunakan helper ID sedia ada yang serasi HTTP LAN.
- Contoh boleh diedit: “Sediakan meja workshop untuk 3 peserta”; buku nota ×3, pen ×3, tanda nama ×3.
- Butang “Sahkan misi”. Hantar CreateMissionInput ke POST /api/sessions/:code/missions dengan host token dan Idempotency-Key. Simpan key bagi retry input yang sama; kunci input ketika submitting. Selepas berjaya, paparkan matlamat dan semua keperluan daripada respons server.
- Satu misi per sesi. MISSION_EXISTS: refresh snapshot dan tunjuk misi sedia ada. Jangan tawarkan edit/reset yang belum wujud.

## 2. Dashboard penyelaras: Mulakan agent

Tambah kaedah api.createMission, api.stepAgent dan api.respondToTask dalam web/src/api.ts berdasarkan shared types.

- Baca /api/health. Jika agent=not_configured, paparkan “Sambungan AI belum dikonfigurasi pada pelayan” dan disable butang. Jangan minta API key pada frontend.
- Selepas misi disahkan dan sekurang-kurangnya satu peserta masuk, aktifkan “Mulakan agent”.
- POST /api/sessions/:code/agent/step dengan host token, Idempotency-Key dan {}. Paparkan “Agent sedang menilai…”; disable butang sehingga selesai. Satu klik = satu keputusan model, bukan worker automatik.
- Selepas berjaya, guna AgentStepResult.session dan summary. Tukar label ke “Langkah agent seterusnya”. Event agent_step yang dipersist boleh menentukan label selepas reload.
- Jangan panggil step daripada polling/useEffect. Polling hanya GET sesi. Host mencetus langkah berikutnya selepas peserta menjawab atau status tugasan berubah.
- Jangan paparkan agent aktif hanya kerana mission.status=active. Bezakan misi disimpan, sedang memproses, menunggu peserta, ralat, dan misi selesai.
- Simpan key langkah tertunda mengikut sesi/role dalam sessionStorage supaya retry selepas reload tidak mengulangi langkah yang berjaya. Selepas keputusan diterima, langkah seterusnya mendapat key baharu.
- Ralat: paparkan mesej API. Untuk AGENT_BUSY tunggu; untuk AGENT_STALE refresh sesi dan tawarkan langkah baharu. Tiada retry automatik yang menggunakan kredit berulang.

## 3. Telefon peserta: tugasan saya

Tapis session.tasks dengan participantId sendiri. Paparkan tajuk, status dan nota.

- offered: “Terima” / “Tolak”.
- accepted: “Mula” / “Lapor siap” / “Tak dapat teruskan”.
- in_progress: “Lapor siap” / “Tak dapat teruskan”.
- decline menghantar action=decline dengan nota pilihan; tiada arahan paksa.
- report_done hanya needs_verification; tunjuk “Menunggu semakan bukti”.
- completed: selesai disemak; declined: kekalkan ditolak.
- Semua mutasi guna participant token + Idempotency-Key. Jangan ubah status hanya pada client; tunggu respons server.

## 4. Semakan dan serahan

Jalankan npm run check. Uji host sahkan misi → langkah agent → permintaan pada telefon → gambar → langkah agent → tawaran tugasan → peserta tolak → langkah baharu. Model memerlukan key pada backend; tanpa key, uji borang misi serta keadaan agent belum dikonfigurasi. Label simulasi ujian dengan jelas.

Kemas kini docs/STATUS.md dengan keputusan sebenar, commit/push branch sendiri dan buka PR ke main. Jangan merge kerja backend atau ubah provider credentials. Hantar link PR kepada penyelaras.

## Prompt untuk assistant kawan

Saya frontend owner PINJAM. Simpan kerja sedia ada dan merge origin/main terkini ke feat/frontend. Baca AGENTS.md, docs/API_CONTRACT.md v0.3 dan docs/MISSION_AGENT_HANDOFF.md. Implement borang Tetapkan misi pada dashboard host, butang Mulakan agent/Langkah agent seterusnya, dan respons tugasan peserta menggunakan API sebenar serta shared types. Edit web/** sahaja; tiada perubahan backend/root dependencies. Kekalkan kerja UI yang sudah siap, idempotency, role checks pada paparan dan snapshot revision handling. Satu klik host = satu langkah model; jangan auto-call agent dalam polling. Jangan tandakan mission active sebagai worker AI sedang berjalan. Jalankan npm run check, kemas kini status sebenar, commit, push dan buka PR ke main.
