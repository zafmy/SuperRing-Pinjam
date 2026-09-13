# Reset, notifikasi telefon dan agent automatik

## Selepas deploy main terkini

1. Buka dashboard penyelaras dan sahkan misi. Peserta boleh masuk menggunakan pautan atau kod enam aksara.
2. Pada setiap telefon, tekan **Aktifkan notifikasi telefon** dan benarkan notifikasi. Tekan **Hantar ujian notifikasi**, kemudian semak notification tray.
3. Pada iPhone/iPad, gunakan Share → Add to Home Screen, buka PINJAM dari ikon tersebut, masukkan kod sesi dan aktifkan notifikasi dalam aplikasi Home Screen. Memasang ikon sahaja tidak memberikan kebenaran notifikasi.
4. Penyelaras pilih had langkah (default 30) dan tekan **Mulakan automatik**. Panel menunjukkan status, bilangan langkah dicuba, had masa dan keputusan terakhir.
5. Tutup halaman peserta. Apabila agent meminta gambar atau menawarkan tugasan, telefon patut menerima notifikasi. Tekan notifikasi untuk membuka sesi dan jawab.
6. Agent menyambung selepas jawapan atau perubahan tugasan. Ia menunggu tanpa memanggil model berulang jika tiada maklumat baharu. Peserta masih memilih sama ada menerima atau menolak kerja.
7. Tekan **Hentikan agent** untuk menghentikan automasi/panggilan semasa. Hasil yang tiba selepas stop tidak digunakan. Kerja fizikal yang sudah diterima perlu dihentikan oleh peserta sendiri.
8. Untuk misi baharu, tekan **Reset misi**, semak penerangan inline dan sahkan. Peserta/pautan kekal. Rekod misi lama diarkibkan pada server; UI kembali kepada borang misi baharu.

## Tetapan Dokploy

Tetapan sedia ada kekal: satu replica, stop-first updates, volume di /app/.data, HTTPS domain pada port 3001, CMD_API_KEY dan AI_MODEL. Tiada key push perlu disalin ke frontend. Server menjana sekali push-vapid.json dan menyimpan push-subscriptions.json dalam volume yang sama. Jangan padam atau gantikan volume sewaktu redeploy.

Pilihan: VAPID_SUBJECT boleh ditetapkan kepada URL sokongan atau alamat mailto milik pasukan. Default ialah URL repository projek. Tiada private key dimasukkan dalam repo, bundle atau pautan notifikasi.

Selepas restart/redeploy, automasi aktif berhenti dengan mesej pemulihan. Penyelaras tekan Mulakan automatik semula selepas menyemak keadaan. Ini mengelakkan panggilan yang terputus diteruskan tanpa diketahui. Had setiap run ialah maksimum 100 langkah dan 20 minit. Ralat provider atau had yang dicapai memerlukan semakan sebelum run baharu.

## Ujian bersama sebelum demo

- Uji notifikasi sebenar pada setiap telefon, termasuk ketika halaman ditutup. Respons “ujian diterima” bermaksud push service menerima mesej, bukan bukti telefon memaparkannya.
- Jalankan misi → permintaan foto → tawaran tugasan → seorang menolak → agent cari tindakan lain → bukti baharu → pengesahan selesai.
- Semasa “sedang berjalan”, tekan stop dan pastikan tiada tugasan/permintaan baharu daripada hasil lambat.
- Reset, sahkan misi baharu dan pastikan tiada foto/tugasan lama muncul dalam konteks baru. Token dan pautan peserta masih berfungsi.
- Matikan notifikasi satu telefon, pastikan ia tidak menerima notifikasi sesi itu lagi.
- Redeploy dengan volume yang sama; pastikan misi, gambar dan langganan kekal serta automasi meminta penyelaras menyambung.

23 ujian automatik meliputi kawalan dan protokol menggunakan respons model serta penghantaran push yang disuntik. Sambungan CommandCode sebenar, penghantaran telefon sebenar dan paparan browser masih perlu diuji pada deployment. Reset mengekalkan fail gambar, jadi had storan gambar 50 MiB bagi sesi masih terpakai. Rekod arkib belum mempunyai paparan UI.

Rujukan: [Web Push iOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/), [Push subscription](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe).
