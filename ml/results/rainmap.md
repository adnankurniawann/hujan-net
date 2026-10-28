# Peta hujan dari CML: OpenMRG, uji Agustus 2015

582 sel radar 2 km dalam 2 km dari suatu lintasan, 8,909 potret 5 menit. Waktu basah: rata-rata radar di sel tercakup > 0.1 mm/jam.

## Masukan dari CML (CNN basah/kering + ITU k-alpha)

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.957 | 2.749 | +0.089 | 0.547 | 0.475 |
| Ridge tautan -> sel (terikat topologi) | 0.796 | 2.328 | -0.102 | 0.581 | 0.496 |
| MLP per sel (bisa dipindah) | 0.848 | 2.483 | -0.489 | 0.563 | 0.532 |

## Masukan sempurna (radar sepanjang lintasan)

Jangkauan IDW terpilih 2 km, alpha ridge 10.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.544 | 1.592 | -0.021 | 0.830 | 0.783 |
| Ridge tautan -> sel (terikat topologi) | 0.505 | 1.479 | +0.077 | 0.858 | 0.751 |
| MLP per sel (bisa dipindah) | 0.525 | 1.536 | -0.023 | 0.842 | 0.793 |
