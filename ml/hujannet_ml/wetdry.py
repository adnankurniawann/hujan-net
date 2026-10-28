"""Klasifikasi basah/kering pada data CML sungguhan: aturan ambang vs Random Forest.

Jalankan (setelah openmrg dan openrainer):
  uv run python -m hujannet_ml.wetdry features   # bangun fitur, sekali
  uv run python -m hujannet_ml.wetdry train      # latih dan nilai

Satu contoh = satu sub-link pada satu cap waktu radar. Labelnya basah kalau hujan
radar rata-rata sepanjang lintasan di atas WET_MM_H. Fitur hanya memakai menit
sampai akhir periode yang diukur radar itu (WINDOW_START_MIN), tidak sesudahnya.
OpenRainER: akumulasi 15 menit yang berakhir di cap waktu. OpenMRG: cap waktu
mewakili 5 menit sesudahnya (results/alignment.md).

Tiga pembanding, dinilai pada data uji yang sama:

  aturan    ambang tangan dari lib/inverse/classify.ts (dasbor). Acuan keringnya
            diganti median 24 jam bergerak, karena selubung kuantil per kejadian
            di dasbor butuh seluruh kejadian. Konsistensi tetangga tidak dipakai.
  std60     satu ambang pada simpangan baku 60 menit (Schleiss & Berne 2010),
            ambangnya disetel di data validasi
  rf        Random Forest pada tujuh fitur statistik, ambang peluangnya disetel
            di data validasi

Pemisahan menurut WAKTU: bulan-bulan uji tidak pernah dipakai melatih atau
menyetel apa pun.
"""

import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import xarray as xr
from sklearn.ensemble import RandomForestClassifier

from .download import RAW_DIR

PROCESSED = RAW_DIR.parent / "processed"
FEATURE_DIR = RAW_DIR.parent / "features"
MODEL_DIR = RAW_DIR.parent / "models"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "results"

WET_MM_H = 0.1
BASE_MIN = 1440
FEATURES = ["dip_mean", "dip_max", "std5_max", "std60", "range60", "freq_ghz", "length_km"]
MAX_TRAIN_ROWS = 1_500_000
# Awal jendela CML relatif terhadap cap waktu radar, menit; panjangnya jendela label
# (5 menit OpenMRG, 15 OpenRainER). Dipilih dari korelasi tertinggi, lihat results/alignment.md.
WINDOW_START_MIN = {"openmrg": 1, "openrainer": -15}

# Aturan dari lib/inverse/classify.ts: stdThresholdDb, minDipWithVarianceDb, levelThresholdDb.
RULE_STD_DB, RULE_MIN_DIP_DB, RULE_LEVEL_DB = 0.6, 0.3, 0.9

SPLITS = {
    "openrainer": {"train": ("2021-01-01", "2021-10-31"), "val": ("2021-11-01", "2021-12-31"), "test": ("2022-01-01", "2022-12-31")},
    "openmrg": {"train": ("2015-06-01", "2015-07-15"), "val": ("2015-07-16", "2015-07-31"), "test": ("2015-08-01", "2015-08-31")},
}
EXPERIMENTS = {"gabungan": ["openrainer", "openmrg"], "hanya_openrainer": ["openrainer"], "hanya_openmrg": ["openmrg"]}


# --- fitur -------------------------------------------------------------------

def minute_loss(cmls: xr.Dataset) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Redaman total tsl - rsl per sub-link pada grid menit teratur, plus metadatanya."""
    st = cmls.stack(link=("cml_id", "sublink_id"))
    loss = (st.tsl - st.rsl).transpose("time", "link")
    cols = [f"{c}|{s}" for c, s in st.link.values]
    df = pd.DataFrame(loss.values.astype(np.float32), index=pd.DatetimeIndex(loss.time.values), columns=cols)
    df = df[~df.index.duplicated()].sort_index().asfreq("1min")
    meta = pd.DataFrame({
        "cml_id": [str(c) for c, _ in st.link.values],
        "freq_ghz": st.frequency.values / 1e3,
        "length_km": np.broadcast_to(cmls.length.values[:, None], (cmls.sizes["cml_id"], 2)).ravel() / 1e3,
        "pol": st.polarization.values.astype(str),
    }, index=cols)
    return df, meta


def dip_minutes(loss: pd.DataFrame) -> pd.DataFrame:
    """Redaman di atas median 24 jam bergerak, acuan kering per sub-link."""
    return loss - loss.rolling(BASE_MIN, min_periods=BASE_MIN // 4).median()


def link_features(loss: pd.DataFrame, times: pd.DatetimeIndex, window_min: int, start_min: int | None = None) -> dict[str, pd.DataFrame]:
    """Fitur per sub-link pada tiap cap waktu radar t, dari jendela menit t+start .. t+start+window-1 dan sebelumnya.

    Tanpa start_min, jendelanya menit sebelum t (start = -window).
    """
    dip = dip_minutes(loss)
    std5 = loss.rolling(5, min_periods=3).std()
    rule = ((std5 > RULE_STD_DB) & (dip > RULE_MIN_DIP_DB)) | (dip > RULE_LEVEL_DB)
    r60 = loss.rolling(60, min_periods=30)

    w = window_min
    end = (-w if start_min is None else start_min) + w - 1  # menit terakhir jendela, relatif terhadap t

    def at(df):
        return df.shift(-end).reindex(times)

    return {
        "dip_mean": at(dip.rolling(w, min_periods=1).mean()),
        "dip_max": at(dip.rolling(w, min_periods=1).max()),
        "std5_max": at(std5.rolling(w, min_periods=1).max()),
        "std60": at(r60.std()),
        "range60": at(r60.max() - r60.min()),
        "rule_wet": at(rule.astype(np.float32).rolling(w, min_periods=1).max()),
    }


def to_long(feats: dict[str, pd.DataFrame], ref: pd.DataFrame, meta: pd.DataFrame) -> pd.DataFrame:
    """Ratakan (waktu x sub-link) menjadi satu baris per contoh, buang yang tidak lengkap."""
    times = feats["dip_mean"].index
    n_t, n_l = len(times), len(meta)
    out = {k: v.to_numpy(np.float32).ravel() for k, v in feats.items()}
    out["freq_ghz"] = np.tile(meta["freq_ghz"].to_numpy(np.float32), n_t)
    out["length_km"] = np.tile(meta["length_km"].to_numpy(np.float32), n_t)
    out["ref_mm_h"] = ref.reindex(index=times, columns=meta["cml_id"]).to_numpy(np.float32).ravel()
    out["time"] = np.repeat(times.values, n_l)
    out["link_idx"] = np.tile(np.arange(n_l, dtype=np.int32), n_t)
    return pd.DataFrame(out).dropna(subset=[*FEATURES, "rule_wet", "ref_mm_h"]).reset_index(drop=True)


def ref_frame(da: xr.DataArray) -> pd.DataFrame:
    da = da.transpose("time", "cml_id")
    return pd.DataFrame(da.values, index=pd.DatetimeIndex(da.time.values), columns=[str(c) for c in da.cml_id.values])


def iter_chunks():
    """(dataset, bagian, redaman menit, metadata, label radar, jendela label menit), sepotong demi sepotong supaya muat di memori."""
    ref = ref_frame(xr.open_dataarray(PROCESSED / "openmrg" / "cml_radar_ref.nc"))
    cml_all = xr.open_dataset(PROCESSED / "openmrg" / "cml_1min.nc")
    for i in range(0, cml_all.sizes["cml_id"], 60):
        loss, meta = minute_loss(cml_all.isel(cml_id=slice(i, i + 60)).load())
        yield "openmrg", f"{i:04d}", loss, meta, ref, 5

    for path in sorted((PROCESSED / "openrainer" / "cml").glob("CML_*.nc")):
        month = path.stem[4:]
        ref = ref_frame(xr.open_dataarray(PROCESSED / "openrainer" / "ref" / f"ref_{month}.nc"))
        loss, meta = minute_loss(xr.open_dataset(path).load())
        yield "openrainer", month, loss, meta, ref, 15


def build_features() -> None:
    FEATURE_DIR.mkdir(parents=True, exist_ok=True)
    for name, part, loss, meta, ref, window in iter_chunks():
        df = to_long(link_features(loss, ref.index, window, WINDOW_START_MIN[name]), ref, meta)
        df.to_pickle(FEATURE_DIR / f"{name}_{part}.pkl")
        print(f"{name} {part}: {len(df)} contoh")


# --- penilaian ---------------------------------------------------------------

def scores(y: np.ndarray, p: np.ndarray) -> dict[str, float]:
    """POD, FAR, CSI, dan MCC untuk kelas basah."""
    y, p = np.asarray(y, bool), np.asarray(p, bool)
    tp, fp = float(np.sum(y & p)), float(np.sum(~y & p))
    fn, tn = float(np.sum(y & ~p)), float(np.sum(~y & ~p))
    den = np.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    return {
        "pod": tp / (tp + fn) if tp + fn else float("nan"),
        "far": fp / (tp + fp) if tp + fp else float("nan"),
        "csi": tp / (tp + fp + fn) if tp + fp + fn else float("nan"),
        "mcc": (tp * tn - fp * fn) / den if den else 0.0,
        "wet_fraction": float(y.mean()),
        "n": int(y.size),
    }


def tune_threshold(score: np.ndarray, y: np.ndarray) -> float:
    """Ambang pada skor yang memaksimalkan MCC."""
    candidates = np.unique(np.quantile(score, np.linspace(0.5, 0.999, 200)))
    return float(max(candidates, key=lambda c: scores(y, score > c)["mcc"]))


def load_split(datasets: list[str], split: str) -> pd.DataFrame:
    parts = []
    for name in datasets:
        start, end = (pd.Timestamp(s) for s in SPLITS[name][split])
        for f in sorted(FEATURE_DIR.glob(f"{name}_*.pkl")):
            df = pd.read_pickle(f)
            parts.append(df[(df.time >= start) & (df.time < end + pd.Timedelta(days=1))].assign(dataset=name))
    return pd.concat(parts, ignore_index=True)


def train_and_evaluate() -> dict:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    tests = {name: load_split([name], "test") for name in SPLITS}
    results = {"wet_mm_h": WET_MM_H, "rule": {}, "experiments": {}}
    for name, df in tests.items():
        results["rule"][name] = scores(df.ref_mm_h > WET_MM_H, df.rule_wet > 0)

    rng = np.random.default_rng(0)
    for exp, datasets in EXPERIMENTS.items():
        train, val = load_split(datasets, "train"), load_split(datasets, "val")
        if len(train) > MAX_TRAIN_ROWS:
            train = train.iloc[rng.choice(len(train), MAX_TRAIN_ROWS, replace=False)]
        y_train, y_val = train.ref_mm_h > WET_MM_H, val.ref_mm_h > WET_MM_H

        rf = RandomForestClassifier(n_estimators=200, min_samples_leaf=50, n_jobs=-1, random_state=0)
        rf.fit(train[FEATURES], y_train)
        rf_thr = tune_threshold(rf.predict_proba(val[FEATURES])[:, 1], y_val)
        std_thr = tune_threshold(val.std60.to_numpy(), y_val)
        joblib.dump({"model": rf, "threshold": rf_thr, "features": FEATURES}, MODEL_DIR / f"wetdry_rf_{exp}.joblib")

        res = {"train_rows": len(train), "rf_threshold": rf_thr, "std60_threshold_db": std_thr,
               "feature_importance": dict(zip(FEATURES, map(float, rf.feature_importances_))), "test": {}}
        for name, df in tests.items():
            y = df.ref_mm_h > WET_MM_H
            res["test"][name] = {
                "std60": scores(y, df.std60 > std_thr),
                "rf": scores(y, rf.predict_proba(df[FEATURES])[:, 1] > rf_thr),
            }
        results["experiments"][exp] = res
        print(f"{exp}: selesai")
    return results


def write_report(results: dict) -> None:
    RESULTS_DIR.mkdir(exist_ok=True)
    (RESULTS_DIR / "wetdry.json").write_text(json.dumps(results, indent=2))
    lines = ["# Klasifikasi basah/kering pada data CML sungguhan", "",
             f"Basah = hujan radar sepanjang lintasan > {WET_MM_H} mm/jam. Dinilai pada bulan uji yang tidak pernah dipakai melatih.", ""]
    for name in SPLITS:
        r = results["rule"][name]
        lines += [f"## Uji: {name} ({SPLITS[name]['test'][0]} s.d. {SPLITS[name]['test'][1]}), fraksi basah {r['wet_fraction']:.1%}, {r['n']:,} contoh", "",
                  "| Dilatih pada | Metode | POD | FAR | CSI | MCC |", "|---|---|---|---|---|---|",
                  f"| — | aturan dasbor | {r['pod']:.3f} | {r['far']:.3f} | {r['csi']:.3f} | {r['mcc']:.3f} |"]
        for exp, e in results["experiments"].items():
            for m, label in (("std60", "ambang std60"), ("rf", "Random Forest")):
                s = e["test"][name][m]
                lines.append(f"| {exp} | {label} | {s['pod']:.3f} | {s['far']:.3f} | {s['csi']:.3f} | {s['mcc']:.3f} |")
        lines.append("")
    (RESULTS_DIR / "wetdry.md").write_text("\n".join(lines))
    print("\n".join(lines))


if __name__ == "__main__":
    if sys.argv[1:] == ["features"]:
        build_features()
    elif sys.argv[1:] == ["train"]:
        write_report(train_and_evaluate())
    else:
        sys.exit("pakai: python -m hujannet_ml.wetdry features|train")
