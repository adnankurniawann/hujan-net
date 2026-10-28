"""Peta hujan dari CML pada data sungguhan: IDW vs ridge vs MLP per sel.

Jalankan (setelah openmrg, wetdry features, dan cnn):
  uv run python -m hujannet_ml.rainmap

Dipakai OpenMRG: 364 CML di sekitar Gothenburg, rapat seperti jaringan dasbor
(50 tautan di 22 x 17 km). OpenRainER hanya 151 CML untuk seluruh Emilia-Romagna,
terlalu jarang untuk membuat peta.

Masukan per tautan ditaksir dari CML saja: basah/kering 1D-CNN, redaman hujan =
selisih redaman 5 menit dikurangi antena basah 1,5 dB, lalu R = (A / L / k)^(1/alpha)
ITU-R P.838-3. Kebenarannya radar 2 km (Z = 200 R^1.5). Semuanya juga dijalankan
dengan masukan "sempurna" (radar sepanjang lintasan), untuk memisahkan galat
interpolasi dari galat taksiran per tautan.

Tiga cara membuat peta, dinilai pada sel yang berjarak <= 2 km dari suatu lintasan:
  idw    seperti lib/inverse/field.ts, jangkauannya disetel di data validasi
  ridge  operator linear tautan -> sel, seperti lib/ml/operator.ts; terikat topologi
  mlp    satu jaringan kecil untuk semua sel, dari 8 tautan terdekat (hujan, jarak,
         ada/tidak) plus taksiran IDW; tidak terikat topologi, jadi bisa dipindah
"""

import json

import numpy as np
import pandas as pd
import torch
import xarray as xr
from sklearn.linear_model import Ridge
from torch import nn

from .cnn import chunk_rows, load, meta_inputs, predict, sequences
from .wetdry import FEATURE_DIR, PROCESSED, RESULTS_DIR, SPLITS, iter_chunks

WAA_DB = 1.5  # lib/inverse/waa.ts
COVER_KM = 2.0
SMOOTHING_KM = 0.3  # lib/inverse/field.ts
PATH_POINTS = 20
IDW_CUTOFFS_KM = (2.0, 4.0, 8.0)
RIDGE_ALPHAS = (1.0, 10.0, 100.0, 1000.0)
NEIGHBOURS = 8
DRY_KEEP = 0.1  # pecahan waktu kering yang tetap dipakai melatih
WET_TIME_MM_H = 0.1

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


def link_rain() -> pd.DataFrame:
    """Hujan per (waktu radar, cml): taksiran dari CML dan radar sepanjang lintasan. Disinggahkan."""
    cache = FEATURE_DIR / "openmrg_link_rain.pkl"
    if cache.exists():
        return pd.read_pickle(cache)
    net, thr = load("cnn")
    parts = []
    for name, part, loss, meta, ref, window in iter_chunks():
        if name != "openmrg":
            break
        rows, dip, pos = chunk_rows(loss, meta, ref, window)
        link = rows.link_idx.to_numpy()
        p = np.concatenate([predict(net, sequences(dip, pos[i:i + 200_000], link[i:i + 200_000]), meta_inputs(rows.iloc[i:i + 200_000]))
                            for i in range(0, len(rows), 200_000)])
        k, alpha = itu(rows.freq_ghz.to_numpy(), meta.pol.to_numpy()[link])
        a = np.where(p > thr, np.maximum(rows.dip_mean.to_numpy() - WAA_DB, 0), 0)
        est = (a / rows.length_km.to_numpy() / k) ** (1 / alpha)
        df = pd.DataFrame({"time": rows.time, "cml": meta.cml_id.to_numpy()[link], "est": est, "oracle": rows.ref_mm_h})
        parts.append(df.groupby(["time", "cml"]).mean())  # rata-rata dua sub-link
        print(f"hujan tautan openmrg {part}")
    out = pd.concat(parts)
    out.to_pickle(cache)
    return out


def to_km(lon, lat, lat0):
    return np.asarray(lon) * np.cos(np.radians(lat0)) * 111.32, np.asarray(lat) * 110.57


def path_distances(cmls: xr.Dataset, lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    """Jarak tiap sel ke tiap titik sepanjang tiap lintasan, km, [sel, tautan, titik]."""
    t = np.linspace(0, 1, PATH_POINTS)
    plon = cmls.site_0_lon.values[:, None] + t * (cmls.site_1_lon.values - cmls.site_0_lon.values)[:, None]
    plat = cmls.site_0_lat.values[:, None] + t * (cmls.site_1_lat.values - cmls.site_0_lat.values)[:, None]
    lat0 = float(np.mean(plat))
    px, py = to_km(plon, plat, lat0)
    cx, cy = to_km(lon, lat, lat0)
    return np.hypot(cx[:, None, None] - px[None], cy[:, None, None] - py[None]).astype(np.float32)


def idw_weights(dist: np.ndarray, cutoff_km: float) -> np.ndarray:
    """Bobot IDW pangkat 2 per (sel, tautan), dijumlah atas titik lintasan dalam jangkauan."""
    w = np.where(dist <= cutoff_km, 1 / (dist ** 2 + SMOOTHING_KM ** 2), 0)
    return w.sum(-1)


def idw(x: np.ndarray, w: np.ndarray) -> np.ndarray:
    """x [waktu, tautan] dengan NaN untuk tautan tanpa data -> [waktu, sel]; bobot dinormalkan ulang tiap waktu."""
    valid = np.isfinite(x)
    num, den = np.where(valid, x, 0) @ w.T, valid.astype(np.float32) @ w.T
    return np.where(den > 0, num / np.maximum(den, 1e-12), 0)


def mlp_inputs(x: np.ndarray, idx: np.ndarray, dk: np.ndarray, idw_pred: np.ndarray) -> np.ndarray:
    """[waktu * sel, 3K + 1]: per tetangga log1p(hujan), jarak/5 km, ada/tidak; lalu log1p(IDW)."""
    r = x[:, idx]  # [waktu, sel, K]
    valid = np.isfinite(r)
    feats = np.concatenate([np.log1p(np.where(valid, r, 0)), np.broadcast_to(dk / 5, r.shape), valid,
                            np.log1p(idw_pred)[..., None]], -1)
    return feats.reshape(-1, feats.shape[-1]).astype(np.float32)


def train_mlp(xtr, ytr, xva, yva) -> nn.Module:
    torch.manual_seed(0)
    net = nn.Sequential(nn.Linear(xtr.shape[1], 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 1), nn.ReLU())
    opt = torch.optim.Adam(net.parameters(), lr=1e-3)
    xv, best, best_epoch = torch.from_numpy(xva), (np.inf, None), 0
    for epoch in range(30):
        net.train()
        order = np.random.default_rng(epoch).permutation(len(xtr))
        for i in range(0, len(order), 4096):
            b = order[i:i + 4096]
            opt.zero_grad()
            loss = ((net(torch.from_numpy(xtr[b])).squeeze(1) - torch.from_numpy(ytr[b])) ** 2).mean()
            loss.backward()
            opt.step()
        with torch.no_grad():
            rmse = float(np.sqrt(np.mean((net.eval()(xv).squeeze(1).numpy() - yva) ** 2)))
        print(f"mlp epoch {epoch + 1}: RMSE validasi {rmse:.3f}")
        if rmse < best[0]:
            best, best_epoch = (rmse, {k: v.clone() for k, v in net.state_dict().items()}), epoch
        elif epoch - best_epoch >= 3:
            break
    net.load_state_dict(best[1])
    return net.eval()


def map_scores(truth: np.ndarray, pred: np.ndarray) -> dict[str, float]:
    """truth, pred [waktu, sel]; waktu basah = rata-rata radar di sel tercakup > WET_TIME_MM_H."""
    wet = truth.mean(1) > WET_TIME_MM_H
    hit, obs = pred >= 1, truth >= 1
    return {
        "rmse": float(np.sqrt(np.mean((pred - truth) ** 2))),
        "rmse_wet": float(np.sqrt(np.mean((pred[wet] - truth[wet]) ** 2))),
        "bias_wet": float(np.mean(pred[wet] - truth[wet])),
        "corr_wet": float(np.corrcoef(pred[wet].ravel(), truth[wet].ravel())[0, 1]),
        "csi_1mm": float((hit & obs).sum() / max((hit | obs).sum(), 1)),
        "wet_times": int(wet.sum()),
    }


def main() -> None:
    rain = link_rain()
    cmls = xr.open_dataset(PROCESSED / "openmrg" / "cml_1min.nc")[["site_0_lon", "site_0_lat", "site_1_lon", "site_1_lat"]].load()
    radar = xr.open_dataset(PROCESSED / "openmrg" / "radar_rain.nc").rainfall_rate
    cml_ids = [str(c) for c in cmls.cml_id.values]

    dist = path_distances(cmls, radar.lon.values.ravel(), radar.lat.values.ravel())
    near = dist.min(-1)  # [sel, tautan]
    covered = near.min(1) <= COVER_KM
    dist, near = dist[covered], near[covered]
    idx = np.argsort(near, 1)[:, :NEIGHBOURS]
    dk = np.take_along_axis(near, idx, 1)
    print(f"{covered.sum()} sel tercakup dari {covered.size}")

    times = rain.index.get_level_values("time").unique().intersection(pd.DatetimeIndex(radar.time.values)).sort_values()
    truth = radar.sel(time=times).values.reshape(len(times), -1)[:, covered]
    ok = np.isfinite(truth).all(1)
    times, truth = times[ok], truth[ok]
    split = {s: (times >= pd.Timestamp(a)) & (times < pd.Timestamp(b) + pd.Timedelta(days=1)) for s, (a, b) in SPLITS["openmrg"].items()}

    rng = np.random.default_rng(0)
    results = {"covered_cells": int(covered.sum()), "test_times": int(split["test"].sum()), "inputs": {}}
    for kind in ("est", "oracle"):
        x = rain[kind].unstack("cml").reindex(index=times, columns=cml_ids).to_numpy(np.float32)
        weights = {c: idw_weights(dist, c) for c in IDW_CUTOFFS_KM}
        cutoff = min(IDW_CUTOFFS_KM, key=lambda c: map_scores(truth[split["val"]], idw(x[split["val"]], weights[c]))["rmse"])
        w = weights[cutoff]
        preds = {"idw": idw(x[split["test"]], w)}

        x0 = np.nan_to_num(x)
        alpha = min(RIDGE_ALPHAS, key=lambda a: map_scores(truth[split["val"]], np.maximum(Ridge(alpha=a).fit(x0[split["train"]], truth[split["train"]]).predict(x0[split["val"]]), 0))["rmse"])
        preds["ridge"] = np.maximum(Ridge(alpha=alpha).fit(x0[split["train"]], truth[split["train"]]).predict(x0[split["test"]]), 0)

        # waktu kering semua (tak ada hujan di masukan maupun radar) sebagian besar dibuang dari data latih
        busy = (np.nan_to_num(x).max(1) > 0) | (truth.max(1) > WET_TIME_MM_H)
        keep = busy | (rng.random(len(times)) < DRY_KEEP)
        sets = {}
        for s in ("train", "val"):
            m = split[s] & keep
            sets[s] = (mlp_inputs(x[m], idx, dk, idw(x[m], w)), truth[m].ravel().astype(np.float32))
        net = train_mlp(*sets["train"], *sets["val"])
        xt = x[split["test"]]
        with torch.no_grad():
            preds["mlp"] = net(torch.from_numpy(mlp_inputs(xt, idx, dk, preds["idw"]))).numpy().reshape(len(xt), -1)
        if kind == "est":
            torch.save({"state_dict": net.state_dict(), "neighbours": NEIGHBOURS, "idw_cutoff_km": cutoff}, FEATURE_DIR.parent / "models" / "rainmap_mlp.pt")

        results["inputs"][kind] = {"idw_cutoff_km": cutoff, "ridge_alpha": alpha,
                                   "test": {k: map_scores(truth[split["test"]], v) for k, v in preds.items()}}
        print(kind, json.dumps(results["inputs"][kind], indent=1))
    write_report(results)


def write_report(results: dict) -> None:
    (RESULTS_DIR / "rainmap.json").write_text(json.dumps(results, indent=2))
    names = {"idw": "IDW (seperti dasbor)", "ridge": "Ridge tautan -> sel (terikat topologi)", "mlp": "MLP per sel (bisa dipindah)"}
    lines = ["# Peta hujan dari CML: OpenMRG, uji Agustus 2015", "",
             f"{results['covered_cells']} sel radar 2 km dalam {COVER_KM:g} km dari suatu lintasan, "
             f"{results['test_times']:,} potret 5 menit. Waktu basah: rata-rata radar di sel tercakup > {WET_TIME_MM_H} mm/jam.", ""]
    for kind, title in (("est", "Masukan dari CML (CNN basah/kering + ITU k-alpha)"), ("oracle", "Masukan sempurna (radar sepanjang lintasan)")):
        r = results["inputs"][kind]
        lines += [f"## {title}", "", f"Jangkauan IDW terpilih {r['idw_cutoff_km']:g} km, alpha ridge {r['ridge_alpha']:g}.", "",
                  "| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |", "|---|---|---|---|---|---|"]
        for k, s in r["test"].items():
            lines.append(f"| {names[k]} | {s['rmse']:.3f} | {s['rmse_wet']:.3f} | {s['bias_wet']:+.3f} | {s['corr_wet']:.3f} | {s['csi_1mm']:.3f} |")
        lines.append("")
    (RESULTS_DIR / "rainmap.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    main()
