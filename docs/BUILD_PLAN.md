# PINJAM — Pelan bina untuk dua orang

Status: Backend sesi, misi, permintaan gambar/soalan, muat naik gambar dan jawapan peserta sudah dibina serta diuji melalui API. Integrasi paparan telefon, tugasan dan agent masih belum siap. Rujuk STATUS.md untuk kemajuan semasa.

Repository pasukan: https://github.com/zafmy/SuperRing-Pinjam

Repository bermula kosong pada 13 September 2026. Starter ini menjadi asas bersama; branch kerja diterangkan dalam TEAM_WORKFLOW.md.

## Cara dua orang bekerja serentak

1. Pemilik repository menjemput akaun GitHub kawan melalui Settings → Collaborators → Add people. Kawan menerima jemputan untuk boleh menghantar perubahan ke repository yang sama.
2. Pemilik menyediakan satu starter bersama dahulu: aplikasi asas yang boleh dijalankan, arahan setup, konfigurasi contoh, pelan kerja dan persetujuan format data/API. Hanya seorang mengurus initial setup, pilihan stack dan fail dependency bersama.
3. Kedua-dua orang clone repository ke komputer masing-masing dan membuka folder itu dalam editor/Codex sendiri. Kod diselaraskan melalui Git; jangan anggap perbualan atau perubahan tempatan diketahui secara automatik oleh rakan.
4. Cadangan pembahagian: pengguna bersama assistant ini mengurus backend/agent pada `feat/backend`; kawan mengurus frontend pada `feat/frontend`. Branch bermula daripada starter yang sama. `main` menjadi tempat versi bersepadu selepas initialization.
5. Frontend boleh menggunakan data contoh mengikut kontrak yang dipersetujui sementara backend dibina. Tandakan ini sebagai mod pembangunan; integrasi dengan backend sebenar wajib sebelum dianggap siap.
6. Setiap bahagian kecil dihantar sebagai pull request. Pengguna menjadi penyelaras integrasi: semak perubahan, gabungkan, kemudian kedua-dua pihak mengambil versi terkini sebelum meneruskan bahagian seterusnya. Integrasi pertama dibuat sebaik aliran minimum tersedia, bukan pada akhir event.
7. Perubahan pada nama field, endpoint, status atau dependency bersama mesti dimaklumkan sebelum digunakan oleh kedua-dua pihak. Catat kemajuan dan keputusan dalam dokumen repository.

Untuk demo, kedua-dua telefon membuka URL aplikasi yang menggunakan backend sama dan menyertai kod sesi sama. Menggunakan repository yang sama sahaja tidak menyatukan data daripada dua server tempatan yang berasingan. Telefon peserta demo tidak memerlukan akaun GitHub.

## Matlamat demo

Satu arahan menyiapkan meja workshop untuk tiga peserta: setiap orang memerlukan satu notebook, satu pen dan satu name tag. Dua peserta manusia menyertai satu sesi melalui telefon di lokasi berbeza. Agent meminta pemerhatian, mencadangkan tugasan, menyesuaikan rancangan apabila ada halangan, dan meminta bukti serta pengesahan sebelum menandakan misi selesai.

Kejayaan perlu dibuktikan oleh tiga perkara:

1. Satu misi fizikal selesai melalui dua telefon dan satu paparan laptop.
2. Agent pulih selepas satu gangguan, seperti peserta menolak tugasan atau barang tidak tersedia.
3. Status akhir disokong oleh pemerhatian terkini dan pengesahan manusia apabila gambar tidak mencukupi.

Ini sasaran produk dan ujian, bukan fungsi yang sudah dibina atau keputusan yang sudah dicapai.

## Skop tetap

- Satu web app: paparan peserta di telefon dan paparan penyelaras di laptop.
- Satu sesi, dua lokasi bernama, dua peserta, satu misi aktif.
- Masuk dengan QR atau pautan dan kod sesi; tiada akaun pengguna kompleks.
- Gambar atas permintaan, jawapan teks, dan butang terima/tolak/lapor halangan.
- Satu agent dengan tindakan terhad; status dan kuantiti disemak oleh kod biasa.
- Satu alternatif barang hanya boleh digunakan selepas pengguna bersetuju.
- Gambar kabur atau objek terlindung dianggap tidak pasti; ketiadaan dalam gambar bukan bukti pasti bahawa barang tiada.

Tangguhkan suara, video langsung, AR, GPS, WhatsApp/Slack, banyak agent, pembayaran, dan sokongan semua jenis misi.

## Pembahagian kerja

| Orang | Pemilikan utama |
|---|---|
| Person 1 | Paparan telefon dan laptop, masuk sesi, kamera/muat naik gambar, butang tindakan, pengalaman demo. |
| Person 2 | Backend, simpanan sesi, sambungan model dengan input imej, alat agent, perubahan status, pengendalian ralat. |
| Bersama | Kontrak data sebelum berpecah, integrasi, ujian fizikal, video dan submission. |

Sebelum kerja serentak, sepakati bentuk data sesi, permintaan, jawapan, tugasan dan peristiwa. Gunakan pembahagian fail yang jelas atau branch berasingan dalam repository yang sama.

## Urutan bina — bajet empat jam

Masa di bawah relatif kepada mula bina. Handbook memberikan jadual contoh dengan submission pada 3:30 petang; sahkan deadline KL dan butiran hadiah dalam portal sebelum mengikut jam mutlak. Jika masa tinggal kurang, kekalkan masa submission dan kecilkan fungsi tambahan.

### 0. Kunci misi dan persediaan — minit 0–10

- [ ] Semak deadline sebenar, syarat penggunaan penaja dan kategori hadiah jika tersedia.
- [ ] Tetapkan dua lokasi: Meja Bekalan dan Meja Pendaftaran.
- [ ] Sediakan dua telefon, satu laptop, notebook, pen, name tag serta pelekat kosong sebagai alternatif.
- [ ] Pilih satu gangguan utama: peserta di Meja Bekalan tidak boleh meninggalkan meja.
- [ ] Pilih stack yang paling biasa kepada pasukan; utamakan deployment HTTPS yang boleh dicapai kedua-dua telefon.
- [ ] Sediakan repository, contoh konfigurasi tanpa rahsia, dan satu API key model di backend sahaja.

Siap apabila kedua-dua orang tahu demo, skop dan bahagian masing-masing.

### 1. Hubungkan dua telefon — minit 10–45

- [ ] Bina sesi dan pautan/QR untuk masuk.
- [ ] Peserta memilih nama panggilan dan lokasi.
- [ ] Laptop memaparkan peserta yang menyertai sesi.
- [ ] Hantar satu permintaan pemerhatian dari paparan penyelaras kepada telefon yang dipilih.
- [ ] Ambil atau muat naik gambar; gambar dan sumbernya muncul pada laptop.
- [ ] Muat semula satu telefon dan pastikan sesi/status dipulihkan.

Checkpoint 45 minit: dua telefon benar-benar berkongsi sesi; satu permintaan dan jawapan bergambar bergerak hujung ke hujung. Pada tahap ini permintaan manual ialah scaffolding integrasi, bukan bukti agent sudah berfungsi.

### 2. Hidupkan agent — minit 45–90

- [ ] Pengguna memasukkan misi; sistem memaparkan senarai keperluan untuk disahkan.
- [ ] Agent membaca peserta, lokasi dan pemerhatian yang tersedia.
- [ ] Agent memilih peserta untuk diminta gambar atau penjelasan.
- [ ] Apabila jawapan diterima, agent menggunakan hasil itu untuk menentukan langkah berikutnya.
- [ ] Agent membezakan fakta yang dilihat, maklumat pengguna dan perkara yang belum pasti.
- [ ] Tiada nama peserta, lokasi atau barang yang dicipta tanpa data sesi.

Checkpoint 90 minit: satu gelung agent sebenar berjalan — misi → permintaan → gambar/jawapan → tindakan seterusnya. Jika belum berjalan, hentikan polish dan kurangkan skop.

### 3. Lengkapkan tindakan dan pemulihan — minit 90–135

- [ ] Agent menawarkan tugasan membawa barang kepada peserta tertentu.
- [ ] Peserta boleh menerima, menolak atau melaporkan halangan.
- [ ] Tugasan menjadi milik peserta hanya selepas diterima.
- [ ] Penolakan membolehkan agent menawarkan rancangan baharu tanpa menandakan tugasan asal selesai.
- [ ] Barang tidak tersedia mencetuskan pertanyaan atau cadangan alternatif untuk diluluskan.
- [ ] Selepas tindakan dilaporkan selesai, agent meminta pemerhatian terkini di destinasi.
- [ ] Sistem menyemak keperluan yang belum dipenuhi dan meminta pengesahan manusia bagi ketidakpastian.

Checkpoint: misi boleh selesai dan satu gangguan boleh ditangani tanpa penyelaras menyunting status secara manual di belakang tabir.

### 4. Kukuhkan pengalaman — minit 135–170

- [ ] Paparkan status ringkas: perlu pemerhatian, menunggu jawapan, tawaran tugasan, sedang dibuat, perlu semakan, selesai atau terhalang.
- [ ] Setiap permintaan mempunyai ID, peserta sasaran, lokasi, status dan bukti yang berkaitan.
- [ ] Ketukan berganda atau percubaan semula tidak menggandakan tugasan.
- [ ] Agent berhenti apabila menunggu manusia; ia disambung oleh jawapan baharu, bukan panggilan model yang berulang tanpa sebab.
- [ ] Hadkan bilangan percubaan dan jelaskan apabila model atau rangkaian gagal.
- [ ] Paparkan gambar yang sedang digunakan, sumber dan masa diterima. Pemerhatian lama boleh disemak semula apabila keadaan berubah.
- [ ] Foto kabur meminta penjelasan; kesimpulan tidak dipaksa untuk menjadikan dashboard hijau.
- [ ] Perubahan sesi kekal selepas reload; peserta tidak menerima permintaan milik sesi lain.

### 5. Uji seperti judge — minit 170–190

Jalankan pada dua telefon sebenar, menggunakan objek sebenar. Rekod hasil sebenar dalam nota ujian.

| Ujian | Hasil yang diperlukan |
|---|---|
| Semua barang tersedia | Misi selesai dengan bukti dan status konsisten. |
| Peserta menolak tugasan | Agent menyesuaikan rancangan; tugasan tidak dianggap diterima. |
| Barang habis | Agent meminta keputusan/alternatif; tidak mendakwa barang tersedia. |
| Gambar kabur atau terlindung | Agent bertanya semula atau meminta pengesahan. |
| Dua kali tekan butang/retry | Tiada tugasan atau peristiwa tindakan berganda. |
| Reload telefon atau API gagal | Sesi kekal; pengguna melihat status menunggu/ralat yang betul. |
| Satu barang dialih ketika ujian | Maklumat baharu mengubah rancangan; pemerhatian lama tidak dianggap kebenaran kekal. |

Minta teammate menentukan satu gangguan daripada jenis yang disokong tanpa memberitahu penyelaras terlebih dahulu. Tidak perlu menjanjikan sistem boleh menangani semua kejutan.

Bekukan ciri pada akhir langkah ini. Baiki bug yang menjejaskan demo sahaja.

### 6. Video dan submission — minit 190–240

- [ ] Rekod video demonstrasi dua minit menggunakan aliran sebenar.
- [ ] Terangkan tugas manusia dan tindakan agent dengan jelas.
- [ ] Paparkan satu gangguan, tindak balas agent dan hasil akhir.
- [ ] Tulis README: masalah, cara menjalankan, konfigurasi, seni bina ringkas, had dan bahagian yang dibina semasa event.
- [ ] Pastikan repository boleh diakses mengikut syarat submission; jangan sertakan API key atau gambar peribadi yang tidak dimaksudkan untuk penerbitan.
- [ ] Siapkan tajuk dan deskripsi projek.
- [ ] Siapkan post sosial dengan tag partner yang disahkan melalui portal, kemudian terbitkan mengikut syarat submission.
- [ ] Semak pautan repository dan video dari sesi tanpa login jika ia perlu boleh diakses umum.
- [ ] Submit dan simpan bukti pengesahan sebelum deadline.

Handbook memerlukan projek baharu dan fungsi teras dibina dalam tempoh rasmi. Simpan rekod perubahan untuk menerangkan kerja yang dibuat semasa event. Langkah di atas ialah rancangan; dokumen ini tidak menerbitkan repository, menghantar mesej atau membuat submission.

## Rangka video dua minit

| Masa | Paparan |
|---|---|
| 0–15 saat | Masalah penyelarasan dan satu arahan menyiapkan meja. |
| 15–45 saat | Agent meminta pemerhatian daripada dua lokasi dan mengenal pasti keperluan. |
| 45–80 saat | Tugasan ditawarkan; seorang peserta menolak; agent mencadangkan pelan baharu. |
| 80–105 saat | Tindakan fizikal dan pemerhatian terkini di destinasi. |
| 105–120 saat | Hasil, skop prototaip, dan penerangan ringkas mengapa konteks tempat penting. |

## Arahan follow-up untuk meneruskan

1. “Mulakan PINJAM langkah 0–1 berdasarkan pelan: kunci skop, setup projek dan sambungkan dua telefon dengan satu sesi serta gambar.”
2. “Teruskan PINJAM langkah 2: sambungkan agent sebenar yang memilih pemerhatian dan bertindak berdasarkan jawapan.”
3. “Teruskan PINJAM langkah 3: bina tawaran tugasan, terima/tolak, pemulihan dan pengesahan hasil.”
4. “Teruskan PINJAM langkah 4–5: kukuhkan status, tangani ralat dan jalankan ujian demo.”
5. “Siapkan PINJAM langkah 6: README, deskripsi submission, skrip video dua minit dan draf post sosial.”

Kemas kini checklist dan nota ujian selepas setiap langkah. Jangan tandakan sesuatu siap sebelum hasil checkpoint diperiksa.
