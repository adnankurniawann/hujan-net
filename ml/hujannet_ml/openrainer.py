"""OpenRainER (Emilia-Romagna, Italia, 2021–2022) untuk pipeline HujanNet.

Sumber: Covi dan Roversi, doi:10.5281/zenodo.10593848, versi 2.0.3, CC BY 4.0.
Paper: Covi, Roversi, Nebuloni, ESSD Discuss., doi:10.5194/essd-2026-160.

Jalankan:  uv run python -m hujannet_ml.openrainer

Keluaran di data/processed/openrainer/, SATU BERKAS PER BULAN:

  cml/CML_<YYYYMM>.nc   rsl dan tsl 1 menit, dimensi (cml_id, sublink_id, time)
  ref/ref_<YYYYMM>.nc   hujan radar terkoreksi penakar sepanjang lintasan, 15 menit, mm/jam

Per bulan, bukan satu berkas besar: dua tahun CML 1 menit sekitar 2,5 GB dan
radarnya 30 GB setelah dibuka, jauh di atas memori laptop biasa.

CML di sumber sudah berformat OpenSense. Yang dikerjakan di sini hanya
membulatkan daya ke 1 dB (saran penerbit: daya mentah dikuantisasi 1 dB lalu
dirata-rata sebelum dicatat) dan menyeragamkan polarisasi menjadi `h`/`v`.

Labelnya radar RADadj, akumulasi 15 menit yang sudah dikoreksi kriging terhadap
penakar. Dipilih di atas reflektivitas mentah karena tidak perlu memilih relasi
Z-R sendiri. Waktu radar dibawa apa adanya dari sumber.
"""

import gzip
import shutil
import tarfile
from pathlib import Path

import numpy as np
import poligrain as plg
import xarray as xr

from .download import RAW_DIR, fetch

RECORD = "https://zenodo.org/api/records/22829808/files"
FILES = {
    "CML.tar": "c350cfdd0a73227f027598b2ef674480",
    "RADadj.tar": "1bd25498c5ee264ebac1a33b2c52e1ba",
}
PROCESSED_DIR = RAW_DIR.parent / "processed" / "openrainer"
RADAR_STEP_H = 0.25
RADAR_CHUNK = 500  # langkah waktu radar per potongan, ~200 MB

SOURCE_ATTRS = {
    "source": "OpenRainER v2.0.3, Covi & Roversi, doi:10.5281/zenodo.10593848",
    "license": "CC BY 4.0",
}


def extract(tar_path: Path) -> Path:
    """Buka tar ke folder bernama sama, lalu buka setiap .nc.gz bulanan menjadi .nc."""
    dest = tar_path.with_suffix("")
    if not dest.exists():
        with tarfile.open(tar_path) as t:
            t.extractall(dest, filter="data")
    for gz in dest.rglob("*.nc.gz"):
        with gzip.open(gz) as src, open(gz.with_suffix(""), "wb") as out:
            shutil.copyfileobj(src, out)
        gz.unlink()
    return dest


def clean_cmls(ds: xr.Dataset) -> xr.Dataset:
    """Bulatkan rsl dan tsl ke 1 dB, float32, dan polarisasi `h`/`v`."""
    ds = ds.copy()
    for v in ("rsl", "tsl"):
        ds[v] = np.round(ds[v]).astype(np.float32)
    pol = np.char.lower(ds["polarization"].values.astype(str))
    ds["polarization"] = (ds["polarization"].dims, np.where(np.char.startswith(pol, "h"), "h", np.where(np.char.startswith(pol, "v"), "v", "")))
    return ds.assign_attrs({**SOURCE_ATTRS, "comment": "rsl dan tsl dibulatkan ke 1 dB sesuai saran penerbit; time UTC"})


def radar_rate(src: xr.Dataset) -> xr.DataArray:
    """Akumulasi 15 menit (mm) menjadi intensitas rata-rata (mm/jam), dengan lon/lat 2D."""
    rate = (src["rainfall_amount"] / RADAR_STEP_H).astype(np.float32)
    lon, lat = np.meshgrid(src["lon"].values, src["lat"].values)
    rate = rate.rename({"lat": "y", "lon": "x"}).drop_vars(["x", "y"])
    rate = rate.assign_coords(lon=(("y", "x"), lon), lat=(("y", "x"), lat))
    return rate.transpose("time", "y", "x")


def month_reference(radar_path: Path, cmls: xr.Dataset) -> xr.DataArray:
    """Hujan radar rata-rata sepanjang lintasan, dibaca per potongan waktu supaya muat di memori."""
    src = xr.open_dataset(radar_path)
    along = plg.spatial.GridAtLines(radar_rate(src.isel(time=slice(0, 1))), cmls, use_lon_lat=True)
    parts = [along(radar_rate(src.isel(time=slice(i, i + RADAR_CHUNK))))
             for i in range(0, src.sizes["time"], RADAR_CHUNK)]
    ref = xr.concat(parts, dim="time")
    ref.attrs = {"units": "mm/h", "comment": "akumulasi 15 menit / 0,25 jam, rata rata sepanjang lintasan; time seperti sumber"}
    return ref


def main() -> None:
    raw = RAW_DIR / "openrainer"
    dirs = {name: extract(fetch(f"{RECORD}/{name}/content", raw / name, md5)) for name, md5 in FILES.items()}
    (PROCESSED_DIR / "cml").mkdir(parents=True, exist_ok=True)
    (PROCESSED_DIR / "ref").mkdir(parents=True, exist_ok=True)

    wet, total = 0, 0
    for cml_path in sorted(dirs["CML.tar"].glob("CML_*.nc")):
        month = cml_path.name[4:10]
        out_ref = PROCESSED_DIR / "ref" / f"ref_{month}.nc"
        cmls = clean_cmls(xr.open_dataset(cml_path))
        if not out_ref.exists():
            cmls.to_netcdf(PROCESSED_DIR / "cml" / f"CML_{month}.nc", encoding={v: {"zlib": True} for v in ("rsl", "tsl")})
            ref = month_reference(dirs["RADadj.tar"] / f"RADadj_{month}.nc", cmls)
            ref.to_dataset(name="rainfall_rate").assign_attrs(SOURCE_ATTRS).to_netcdf(out_ref)
        ref = xr.open_dataarray(out_ref)
        w, n = int((ref > 0.1).sum()), int(ref.notnull().sum())
        wet, total = wet + w, total + n
        print(f"{month}: {cmls.sizes['cml_id']} CML, {cmls.sizes['time']} menit, {ref.sizes['time']} potret radar, basah {w / max(n, 1):.1%}")

    print(f"selesai: {wet / max(total, 1):.1%} pasangan CML-potret basah (>0,1 mm/jam)")


if __name__ == "__main__":
    main()
