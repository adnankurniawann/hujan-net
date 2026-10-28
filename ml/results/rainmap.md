# Peta hujan dari CML: OpenMRG, uji Agustus 2015

582 sel radar 2 km dalam 2 km dari suatu lintasan, 8,908 potret 5 menit. Waktu basah: rata-rata radar di sel tercakup > 0.1 mm/jam.

## Masukan dari CML (CNN basah/kering + ITU k-alpha apa adanya)

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.831 | 2.369 | +0.092 | 0.663 | 0.517 |
| Ridge tautan -> sel (terikat topologi) | 0.761 | 2.224 | -0.116 | 0.627 | 0.516 |
| MLP per sel (bisa dipindah) | 0.759 | 2.218 | -0.378 | 0.670 | 0.582 |

## Masukan dari CML, angka dasbor, tautan < 1 km dibuang

Jangkauan IDW terpilih 8 km, alpha ridge 1000.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.770 | 2.223 | +0.008 | 0.682 | 0.530 |
| Ridge tautan -> sel (terikat topologi) | 0.763 | 2.233 | -0.128 | 0.623 | 0.518 |
| MLP per sel (bisa dipindah) | 0.757 | 2.214 | -0.401 | 0.677 | 0.585 |

## Masukan dari CML, terkalibrasi (calibrate.md), tautan < 1 km dibuang

Jangkauan IDW terpilih 4 km, alpha ridge 100.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.775 | 2.249 | -0.393 | 0.677 | 0.544 |
| Ridge tautan -> sel (terikat topologi) | 0.750 | 2.188 | -0.116 | 0.649 | 0.552 |
| MLP per sel (bisa dipindah) | 0.760 | 2.224 | -0.388 | 0.684 | 0.587 |

## Masukan sempurna (radar sepanjang lintasan)

Jangkauan IDW terpilih 4 km, alpha ridge 100.

| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |
|---|---|---|---|---|---|
| IDW (seperti dasbor) | 0.535 | 1.569 | -0.001 | 0.835 | 0.788 |
| Ridge tautan -> sel (terikat topologi) | 0.507 | 1.485 | +0.053 | 0.854 | 0.751 |
| MLP per sel (bisa dipindah) | 0.526 | 1.541 | +0.005 | 0.842 | 0.793 |
