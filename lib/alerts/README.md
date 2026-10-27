# `lib/alerts` — C2, mesin peringatan dan antrean konfirmasi

Pemilik: Adnan. Butuh: C1. Konsumen: C3 (panel antrean).

## Aturan yang menjadi alasan lapisan ini ada

> Sistem tidak pernah menyiarkan peringatan sendiri. Operator BPBD yang memutuskan.

Ini bukan sekadar fitur, ini poin tata kelola yang disampaikan ke juri pada menit 2:15
skenario demo. Karena itu aturannya ditegakkan oleh bentuk kodenya, bukan oleh kedisiplinan:

1. `syncCandidates` tidak punya parameter status. Nilai bawaan skema, `menunggu`, adalah
   satu satunya status yang bisa lahir dari pendeteksian.
2. Tidak ada `POST /api/alerts` untuk membuat peringatan manual. Kandidat hanya lahir dari
   ambang yang benar benar terlampaui, sehingga tidak ada jalur untuk menyuntik peringatan palsu.
3. Status hanya berubah lewat `confirmAlert` atau `dismissAlert`, keduanya menuntut identitas
   operator yang tidak kosong, dan keduanya menolak baris yang sudah diputuskan.
4. `publishableAlerts` adalah satu satunya pintu menuju "boleh diteruskan", dan menuntut
   status `dikonfirmasi` sekaligus `decidedBy` terisi.
5. **Proyek ini tidak punya saluran keluar sama sekali.** Tidak ada pengirim surel, SMS,
   maupun webhook di mana pun. Ketiadaan itu disengaja dan diuji.

## Alur

```ts
const seeds = detectCandidates(timeline, config, eventId);  // murni, tanpa basis data
await syncCandidates(seeds);                                // selalu lahir "menunggu"
const queue = await listAlerts({ status: "menunggu" });      // untuk panel C3
await confirmAlert(id, "Nama Operator");                     // satu satunya jalan
```

## Keputusan yang diambil, dan alasannya

**Kandidat lahir dari tepi naik keparahan, bukan dari keadaan bertahan.** Cuplikan simulasi
datang tiap 15 detik. Tanpa aturan tepi naik, satu badai melahirkan ratusan kandidat kembar
dan antrean operator jadi tidak terpakai. Pada badai uji, 121 bingkai menghasilkan tepat
4 kandidat.

**Id kandidat deterministik:** `<eventId>:<catchmentId>:<level>:<raisedAtSec>`. Karena
simulasinya deterministik, memutar ulang kejadian yang sama menghasilkan id yang sama,
sehingga pendeteksian ulang bersifat idempoten tanpa perlu tabel penanda tambahan.

**`syncCandidates` tidak pernah menyentuh baris yang sudah ada.** Memutar ulang demo tidak
boleh mengembalikan kandidat yang sudah dikonfirmasi operator ke `menunggu`.

**Dua sumbu waktu, dan ini disengaja.** `raisedAt` pada kontrak data adalah **detik simulasi**,
karena ambang terlampaui pada waktu simulasi. `confirmedAt` adalah **milidetik epoch waktu
dinding**, karena operator menekan tombol pada waktu nyata. Panel C3 harus memformat keduanya
dengan cara berbeda. Basis data menyimpan `raisedAtWall` terpisah untuk jejak audit.

**Kolom basis data bernama `decidedBy` dan `decidedAt`, bukan `confirmedBy` dan `confirmedAt`.**
Kontrak data hanya menyediakan satu pasang bidang untuk dua jenis keputusan, sedangkan
pengabaian sama pentingnya untuk diaudit. Pemetaan dilakukan di `store.ts`.

**Peralihan status memakai `updateMany` bersyarat, bukan baca lalu tulis.** Dua permintaan
yang datang bersamaan tidak bisa sama sama berhasil; yang kalah menerima 409, bukan diam
diam menimpa keputusan yang lain.

## Endpoint

| Metode | Jalur | Tanggapan |
|---|---|---|
| GET | `/api/alerts?status=&eventId=` | `{ alerts: AlertRecord[] }`, menunggu di urutan atas |
| POST | `/api/alerts/:id/confirm` | badan `{ by }`. 200, 400, 404, atau 409 |
| POST | `/api/alerts/:id/dismiss` | badan `{ by, note? }`. Sama |
| POST | `/api/alerts/refresh` | 200 `{ created, existing, detected, eventId }` |
| GET | `/api/alerts/event` | `{ eventId, durationS, frameCount }` kejadian yang berjalan |

## Sambungan ke lapisan simulasi

`loadSimFrames()` di `pipeline.ts` memanggil `reconstructEvent` dari `lib/inverse`
**secara langsung**, bukan lewat HTTP ke `/api/sim`, dan bukan lewat
`app/api/sim/store`. Alasannya aturan ARSITEKTUR bagian 2: tidak ada modul di `lib/`
yang boleh memanggil ke atas. Pada diagram aliran data, `lib/inverse` menyuapi
`app/api/sim` dan `lib/catchment` sebagai dua cabang sejajar, dan ini cabang kedua.

Konsekuensinya kejadian dihitung dua kali per proses, masing masing sekitar 0,5 detik.
Itu harga menjaga arah ketergantungan tetap satu arah. Kalau nanti terasa, jalan
keluarnya memindahkan penyinggahan ke `lib/`, dan itu wilayah Radit.

`eventId` adalah `sim-` ditambah FNV-1a 32 bit atas `DEMO_STORM`, durasi, selang
cuplikan, bentuk grid, dan daftar id tautan. Jadi kalau Radit menyetel skenario,
id kandidat ikut berubah dan kandidat lama tidak bercampur dengan yang baru.

## Menjalankan

`npm install` sudah menjalankan `prisma generate` lewat `postinstall`. Untuk membuat berkas
basis datanya:

```bash
npm run db:setup
```

Berkas `prisma/dev.db` tidak ikut repo, hanya skema dan migrasinya.

## Verifikasi

Uji otomatis ada di `tests/alerts.test.ts`, dijalankan `npm test` bersama uji tim.
13 uji: tepi naik keparahan, normal langsung ke siaga, turun lalu naik lagi sebagai
kejadian baru, id deterministik, `eventId` wajib, dan `loadSimFrames` terhadap
kejadian sungguhan.

Satu uji di sana khusus menjaga demo: **kejadian sungguhan harus melahirkan
setidaknya satu waspada dan satu siaga.** Tanpa penskalaan ambang, jumlahnya nol
dan babak 1:50 skenario demo tidak pernah terjadi. Lihat catatan `demoScale` di
`data/catchment-config.json`.

**Bagian yang menulis ke SQLite sengaja tidak diuji otomatis**, karena
`prisma/schema.prisma` menunjuk `file:./dev.db` langsung sehingga uji akan menimpa
basis data demo. Perilakunya diverifikasi pada server yang berjalan:

| Yang diuji | Hasil |
|---|---|
| `POST /api/alerts/refresh` | 200, `created: 5` dari kejadian sungguhan |
| Refresh kedua | `created: 0, existing: 5`, idempoten |
| `POST /:id/confirm` | 200, nama operator dan cap waktu tersimpan |
| Refresh setelah konfirmasi | keputusan operator tetap, `menunggu=4 dikonfirmasi=1` |
| Konfirmasi ganda, id tak dikenal, operator kosong | 409, 404, 400 |
| Proses terpisah dengan klien Prisma baru | seluruh riwayat bertahan |

Kalau nanti mau uji basis data otomatis, yang dibutuhkan adalah seam basis data uji.
Itu mengubah cara semua orang menjalankan proyek, jadi perlu dibahas di grup dulu.
