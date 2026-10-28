# 1D-CNN basah/kering vs Random Forest

Dilatih pada kedua dataset (1,704,790 contoh, 10% dari bulan latih). Basah = radar > 0.1 mm/jam. Ketiga metode dinilai pada baris uji yang sama.

## Uji: openrainer, fraksi basah 4.7%, 9,095,577 contoh

| Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|
| aturan dasbor | 0.784 | 0.882 | 0.114 | 0.226 |
| Random Forest (fitur tangan) | 0.509 | 0.480 | 0.346 | 0.491 |
| 1D-CNN (deret mentah) | 0.513 | 0.402 | 0.381 | 0.533 |

## Uji: openmrg, fraksi basah 6.8%, 6,307,780 contoh

| Metode | POD | FAR | CSI | MCC |
|---|---|---|---|---|
| aturan dasbor | 0.639 | 0.407 | 0.444 | 0.586 |
| Random Forest (fitur tangan) | 0.706 | 0.384 | 0.490 | 0.633 |
| 1D-CNN (deret mentah) | 0.742 | 0.339 | 0.537 | 0.677 |
