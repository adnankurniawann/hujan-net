# Klasifikasi basah/kering pada data CML sungguhan

Basah = hujan radar sepanjang lintasan > 0.1 mm/jam. Dinilai pada bulan uji yang tidak pernah dipakai melatih.

## Uji: openrainer (2022-01-01 s.d. 2022-12-31), fraksi basah 4.7%, 9,095,577 contoh

| Dilatih pada | Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|---|
| — | aturan dasbor | 0.784 | 0.882 | 0.114 | 0.226 |
| gabungan | ambang std60 | 0.586 | 0.775 | 0.194 | 0.314 |
| gabungan | Random Forest | 0.526 | 0.504 | 0.343 | 0.486 |
| hanya_openrainer | ambang std60 | 0.530 | 0.730 | 0.218 | 0.336 |
| hanya_openrainer | Random Forest | 0.515 | 0.480 | 0.349 | 0.494 |
| hanya_openmrg | ambang std60 | 0.829 | 0.914 | 0.085 | 0.168 |
| hanya_openmrg | Random Forest | 0.643 | 0.771 | 0.203 | 0.335 |

## Uji: openmrg (2015-08-01 s.d. 2015-08-31), fraksi basah 6.9%, 6,308,420 contoh

| Dilatih pada | Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|---|
| — | aturan dasbor | 0.599 | 0.443 | 0.406 | 0.546 |
| gabungan | ambang std60 | 0.510 | 0.538 | 0.320 | 0.445 |
| gabungan | Random Forest | 0.669 | 0.441 | 0.438 | 0.580 |
| hanya_openrainer | ambang std60 | 0.465 | 0.521 | 0.309 | 0.434 |
| hanya_openrainer | Random Forest | 0.511 | 0.337 | 0.406 | 0.556 |
| hanya_openmrg | ambang std60 | 0.673 | 0.635 | 0.310 | 0.446 |
| hanya_openmrg | Random Forest | 0.653 | 0.399 | 0.456 | 0.598 |
