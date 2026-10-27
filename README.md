# HujanNet Dashboard

Dasbor operator yang merekonstruksi peta curah hujan dari redaman tautan
gelombang mikro antar menara telekomunikasi. Seluruh data pada fase ini adalah
**simulasi**, dan justru karena itu kebenaran dasarnya diketahui sehingga galat
rekonstruksi bisa diukur.

Panduan kerja tim, pembagian tugas, dan aturan desain ada di [Panduan.md](Panduan.md).

## Menjalankan

```bash
npm install
npm run dev
npm test
```

Buka http://localhost:3000.

## Peta direktori

| Direktori | Isi |
|---|---|
| `lib/types.ts` | Kontrak data bersama, dikunci setelah T0 |
| `lib/physics/` | Model ITU-R P.838, murni tanpa efek samping |
| `lib/sim/` | Simulator medan hujan dan model maju |
| `lib/inverse/` | Rekonstruksi medan hujan dari redaman |
| `lib/catchment/`, `lib/alerts/` | Akumulasi DAS dan antrean peringatan |
| `components/` | Antarmuka dasbor |
| `data/` | Topologi tautan sintetis dan poligon DAS |
| `tests/` | Uji modul fisika dan inversi |

Modul di `lib/physics`, `lib/sim`, dan `lib/inverse` tidak boleh mengimpor apa
pun dari React atau Next.
