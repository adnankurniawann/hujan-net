"""CML Belanda empat tahun (T-Mobile NL, 2011–2015) ke format standar OpenSense.

Sumber: Overeem, Walraven, Leijnse, Uijlenhoet (2024), 4TU.ResearchData,
doi:10.4121/be252844-b672-471e-8d69-27269a862ec1.v1, CC BY 4.0.

Jalankan:  uv run python -m hujannet_ml.nl

Dataset ini penting karena bentuknya sama dengan yang direkam NMS operator
Indonesia: daya terima MINIMUM dan MAKSIMUM per 15 menit, tanpa daya pancar.

BELUM DIUJI PADA BERKAS ASLI. Saat modul ini ditulis, data.4tu.nl tidak bisa
dijangkau dari jaringan kami. Pengurainya mengikuti format masukan RAINLINK,
yang menurut penerbit dipakai berkas olahannya, dan kolomnya sama dengan
dataset CML Belanda 2019 yang sudah diurai OpenSense. Periksa ulang setelah
berkas pertama terunduh.

Kebenaran dasarnya (radar KNMI terkoreksi penakar, 5 menit) belum ditarik di
sini: KNMI Data Platform butuh kunci API.
"""

import json
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

from .download import RAW_DIR, fetch

DATASET_UUID = "be252844-b672-471e-8d69-27269a862ec1"
FILES_API = f"https://data.4tu.nl/v2/articles/{DATASET_UUID}/files"
PROCESSED_DIR = RAW_DIR.parent / "processed" / "nl"

RAINLINK_COLUMNS = [
    "frequency", "datetime", "pmin", "pmax", "pathlength",
    "xstart", "ystart", "xend", "yend", "id",
]
SOURCE_ATTRS = {
    "source": "Overeem et al. (2024), doi:10.4121/be252844-b672-471e-8d69-27269a862ec1.v1",
    "license": "CC BY 4.0",
}


def download() -> list[Path]:
    """Unduh seluruh berkas dataset lewat API 4TU, dengan MD5 dari API itu sendiri."""
    with urllib.request.urlopen(FILES_API, timeout=60) as r:
        files = json.load(r)
    return [fetch(f["download_url"], RAW_DIR / "nl" / f["name"], f.get("computed_md5")) for f in files]


def rainlink_to_dataset(path: Path) -> xr.Dataset:
    """Urai satu berkas format RAINLINK menjadi (cml_id, time) rsl_min dan rsl_max.

    Satu ID RAINLINK adalah satu sub-link. Baris ganda untuk (ID, waktu) yang sama
    dibuang selain yang pertama; OpenSense menduga asalnya metadata yang keliru.
    """
    df = pd.read_csv(path, sep=r"\s+", skiprows=1, names=RAINLINK_COLUMNS)
    df["time"] = pd.to_datetime(df["datetime"].astype(str), format="%Y%m%d%H%M")
    df["id"] = df["id"].astype(str)
    df = df.drop_duplicates(["id", "time"])

    rsl = df.set_index(["id", "time"])[["pmin", "pmax"]].to_xarray()
    meta = df.groupby("id").first()
    return xr.Dataset(
        {
            "rsl_min": (("cml_id", "time"), rsl["pmin"].values.astype(np.float32), {"units": "dBm"}),
            "rsl_max": (("cml_id", "time"), rsl["pmax"].values.astype(np.float32), {"units": "dBm"}),
        },
        coords={
            "cml_id": rsl["id"].values,
            "time": rsl["time"].values,
            "frequency": ("cml_id", meta["frequency"].to_numpy() * 1e3, {"units": "MHz"}),
            "length": ("cml_id", meta["pathlength"].to_numpy() * 1e3, {"units": "m"}),
            "site_0_lon": ("cml_id", meta["xstart"].to_numpy()),
            "site_0_lat": ("cml_id", meta["ystart"].to_numpy()),
            "site_1_lon": ("cml_id", meta["xend"].to_numpy()),
            "site_1_lat": ("cml_id", meta["yend"].to_numpy()),
        },
        attrs={**SOURCE_ATTRS, "comment": "min/maks daya terima 15 menit; time = AKHIR interval, UTC"},
    )


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    for path in download():
        # shortcut: berkas mentah asli operator dilewati, hanya berkas format RAINLINK yang diurai
        if not path.name.endswith((".dat", ".dat.gz", ".txt", ".txt.gz", ".csv.gz")):
            continue
        out = PROCESSED_DIR / (path.name.split(".")[0] + ".nc")
        if out.exists():
            continue
        print(f"mengurai {path.name} ...")
        ds = rainlink_to_dataset(path)
        ds.to_netcdf(out, encoding={v: {"zlib": True} for v in ("rsl_min", "rsl_max")})
        print(f"  {ds.sizes['cml_id']} sub-link, {ds.sizes['time']} langkah waktu")


if __name__ == "__main__":
    main()
