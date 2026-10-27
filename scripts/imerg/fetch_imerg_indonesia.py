#!/usr/bin/env python3
"""
Mengambil medan hujan IMERG NYATA di atas Indonesia, lalu mengemasnya menjadi
masukan untuk model maju HujanNet.

KENAPA INI ADA
--------------
Medan hujan simulasi kita adalah tiga gumpalan Gauss yang HALUS, sedangkan
interpolasi kita mengasumsikan hujan itu halus. Artinya kita menguji metode
kita pada medan yang paling ramah terhadap asumsi metode kita sendiri.

Hujan konvektif tropis nyata jauh lebih bergerigi dan terputus putus. Skrip ini
mengganti gumpalan buatan itu dengan medan hujan tropis SUNGGUHAN, supaya
rantai invers kita diuji pada struktur yang benar benar akan ditemuinya.

Ini BUKAN klaim bahwa kita punya data operator Indonesia. Yang nyata di sini
hanya medan hujannya. Redaman tautannya tetap disimulasikan.

BATAS YANG HARUS DISEBUT
------------------------
IMERG kotaknya 0,1 derajat, kira kira 11 km, tiap 30 menit. Grid kita 550 m.
Jadi IMERG TIDAK bisa dipakai menilai ketajaman 550 m kita: ia 20 kali lebih
kasar. Yang diuji di sini adalah apakah rantai kita tetap bekerja pada bentuk
hujan tropis, bukan seberapa tajam hasilnya.

PRASYARAT
---------
1. Daftar gratis di https://urs.earthdata.nasa.gov/users/new
2. Simpan kredensial (sekali saja):

   Linux/Mac:  ~/.netrc          Windows:  C:\\Users\\<nama>\\_netrc
   Isinya:
       machine urs.earthdata.nasa.gov login NAMA_ANDA password SANDI_ANDA

   Lalu di Linux/Mac:  chmod 600 ~/.netrc

3. pip install requests h5py numpy

PEMAKAIAN
---------
    python fetch_imerg_indonesia.py --start 2026-02-01 --end 2026-02-02 --wilayah ciliwung

Produk IMERG:
    GPM_3IMERGHH.07   Final Run,  jeda ~3,5 bulan, paling akurat  (bawaan)
    GPM_3IMERGHHL.07  Late Run,   jeda ~14 jam
    GPM_3IMERGHHE.07  Early Run,  jeda ~4 jam
"""

import argparse
import datetime as dt
import json
import os
import sys

import numpy as np

try:
    import h5py
    import requests
except ImportError:
    sys.exit("Butuh: pip install requests h5py numpy")

BASE = "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3"

# Kotak batas: [lonMin, latMin, lonMax, latMax]
WILAYAH = {
    # Sama persis dengan EVENT_BBOX di lib/sim/scenario.ts
    "ciliwung": [106.86, -6.76, 107.06, -6.61],
    # DAS sasaran usulan, lihat slide 16 deck
    "batanghari": [101.5, -2.4, 103.5, -1.0],
    "jakarta": [106.6, -6.4, 107.1, -6.0],
}


def urls_for(day: dt.date, product: str):
    """Empat puluh delapan berkas setengah jaman untuk satu hari."""
    doy = day.timetuple().tm_yday
    ver = "V07B"
    tag = {"GPM_3IMERGHH.07": "3B-HHR", "GPM_3IMERGHHL.07": "3B-HHR-L",
           "GPM_3IMERGHHE.07": "3B-HHR-E"}[product]
    out = []
    for half in range(48):
        t = dt.datetime.combine(day, dt.time()) + dt.timedelta(minutes=30 * half)
        end = t + dt.timedelta(minutes=29, seconds=59)
        name = (f"{tag}.MS.MRG.3IMERG.{t:%Y%m%d}-S{t:%H%M%S}-E{end:%H%M%S}."
                f"{half*30:04d}.{ver}.HDF5")
        out.append((t, f"{BASE}/{product}/{day:%Y}/{doy:03d}/{name}"))
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--start", required=True, help="YYYY-MM-DD")
    p.add_argument("--end", required=True, help="YYYY-MM-DD, inklusif")
    p.add_argument("--wilayah", default="ciliwung", choices=list(WILAYAH))
    p.add_argument("--produk", default="GPM_3IMERGHH.07")
    p.add_argument("--keluaran", default="imerg_field.json")
    p.add_argument("--min-mm", type=float, default=0.5,
                   help="buang potret yang puncaknya di bawah ini, mm/jam")
    a = p.parse_args()

    lon0, lat0, lon1, lat1 = WILAYAH[a.wilayah]
    d0 = dt.date.fromisoformat(a.start)
    d1 = dt.date.fromisoformat(a.end)

    s = requests.Session()
    s.headers["User-Agent"] = "HujanNet/1.0"

    frames, times = [], []
    lats = lons = None

    day = d0
    while day <= d1:
        for t, url in urls_for(day, a.produk):
            try:
                r = s.get(url, timeout=180, allow_redirects=True)
            except Exception as e:
                print(f"  ! {t:%Y-%m-%d %H:%M} gagal: {e}")
                continue

            if r.status_code != 200 or r.content[:4] != b"\x89HDF":
                head = r.content[:60].decode("utf-8", "replace")
                if "denied" in head.lower() or "login" in head.lower():
                    sys.exit("\nAKSES DITOLAK. Kredensial .netrc belum benar.\n"
                             "Daftar di https://urs.earthdata.nasa.gov/users/new\n"
                             "lalu isi ~/.netrc atau C:\\Users\\<nama>\\_netrc:\n"
                             "  machine urs.earthdata.nasa.gov login NAMA password SANDI")
                print(f"  ! {t:%Y-%m-%d %H:%M} bukan HDF5 (HTTP {r.status_code})")
                continue

            tmp = "_imerg_tmp.h5"
            open(tmp, "wb").write(r.content)
            with h5py.File(tmp, "r") as f:
                g = f["Grid"]
                if lats is None:
                    LA, LO = g["lat"][:], g["lon"][:]
                    yi = np.where((LA >= lat0) & (LA <= lat1))[0]
                    xi = np.where((LO >= lon0) & (LO <= lon1))[0]
                    lats, lons = LA[yi], LO[xi]
                    print(f"potongan grid IMERG: {len(lats)} x {len(lons)} kotak "
                          f"(0,1 derajat, kira kira 11 km)")
                # precipitation: (time, lon, lat) pada V07
                pr = g["precipitation"][0, :, :]
                fld = pr[np.ix_(xi, yi)].T.astype(np.float32)
            os.remove(tmp)

            fld[fld < 0] = 0.0
            if fld.max() >= a.min_mm:
                frames.append(fld)
                times.append(int(t.replace(tzinfo=dt.timezone.utc).timestamp()))
                print(f"  + {t:%Y-%m-%d %H:%M}  puncak {fld.max():6.1f} mm/jam  "
                      f"rata rata {fld.mean():5.2f}")
        day += dt.timedelta(days=1)

    if not frames:
        sys.exit("Tidak ada potret berhujan pada rentang itu. Coba tanggal lain.")

    arr = np.array(frames)
    json.dump({
        "sumber": f"NASA {a.produk}",
        "wilayah": a.wilayah,
        "bbox": [float(lons.min()), float(lats.min()), float(lons.max()), float(lats.max())],
        "nx": int(len(lons)), "ny": int(len(lats)),
        "catatan": ("Kotak 0,1 derajat (kira kira 11 km), tiap 30 menit. "
                    "20 kali lebih kasar daripada grid 550 m HujanNet. "
                    "Dipakai sebagai BENTUK medan hujan tropis nyata, "
                    "bukan sebagai kebenaran dasar untuk menilai ketajaman."),
        "times": times,
        "frames": [f.round(3).tolist() for f in arr],
    }, open(a.keluaran, "w"))

    print(f"\n{len(frames)} potret berhujan -> {a.keluaran}")
    print(f"puncak tertinggi {arr.max():.1f} mm/jam, rata rata {arr.mean():.2f} mm/jam")
    print("\nLangkah berikutnya: pakai berkas ini sebagai medan hujan pada model maju,")
    print("menggantikan DEMO_STORM di lib/sim/scenario.ts.")


if __name__ == "__main__":
    main()
