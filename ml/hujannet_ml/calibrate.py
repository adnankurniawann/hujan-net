"""Kalibrasi taksiran hujan per tautan: redaman antena basah dan skala k ITU.

Jalankan (setelah openmrg, openrainer, wetdry features, dan cnn):
  uv run python -m hujannet_ml.calibrate

Taksiran per tautan: R = (max(A - WAA, 0) / L / (c * k))^(1/alpha) saat CNN bilang
basah, 0 saat kering. k dan alpha dari ITU-R P.838-3. Dua angka disetel pada bulan
latih+validasi tiap dataset, terhadap radar sepanjang lintasan:

  WAA  redaman antena basah, dB (dasbor memakai 1,5)
  c    pengali k (dasbor memakai 1); menyerap DSD setempat dan bias radar

Untuk tiap WAA, c dipilih supaya TOTAL hujan taksiran sama dengan radar; lalu WAA
dengan RMSE terkecil. Meminimalkan RMSE langsung tidak dipakai: dengan korelasi
per tautan sekitar 0,5, itu menyusutkan semua taksiran ke separuhnya, dan akumulasi
DAS untuk peringatan banjir ikut terlalu rendah.

Tautan di bawah MIN_LINK_KM dibuang: satu langkah kuantisasi pada lintasan 300 m
sudah terbaca puluhan mm/jam (rincian per panjang ada di laporan).

Lalu dinilai pada bulan uji, termasuk silang: angka OpenMRG dipakai di OpenRainER
dan sebaliknya. Kalau angka satu iklim tidak cocok di iklim lain, itu alasan
kalibrasi ulang dengan data Indonesia.
"""

import json

import numpy as np
import pandas as pd

from .cnn import chunk_rows, load, meta_inputs, predict, sequences
from .wetdry import FEATURE_DIR, RESULTS_DIR, SPLITS, iter_chunks

DEFAULT = {"waa_db": 1.5, "k_scale": 1.0}  # lib/inverse/waa.ts, lib/physics/itu838.ts
WAA_GRID = np.arange(0, 3.01, 0.25)
MIN_LINK_KM = 1.0
LENGTH_BINS_KM = [0, 0.5, 1, 2, 4, 8, 30]

# ITU-R P.838-3, sama dengan lib/physics/itu838.ts: frekuensi GHz, kH, alphaH, kV, alphaV.
P838 = np.array([
    [7, 0.001915, 1.481, 0.001425, 1.4745], [8, 0.004115, 1.3905, 0.00345, 1.3797],
    [9, 0.007535, 1.3155, 0.006691, 1.2895], [10, 0.01217, 1.2571, 0.01129, 1.2156],
    [11, 0.01772, 1.214, 0.01731, 1.1617], [12, 0.02386, 1.1825, 0.02455, 1.1216],
    [13, 0.03041, 1.1586, 0.03266, 1.0901], [14, 0.03738, 1.1396, 0.04126, 1.0646],
    [15, 0.04481, 1.1233, 0.05008, 1.044], [16, 0.05282, 1.1086, 0.05899, 1.0273],
    [17, 0.06146, 1.0949, 0.06797, 1.0137], [18, 0.07078, 1.0818, 0.07708, 1.0025],
    [19, 0.08084, 1.0691, 0.08642, 0.993], [20, 0.09164, 1.0568, 0.09611, 0.9847],
    [21, 0.1032, 1.0447, 0.1063, 0.9771], [22, 0.1155, 1.0329, 0.117, 0.97],
    [23, 0.1286, 1.0214, 0.1284, 0.963], [24, 0.1425, 1.0101, 0.1404, 0.9561],
    [25, 0.1571, 0.9991, 0.1533, 0.9491], [26, 0.1724, 0.9884, 0.1669, 0.9421],
    [27, 0.1884, 0.978, 0.1813, 0.9349], [28, 0.2051, 0.9679, 0.1964, 0.9277],
    [29, 0.2224, 0.958, 0.2124, 0.9203], [30, 0.2403, 0.9485, 0.2291, 0.9129],
    [31, 0.2588, 0.9392, 0.2465, 0.9055], [32, 0.2778, 0.9302, 0.2646, 0.8981],
    [33, 0.2972, 0.9214, 0.2833, 0.8907], [34, 0.3171, 0.9129, 0.3026, 0.8834],
    [35, 0.3374, 0.9047, 0.3224, 0.8761], [36, 0.358, 0.8967, 0.3427, 0.869],
    [37, 0.3789, 0.889, 0.3633, 0.8621], [38, 0.4001, 0.8816, 0.3844, 0.8552],
    [39, 0.4215, 0.8743, 0.4058, 0.8486], [40, 0.4431, 0.8673, 0.4274, 0.8421],
])


def itu(freq_ghz: np.ndarray, pol: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """k dan alpha, interpolasi pada log frekuensi seperti itu838.ts."""
    lf, tf = np.log(np.clip(freq_ghz, 7, 40)), np.log(P838[:, 0])
    h = np.char.lower(pol.astype(str)) == "h"
    k = np.exp(np.where(h, np.interp(lf, tf, np.log(P838[:, 1])), np.interp(lf, tf, np.log(P838[:, 3]))))
    alpha = np.where(h, np.interp(lf, tf, P838[:, 2]), np.interp(lf, tf, P838[:, 4]))
    return k, alpha


def link_rows(name: str) -> pd.DataFrame:
    """Bahan taksiran per (sub-link, waktu radar): selisih redaman, basah CNN, L, k, alpha, radar. Disinggahkan."""
    cache = FEATURE_DIR / f"{name}_link_rows.pkl"
    if cache.exists():
        return pd.read_pickle(cache)
    net, thr = load("cnn")
    parts = []
    for ds, part, loss, meta, ref, window in iter_chunks():
        if ds != name:
            if parts:
                break
            continue
        rows, dip, pos = chunk_rows(loss, meta, ref, window)
        link = rows.link_idx.to_numpy()
        p = np.concatenate([predict(net, sequences(dip, pos[i:i + 200_000], link[i:i + 200_000]), meta_inputs(rows.iloc[i:i + 200_000]))
                            for i in range(0, len(rows), 200_000)])
        k, alpha = itu(rows.freq_ghz.to_numpy(), meta.pol.to_numpy()[link])
        parts.append(pd.DataFrame({
            "time": rows.time, "cml": meta.cml_id.to_numpy()[link], "dip": rows.dip_mean.to_numpy(np.float32),
            "wet": p > thr, "length_km": rows.length_km.to_numpy(np.float32),
            "k": k.astype(np.float32), "alpha": alpha.astype(np.float32), "oracle": rows.ref_mm_h.to_numpy(np.float32),
        }))
        print(f"bahan taksiran {name} {part}")
    out = pd.concat(parts, ignore_index=True)
    out["cml"] = out.cml.astype("category")
    out.to_pickle(cache)
    return out


def retrieve(rows: pd.DataFrame, waa_db: float, k_scale: float) -> np.ndarray:
    a = np.maximum(rows.dip.to_numpy() - waa_db, 0)
    est = (a / rows.length_km.to_numpy() / (k_scale * rows.k.to_numpy())) ** (1 / rows.alpha.to_numpy())
    return np.where(rows.wet.to_numpy(), est, 0).astype(np.float32)


def fit(rows: pd.DataFrame) -> dict[str, float]:
    """Per WAA, c yang membuat total taksiran = total radar; lalu WAA dengan RMSE terkecil.

    Baris kering CNN tidak bergantung pada keduanya, jadi cukup baris basah yang dihitung.
    """
    wet = rows[rows.wet.to_numpy()]
    total = rows.oracle.to_numpy().sum(dtype=np.float64)
    best = None
    for w in WAA_GRID:
        lo, hi = np.log(0.05), np.log(20)
        for _ in range(40):  # total taksiran turun monoton terhadap c
            mid = (lo + hi) / 2
            lo, hi = (mid, hi) if retrieve(wet, w, np.exp(mid)).sum(dtype=np.float64) > total else (lo, mid)
        c = float(np.exp((lo + hi) / 2))
        sse = float(np.sum((retrieve(wet, w, c) - wet.oracle.to_numpy()) ** 2.0))
        if best is None or sse < best[0]:
            best = (sse, float(w), c)
    return {"waa_db": best[1], "k_scale": best[2]}


def link_scores(rows: pd.DataFrame, est: np.ndarray) -> dict[str, float]:
    y = rows.oracle.to_numpy()
    wet = y > 0.1
    return {
        "rmse": float(np.sqrt(np.mean((est - y) ** 2))),
        "rmse_wet": float(np.sqrt(np.mean((est[wet] - y[wet]) ** 2))),
        "bias_wet": float(np.mean(est[wet] - y[wet])),
        "corr": float(np.corrcoef(est, y)[0, 1]),
        "total_ratio": float(est.sum() / y.sum()),
    }


def split_rows(name: str, rows: pd.DataFrame, splits: tuple[str, ...]) -> pd.DataFrame:
    m = np.zeros(len(rows), bool)
    for s in splits:
        a, b = SPLITS[name][s]
        m |= (rows.time >= pd.Timestamp(a)).to_numpy() & (rows.time < pd.Timestamp(b) + pd.Timedelta(days=1)).to_numpy()
    return rows[m]


def by_length(rows: pd.DataFrame) -> dict[str, dict[str, float]]:
    """Angka dasbor per kelas panjang lintasan: rasio total dan bagian galat kuadrat."""
    est, y = retrieve(rows, **DEFAULT), rows.oracle.to_numpy()
    se, out = (est - y) ** 2.0, {}
    bins = pd.cut(rows.length_km, LENGTH_BINS_KM).astype(str).to_numpy()
    for b in pd.unique(bins):
        m = bins == b
        out[b] = {"rows": int(m.sum()), "total_ratio": float(est[m].sum() / y[m].sum()), "sse_share": float(se[m].sum() / se.sum())}
    return dict(sorted(out.items(), key=lambda kv: float(kv[0].strip("(]").split(",")[0])))


def main() -> None:
    params, tests, lengths = {}, {}, {}
    for name in SPLITS:
        rows = link_rows(name)
        lengths[name] = by_length(split_rows(name, rows, ("test",)))
        rows = rows[rows.length_km.to_numpy() >= MIN_LINK_KM]
        params[name] = fit(split_rows(name, rows, ("train", "val")))
        tests[name] = split_rows(name, rows, ("test",))
        print(name, params[name])
    results = {"params": params, "default": DEFAULT, "min_link_km": MIN_LINK_KM, "by_length": lengths, "test": {}}
    for name, rows in tests.items():
        results["test"][name] = {"dasbor": link_scores(rows, retrieve(rows, **DEFAULT))}
        results["test"][name] |= {f"disetel di {p}": link_scores(rows, retrieve(rows, **params[p])) for p in params}
    write_report(results)


def write_report(results: dict) -> None:
    (RESULTS_DIR / "calibrate.json").write_text(json.dumps(results, indent=2))
    lines = ["# Kalibrasi antena basah dan skala k", "",
             "Taksiran R = (max(A - WAA, 0) / L / (c k))^(1/alpha) saat CNN bilang basah. Per WAA, c dipilih "
             "supaya total taksiran sama dengan radar di bulan latih+validasi; lalu WAA dengan RMSE terkecil.", "",
             "## Galat menurut panjang lintasan, angka dasbor, bulan uji", "",
             "| Dataset | Panjang (km) | Baris | Total taksiran / radar | Bagian galat kuadrat |", "|---|---|---|---|---|"]
    for name, bins in results["by_length"].items():
        lines += [f"| {name} | {b} | {s['rows']:,} | {s['total_ratio']:.2f} | {s['sse_share']:.0%} |" for b, s in bins.items()]
    lines += ["", f"Tautan di bawah {results['min_link_km']:g} km dibuang untuk semua angka di bawah ini.", "",
              "| Angka | WAA (dB) | c |", "|---|---|---|",
              f"| dasbor (ITU apa adanya) | {DEFAULT['waa_db']:g} | {DEFAULT['k_scale']:g} |"]
    lines += [f"| disetel di {n} | {p['waa_db']:g} | {p['k_scale']:.2f} |" for n, p in results["params"].items()]
    for name, r in results["test"].items():
        lines += ["", f"## Uji: {name}, per sub-link per potret radar, tautan >= {results['min_link_km']:g} km", "",
                  "| Angka | RMSE | RMSE basah | Bias basah | Korelasi | Total taksiran / radar |", "|---|---|---|---|---|---|"]
        for k, s in r.items():
            lines.append(f"| {k} | {s['rmse']:.3f} | {s['rmse_wet']:.3f} | {s['bias_wet']:+.3f} | {s['corr']:.3f} | {s['total_ratio']:.2f} |")
    (RESULTS_DIR / "calibrate.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
