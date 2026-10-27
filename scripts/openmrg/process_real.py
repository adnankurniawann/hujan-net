# Menjalankan rantai invers HujanNet pada data OpenMRG asli.
#
# Logikanya disalin persis dari lib/inverse/*.ts:
#   classify.ts  -> klasifikasi basah/kering + konsistensi tetangga
#   baseline.ts  -> median bergerak atas cuplikan kering
#   waa.ts       -> koreksi antena basah 1,5 dB
#   itu838.ts    -> R = (A/L/k)^(1/alpha), tabel resmi ITU-R P.838-3
#
# Ambang jendela diskalakan ke WAKTU yang sama, bukan jumlah cuplikan yang sama,
# karena data ini 1 menit sedangkan simulasi 15 detik.
#
# Keluaran: link_rain (taksiran hujan per sub-link) dan truth (radar) pada
# setiap cap waktu radar, siap dilatih oleh lib/ml/operator.ts.

import csv
import json
import numpy as np

# --- tabel ITU-R P.838-3 resmi, 7..40 GHz -------------------------------
P838 = np.array([
    [7,0.001915,1.4810,0.001425,1.4745],[8,0.004115,1.3905,0.003450,1.3797],
    [9,0.007535,1.3155,0.006691,1.2895],[10,0.01217,1.2571,0.01129,1.2156],
    [11,0.01772,1.2140,0.01731,1.1617],[12,0.02386,1.1825,0.02455,1.1216],
    [13,0.03041,1.1586,0.03266,1.0901],[14,0.03738,1.1396,0.04126,1.0646],
    [15,0.04481,1.1233,0.05008,1.0440],[16,0.05282,1.1086,0.05899,1.0273],
    [17,0.06146,1.0949,0.06797,1.0137],[18,0.07078,1.0818,0.07708,1.0025],
    [19,0.08084,1.0691,0.08642,0.9930],[20,0.09164,1.0568,0.09611,0.9847],
    [21,0.1032,1.0447,0.1063,0.9771],[22,0.1155,1.0329,0.1170,0.9700],
    [23,0.1286,1.0214,0.1284,0.9630],[24,0.1425,1.0101,0.1404,0.9561],
    [25,0.1571,0.9991,0.1533,0.9491],[26,0.1724,0.9884,0.1669,0.9421],
    [27,0.1884,0.9780,0.1813,0.9349],[28,0.2051,0.9679,0.1964,0.9277],
    [29,0.2224,0.9580,0.2124,0.9203],[30,0.2403,0.9485,0.2291,0.9129],
    [31,0.2588,0.9392,0.2465,0.9055],[32,0.2778,0.9302,0.2646,0.8981],
    [33,0.2972,0.9214,0.2833,0.8907],[34,0.3171,0.9129,0.3026,0.8834],
    [35,0.3374,0.9047,0.3224,0.8761],[36,0.3580,0.8967,0.3427,0.8690],
    [37,0.3789,0.8890,0.3633,0.8621],[38,0.4001,0.8816,0.3844,0.8552],
    [39,0.4215,0.8743,0.4058,0.8486],[40,0.4431,0.8673,0.4274,0.8421]])


def itu(freq, pol):
    """k dan alpha, k log-interpolasi dan alpha linear, persis itu838.ts."""
    f = min(40.0, max(7.0, float(freq)))
    ki, ai = (1, 2) if pol == "Horizontal" else (3, 4)
    hi = int(np.searchsorted(P838[:, 0], f))
    hi = max(1, min(hi, len(P838) - 1))
    lo = hi - 1
    fl, fh = P838[lo, 0], P838[hi, 0]
    if f == fl:
        return P838[lo, ki], P838[lo, ai]
    if f == fh:
        return P838[hi, ki], P838[hi, ai]
    w = (np.log(f) - np.log(fl)) / (np.log(fh) - np.log(fl))
    k = np.exp(np.log(P838[lo, ki]) + w * (np.log(P838[hi, ki]) - np.log(P838[lo, ki])))
    a = P838[lo, ai] + w * (P838[hi, ai] - P838[lo, ai])
    return k, a


# --- parameter, disalin dari classify.ts / baseline.ts ------------------
STD_TH = 0.6        # dB, ambang ragam jangka pendek
LEVEL_TH = 0.9      # dB, ambang selisih tingkat
MIN_DIP_VAR = 0.3   # dB
SOFT_LEVEL = 0.45   # dB
UPPER_Q = 0.98
CAND_MARGIN = 0.9   # dB
MIN_DRY = 5
NB_RADIUS_KM = 6.0
NB_PROMOTE = 0.5
WAA_DB = 1.5
# jendela dalam MENIT, menyamai 5 menit dan 15 menit pada kode aslinya
WIN = 5
HALF_WIN = 15


def dry_reference(levels):
    v = levels[np.isfinite(levels)]
    if v.size == 0:
        return np.nan
    env = np.quantile(v, UPPER_Q)
    cand = v[v >= env - CAND_MARGIN]
    return np.median(cand) if cand.size >= MIN_DRY else env


def rolling_std(x, w):
    """Simpangan baku jendela yang hanya menoleh ke belakang, seperti classify.ts."""
    n = len(x)
    out = np.full(n, np.nan)
    for i in range(n):
        s = x[max(0, i - w + 1):i + 1]
        s = s[np.isfinite(s)]
        if s.size >= 2:
            out[i] = s.std()
    return out


def haversine(a, b):
    R = 6371.0
    p1, p2 = np.radians(a[0]), np.radians(b[0])
    dp = p2 - p1
    dl = np.radians(b[1] - a[1])
    h = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(h))


def main():
    meta = list(csv.DictReader(open("omrg/cml/cml_metadata.csv")))
    sub_ids = [int(m["Sublink"]) for m in meta]
    order = {s: i for i, s in enumerate(sorted(sub_ids))}  # urutan dimensi sublink
    n = len(meta)

    mid = np.array([[(float(m["NearLatitude_DecDeg"]) + float(m["FarLatitude_DecDeg"])) / 2,
                     (float(m["NearLongitude_DecDeg"]) + float(m["FarLongitude_DecDeg"])) / 2]
                    for m in meta])
    length = np.array([float(m["Length_km"]) for m in meta])
    ka = np.array([itu(m["Frequency_GHz"], m["Polarization"]) for m in meta])

    # daftar tetangga dalam radius 6 km
    nb = []
    for i in range(n):
        d = np.array([haversine(mid[i], mid[j]) for j in range(n)])
        d[i] = 1e9
        nb.append(np.where(d <= NB_RADIUS_KM)[0])

    z = np.load("cml_ev.npz")
    tr = np.load("t_radar.npy")
    R_all = np.load("R_crop.npy")
    events = json.load(open("events.json"))["events"]

    X_rows, Y_rows, ev_rows, t_rows = [], [], [], []

    for e, (ri, rj, _) in enumerate(events):
        tmin = z[f"{e}_tmin"]
        rsl = z[f"{e}_rsl"].astype(np.float64)
        tsl = z[f"{e}_tsl"].astype(np.float64)
        # kolom NetCDF berurut menurut id sublink; petakan ke urutan metadata
        col = np.array([order[int(m["Sublink"])] for m in meta])
        lvl = rsl[:, col] - tsl[:, col]     # daya terima ternormalkan daya pancar

        T = lvl.shape[0]
        est = np.zeros((T, n))
        wet_all = np.zeros((T, n), bool)

        for i in range(n):
            x = lvl[:, i]
            if np.isfinite(x).sum() < 30:
                continue
            dry = dry_reference(x)
            if not np.isfinite(dry):
                continue
            dip = dry - x
            sd = rolling_std(x, WIN)
            wet = ((sd > STD_TH) & (dip > MIN_DIP_VAR)) | (dip > LEVEL_TH)
            wet_all[:, i] = np.nan_to_num(wet, nan=False).astype(bool)

        # konsistensi ruang antar tetangga
        wet2 = wet_all.copy()
        for i in range(n):
            if len(nb[i]) == 0:
                continue
            wn = wet_all[:, nb[i]].sum(axis=1)
            x = lvl[:, i]
            dry = dry_reference(x)
            dip = dry - x if np.isfinite(dry) else np.zeros(T)
            wet2[:, i] = np.where(wet_all[:, i], wn > 0,
                                  (wn / len(nb[i]) >= NB_PROMOTE) & (dip > SOFT_LEVEL))

        # garis dasar: median bergerak atas cuplikan kering
        for i in range(n):
            x = lvl[:, i]
            if np.isfinite(x).sum() < 30:
                continue
            fb = dry_reference(x)
            base = np.full(T, fb)
            for t in range(T):
                a, b = max(0, t - HALF_WIN), min(T, t + HALF_WIN + 1)
                seg = x[a:b][~wet2[a:b, i] & np.isfinite(x[a:b])]
                if seg.size:
                    base[t] = np.median(seg)
            att = np.maximum(0.0, base - x)
            att = np.where(wet2[:, i], np.maximum(0.0, att - WAA_DB), 0.0)
            g = att / length[i]
            est[:, i] = np.nan_to_num((g / ka[i, 0]) ** (1.0 / ka[i, 1]))

        # samakan ke cap waktu radar
        for r in range(ri, rj + 1):
            tt = int(tr[r]) // 60
            idx = np.searchsorted(tmin, tt)
            if idx <= 0 or idx >= T:
                continue
            X_rows.append(est[idx])
            Y_rows.append(R_all[r].ravel())
            ev_rows.append(e)
            t_rows.append(int(tr[r]))

        print(f"  kejadian {e+1:2d}: {rj-ri+1:3d} potret, "
              f"basah rata rata {wet2.mean()*100:.1f}% sub-link, "
              f"taksiran maks {est.max():.1f} mm/jam", flush=True)

    X = np.array(X_rows, np.float32)
    Y = np.array(Y_rows, np.float32)
    np.savez_compressed("real_pairs.npz", X=X, Y=Y, ev=np.array(ev_rows),
                        t=np.array(t_rows), length=length, mid=mid,
                        lat=np.load("lat_crop.npy"), lon=np.load("lon_crop.npy"))
    print(f"\nX {X.shape}  Y {Y.shape}  dari {len(set(ev_rows))} kejadian")
    print(f"taksiran tautan : maks {X.max():.1f}  rata rata {X.mean():.3f} mm/jam")
    print(f"radar           : maks {Y.max():.1f}  rata rata {Y.mean():.3f} mm/jam")


if __name__ == "__main__":
    main()
