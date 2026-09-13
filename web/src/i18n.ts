export type Language = 'ms' | 'en';

export const languageStorageKey = 'pinjam.language.v1';

export function readLanguage(): Language {
  try { return localStorage.getItem(languageStorageKey) === 'en' ? 'en' : 'ms'; }
  catch { return 'ms'; }
}

export function saveLanguage(language: Language) {
  try { localStorage.setItem(languageStorageKey, language); } catch { /* The current choice still works for this visit. */ }
}

// The app started in Bahasa Melayu. Keeping the original Malay copy as the
// source lets old components and newly rendered async states switch together.
const english: Record<string, string> = {
  'Sambungan tidak dapat diselesaikan. Cuba lagi.': 'The connection could not be completed. Try again.',
  'Pilih bahasa': 'Choose language',
  'baru sahaja': 'just now',
  'Belum ada kemas kini daripada ruang kerja ini.': 'There are no updates from this workspace yet.',
  'Diselaraskan': 'Synced',
  '← Kembali': '← Back',
  'PENYELARAS': 'COORDINATOR',
  'Buka ruang bantuan': 'Open a help space',
  'Anda akan menerima kod jemputan dan boleh melihat peserta yang masuk dari telefon mereka.': 'You will receive an invite code and can see participants joining from their phones.',
  'Nama ringkas sesi': 'Short session name',
  'Membuka sesi…': 'Opening session…',
  'Cipta sesi': 'Create session',
  'Token penyelaras disimpan pada peranti ini sahaja dan tidak dimasukkan dalam pautan jemputan.': 'The coordinator token is stored only on this device and is never included in the invite link.',
  'SERTAI RUANG': 'JOIN SPACE',
  'Anda di mana sekarang?': 'Where are you now?',
  'Anda sedang menyertai sesi ': 'You are joining session ',
  '. Beritahu penyelaras kawasan yang anda boleh lihat.': '. Tell the coordinator which area you can see.',
  'Nama anda': 'Your name',
  'Lokasi atau kawasan anda': 'Your location or area',
  'Contoh: Meja bekalan': 'Example: Supply table',
  'Menyertai…': 'Joining…',
  'Sertai sesi': 'Join session',
  'Maklumat ini hanya dikongsi dengan orang dalam sesi ini.': 'This information is only shared with people in this session.',
  'MEMULIHKAN SESI': 'RESTORING SESSION',
  'Akses sesi telah ditamatkan': 'Session access has ended',
  'Menyambung semula…': 'Reconnecting…',
  'Anda mungkin telah dikeluarkan oleh penyelaras. Hubungi penyelaras untuk menyertai semula.': 'You may have been removed by the coordinator. Contact them to join again.',
  'Menyemak akses selamat pada peranti ini.': 'Checking secure access on this device.',
  'Gunakan sesi lain': 'Use another session',
  'Satu ruang. Dua pandangan.': 'One space. Two perspectives.',
  'Selaras bantuan ringkas di meja workshop tanpa kehilangan konteks di antara telefon dan laptop.': 'Coordinate quick help at a workshop table without losing context between phone and laptop.',
  'Saya penyelaras': 'I am the coordinator',
  'Cipta ruang, kongsi pautan jemputan, dan lihat siapa yang sudah bersedia membantu.': 'Create a space, share an invite link, and see who is ready to help.',
  'Saya peserta': 'I am a participant',
  'Buka pautan jemputan yang dikongsi oleh penyelaras untuk masuk ke ruang yang betul.': 'Open the invite link shared by the coordinator to join the right space.',
  'Atau masukkan kod sesi': 'Or enter a session code',
  'Masuk dengan kod': 'Join with code',
  'Untuk sekarang:': 'Currently:',
  ' sesi, misi, jemputan, bukti dan tugasan peserta tersedia. Penyelaras boleh menjalankan agent secara automatik, memantau kemajuan dan menghentikannya.': ' sessions, missions, invites, evidence and participant tasks are available. Coordinators can run the agent automatically, monitor progress and stop it.',
  'PESERTA': 'PARTICIPANT',
  'Menyambung…': 'Connecting…',
  'Browser ini tidak dapat menyimpan akses sesi. Jangan tutup halaman ini jika anda mahu kekal dalam sesi.': 'This browser cannot save session access. Keep this page open if you want to stay in the session.',
  'Jemput peserta': 'Invite participants',
  'KOD JEMPUTAN': 'INVITE CODE',
  'Pautan untuk peserta': 'Participant link',
  'Salin atau kongsi pautan ini. Ia tidak mengandungi token penyelaras.': 'Copy or share this link. It does not contain the coordinator token.',
  'ANDA DISAMBUNGKAN': 'YOU ARE CONNECTED',
  'Peserta sesi': 'Session participant',
  'Penyelaras boleh melihat bahawa anda tersedia di kawasan ini.': 'The coordinator can see that you are available in this area.',
  'ORANG DALAM RUANG': 'PEOPLE IN THE SPACE',
  ' peserta bersedia': ' participants ready',
  'Kongsi pautan jemputan untuk mula mengumpulkan pandangan daripada lokasi lain.': 'Share the invite link to start gathering perspectives from other locations.',
  'Masuk ': 'Joined ',
  'STATUS MISI': 'MISSION STATUS',
  'Status: ': 'Status: ',
  'Belum ada misi': 'No mission yet',
  'Penyelaras belum menetapkan misi untuk ruang ini.': 'The coordinator has not set a mission for this space.',
  'Penerimaan bukti sahaja tidak mengesahkan kerja selesai. Rujuk status misi dan keputusan agent.': 'Receiving evidence alone does not confirm work is complete. Check the mission status and agent decision.',
  'AKTIVITI RUANG': 'SPACE ACTIVITY',
  'Kemas kini terbaru': 'Latest updates',
  'Versi sesi ': 'Session version ',
  'Keluarkan akses daripada peranti ini': 'Remove access from this device',
  'TETAPKAN MISI': 'SET MISSION',
  'Apa yang perlu disediakan?': 'What needs to be prepared?',
  'Sahkan matlamat dan barang yang diperlukan. Anda boleh reset misi kemudian tanpa menukar pautan peserta.': 'Confirm the goal and required items. You can reset the mission later without changing the participant link.',
  'Matlamat': 'Goal',
  'Barang diperlukan': 'Required items',
  'Barang ': 'Item ',
  'Kuantiti ': 'Quantity ',
  'Contoh: Pen': 'Example: Pen',
  '+ Tambah barang': '+ Add item',
  'Mengesahkan…': 'Confirming…',
  'Sahkan misi': 'Confirm mission',
  'KAWALAN AGENT': 'AGENT CONTROLS',
  'Teruskan dengan bukti baharu': 'Continue with new evidence',
  'Mulakan keputusan pertama': 'Start the first decision',
  'Keputusan terakhir:': 'Latest decision:',
  'Agent sedang menilai…': 'Agent is assessing…',
  'Langkah agent seterusnya': 'Next agent step',
  'Mulakan agent': 'Start agent',
  'Butang di atas menjalankan satu langkah manual. Gunakan mod automatik di bawah untuk meneruskan tanpa klik berulang.': 'The button above runs one manual step. Use automatic mode below to continue without repeated clicks.',
  'TUGASAN SAYA': 'MY TASKS',
  ' tugasan untuk anda': ' tasks for you',
  'Tiada tugasan baharu': 'No new tasks',
  'Agent mungkin meminta bukti atau menawarkan tugasan selepas langkah penyelaras yang seterusnya.': 'The agent may request evidence or offer a task after the coordinator’s next step.',
  'Menunggu semakan bukti oleh agent.': 'Waiting for the agent to review evidence.',
  'Selesai disemak oleh agent.': 'Completed and reviewed by the agent.',
  'Tugasan ini kekal ditolak.': 'This task remains declined.',
  'Nota halangan (pilihan)': 'Obstacle note (optional)',
  'Contoh: Saya tidak dapat capai kawasan itu.': 'Example: I cannot reach that area.',
  'Menerima…': 'Accepting…',
  'Terima': 'Accept',
  'Memulakan…': 'Starting…',
  'Mula': 'Start',
  'Melapor…': 'Reporting…',
  'Lapor siap': 'Report done',
  'Menghantar…': 'Sending…',
  'Tolak': 'Decline',
  'Tak dapat teruskan': 'Cannot continue',
  'PERMINTAAN PENYELARAS': 'COORDINATOR REQUEST',
  'Minta pandangan peserta': 'Request a participant view',
  'Tunggu sekurang-kurangnya seorang peserta menyertai sesi sebelum menghantar permintaan.': 'Wait for at least one participant to join before sending a request.',
  'Hantar kepada': 'Send to',
  'Jenis permintaan': 'Request type',
  'Gambar': 'Photo',
  'Soalan': 'Question',
  'Arahan jelas': 'Clear instructions',
  'Contoh: Ambil gambar sudut kiri meja.': 'Example: Take a photo of the left corner of the table.',
  'Contoh: Berapa buah pen yang anda nampak?': 'Example: How many pens can you see?',
  'Hantar permintaan': 'Send request',
  'Peserta': 'Participant',
  'Dijawab': 'Answered',
  'Menunggu': 'Waiting',
  'Permintaan ini dihantar oleh penyelaras, bukan oleh agent automatik.': 'This request was sent by the coordinator, not the automatic agent.',
  'TINDAKAN ANDA': 'YOUR ACTIONS',
  ' permintaan menunggu': ' pending requests',
  'Tiada permintaan baharu': 'No new requests',
  'Apabila penyelaras meminta gambar atau jawapan, tindakan akan muncul di sini.': 'When the coordinator requests a photo or answer, the action will appear here.',
  'Pilih fail JPEG, PNG atau WebP.': 'Choose a JPEG, PNG or WebP file.',
  'Saiz gambar mestilah 5 MiB atau kurang.': 'The image must be 5 MiB or smaller.',
  'Pilih gambar untuk dihantar.': 'Choose an image to send.',
  'GAMBAR': 'PHOTO',
  'SOALAN': 'QUESTION',
  'Pilih satu gambar': 'Choose one photo',
  'JPEG, PNG atau WebP sahaja, maksimum 5 MiB. Gambar menjadi bukti dihantar, bukan pengesahan AI.': 'JPEG, PNG or WebP only, maximum 5 MiB. The photo is submitted evidence, not AI confirmation.',
  'Nota (pilihan)': 'Note (optional)',
  'Jawapan anda': 'Your answer',
  'Terangkan apa yang kelihatan, jika membantu.': 'Describe what is visible, if helpful.',
  'Taip jawapan yang anda lihat.': 'Type the answer you see.',
  'Memuat naik…': 'Uploading…',
  'Hantar gambar': 'Send photo',
  'Hantar jawapan': 'Send answer',
  'BUKTI DITERIMA': 'EVIDENCE RECEIVED',
  'Pemerhatian daripada ruang': 'Observations from the space',
  'Jawapan dan gambar peserta akan kelihatan di sini selepas diterima oleh sesi.': 'Participant answers and photos appear here after the session receives them.',
  'Jawapan': 'Answer',
  'Bukti diterima oleh sesi. Rujuk keputusan agent untuk semakan; penerimaan gambar sahaja bukan pengesahan siap.': 'The session received this evidence. Check the agent decision for review; receiving a photo alone does not confirm completion.',
  'Gambar tidak dapat dimuat: ': 'Could not load photo: ',
  'Memuatkan bukti gambar…': 'Loading photo evidence…',
  'Keluarkan': 'Remove',
  'Ya, keluarkan': 'Yes, remove',
  'Mengeluarkan…': 'Removing…',
  'Batal': 'Cancel',
  'Agent automatik': 'Automatic agent',
  'Agent menyambung sendiri apabila peserta menjawab, sehingga misi selesai atau anda menghentikannya.': 'The agent continues when participants respond, until the mission is complete or you stop it.',
  'Status': 'Status',
  'Langkah dicuba': 'Steps attempted',
  'Had masa': 'Time limit',
  'Belum dimulakan': 'Not started',
  'Sedang berjalan': 'Running',
  'Menunggu maklumat peserta': 'Waiting for participant information',
  'Dihentikan': 'Stopped',
  'Misi selesai': 'Mission complete',
  'Perlu perhatian': 'Needs attention',
  'Had dicapai': 'Limit reached',
  'Had langkah': 'Step limit',
  'Mulakan automatik': 'Start automatic mode',
  'Hentikan agent': 'Stop agent',
  'Menghentikan…': 'Stopping…',
  'Had masa setiap larian: 20 minit. Ketika menunggu peserta, tiada panggilan model baharu. Henti membatalkan hasil panggilan semasa; caj yang sudah diproses penyedia mungkin masih dikenakan.': 'Each run has a 20-minute limit. While waiting for participants, no new model calls are made. Stopping cancels the current result; your provider may still charge for work already processed.',
  'Reset misi': 'Reset mission',
  'Sahkan reset misi': 'Confirm mission reset',
  'Hentikan agent dan kosongkan misi serta tugasan aktif? Rekod lama diarkibkan; peserta dan pautan sesi kekal.': 'Stop the agent and clear the mission and active tasks? Earlier records are archived; participants and the session link remain.',
  'Mereset…': 'Resetting…',
  'Ya, reset misi': 'Yes, reset mission',
  'Notifikasi': 'Notifications',
  'Tandakan dibaca': 'Mark as read',
  ' notifikasi belum dibaca.': ' unread notifications.',
  'Tiada notifikasi baharu.': 'No new notifications.',
  'Aktifkan notifikasi telefon': 'Enable phone notifications',
  'Hantar ujian notifikasi': 'Send test notification',
  'Matikan notifikasi telefon': 'Turn off phone notifications',
  'Untuk iPhone: Share → Add to Home Screen, buka PINJAM dari ikonnya, sertai sesi dan aktifkan notifikasi. Penghantaran bergantung pada kebenaran, sambungan dan tetapan telefon.': 'For iPhone: Share → Add to Home Screen, open PINJAM from its icon, join the session and enable notifications. Delivery depends on permission, connection and phone settings.',
};

const originals = new WeakMap<Text, string>();
const attributeOriginals = new WeakMap<Element, Map<string, string>>();
const attributes = ['aria-label', 'placeholder', 'alt', 'title'];

function localized(source: string, language: Language) { return language === 'en' ? english[source] ?? source : source; }

export function localizePage(language: Language) {
  document.documentElement.lang = language;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    if (node.parentElement?.closest('script, style')) continue;
    const source = originals.get(node) ?? node.nodeValue ?? '';
    originals.set(node, source);
    const next = localized(source, language);
    if (node.nodeValue !== next) node.nodeValue = next;
  }
  for (const element of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    for (const attribute of attributes) {
      const value = element.getAttribute(attribute);
      if (value === null) continue;
      const saved = attributeOriginals.get(element) ?? new Map<string, string>();
      if (!attributeOriginals.has(element)) attributeOriginals.set(element, saved);
      const source = saved.get(attribute) ?? value;
      saved.set(attribute, source);
      const next = localized(source, language);
      if (value !== next) element.setAttribute(attribute, next);
    }
  }
}
