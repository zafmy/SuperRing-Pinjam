# Frontend handoff — untuk kawan

Owner: frontend teammate. Branch: `feat/frontend`. Ruang kerja: `web/**`.

## Mula sekarang

Selepas clone: `npm ci`, `git switch -c feat/frontend`, kemudian `npm run dev`.

React + TypeScript + Vite sudah tersedia. Gantikan paparan starter dalam web/src/App.tsx dengan pengalaman peserta dan penyelaras. Reka bentuk produk adalah bahagian kamu; starter tidak menetapkan visual akhir.

## Urutan kerja

1. Bina paparan host untuk mencipta sesi menggunakan api.createSession. Simpan hostToken untuk sesi itu. Paparkan kod dan URL jemputan; tambah QR selepas menentukan dependency bersama owner.
2. Bina paparan join daripada URL cadangan `/join/:code`, dengan nama dan lokasi. Panggil api.joinSession, simpan participantId/token dan pulihkan sesi selepas reload.
3. Paparkan peserta dan status sesi pada host. Gunakan api.getSession dengan polling terkawal. Kedua-dua telefon mesti menggunakan backend yang sama.
4. Bina paparan permintaan gambar/soalan, muat naik, serta terima/tolak/lapor halangan mengikut jenis data shared/contracts.ts. Gunakan fixture berlabel untuk endpoint yang belum dibina.
5. Sambungkan flow gambar dan tugasan kepada API sebenar selepas backend owner mengemas kini API_CONTRACT.md.

Prioriti UX: satu tindakan utama pada telefon, sasaran butang mudah disentuh, keadaan menunggu/ralat jelas, dan paparan sumber bukti pada laptop. Gunakan bahasa ringkas yang sesuai untuk sukarelawan di tempat workshop yang sibuk.

## Sempadan

- Edit web/**. Jangan mengubah server/**, shared/contracts.ts atau root dependencies tanpa koordinasi.
- Jangan reka API payload baharu. Baca API_CONTRACT.md dan gunakan web/src/api.ts.
- API key model tidak diperlukan untuk bina frontend dan tidak boleh berada dalam browser bundle.
- Jangan tandakan AI aktif atau tugas selesai jika fungsi sebenar belum tersedia.
- Hantar PR kecil untuk create/join terlebih dahulu, kemudian teruskan bahagian berikutnya.

## Prompt untuk coding assistant kamu

> Saya frontend owner untuk PINJAM. Baca AGENTS.md, README.md, docs/FRONTEND_HANDOFF.md dan docs/API_CONTRACT.md. Bekerja pada branch feat/frontend yang bermula daripada main terkini. Implement dahulu paparan host create-session dan participant join-session menggunakan API sebenar, simpan credential mengikut sesi dan sokong reload. Bahagian saya ialah web/**. Backend dan root tooling dikendalikan teammate. Guna shared/contracts.ts serta web/src/api.ts; jangan tukar kontrak atau dependency bersama tanpa koordinasi. Reka pengalaman mobile yang jelas untuk dua sukarelawan di workshop. Jalankan semakan yang sesuai, kemas kini status, dan hantar PR kecil ke main. Jangan bina keseluruhan backend atau berpura-pura fungsi agent sudah tersedia.
