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
| openmrg | (0.0, 0.5] | 445,774 | 7.30 | 77% |
| openmrg | (0.5, 1.0] | 695,524 | 2.00 | 7% |
| openmrg | (1.0, 2.0] | 1,675,316 | 1.33 | 8% |
| openmrg | (2.0, 4.0] | 2,102,924 | 0.98 | 5% |
| openmrg | (4.0, 8.0] | 1,157,278 | 0.98 | 2% |
| openmrg | (8.0, 30.0] | 231,604 | 1.16 | 1% |

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
| disetel di openmrg | 0.656 | 2.654 | -0.878 | 0.491 | 0.69 |

## Uji: openmrg, per sub-link per potret radar, tautan >= 1 km

| Angka | RMSE | RMSE basah | Bias basah | Korelasi | Total taksiran / radar |
|---|---|---|---|---|---|
| dasbor | 1.053 | 3.779 | +0.019 | 0.558 | 1.10 |
| disetel di openrainer | 0.812 | 2.872 | -0.227 | 0.577 | 1.07 |
| disetel di openmrg | 0.779 | 2.834 | -0.666 | 0.572 | 0.78 |
