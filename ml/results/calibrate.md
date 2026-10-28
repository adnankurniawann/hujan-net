# Kalibrasi antena basah dan skala k

Taksiran R = (max(A - WAA, 0) / L / (c k))^(1/alpha) saat CNN bilang basah. Per WAA, c dipilih supaya total taksiran sama dengan radar di bulan latih+validasi; lalu WAA dengan RMSE terkecil.

## Galat menurut panjang lintasan, angka dasbor, bulan uji

| Dataset | Panjang (km) | Baris | Total taksiran / radar | Bagian galat kuadrat |
|---|---|---|---|---|
| openrainer | (0.0, 0.5] | 133,215 | 10.24 | 42% |
| openrainer | (0.5, 1.0] | 307,714 | 2.17 | 20% |
| openrainer | (1.0, 2.0] | 947,864 | 1.56 | 15% |
| openrainer | (2.0, 4.0] | 1,977,434 | 1.49 | 15% |
| openrainer | (4.0, 8.0] | 2,059,122 | 0.97 | 4% |
| openrainer | (8.0, 30.0] | 3,670,228 | 0.78 | 4% |
| openmrg | (0.0, 0.5] | 445,714 | 7.32 | 82% |
| openmrg | (0.5, 1.0] | 695,440 | 2.01 | 6% |
| openmrg | (1.0, 2.0] | 1,675,076 | 1.33 | 6% |
| openmrg | (2.0, 4.0] | 2,102,632 | 0.98 | 3% |
| openmrg | (4.0, 8.0] | 1,157,062 | 0.99 | 2% |
| openmrg | (8.0, 30.0] | 231,572 | 1.16 | 1% |

Tautan di bawah 1 km dibuang untuk semua angka di bawah ini.

| Angka | WAA (dB) | c |
|---|---|---|
| dasbor (ITU apa adanya) | 1.5 | 1 |
| disetel di openrainer | 0 | 2.11 |
| disetel di openmrg | 0 | 2.82 |

## Uji: openrainer, per sub-link per potret radar, tautan >= 1 km

| Angka | RMSE | RMSE basah | Bias basah | Korelasi | Total taksiran / radar |
|---|---|---|---|---|---|
| dasbor | 1.128 | 3.811 | -0.333 | 0.454 | 1.07 |
| disetel di openrainer | 0.724 | 2.714 | -0.594 | 0.491 | 0.94 |
| disetel di openmrg | 0.656 | 2.654 | -0.877 | 0.491 | 0.69 |

## Uji: openmrg, per sub-link per potret radar, tautan >= 1 km

| Angka | RMSE | RMSE basah | Bias basah | Korelasi | Total taksiran / radar |
|---|---|---|---|---|---|
| dasbor | 0.864 | 3.046 | +0.069 | 0.713 | 1.11 |
| disetel di openrainer | 0.687 | 2.390 | -0.156 | 0.701 | 1.07 |
| disetel di openmrg | 0.685 | 2.479 | -0.614 | 0.694 | 0.78 |
