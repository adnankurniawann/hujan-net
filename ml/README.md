# HujanNet ML

Pipeline data dan model AI yang dilatih pada data tautan operator **sungguhan**.
Ini pengganti percobaan lama di `scripts/openmrg/`, yang file antaranya tidak bisa
dibuat ulang dari repo.

Python dikelola [uv](https://docs.astral.sh/uv/). Seluruh data diunduh dan diolah
ulang dari sumber aslinya, dengan pemeriksaan MD5. Folder `data/` tidak masuk git.

```bash
cd ml
uv sync
uv run pytest
uv run python -m hujannet_ml.openmrg   # unduh 318 MB, olah 4,6 GB, ~beberapa menit
uv run python -m hujannet_ml.openrainer # unduh 1,7 GB, buka jadi ~35 GB
uv run python -m hujannet_ml.nl        # butuh akses ke data.4tu.nl
```

## Format keluaran

Semua dataset diubah ke [format data OpenSense](https://open-research-europe.ec.europa.eu/articles/3-169/v2)
supaya bisa langsung dibaca `poligrain` dan `pycomlink`:

- dimensi `cml_id`, `sublink_id`, `time`
- `frequency` dalam MHz, `length` dalam meter, `polarization` `v`/`h`
- `site_0_lat/lon`, `site_1_lat/lon` per CML

## Dataset

| Modul | Data | Keluaran di `data/processed/` | Status |
|---|---|---|---|
| `openmrg` | OpenMRG, Gothenburg, Jun–Agu 2015, CC BY-SA 4.0 | `cml_1min.nc`, `radar_rain.nc`, `cml_radar_ref.nc` | jalan |
| `openrainer` | OpenRainER, Emilia-Romagna, 2021–2022, CC BY 4.0 | `cml/CML_<bulan>.nc`, `ref/ref_<bulan>.nc`, satu per bulan | jalan |
| `nl` | CML Belanda 2011–2015, 15 menit min/maks, CC BY 4.0 | satu `.nc` per berkas sumber | **belum diuji pada berkas asli**, 4TU tidak terjangkau |

`cml_radar_ref.nc` dan `ref/` adalah label latih: hujan radar dirata-ratakan
sepanjang tiap lintasan CML. OpenRainER memakai radar yang sudah dikoreksi
penakar (15 menit), OpenMRG memakai reflektivitas mentah (5 menit, Z = 200R^1.5). Untuk NL, label serupa butuh radar KNMI
(`rad_nl25_rac_mfbs_em_5min`), yang aksesnya memerlukan kunci API KNMI.

**Waktu tidak diselaraskan di tahap ini.** CML memakai awal jendela (OpenMRG)
atau akhir interval (NL), radar memakai saat pindai. Penyelarasan diputuskan
saat membuat himpunan latih.
