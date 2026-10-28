# Peta hujan dari CML: OpenMRG, uji Agustus 2015

582 sel radar 2 km dalam 2 km dari suatu lintasan, 8,909 potret 5 menit. Waktu basah: rata-rata radar di sel tercakup > 0.1 mm/jam.

## Masukan dari CML (CNN basah/kering + ITU k-alpha apa adanya)

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.957 | 2.749 | +0.089 | 0.547 | 0.475 |
| Ridge tautan -> sel (terikat topologi) | 0.796 | 2.328 | -0.102 | 0.581 | 0.496 |
| MLP per sel (bisa dipindah) | 0.848 | 2.481 | -0.488 | 0.563 | 0.533 |

## Masukan dari CML, angka dasbor, tautan < 1 km dibuang

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.901 | 2.614 | +0.005 | 0.560 | 0.486 |
| Ridge tautan -> sel (terikat topologi) | 0.797 | 2.332 | -0.098 | 0.577 | 0.502 |
| MLP per sel (bisa dipindah) | 0.826 | 2.413 | -0.401 | 0.575 | 0.534 |

## Masukan dari CML, terkalibrasi (calibrate.md), tautan < 1 km dibuang

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.826 | 2.410 | -0.384 | 0.573 | 0.513 |
| Ridge tautan -> sel (terikat topologi) | 0.794 | 2.321 | -0.251 | 0.611 | 0.555 |
| MLP per sel (bisa dipindah) | 0.838 | 2.454 | -0.433 | 0.582 | 0.532 |

## Masukan sempurna (radar sepanjang lintasan)

Jangkauan IDW terpilih 2 km, alpha ridge 10.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.544 | 1.592 | -0.021 | 0.830 | 0.783 |
| Ridge tautan -> sel (terikat topologi) | 0.505 | 1.479 | +0.077 | 0.858 | 0.751 |
| MLP per sel (bisa dipindah) | 0.525 | 1.536 | -0.023 | 0.842 | 0.793 |
