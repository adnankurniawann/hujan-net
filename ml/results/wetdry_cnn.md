# 1D-CNN basah/kering vs Random Forest

Dilatih pada kedua dataset (1,704,748 contoh, 10% dari bulan latih). Basah = radar > 0.1 mm/jam. Ketiga metode dinilai pada baris uji yang sama.

## Uji: openrainer, fraksi basah 4.7%, 9,095,577 contoh

| Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|
| aturan dasbor | 0.784 | 0.882 | 0.114 | 0.226 |
| Random Forest (fitur tangan) | 0.526 | 0.504 | 0.343 | 0.486 |
| 1D-CNN (deret mentah) | 0.540 | 0.425 | 0.386 | 0.536 |

## Uji: openmrg, fraksi basah 6.9%, 6,308,420 contoh

| Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|
| aturan dasbor | 0.599 | 0.443 | 0.406 | 0.546 |
| Random Forest (fitur tangan) | 0.669 | 0.441 | 0.438 | 0.580 |
| 1D-CNN (deret mentah) | 0.699 | 0.384 | 0.487 | 0.629 |
