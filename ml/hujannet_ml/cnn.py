"""1D-CNN basah/kering, tahap kedua setelah Random Forest.

Jalankan (setelah `wetdry features` dan `wetdry train`, karena RF pembandingnya dimuat dari sana):
  uv run python -m hujannet_ml.cnn

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
import time

import joblib
import numpy as np
import pandas as pd
import torch
from torch import nn

from .wetdry import (FEATURES, MODEL_DIR, RESULTS_DIR, SPLITS, WET_MM_H, dip_minutes, iter_chunks,
                     link_features, scores, to_long, tune_threshold)

WINDOW = 120
SAMPLE_FRACTION = 0.1
EPOCHS = 6
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


def chunk_rows(loss, meta, ref, window):
    """Baris contoh (sama dengan RF) yang punya cukup riwayat untuk satu jendela CNN penuh."""
    rows = to_long(link_features(loss, ref.index, window), ref, meta)
    pos = loss.index.get_indexer(rows.time)
    keep = pos >= WINDOW
    return rows[keep].reset_index(drop=True), dip_minutes(loss).to_numpy(np.float32), pos[keep]


def predict(net: Net, x: np.ndarray, meta: np.ndarray) -> np.ndarray:
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
        rows, dip, pos = chunk_rows(loss, meta, ref, window)
        split = split_labels(name, rows.time)
        for s in parts:
            m = (split == s) & (rng.random(len(rows)) < SAMPLE_FRACTION)
            if m.any():
                parts[s].append((sequences(dip, pos[m], rows.link_idx.to_numpy()[m]).astype(np.float16),
                                 meta_inputs(rows[m]), (rows.ref_mm_h.to_numpy()[m] > WET_MM_H).astype(np.float32)))
        print(f"kumpul {name} {part}")
    return {s: tuple(np.concatenate(a) for a in zip(*p)) for s, p in parts.items()}


def train(data) -> tuple[Net, float]:
    torch.manual_seed(0)
    x, meta, y = data["train"]
    xv, mv, yv = data["val"]
    net = Net()
    opt = torch.optim.Adam(net.parameters(), lr=1e-3)
    loss_fn = nn.BCEWithLogitsLoss()
    best = (-1.0, None, 0.5)
    for epoch in range(EPOCHS):
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
    net.load_state_dict(best[1])
    return net, best[2]


def evaluate(net: Net, cnn_thr: float) -> dict:
    """Aturan dasbor, RF gabungan, dan CNN pada baris uji yang persis sama."""
    rf = joblib.load(MODEL_DIR / "wetdry_rf_gabungan.joblib")
    acc = {name: {"y": [], "rule": [], "rf": [], "cnn": []} for name in SPLITS}
    for name, part, loss, meta, ref, window in iter_chunks():
        rows, dip, pos = chunk_rows(loss, meta, ref, window)
        m = split_labels(name, rows.time) == "test"
        if not m.any():
            continue
        rows, pos = rows[m], pos[m]
        a = acc[name]
        a["y"].append(rows.ref_mm_h.to_numpy() > WET_MM_H)
        a["rule"].append(rows.rule_wet.to_numpy() > 0)
        a["rf"].append(rf["model"].predict_proba(rows[FEATURES])[:, 1] > rf["threshold"])
        a["cnn"].append(predict(net, sequences(dip, pos, rows.link_idx.to_numpy()), meta_inputs(rows)) > cnn_thr)
        print(f"uji {name} {part}")
    return {name: {k: scores(np.concatenate(a["y"]), np.concatenate(a[k])) for k in ("rule", "rf", "cnn")}
            for name, a in acc.items()}


def write_report(results: dict, cnn_thr: float, n_train: int) -> None:
    (RESULTS_DIR / "wetdry_cnn.json").write_text(json.dumps({"cnn_threshold": cnn_thr, "train_rows": n_train, "test": results}, indent=2))
    lines = ["# 1D-CNN basah/kering vs Random Forest", "",
             f"Dilatih pada kedua dataset ({n_train:,} contoh, {SAMPLE_FRACTION:.0%} dari bulan latih). "
             f"Basah = radar > {WET_MM_H} mm/jam. Ketiga metode dinilai pada baris uji yang sama.", ""]
    for name, r in results.items():
        lines += [f"## Uji: {name}, fraksi basah {r['rule']['wet_fraction']:.1%}, {r['rule']['n']:,} contoh", "",
                  "| Metode | POD | FAR | CSI | MCC |", "|---|---|---|---|---|"]
        for k, label in (("rule", "aturan dasbor"), ("rf", "Random Forest (fitur tangan)"), ("cnn", "1D-CNN (deret mentah)")):
            s = r[k]
            lines.append(f"| {label} | {s['pod']:.3f} | {s['far']:.3f} | {s['csi']:.3f} | {s['mcc']:.3f} |")
        lines.append("")
    (RESULTS_DIR / "wetdry_cnn.md").write_text("\n".join(lines))
    print("\n".join(lines))


def main() -> None:
    torch.set_num_threads(os.cpu_count() or 1)
    data = collect()
    print(f"latih {len(data['train'][2]):,}, validasi {len(data['val'][2]):,}, basah latih {data['train'][2].mean():.1%}")
    net, thr = train(data)
    torch.save({"state_dict": net.state_dict(), "threshold": thr, "window": WINDOW}, MODEL_DIR / "wetdry_cnn.pt")
    n_train = len(data["train"][2])
    del data
    write_report(evaluate(net, thr), thr, n_train)


if __name__ == "__main__":
    main()
