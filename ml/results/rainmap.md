# Peta hujan dari CML: OpenMRG, uji Agustus 2015

582 sel radar 2 km dalam 2 km dari suatu lintasan, 8,908 potret 5 menit. Waktu basah: rata-rata radar di sel tercakup > 0.1 mm/jam.

## Masukan dari CML (CNN basah/kering + ITU k-alpha apa adanya)

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.837 | 2.380 | +0.098 | 0.662 | 0.510 |
| Ridge tautan -> sel (terikat topologi) | 0.754 | 2.203 | -0.085 | 0.636 | 0.522 |
| MLP per sel (bisa dipindah) | 0.765 | 2.236 | -0.388 | 0.671 | 0.590 |

## Masukan dari CML, angka dasbor, tautan < 1 km dibuang

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.776 | 2.235 | +0.012 | 0.680 | 0.524 |
| Ridge tautan -> sel (terikat topologi) | 0.751 | 2.195 | -0.108 | 0.639 | 0.533 |
| MLP per sel (bisa dipindah) | 0.736 | 2.146 | -0.289 | 0.682 | 0.589 |

## Masukan dari CML, terkalibrasi (calibrate.md), tautan < 1 km dibuang

Jangkauan IDW terpilih 4 km, alpha ridge 100.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.773 | 2.242 | -0.385 | 0.677 | 0.544 |
| Ridge tautan -> sel (terikat topologi) | 0.741 | 2.161 | -0.116 | 0.660 | 0.563 |
| MLP per sel (bisa dipindah) | 0.755 | 2.211 | -0.378 | 0.681 | 0.589 |

## Masukan sempurna (radar sepanjang lintasan)

Jangkauan IDW terpilih 4 km, alpha ridge 100.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.535 | 1.568 | -0.000 | 0.835 | 0.788 |
| Ridge tautan -> sel (terikat topologi) | 0.507 | 1.486 | +0.053 | 0.854 | 0.753 |
| MLP per sel (bisa dipindah) | 0.525 | 1.539 | +0.021 | 0.842 | 0.794 |
