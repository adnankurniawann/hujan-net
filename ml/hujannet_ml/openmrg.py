"""OpenMRG (Gothenburg, Jun–Agu 2015) ke format standar OpenSense.

Sumber: Andersson dkk. (2022), ESSD 14, 5411–5426, doi:10.5281/zenodo.7107689,
CC BY-SA 4.0. Hasil turunan dari data ini ikut berlisensi CC BY-SA 4.0.

Jalankan:  uv run python -m hujannet_ml.openmrg

Keluaran di data/processed/openmrg/:

  cml_1min.nc       rsl dan tsl rata rata 1 menit, dimensi (cml_id, sublink_id, time)
  radar_rain.nc     intensitas hujan radar 5 menit, mm/jam, grid 2 km
  cml_radar_ref.nc  hujan radar rata rata sepanjang lintasan tiap CML, 5 menit

Berkas ketiga adalah label latih: kebenaran dasar untuk klasifikasi basah/kering
dan untuk estimasi intensitas per tautan.

Konvensi waktu dibawa apa adanya dari sumber, karena keduanya berbeda:
waktu CML adalah AWAL jendela sampel, waktu radar adalah SAAT pindai.
Penyelarasan diputuskan di tahap pembuatan himpunan latih, bukan di sini.
"""

import warnings
import zipfile
from pathlib import Path

import netCDF4
import numpy as np
import pandas as pd
import poligrain as plg
import xarray as xr

from .download import RAW_DIR, fetch

URL = "https://zenodo.org/api/records/7107689/files/OpenMRG.zip/content"
ZIP_MD5 = "4e4cdf6ced4d45a084c348f245b8d690"
PROCESSED_DIR = RAW_DIR.parent / "processed" / "openmrg"

RAW_STEP_S = 10
STEPS_PER_MIN = 60 // RAW_STEP_S
MISSING = 1e10

# Andersson dkk. (2022) memakai Z = 200 R^1.5 untuk komposit radar ini.
ZR_A, ZR_B = 200.0, 1.5

SOURCE_ATTRS = {
    "source": "OpenMRG v1.1, Andersson et al. (2022), doi:10.5281/zenodo.7107689",
    "license": "CC BY-SA 4.0",
}


def cml_to_minutes(cml_nc: Path, meta_csv: Path, block_min: int = 1440) -> xr.Dataset:
    """Rata ratakan rsl dan tsl 10 detik menjadi 1 menit, lalu susun per CML.

    Dibaca per blok `block_min` menit karena berkas mentahnya 4,6 GB, lebih besar
    daripada memori yang aman dipakai. Satu menit bernilai NaN hanya kalau
    keenam cuplikannya hilang.
    """
    meta = pd.read_csv(meta_csv)
    nc = netCDF4.Dataset(cml_nc)
    nc.set_auto_mask(False)

    t = nc["time"][:].astype(np.int64)
    if not (np.all(np.diff(t) == RAW_STEP_S) and t[0] % 60 == 0):
        raise ValueError("waktu cml.nc tidak teratur 10 detik mulai awal menit")
    n_min = len(t) // STEPS_PER_MIN

    sub = meta.set_index("Sublink").loc[nc["sublink"][:]]
    cml_ids = np.sort(sub["Link"].unique())
    col_cml = np.searchsorted(cml_ids, sub["Link"].to_numpy())
    col_dir = np.where(sub["Direction"].to_numpy() == "A", 0, 1)
    if len(set(zip(col_cml, col_dir))) != len(sub):
        raise ValueError("pasangan (Link, Direction) ganda di metadata")

    out = {v: np.full((len(cml_ids), 2, n_min), np.nan, np.float32) for v in ("rsl", "tsl")}
    for start in range(0, n_min, block_min):
        stop = min(start + block_min, n_min)
        for v in out:
            x = nc[v][start * STEPS_PER_MIN : stop * STEPS_PER_MIN, :]
            x[x >= MISSING] = np.nan
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", RuntimeWarning)  # menit yang seluruhnya hilang
                m = np.nanmean(x.reshape(stop - start, STEPS_PER_MIN, -1), axis=1)
            out[v][col_cml, col_dir, start:stop] = m.T
    nc.close()

    def per_sublink(col, fill):
        a = np.full((len(cml_ids), 2), fill, dtype=object if isinstance(fill, str) else float)
        a[col_cml, col_dir] = sub[col].to_numpy()
        return a

    # Koordinat dan panjang diambil dari arah A: site_0 = ujung Near arah A.
    a = sub[sub["Direction"] == "A"].set_index("Link").reindex(cml_ids)
    pol = per_sublink("Polarization", "")
    ds = xr.Dataset(
        {
            "rsl": (("cml_id", "sublink_id", "time"), out["rsl"], {"units": "dBm"}),
            "tsl": (("cml_id", "sublink_id", "time"), out["tsl"], {"units": "dBm"}),
        },
        coords={
            "cml_id": cml_ids.astype(str),
            "sublink_id": ["sublink_1", "sublink_2"],
            "time": pd.to_datetime(t[0] + 60 * np.arange(n_min), unit="s"),
            "frequency": (("cml_id", "sublink_id"), per_sublink("Frequency_GHz", np.nan) * 1e3, {"units": "MHz"}),
            "polarization": (("cml_id", "sublink_id"), np.where(pol == "Vertical", "v", np.where(pol == "Horizontal", "h", "")).astype(str)),
            "length": ("cml_id", a["Length_km"].to_numpy() * 1e3, {"units": "m"}),
            "site_0_lat": ("cml_id", a["NearLatitude_DecDeg"].to_numpy()),
            "site_0_lon": ("cml_id", a["NearLongitude_DecDeg"].to_numpy()),
            "site_1_lat": ("cml_id", a["FarLatitude_DecDeg"].to_numpy()),
            "site_1_lon": ("cml_id", a["FarLongitude_DecDeg"].to_numpy()),
        },
        attrs={**SOURCE_ATTRS, "comment": "rata rata 1 menit; time = awal menit, UTC"},
    )
    return ds


def radar_rain(radar_nc: Path) -> xr.Dataset:
    """Reflektivitas radar ke intensitas hujan mm/jam lewat Z = 200 R^1.5."""
    src = xr.open_dataset(radar_nc)  # skala 0,4 dan offset -30 serta nilai 255 didekode xarray
    dbz = src["data"]
    rain = ((10 ** (dbz / 10) / ZR_A) ** (1 / ZR_B)).astype(np.float32)
    rain.attrs = {"units": "mm/h", "comment": f"Z = {ZR_A:g} R^{ZR_B:g}; time = saat pindai, UTC"}
    return xr.Dataset({"rainfall_rate": rain}, coords={"lat": src["lat"], "lon": src["lon"]}, attrs=SOURCE_ATTRS)


def path_average(rain: xr.DataArray, cmls: xr.Dataset) -> xr.DataArray:
    """Hujan radar rata rata sepanjang lintasan tiap CML, dibobot panjang potongan per sel."""
    along = plg.spatial.GridAtLines(rain, cmls, use_lon_lat=True)(rain.transpose("time", "y", "x"))
    along.attrs = {"units": "mm/h", "comment": "rata rata radar sepanjang lintasan; time = saat pindai radar"}
    return along


def main() -> None:
    raw = RAW_DIR / "openmrg"
    zip_path = fetch(URL, raw / "OpenMRG.zip", ZIP_MD5)
    if not (raw / "cml" / "cml.nc").exists():
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(raw)

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    print("CML 10 detik -> 1 menit ...")
    cmls = cml_to_minutes(raw / "cml" / "cml.nc", raw / "cml" / "cml_metadata.csv")
    enc = {v: {"zlib": True, "complevel": 4} for v in ("rsl", "tsl")}
    cmls.to_netcdf(PROCESSED_DIR / "cml_1min.nc", encoding=enc)

    print("radar -> mm/jam ...")
    rad = radar_rain(raw / "radar" / "radar.nc")
    rad.to_netcdf(PROCESSED_DIR / "radar_rain.nc", encoding={"rainfall_rate": {"zlib": True}})

    print("radar sepanjang lintasan ...")
    ref = path_average(rad["rainfall_rate"], cmls)
    ref.to_dataset(name="rainfall_rate").assign_attrs(SOURCE_ATTRS).to_netcdf(PROCESSED_DIR / "cml_radar_ref.nc")

    wet = float((ref > 0.1).mean())
    print(f"selesai: {cmls.sizes['cml_id']} CML, {cmls.sizes['time']} menit, "
          f"{ref.sizes['time']} potret radar, {wet:.1%} pasangan CML-potret basah (>0,1 mm/jam)")


if __name__ == "__main__":
    main()
