# Mengunduh ubin DEM yang dibutuhkan `delineate_catchments.py`.
#
# Sumbernya cermin terbuka AWS "Terrain Tiles" untuk SRTM 1 arcsec, format skadi
# (satu berkas .hgt.gz per derajat). Tanpa akun, tanpa kunci API — beda dengan
# jalur NASA Earthdata di `scripts/imerg/` yang menuntut login.
#
#   python scripts/hydro/fetch_dem.py
#
# Ubinnya ~26 MB per berkas setelah dibuka dan TIDAK ikut masuk git; lihat
# `scripts/hydro/dem/.gitignore`. Jalankan sekali, hasilnya dipakai berkali-kali.

from __future__ import annotations

import gzip
import os
import shutil
import urllib.request

BASE = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"
TILES = ["S07E106", "S07E107"]

HERE = os.path.dirname(os.path.abspath(__file__))
DEM_DIR = os.path.join(HERE, "dem")


def main() -> None:
    os.makedirs(DEM_DIR, exist_ok=True)
    for tile in TILES:
        target = os.path.join(DEM_DIR, f"{tile}.hgt")
        if os.path.exists(target):
            print(f"{tile}: sudah ada, dilewati")
            continue
        url = f"{BASE}/{tile[:3]}/{tile}.hgt.gz"
        print(f"{tile}: mengunduh {url}")
        with urllib.request.urlopen(url, timeout=300) as response:
            data = response.read()
        with gzip.GzipFile(fileobj=__import__("io").BytesIO(data)) as gz, open(target, "wb") as out:
            shutil.copyfileobj(gz, out)
        print(f"{tile}: {os.path.getsize(target) / 1e6:.1f} MB -> {target}")


if __name__ == "__main__":
    main()
