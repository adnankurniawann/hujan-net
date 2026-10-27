# HujanNet Dashboard

Dasbor operator yang merekonstruksi peta curah hujan dari redaman tautan
gelombang mikro antar menara telekomunikasi. Dasbor masih berjalan di atas data
**simulasi**. Pipeline data tautan dan radar sungguhan untuk melatih modelnya ada
di [`ml/`](ml/README.md).

Produk, arsitektur, dan angka yang sudah diukur ada di [ARSITEKTUR.md](ARSITEKTUR.md).
Aturan tampilan ada di [DESIGN.md](DESIGN.md).

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
| `lib/types.ts` | Kontrak data bersama |
| `lib/physics/` | Model ITU-R P.838, murni tanpa efek samping |
| `lib/sim/` | Simulator medan hujan dan model maju |
| `lib/inverse/` | Rekonstruksi medan hujan dari redaman |
| `lib/catchment/`, `lib/alerts/` | Akumulasi DAS dan antrean peringatan |
| `components/` | Antarmuka dasbor |
| `data/` | Topologi tautan sintetis dan poligon DAS |
| `tests/` | Uji modul fisika dan inversi |
| `ml/` | Pipeline data asli dan model AI (Python) |

Modul di `lib/physics`, `lib/sim`, dan `lib/inverse` tidak boleh mengimpor apa
pun dari React atau Next.
