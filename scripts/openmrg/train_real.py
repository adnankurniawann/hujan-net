# IDW vs operator terlatih, pada data OpenMRG asli dengan radar sebagai kebenaran dasar.
#
# Ridge-nya identik dengan lib/ml/operator.ts:
#   W = X Rt (R Rt + lambda I)^-1, tanpa intersep, keluaran dijepit di nol.
# Pemisahan dilakukan PER KEJADIAN HUJAN, bukan per potret.

import numpy as np

d = np.load("real_pairs.npz")
X, Y, ev = d["X"].astype(np.float64), d["Y"].astype(np.float64), d["ev"]
mid, length = d["mid"], d["length"]
lat, lon = d["lat"], d["lon"]
ny, nx = lat.shape
cells = np.stack([lat.ravel(), lon.ravel()], 1)

meta = __import__("csv").DictReader(open("omrg/cml/cml_metadata.csv"))
rows = list(meta)
A = np.array([[float(r["NearLatitude_DecDeg"]), float(r["NearLongitude_DecDeg"])] for r in rows])
B = np.array([[float(r["FarLatitude_DecDeg"]), float(r["FarLongitude_DecDeg"])] for r in rows])


def hav(p, q):
    R = 6371.0
    p1, p2 = np.radians(p[..., 0]), np.radians(q[..., 0])
    dp, dl = p2 - p1, np.radians(q[..., 1] - p[..., 1])
    h = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.sqrt(h))


def idw_kernel(cutoff=2.0, power=2.0, smooth=0.3, npts=20):
    """Sama dengan lib/inverse/field.ts."""
    n = len(rows)
    W = np.zeros((len(cells), n))
    fr = np.linspace(0, 1, npts + 1)[:-1] + 0.5 / npts
    for l in range(n):
        pts = A[l] + (B[l] - A[l]) * fr[:, None]
        for p in pts:
            dd = hav(cells, np.broadcast_to(p, cells.shape))
            m = dd <= cutoff
            W[m, l] += (dd[m] ** 2 + smooth ** 2) ** (-power / 2)
    inr = W.sum(1) > 0
    W[inr] /= W[inr].sum(1, keepdims=True)
    # sel di luar jangkauan: tautan terdekat dengan peluruhan, seperti field.ts
    for c in np.where(~inr)[0]:
        best, bd = -1, 1e18
        for l in range(n):
            pts = A[l] + (B[l] - A[l]) * fr[:, None]
            dd = hav(np.broadcast_to(cells[c], pts.shape), pts).min()
            if dd < bd:
                bd, best = dd, l
        W[c, best] = min(1.0, (cutoff / bd) ** power)
    return W, inr


def fit_ridge(Xtr, Ytr, lam):
    n = len(Xtr)
    G = Xtr.T @ Xtr / n
    C = Ytr.T @ Xtr / n
    G[np.diag_indices_from(G)] += lam
    return np.linalg.solve(G, C.T).T


def rmse_per_frame(T, P, mask=None):
    if mask is None:
        return np.sqrt(((T - P) ** 2).mean(1))
    return np.sqrt(((T[:, mask] - P[:, mask]) ** 2).mean(1))


print("membangun operator IDW dari geometri menara asli ...", flush=True)
W_idw, inrange = idw_kernel()
print(f"  cakupan jaringan: {inrange.mean()*100:.0f} % dari {len(cells)} sel\n")

uev = np.unique(ev)
rng = np.random.RandomState(7)
rng.shuffle(uev)
n_te = 5
te_ev, va_ev, tr_ev = uev[:n_te], uev[n_te:n_te + 3], uev[n_te + 3:]
tr = np.isin(ev, tr_ev); va = np.isin(ev, va_ev); te = np.isin(ev, te_ev)
print(f"kejadian latih {sorted(tr_ev+1)}  ({tr.sum()} potret)")
print(f"kejadian validasi {sorted(va_ev+1)}  ({va.sum()} potret)")
print(f"kejadian uji   {sorted(te_ev+1)}  ({te.sum()} potret)\n")

best = None
print("memilih lambda pada kejadian validasi:")
for lam in [1e-3, 1e-2, 1e-1, 1, 3, 10, 30, 100, 300]:
    Wl = fit_ridge(X[tr], Y[tr], lam)
    P = np.maximum(0, X[va] @ Wl.T)
    r = rmse_per_frame(Y[va], P).mean()
    mark = ""
    if best is None or r < best[1]:
        best, mark = (lam, r, Wl), " <-"
    print(f"  lambda {lam:>6}   RMSE {r:.3f}{mark}")
lam, _, W_ml = best
print(f"\nlambda terpilih: {lam}\n")

print("=" * 62)
print("HASIL PADA KEJADIAN UJI — hujan asli yang tidak pernah dilatih")
print("=" * 62)
P_idw = np.maximum(0, X[te] @ W_idw.T)
P_ml = np.maximum(0, X[te] @ W_ml.T)
T = Y[te]

for nm, mask in [("seluruh grid", None), ("sel tercakup jaringan", inrange)]:
    a = rmse_per_frame(T, P_idw, mask).mean()
    b = rmse_per_frame(T, P_ml, mask).mean()
    print(f"  RMSE {nm:<24} IDW {a:6.3f}   terlatih {b:6.3f}   {100*(b-a)/a:+.1f} %")

for nm, P in [("IDW", P_idw), ("terlatih", P_ml)]:
    m = inrange
    c = np.corrcoef(T[:, m].ravel(), P[:, m].ravel())[0, 1]
    bias = (P[:, m] - T[:, m]).mean()
    print(f"  {nm:<9} korelasi {c:.3f}   bias {bias:+.3f} mm/jam")

print(f"\n  {len(te_ev)} kejadian uji, {te.sum()} potret, radar sebagai kebenaran dasar")
np.savez_compressed("real_result.npz", W_ml=W_ml, W_idw=W_idw, inrange=inrange,
                    te=te, lam=lam)
