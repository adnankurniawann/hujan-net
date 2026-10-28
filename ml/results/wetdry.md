# Klasifikasi basah/kering pada data CML sungguhan

Basah = hujan radar sepanjang lintasan > 0.1 mm/jam. Dinilai pada bulan uji yang tidak pernah dipakai melatih.

## Uji: openrainer (2022-01-01 s.d. 2022-12-31), fraksi basah 4.7%, 9,095,577 contoh

| Dilatih pada | Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|---|
| — | aturan dasbor | 0.784 | 0.882 | 0.114 | 0.226 |
| gabungan | ambang std60 | 0.586 | 0.775 | 0.194 | 0.314 |
| gabungan | Random Forest | 0.509 | 0.480 | 0.346 | 0.491 |
| hanya_openrainer | ambang std60 | 0.530 | 0.730 | 0.218 | 0.336 |
| hanya_openrainer | Random Forest | 0.507 | 0.467 | 0.351 | 0.497 |
| hanya_openmrg | ambang std60 | 0.819 | 0.911 | 0.087 | 0.173 |
| hanya_openmrg | Random Forest | 0.658 | 0.788 | 0.191 | 0.322 |

## Uji: openmrg (2015-08-01 s.d. 2015-08-31), fraksi basah 6.8%, 6,307,780 contoh

| Dilatih pada | Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|---|
| — | aturan dasbor | 0.639 | 0.407 | 0.444 | 0.586 |
| gabungan | ambang std60 | 0.537 | 0.514 | 0.343 | 0.473 |
| gabungan | Random Forest | 0.706 | 0.384 | 0.490 | 0.633 |
| hanya_openrainer | ambang std60 | 0.491 | 0.495 | 0.331 | 0.462 |
| hanya_openrainer | Random Forest | 0.537 | 0.286 | 0.442 | 0.595 |
| hanya_openmrg | ambang std60 | 0.691 | 0.602 | 0.338 | 0.479 |
| hanya_openmrg | Random Forest | 0.705 | 0.369 | 0.499 | 0.641 |
