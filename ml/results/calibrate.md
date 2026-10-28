# Kalibrasi antena basah dan skala k

Taksiran R = (max(A - WAA, 0) / L / (c k))^(1/alpha) saat CNN bilang basah. Per WAA, c dipilih supaya total taksiran sama dengan radar di bulan latih+validasi; lalu WAA dengan RMSE terkecil.

## Galat menurut panjang lintasan, angka dasbor, bulan uji

| Dataset | Panjang (km) | Baris | Total taksiran / radar | Bagian galat kuadrat |
|---|---|---|---|---|
| openrainer | (0.0, 0.5] | 133,215 | 8.07 | 35% |
| openrainer | (0.5, 1.0] | 307,714 | 2.01 | 22% |
| openrainer | (1.0, 2.0] | 947,864 | 1.49 | 16% |
| openrainer | (2.0, 4.0] | 1,977,434 | 1.50 | 18% |
| openrainer | (4.0, 8.0] | 2,059,122 | 0.91 | 4% |
| openrainer | (8.0, 30.0] | 3,670,228 | 0.77 | 5% |
| openmrg | (0.0, 0.5] | 445,730 | 7.59 | 82% |
| openmrg | (0.5, 1.0] | 695,448 | 2.03 | 6% |
| openmrg | (1.0, 2.0] | 1,675,154 | 1.34 | 6% |
| openmrg | (2.0, 4.0] | 2,102,706 | 0.98 | 3% |
| openmrg | (4.0, 8.0] | 1,157,164 | 1.01 | 2% |
| openmrg | (8.0, 30.0] | 231,578 | 1.19 | 1% |

Tautan di bawah 1 km dibuang untuk semua angka di bawah ini.

| Angka | WAA (dB) | c |
|---|---|---|
| dasbor (ITU apa adanya) | 1.5 | 1 |
| disetel di openrainer | 0 | 1.98 |
| disetel di openmrg | 0 | 2.79 |

## Uji: openrainer, per sub-link per potret radar, tautan >= 1 km

| Angka | RMSE | RMSE basah | Bias basah | Korelasi | Total taksiran / radar |
|---|---|---|---|---|---|
| dasbor | 1.164 | 3.804 | -0.363 | 0.444 | 1.04 |
| disetel di openrainer | 0.756 | 2.740 | -0.570 | 0.485 | 0.94 |
| disetel di openmrg | 0.662 | 2.647 | -0.904 | 0.486 | 0.66 |

## Uji: openmrg, per sub-link per potret radar, tautan >= 1 km

| Angka | RMSE | RMSE basah | Bias basah | Korelasi | Total taksiran / radar |
|---|---|---|---|---|---|
| dasbor | 0.874 | 3.067 | +0.078 | 0.710 | 1.12 |
| disetel di openrainer | 0.701 | 2.410 | -0.034 | 0.700 | 1.15 |
| disetel di openmrg | 0.685 | 2.471 | -0.600 | 0.693 | 0.79 |
