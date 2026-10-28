"""Peta hujan dari CML pada data sungguhan: IDW vs ridge vs MLP per sel.

Jalankan (setelah openmrg, wetdry features, dan cnn):
  uv run python -m hujannet_ml.rainmap          latih dan nilai
  uv run python -m hujannet_ml.rainmap export   tulis MLP ke data/ml-rainmap.json

Dipakai OpenMRG: 364 CML di sekitar Gothenburg, rapat seperti jaringan dasbor
(50 tautan di 22 x 17 km). OpenRainER hanya 151 CML untuk seluruh Emilia-Romagna,
terlalu jarang untuk membuat peta.

Masukan per tautan ditaksir dari CML saja (calibrate.py): basah/kering 1D-CNN,
antena basah dan k ITU-R P.838-3, sekali dengan angka dasbor dan sekali dengan angka
yang disetel di bulan latih. Kebenarannya radar 2 km (Z = 200 R^1.5). Semuanya juga
dijalankan dengan masukan "sempurna" (radar sepanjang lintasan), untuk memisahkan
galat interpolasi dari galat taksiran per tautan.

Tiga cara membuat peta, dinilai pada sel yang berjarak <= 2 km dari suatu lintasan:
  idw    seperti lib/inverse/field.ts, jangkauannya disetel di data validasi
  ridge  operator linear tautan -> sel, seperti lib/ml/operator.ts; terikat topologi
  mlp    satu jaringan kecil untuk semua sel, dari 8 tautan terdekat (hujan, jarak,
         ada/tidak) plus taksiran IDW; tidak terikat topologi, jadi bisa dipindah
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import xarray as xr
from sklearn.linear_model import Ridge
from torch import nn

from .calibrate import DEFAULT, MIN_LINK_KM, fit, link_rows, retrieve, split_rows
from .wetdry import FEATURE_DIR, PROCESSED, RESULTS_DIR, SPLITS
COVER_KM = 2.0
SMOOTHING_KM = 0.3  # lib/inverse/field.ts
PATH_POINTS = 20
IDW_CUTOFFS_KM = (2.0, 4.0, 8.0)
RIDGE_ALPHAS = (1.0, 10.0, 100.0, 1000.0)
NEIGHBOURS = 8
DRY_KEEP = 0.1  # pecahan waktu kering yang tetap dipakai melatih
WET_TIME_MM_H = 0.1

def link_rain() -> pd.DataFrame:
    """Hujan per (waktu radar, cml), rata-rata dua sub-link.

    est: angka dasbor, semua tautan. est_long: angka dasbor, tautan pendek dibuang (NaN).
    est_cal: terkalibrasi, tautan pendek dibuang. oracle: radar sepanjang lintasan.
    """
    rows = link_rows("openmrg")
    long = rows.length_km.to_numpy() >= MIN_LINK_KM
    cal = fit(split_rows("openmrg", rows[long], ("train", "val")))
    est = retrieve(rows, **DEFAULT)
    df = pd.DataFrame({"time": rows.time, "cml": rows.cml, "est": est, "est_long": np.where(long, est, np.nan),
                       "est_cal": np.where(long, retrieve(rows, **cal), np.nan), "oracle": rows.oracle})
    return df.groupby(["time", "cml"], observed=True).mean()


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
    for kind in ("est", "est_long", "est_cal", "oracle"):
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
        if kind == "est_cal":
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
    for kind, title in (("est", "Masukan dari CML (CNN basah/kering + ITU k-alpha apa adanya)"),
                        ("est_long", f"Masukan dari CML, angka dasbor, tautan < {MIN_LINK_KM:g} km dibuang"),
                        ("est_cal", f"Masukan dari CML, terkalibrasi (calibrate.md), tautan < {MIN_LINK_KM:g} km dibuang"),
                        ("oracle", "Masukan sempurna (radar sepanjang lintasan)")):
        r = results["inputs"][kind]
        lines += [f"## {title}", "", f"Jangkauan IDW terpilih {r['idw_cutoff_km']:g} km, alpha ridge {r['ridge_alpha']:g}.", "",
                  "| Metode | RMSE semua | RMSE waktu basah | Bias waktu basah | Korelasi waktu basah | CSI >= 1 mm/jam |", "|---|---|---|---|---|---|"]
        for k, s in r["test"].items():
            lines.append(f"| {names[k]} | {s['rmse']:.3f} | {s['rmse_wet']:.3f} | {s['bias_wet']:+.3f} | {s['corr_wet']:.3f} | {s['csi_1mm']:.3f} |")
        lines.append("")
    (RESULTS_DIR / "rainmap.md").write_text("\n".join(lines))
    print("\n".join(lines))


def export() -> None:
    """Bobot MLP sebagai JSON untuk lib/ml/rainmap.ts, plus satu contoh acuan untuk uji kesamaan."""
    saved = torch.load(FEATURE_DIR.parent / "models" / "rainmap_mlp.pt")
    w = {k: v.numpy().astype(float) for k, v in saved["state_dict"].items()}
    k = saved["neighbours"]
    net = nn.Sequential(nn.Linear(3 * k + 1, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, 1), nn.ReLU())
    net.load_state_dict(saved["state_dict"])
    x = mlp_inputs(np.array([[5.0, 0.0, np.nan, 12.0, 1.0, 0.5, 3.0, 0.0]], np.float32), np.arange(k)[None],
                   np.linspace(0.2, 3.0, k)[None].astype(np.float32), np.array([[4.0]], np.float32))
    with torch.no_grad():
        y = float(net.eval()(torch.from_numpy(x))[0, 0])
    r = lambda a: np.round(a, 7).ravel().tolist()  # noqa: E731
    out = {"neighbours": k, "idwCutoffKm": saved["idw_cutoff_km"], "coverKm": COVER_KM,
           "w0": r(w["0.weight"]), "b0": r(w["0.bias"]), "w1": r(w["2.weight"]), "b1": r(w["2.bias"]),
           "w2": r(w["4.weight"]), "b2": float(w["4.bias"][0]), "check": {"x": r(x[0]), "y": y}}
    path = Path(__file__).resolve().parents[2] / "data" / "ml-rainmap.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"tulis {path}, keluaran acuan {y:.4f} mm/jam")


if __name__ == "__main__":
    export() if sys.argv[1:] == ["export"] else main()
