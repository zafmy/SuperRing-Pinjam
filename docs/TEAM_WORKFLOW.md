# Kerja serentak

## Permulaan

1. Terima jemputan GitHub dan clone repository ke komputer sendiri.
2. Buka folder repository dalam Codex/editor sendiri.
3. Baca README, API_CONTRACT dan handoff bahagian masing-masing.
4. Jalankan `npm ci` dan `npm run dev`.

Kawan frontend:

```sh
git switch main
git pull --ff-only origin main
git switch -c feat/frontend
```

Pemilik backend menggunakan `feat/backend` dengan langkah yang sama. Jika branch sudah wujud, gunakan branch itu dan jangan cipta branch dengan kandungan yang bertentangan.

## Aliran harian

- Siapkan perubahan kecil: contohnya masuk sesi dahulu, kemudian kamera, kemudian respons tugasan.
- Commit hanya fail yang dimaksudkan, push branch sendiri, buka pull request ke `main`.
- zafmy menjadi penyelaras integrasi. Gabungkan aliran minimum awal; jangan tunggu semua feature siap.
- Selepas PR digabungkan, simpan/commit kerja sendiri, fetch `origin`, kemudian merge `origin/main` ke feature branch. Selesaikan konflik dengan memahami kedua-dua perubahan. Jangan buang kerja kawan atau force-push.
- Jalankan `npm run check` sebelum menyerahkan perubahan.
- Catat status sebenar dalam docs/STATUS.md. Perbualan Codex dan perubahan lokal tidak diselaraskan secara automatik melalui GitHub.

## Kontrak bersama

Frontend menggunakan jenis daripada shared/contracts.ts dan client web/src/api.ts. Endpoint masa depan ditandakan jelas dalam API_CONTRACT.md.

Jika frontend perlukan field atau endpoint baharu, tulis cadangan yang spesifik dalam PR. Backend owner menyelaraskan perubahan. Jangan reka payload berbeza dalam dua tempat.

Fail package.json, package-lock.json, vite.config.ts dan konfigurasi root dikendalikan backend owner dahulu. Nyatakan keperluan dependency frontend dalam PR sebelum kedua-dua orang menyunting lockfile.

## Demo bersama

GitHub menyelaraskan kod; backend menyelaraskan sesi. Dua laptop dengan dua server berasingan mempunyai data berbeza walaupun kodnya sama. Untuk demo, kedua-dua telefon membuka deployment/backend yang sama dan kod sesi yang sama.

QR mengandungi URL masuk dengan kod sesi sahaja. Jangan masukkan token host, token peserta atau key model ke QR.
