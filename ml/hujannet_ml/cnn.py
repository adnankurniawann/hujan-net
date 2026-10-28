"""1D-CNN dan LSTM basah/kering, tahap kedua dan ketiga setelah Random Forest.

Jalankan (setelah `wetdry features` dan `wetdry train`, karena RF pembandingnya dimuat dari sana):
  uv run python -m hujannet_ml.cnn        # 1D-CNN
  uv run python -m hujannet_ml.cnn lstm   # LSTM, juga membandingkan CNN yang sudah tersimpan
  uv run python -m hujannet_ml.cnn export # tulis bobot LSTM ke ../data/ml-wetdry.json untuk dasbor

Masukannya deret redaman mentah 120 menit sebelum cap waktu radar, bukan fitur
yang dirancang tangan seperti RF. Gagasannya mengikuti Polz dkk. (2020, AMT 13,
3835): biarkan jaringan menemukan sendiri pola penurunan sinyal akibat hujan.

Dua kanal: redaman di atas median 24 jam (dibagi 5 dB, dijepit -10..40 dB) dan
topeng data ada/hilang. Frekuensi dan panjang lintasan masuk di lapisan padat.

Penilaian dilakukan pada BARIS UJI YANG SAMA untuk aturan dasbor, RF, dan CNN,
supaya angkanya bisa dibandingkan langsung.
"""

import json
import os
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import torch
from torch import nn

from .wetdry import (FEATURES, MODEL_DIR, RESULTS_DIR, SPLITS, WET_MM_H, dip_minutes, iter_chunks,
                     WINDOW_START_MIN, link_features, scores, to_long, tune_threshold)

WINDOW = 120
SAMPLE_FRACTION = 0.1
EPOCHS = {"cnn": 6, "lstm": 20}  # LSTM belajar lebih lambat; MCC validasinya masih naik di epoch 6
PATIENCE = 3  # berhenti bila MCC validasi tidak membaik selama 3 epoch
BATCH = 1024


class Net(nn.Module):
    def __init__(self):
        super().__init__()
        block = lambda i, o: [nn.Conv1d(i, o, 5, padding=2), nn.ReLU()]  # noqa: E731
        self.conv = nn.Sequential(
            *block(2, 32), *block(32, 32), nn.MaxPool1d(2),
            *block(32, 64), *block(64, 64), nn.MaxPool1d(2),
            *block(64, 64), nn.MaxPool1d(2),
        )  # 120 menit -> 15 langkah; diratakan, bukan dirata-rata, supaya posisi waktu tetap terbaca
        self.head = nn.Sequential(nn.Linear(64 * (WINDOW // 8) + 2, 64), nn.ReLU(), nn.Dropout(0.2), nn.Linear(64, 1))

    def forward(self, x: torch.Tensor, meta: torch.Tensor) -> torch.Tensor:
        return self.head(torch.cat([self.conv(x).flatten(1), meta], 1)).squeeze(1)


class Lstm(nn.Module):
    """Membaca deret menit demi menit; keadaan tersembunyi terakhir masuk lapisan padat."""

    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(2, 64, batch_first=True)
        self.head = nn.Sequential(nn.Linear(64 + 2, 64), nn.ReLU(), nn.Dropout(0.2), nn.Linear(64, 1))

    def forward(self, x: torch.Tensor, meta: torch.Tensor) -> torch.Tensor:
        return self.head(torch.cat([self.lstm(x.transpose(1, 2))[0][:, -1], meta], 1)).squeeze(1)


NETS = {"cnn": (Net, "1D-CNN (deret mentah)"), "lstm": (Lstm, "LSTM (deret mentah)")}


def sequences(dip: np.ndarray, pos: np.ndarray, link: np.ndarray) -> np.ndarray:
    """Potongan [n, 2, WINDOW] dari menit pos-WINDOW .. pos-1, kanal redaman dan topeng."""
    x = dip[pos[:, None] - WINDOW + np.arange(WINDOW), link[:, None]]
    mask = np.isfinite(x)
    x = np.clip(np.where(mask, x, 0), -10, 40) / 5
    return np.stack([x, mask], 1).astype(np.float32)


def meta_inputs(rows: pd.DataFrame) -> np.ndarray:
    return np.stack([rows.freq_ghz / 40, rows.length_km / 10], 1).astype(np.float32)


def split_labels(name: str, times: pd.Series) -> np.ndarray:
    out = np.full(len(times), "", dtype=object)
    for split, (start, end) in SPLITS[name].items():
        out[(times >= pd.Timestamp(start)) & (times < pd.Timestamp(end) + pd.Timedelta(days=1))] = split
    return out


def chunk_rows(loss, meta, ref, window, start):
    """Baris contoh (sama dengan RF) yang punya cukup riwayat untuk satu jendela CNN penuh.

    Mengembalikan juga `end`: indeks menit sesudah akhir jendela label, ujung deret CNN.
    """
    rows = to_long(link_features(loss, ref.index, window, start), ref, meta)
    pos = loss.index.get_indexer(rows.time)
    end = pos + start + window
    keep = (pos >= 0) & (end >= WINDOW) & (end <= len(loss))
    return rows[keep].reset_index(drop=True), dip_minutes(loss).to_numpy(np.float32), end[keep]


def predict(net: nn.Module, x: np.ndarray, meta: np.ndarray) -> np.ndarray:
    net.eval()
    out = []
    with torch.no_grad():
        for i in range(0, len(x), 8192):
            out.append(torch.sigmoid(net(torch.from_numpy(x[i:i + 8192]).float(), torch.from_numpy(meta[i:i + 8192]))).numpy())
    return np.concatenate(out) if out else np.empty(0, np.float32)


def collect() -> dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Contoh latih dan validasi, diambil acak SAMPLE_FRACTION dari tiap potongan."""
    rng = np.random.default_rng(0)
    parts = {"train": [], "val": []}
    for name, part, loss, meta, ref, window in iter_chunks():
        rows, dip, pos = chunk_rows(loss, meta, ref, window, WINDOW_START_MIN[name])
        split = split_labels(name, rows.time)
        for s in parts:
            m = (split == s) & (rng.random(len(rows)) < SAMPLE_FRACTION)
            if m.any():
                parts[s].append((sequences(dip, pos[m], rows.link_idx.to_numpy()[m]).astype(np.float16),
                                 meta_inputs(rows[m]), (rows.ref_mm_h.to_numpy()[m] > WET_MM_H).astype(np.float32)))
        print(f"kumpul {name} {part}")
    return {s: tuple(np.concatenate(a) for a in zip(*p)) for s, p in parts.items()}


def train(data, kind: str) -> tuple[nn.Module, float]:
    torch.manual_seed(0)
    x, meta, y = data["train"]
    xv, mv, yv = data["val"]
    net = NETS[kind][0]()
    opt = torch.optim.Adam(net.parameters(), lr=1e-3)
    loss_fn = nn.BCEWithLogitsLoss()
    best = (-1.0, None, 0.5)
    best_epoch = 0
    for epoch in range(EPOCHS[kind]):
        t0 = time.time()
        net.train()
        order = np.random.default_rng(epoch).permutation(len(x))
        for i in range(0, len(order), BATCH):
            b = order[i:i + BATCH]
            opt.zero_grad()
            loss = loss_fn(net(torch.from_numpy(x[b]).float(), torch.from_numpy(meta[b])), torch.from_numpy(y[b]))
            loss.backward()
            opt.step()
        p = predict(net, xv, mv)
        thr = tune_threshold(p, yv > 0)
        mcc = scores(yv > 0, p > thr)["mcc"]
        print(f"epoch {epoch + 1}: MCC validasi {mcc:.3f}, {time.time() - t0:.0f} detik")
        if mcc > best[0]:
            best = (mcc, {k: v.clone() for k, v in net.state_dict().items()}, thr)
            best_epoch = epoch
        elif epoch - best_epoch >= PATIENCE:
            break
    net.load_state_dict(best[1])
    return net, best[2]


def evaluate(nets: dict[str, tuple[nn.Module, float]]) -> dict:
    """Aturan dasbor, RF gabungan, dan tiap jaringan pada baris uji yang persis sama."""
    rf = joblib.load(MODEL_DIR / "wetdry_rf_gabungan.joblib")
    acc = {name: {k: [] for k in ["y", "rule", "rf", *nets]} for name in SPLITS}
    for name, part, loss, meta, ref, window in iter_chunks():
        rows, dip, pos = chunk_rows(loss, meta, ref, window, WINDOW_START_MIN[name])
        m = split_labels(name, rows.time) == "test"
        if not m.any():
            continue
        rows, pos = rows[m], pos[m]
        a = acc[name]
        a["y"].append(rows.ref_mm_h.to_numpy() > WET_MM_H)
        a["rule"].append(rows.rule_wet.to_numpy() > 0)
        a["rf"].append(rf["model"].predict_proba(rows[FEATURES])[:, 1] > rf["threshold"])
        x, m_in = sequences(dip, pos, rows.link_idx.to_numpy()), meta_inputs(rows)
        for k, (net, thr) in nets.items():
            a[k].append(predict(net, x, m_in) > thr)
        print(f"uji {name} {part}")
    return {name: {k: scores(np.concatenate(a["y"]), np.concatenate(v)) for k, v in a.items() if k != "y"}
            for name, a in acc.items()}


def write_report(results: dict, kind: str, thr: float, n_train: int) -> None:
    (RESULTS_DIR / f"wetdry_{kind}.json").write_text(json.dumps({f"{kind}_threshold": thr, "train_rows": n_train, "test": results}, indent=2))
    lines = [f"# {NETS[kind][1].split(' ')[0]} basah/kering vs Random Forest", "",
             f"Dilatih pada kedua dataset ({n_train:,} contoh, {SAMPLE_FRACTION:.0%} dari bulan latih). "
             f"Basah = radar > {WET_MM_H} mm/jam. Ketiga metode dinilai pada baris uji yang sama.", ""]
    for name, r in results.items():
        lines += [f"## Uji: {name}, fraksi basah {r['rule']['wet_fraction']:.1%}, {r['rule']['n']:,} contoh", "",
                  "| Metode | POD | FAR | CSI | MCC |", "|---|---|---|---|---|"]
        labels = {"rule": "aturan dasbor", "rf": "Random Forest (fitur tangan)", **{k: v[1] for k, v in NETS.items()}}
        for k in r:
            s, label = r[k], labels[k]
            lines.append(f"| {label} | {s['pod']:.3f} | {s['far']:.3f} | {s['csi']:.3f} | {s['mcc']:.3f} |")
        lines.append("")
    (RESULTS_DIR / f"wetdry_{kind}.md").write_text("\n".join(lines))
    print("\n".join(lines))


def load(kind: str) -> tuple[nn.Module, float]:
    saved = torch.load(MODEL_DIR / f"wetdry_{kind}.pt")
    net = NETS[kind][0]()
    net.load_state_dict(saved["state_dict"])
    return net, saved["threshold"]


def export() -> None:
    """Bobot LSTM sebagai JSON untuk lib/ml/wetdry.ts, plus satu contoh acuan untuk uji kesamaan."""
    net, thr = load("lstm")
    w = {k: v.numpy().astype(float) for k, v in net.state_dict().items()}
    rng = np.random.default_rng(0)
    dip = np.concatenate([np.full(60, np.nan), rng.normal(0, 0.3, 40), np.linspace(0, 6, 20)])[:, None]
    x, meta = sequences(dip.astype(np.float32), np.array([WINDOW]), np.array([0])), np.array([[0.5, 0.4]], np.float32)
    with torch.no_grad():
        logit = float(net.eval()(torch.from_numpy(x), torch.from_numpy(meta))[0])
    r = lambda a: np.round(a, 7).ravel().tolist()  # noqa: E731
    out = {
        "window": WINDOW, "hidden": net.lstm.hidden_size, "threshold": thr,
        "wIh": r(w["lstm.weight_ih_l0"]), "wHh": r(w["lstm.weight_hh_l0"]),
        "b": r(w["lstm.bias_ih_l0"] + w["lstm.bias_hh_l0"]),
        "w1": r(w["head.0.weight"]), "b1": r(w["head.0.bias"]), "w2": r(w["head.3.weight"]), "b2": float(w["head.3.bias"][0]),
        "check": {"x": r(x[0].T), "meta": r(meta[0]), "logit": logit},
    }
    path = Path(__file__).resolve().parents[2] / "data" / "ml-wetdry.json"
    path.write_text(json.dumps(out, separators=(",", ":")))
    print(f"tulis {path}, logit acuan {logit:.4f}")


def main(kind: str) -> None:
    torch.set_num_threads(os.cpu_count() or 1)
    data = collect()
    print(f"latih {len(data['train'][2]):,}, validasi {len(data['val'][2]):,}, basah latih {data['train'][2].mean():.1%}")
    net, thr = train(data, kind)
    torch.save({"state_dict": net.state_dict(), "threshold": thr, "window": WINDOW}, MODEL_DIR / f"wetdry_{kind}.pt")
    n_train = len(data["train"][2])
    del data
    # jaringan lain yang sudah dilatih ikut dinilai, supaya semua dibandingkan pada baris yang sama
    nets = {k: load(k) for k in NETS if k != kind and (MODEL_DIR / f"wetdry_{k}.pt").exists()} | {kind: (net, thr)}
    write_report(evaluate(nets), kind, thr, n_train)


if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "cnn"
    export() if arg == "export" else main(arg)
