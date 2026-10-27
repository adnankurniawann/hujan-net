# `components/panels` — C3, panel status DAS dan antrean peringatan

Pemilik: Adnan, dengan Sultan untuk gaya. Butuh: C2.

## Catatan kepemilikan

Panduan bagian 2 menandai `components/panels/` sebagai milik Sultan, sedangkan bagian 4
dan blok tugas C3 menugaskan panel ini ke Adnan. Yang diikuti di sini adalah bagian 4 dan
blok tugas, karena keduanya lebih spesifik. `components/map/` tidak disentuh sama sekali.
Kalau Sultan mau mengambil alih berkas berkas ini, tidak ada yang perlu dipindahkan:
seluruh logikanya ada di `lib/catchment` dan `lib/alerts`, komponen di sini murni tampilan.

## Susunan

| Berkas | Isi |
|---|---|
| `CatchmentPanel.tsx` | Pembungkus. Ini yang dipasang Sultan di panel kanan |
| `CatchmentList.tsx` | Daftar DAS: tiga jendela akumulasi, ambang, batang, status |
| `AlertQueue.tsx` | Antrean menunggu keputusan, plus riwayat keputusan |
| `ConfirmDialog.tsx` | Dialog penegasan singkat, sekaligus tempat nama operator diminta |
| `StatusBadge.tsx` | Penanda status dan batang akumulasi |
| `SectionLabel.tsx` | Judul bagian, garis pemisah, keadaan kosong |
| `format.ts` | Pemformat angka dan waktu, satuan selalu ditulis |
| `DensityPanel.tsx` | C4, perbandingan kerapatan penakar hujan versus tautan |
| `density.ts` | C4, perhitungan murni rasio dan kotak batas |

## C4, panel kerapatan

```tsx
{density.enabled && (
  <DensityPanel
    stats={densityStats(links, density)}   // links dari data/links.json
    sourceLabel={density.sourceLabel}
    bboxLabel={density.bboxLabel}
    verified={density.verified}
  />
)}
```

**Jumlah tautan tidak pernah ditulis di konfigurasi.** Angka itu dihitung dari
`data/links.json` supaya tidak basi ketika topologi berubah. Yang datang dari
`data/density-config.json` hanya jumlah penakar hujan, sesuai bunyi tugas C4.

Dua tuas untuk mematikannya, dan keduanya diperlukan: `enabled` di berkas konfigurasi
untuk sebelum demo, dan tombol Tutup di panel untuk di tengah demo. Tidak ada yang mau
menyunting berkas di depan juri.

**PERINGATAN.** `rainGaugeCount` bernilai 3 adalah perkiraan kerja, **bukan angka
terverifikasi**. Panel menampilkan peringatan merah selama `verified` masih `false`,
dan konfigurasinya memuat catatan agar angka itu tidak disebut ke juri sebagai fakta.
Rasio yang keluar sekarang `1 : 17`, bukan `1 : 47` seperti contoh di Panduan, karena
dihitung dari 50 tautan yang benar benar ada di `links.json`. Kalau mau angka yang lebih
kuat, yang perlu diperbaiki adalah jumlah penakar hujannya, dan itu harus dirujuk ke
basis data BMKG, bukan dikarang.

## Sambungan untuk Sultan

`CatchmentPanel` tidak mengambil status DAS sendiri, melainkan menerimanya lewat prop:

```tsx
<CatchmentPanel
  states={catchmentStates}   // dari store, isi GET /api/catchments?t=
  simTime={t}                // detik simulasi, untuk jam di kepala panel
  eventId={eventId}          // WAJIB saat demo, lihat di bawah
  pollMs={4000}              // 0 berarti hanya sekali muat
/>
```

Antrean peringatan mengambil datanya sendiri dari `/api/alerts`, karena antrean berubah
oleh aksi operator, bukan oleh pergerakan waktu simulasi. Menyalurkannya lewat store
Zustand hanya akan menambah state yang bisa tidak sinkron.

**`eventId` wajib diisi saat demo.** Tanpa itu, kandidat dari pemutaran ulang sebelumnya
ikut muncul di antrean. Ini bukan dugaan: saat verifikasi, dua kejadian yang hidup
bersamaan membuat antrean menampilkan 12 baris padahal seharusnya 6.

Lebar tidak diatur di sini. Panel kanan 380px ditetapkan B1, jadi pembungkuslah yang
menentukan lebarnya.

## Kepatuhan pada Panduan bagian 6

Diaudit terprogram, semuanya lulus: tanpa gradien, tanpa efek kaca buram, tanpa bayangan,
tanpa emoji, tanpa animasi masuk, tanpa warna heksa ditanam di kelas, hanya `rounded-md`,
dan seluruh kelas jarak yang dipakai ada di skala 4px. Warna hanya dari sembilan token
bagian 6 lewat kelas Tailwind yang disiapkan T0. Siaga memakai `--alert` sesuai kriteria C3.

Setiap angka, satuan, id DAS, dan cap waktu memakai `font-mono`. Isi penanda status
sengaja transparan, hanya garis satu piksel dan teks berwarna, karena blok warna pekat
dan bayangan dilarang.

Latar dialog memakai `color-mix(in srgb, var(--bg) 82%, transparent)`, yaitu blok warna
semi tembus, bukan `backdrop-blur`.

## Halaman pratinjau

`app/panel-preview/` menjalankan rantai C1 sampai C3 penuh memakai badai sintetis, supaya
panel bisa dilihat sebelum A5 selesai. **Halaman itu bukan bagian dari demo, tidak ditaut
dari mana pun, dan harus dibuang begitu `CatchmentPanel` dipasang di dasbor.**

## Verifikasi

Diuji hidup di atas `next start`:

- Panel terender dengan angka C1 sungguhan: C-01 `50.3 mm`, C-02 `57.4 mm`, C-03 `53.0 mm`
  pada `t = 5400 s`, ketiganya siaga, persentase terhadap ambang 101, 128, dan 133 persen.
- Antrean terisi 6 kandidat dari pendeteksian C2, dan tetap 6 setelah dibatasi `eventId`.
- Konfirmasi dan pengabaian lewat dialog menghasilkan 200, lalu keduanya **pindah dari
  antrean ke riwayat**: 6 menunggu menjadi 4 menunggu ditambah 2 riwayat, lengkap dengan
  nama operator, cap waktu, dan catatan pengabaian.
- Keadaan kosong dan keadaan memuat muncul apa adanya di HTML hasil render server.
- Panel kerapatan terender dengan `1 : 17`, 3 penakar berbanding 50 tautan, total lintasan
  `238.7 km`, rata rata `4.77 km`, kotak batas `106.876 .. 107.048` bujur dan
  `-6.753 .. -6.616` lintang, ditambah peringatan belum terverifikasi.
- Harness C4: 24 pemeriksaan lulus, termasuk nol penakar tidak menjadi `Infinity`,
  jumlah penakar negatif dijepit ke nol, dan `lengthKm` rusak tidak merusak total.

Yang belum ada: **tangkapan layar**. Panduan bagian 9 mewajibkannya untuk perubahan yang
terlihat di layar, dan itu perlu diambil manual dengan menjalankan `npm run dev` lalu
membuka `/panel-preview?t=5400`.

---

## Jalur mana yang menyimpan keputusan operator (terjawab 31 Juli)

Pertanyaan itu pernah menggantung sejak merge `79e1e3c`, ketika ada dua antrean
peringatan di repo ini. Jawabannya sekarang: **SQLite, dan hanya SQLite.**

- `AlertQueueLive.tsx` — dipakai `app/panel-preview`, mengambil sendiri dari
  `/api/alerts`.
- `AlertQueue.tsx` — dipakai dasbor lewat `CatchmentPanel`, menerima kandidat
  lewat prop dari `components/alerts/useCatchmentAlerts.ts`, yang juga mengambil
  dari `/api/alerts` dan menulis keputusan ke sana.

Jadi keduanya bukan lagi dua sumber kebenaran, melainkan **dua tampilan di atas
satu basis data**. Keputusan yang dibuat di salah satunya muncul di yang lain;
hook dasbor menarik ulang tiap 5 detik justru untuk itu.

Status DAS di dasbor tidak lagi datang dari perhitungan di peramban, melainkan
dari `GET /api/catchments?all=1`, yang mengembalikan seluruh rangkaian status
kejadian sekaligus. Ragam per bingkai `?t=` yang dijelaskan di atas tetap ada dan
tetap bekerja.

Angka pada bagian Verifikasi di atas diukur pada `t = 5400 s`, di luar rentang
kejadian contoh yang panjangnya 3600 detik, jadi jangan dipakai sebagai acuan
tampilan demo. Angka kejadian demo yang berlaku ada di `ARSITEKTUR.md` bagian 9.
