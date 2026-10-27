# Membangun `data/catchments.geojson` dari topografi sungguhan.
#
# KENAPA ADA BERKAS INI. Sampai T0 selesai, ketiga DAS di `data/catchments.geojson`
# adalah persegi panjang yang digambar tangan. Persegi panjang bukan daerah aliran
# sungai: batas DAS ditentukan punggungan, bukan garis bujur bulat. Skrip ini
# menggantinya dengan batas yang benar-benar diturunkan dari elevasi, memakai
# rantai baku hidrologi permukaan:
#
#   isi cekungan (priority-flood + epsilon)
#     -> arah aliran D8
#       -> akumulasi aliran
#         -> delineasi hulu dari titik tuang
#
# DATANYA. SRTM 1 arcsec (~30 m) lewat cermin terbuka AWS "Terrain Tiles",
# ubin S07E106 dan S07E107, tanpa akun. Dataset yang sama dipakai HydroSHEDS
# sebagai bahan mentah, hanya saja HydroSHEDS meratakannya ke 15 arcsec (~460 m).
#
#   Kenapa bukan HydroBASINS langsung? Sudah dicoba. Pada level 12 (yang terhalus),
#   Cisarua, Megamendung, DAN Gadog jatuh di dalam satu poligon yang sama,
#   HYBAS_ID 5120668250 seluas 161 km2. Seluruh hulu Ciliwung masih satu basin
#   di sana, jadi tiga DAS bernama itu tidak bisa dibuat daripadanya.
#
# TIGA DAS-NYA BERSARANG, JADI DIPAKAI SUB-DAS INKREMENTAL. Cisarua, Megamendung,
# dan Gadog berjajar di batang Ciliwung dari hulu ke hilir, jadi hulu Gadog
# memuat hulu Megamendung yang memuat hulu Cisarua. Poligon yang saling menimpa
# akan membuat satu sel grid dihitung dua kali oleh `lib/catchment/membership.ts`.
# Maka yang ditulis adalah sub-DAS inkremental:
#
#   C-01 = seluruh hulu di titik tuang Cisarua
#   C-02 = hulu di Megamendung DIKURANGI C-01
#   C-03 = hulu di Gadog DIKURANGI C-01 dan C-02
#
# Pengurangannya dikerjakan pada raster, bukan pada poligon, jadi tidak ada
# operasi boolean poligon yang bisa menghasilkan geometri rusak.
#
# DIPOTONG KE KOTAK KEJADIAN. `lib/sim/scenario.ts` menjanjikan setiap DAS berada
# di dalam `EVENT_BBOX`, dan `lib/catchment/membership.ts` bergantung pada itu
# supaya tiap DAS kebagian sel grid. Pemotongan juga dilakukan pada raster,
# sebelum divektorkan. Luas DAS penuh tetap dicatat di `properties` supaya
# tidak ada yang mengira 40 km2 hasil potongan adalah luas DAS sebenarnya.
#
# Menjalankan:
#   python scripts/hydro/fetch_dem.py                  # unduh dua ubin, sekali saja
#   python scripts/hydro/delineate_catchments.py       # tulis data/catchments.geojson
#
# Baca `scripts/hydro/README.md` untuk keluaran yang diharapkan.

from __future__ import annotations

import argparse
import heapq
import json
import math
import os
from collections import deque

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
DEM_DIR = os.path.join(HERE, "dem")

# Kotak batas kejadian, disalin dari EVENT_BBOX di lib/sim/scenario.ts.
EVENT_BBOX = (106.86, -6.76, 107.06, -6.61)

# Grid kejadian, disalin dari EVENT_GRID. Dipakai hanya untuk memeriksa bahwa
# tiap DAS hasil kebagian sel, bukan untuk membentuk poligonnya.
EVENT_NX, EVENT_NY = 40, 30

# Jendela kerja DEM: kotak kejadian ditambah bantalan sampai melewati punggungan
# pemisah. Batas selatan harus melewati massif Gede-Pangrango karena di situlah
# hulu Ciliwung bermula; batas timur harus melewati Puncak.
WINDOW = (106.74, -6.88, 107.14, -6.56)

SEC = 1.0 / 3600.0  # satu arcsec dalam derajat
VOID = -32768  # penanda lubang data SRTM

# Titik tuang. Koordinat kota, BUKAN koordinat sungai: titiknya nanti ditempelkan
# ke sel berakumulasi tertinggi di sekitarnya, supaya jatuh tepat di alur.
OUTLETS = [
    {"id": "C-01", "name": "DAS Cisarua", "lon": 106.9497, "lat": -6.7003},
    {"id": "C-02", "name": "DAS Megamendung", "lon": 106.9333, "lat": -6.6667},
    {"id": "C-03", "name": "DAS Gadog", "lon": 106.8720, "lat": -6.6480},
]

# Sejauh mana titik tuang boleh digeser dari pusat kota untuk mencari alur.
# Cukup untuk menyeberangi lembah di sini, masih terlalu pendek untuk melompat
# ke sungai di lembah sebelah.
SNAP_RADIUS_M = 1200.0

# Toleransi penyederhanaan Douglas-Peucker, derajat. Batas hasil delineasi
# raster berbentuk tangga selebar satu sel (~30 m); toleransi ini membuang
# undakannya tanpa memindahkan batas lebih jauh daripada satu setengah sel.
SIMPLIFY_DEG = 0.00045

# Lubang yang lebih kecil daripada ini dibuang, km2. Lubang sekecil satu-dua sel
# hampir selalu artefak D8 di punggungan datar, bukan enklave sungguhan.
MIN_HOLE_KM2 = 0.05

KM_PER_DEG_LAT = 111.0


def km_per_deg_lon(lat: float) -> float:
    return 111.320 * math.cos(math.radians(lat))


# --- pembacaan DEM ---------------------------------------------------------


def read_hgt(path: str) -> np.ndarray:
    """Satu ubin SRTM 1 arcsec: 3601x3601 int16 big-endian, baris 0 di utara."""
    raw = np.fromfile(path, dtype=">i2")
    side = int(math.sqrt(raw.size))
    if side * side != raw.size:
        raise SystemExit(f"{path}: ukuran {raw.size} bukan ubin persegi")
    return raw.reshape(side, side).astype(np.int32)


def load_window(window: tuple[float, float, float, float]) -> tuple[np.ndarray, float, float]:
    """
    Rakit jendela kerja dari ubin-ubin yang dibutuhkan.

    Mengembalikan (elevasi, lon sel kolom 0, lat sel baris 0). Baris 0 di utara.
    """
    lon_min, lat_min, lon_max, lat_max = window
    tiles_lon = range(math.floor(lon_min), math.floor(lon_max) + 1)
    tiles_lat = range(math.floor(lat_min), math.floor(lat_max) + 1)

    cols = []
    for tlat in sorted(tiles_lat, reverse=True):  # utara ke selatan
        row = []
        for tlon in tiles_lon:
            name = f"{'S' if tlat < 0 else 'N'}{abs(tlat):02d}{'E' if tlon >= 0 else 'W'}{abs(tlon):03d}"
            path = os.path.join(DEM_DIR, f"{name}.hgt")
            if not os.path.exists(path):
                raise SystemExit(
                    f"ubin {name}.hgt tidak ada di {DEM_DIR}.\n"
                    "Jalankan dulu: python scripts/hydro/fetch_dem.py"
                )
            tile = read_hgt(path)
            # Baris/kolom terakhir tiap ubin sama dengan baris/kolom pertama
            # ubin tetangganya. Dibuang supaya tidak dobel.
            row.append(tile[:-1, :-1])
        cols.append(np.hstack(row))
    grid = np.vstack(cols)

    tile_lon0 = math.floor(lon_min)
    tile_lat_top = max(tiles_lat) + 1

    c0 = int(round((lon_min - tile_lon0) / SEC))
    c1 = int(round((lon_max - tile_lon0) / SEC)) + 1
    r0 = int(round((tile_lat_top - lat_max) / SEC))
    r1 = int(round((tile_lat_top - lat_min) / SEC)) + 1

    sub = grid[r0:r1, c0:c1]
    return sub, tile_lon0 + c0 * SEC, tile_lat_top - r0 * SEC


def fill_voids(z: np.ndarray) -> np.ndarray:
    """
    Tambal lubang SRTM dengan rata-rata tetangga yang sah, diulang sampai habis.
    Di wilayah ini lubangnya sedikit; kalau nanti dipakai di daerah lain yang
    berlubang besar, ganti dengan interpolasi yang benar.
    """
    out = z.astype(np.float64)
    bad = out <= VOID + 1
    if not bad.any():
        return out
    out[bad] = np.nan
    for _ in range(64):
        holes = np.isnan(out)
        if not holes.any():
            break
        padded = np.pad(out, 1, constant_values=np.nan)
        stack = np.stack(
            [
                padded[0:-2, 1:-1],
                padded[2:, 1:-1],
                padded[1:-1, 0:-2],
                padded[1:-1, 2:],
            ]
        )
        with np.errstate(invalid="ignore"):
            mean = np.nanmean(stack, axis=0)
        out = np.where(holes & ~np.isnan(mean), mean, out)
    return np.nan_to_num(out, nan=0.0)


# --- hidrologi -------------------------------------------------------------


def priority_flood(z: np.ndarray, epsilon: float = 1e-4) -> np.ndarray:
    """
    Isi cekungan dengan priority-flood + epsilon (Barnes, Lehman, Mulla 2014).

    Setiap sel dijamin punya tetangga yang elevasinya BENAR-BENAR lebih rendah,
    sehingga D8 selalu terdefinisi dan tidak ada aliran melingkar. Kemiringan
    epsilon dipasang pada bidang datar supaya urutan topologisnya tetap tegas.
    """
    h, w = z.shape
    filled = np.full((h, w), np.inf)
    closed = np.zeros((h, w), dtype=bool)
    heap: list[tuple[float, int, int]] = []

    for c in range(w):
        for r in (0, h - 1):
            filled[r, c] = z[r, c]
            closed[r, c] = True
            heap.append((float(z[r, c]), r, c))
    for r in range(1, h - 1):
        for c in (0, w - 1):
            filled[r, c] = z[r, c]
            closed[r, c] = True
            heap.append((float(z[r, c]), r, c))
    heapq.heapify(heap)

    while heap:
        elev, r, c = heapq.heappop(heap)
        for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (-1, 1), (1, -1), (1, 1)):
            rr, cc = r + dr, c + dc
            if rr < 0 or rr >= h or cc < 0 or cc >= w or closed[rr, cc]:
                continue
            closed[rr, cc] = True
            nz = max(float(z[rr, cc]), elev + epsilon)
            filled[rr, cc] = nz
            heapq.heappush(heap, (nz, rr, cc))
    return filled


def flow_direction(filled: np.ndarray, dx_m: float, dy_m: float) -> np.ndarray:
    """
    D8: tiap sel mengalir ke tetangga dengan kemiringan turun terbesar.

    Mengembalikan indeks datar sel penerima, atau -1 kalau alirannya keluar dari
    jendela kerja. Tepi jendela dianggap keluaran, bukan tembok, supaya sungai
    yang meninggalkan jendela tidak menumpuk di pinggir.
    """
    h, w = filled.shape
    padded = np.pad(filled, 1, constant_values=-1e12)
    diag = math.hypot(dx_m, dy_m)
    neighbours = [
        (-1, 0, dy_m),
        (1, 0, dy_m),
        (0, -1, dx_m),
        (0, 1, dx_m),
        (-1, -1, diag),
        (-1, 1, diag),
        (1, -1, diag),
        (1, 1, diag),
    ]

    best_slope = np.full((h, w), -np.inf)
    best_dir = np.full((h, w), -1, dtype=np.int8)
    for k, (dr, dc, dist) in enumerate(neighbours):
        nb = padded[1 + dr : 1 + dr + h, 1 + dc : 1 + dc + w]
        slope = (filled - nb) / dist
        better = slope > best_slope
        best_slope = np.where(better, slope, best_slope)
        best_dir = np.where(better, k, best_dir)

    rows, cols = np.meshgrid(np.arange(h), np.arange(w), indexing="ij")
    dr = np.array([n[0] for n in neighbours])[best_dir]
    dc = np.array([n[1] for n in neighbours])[best_dir]
    rr, cc = rows + dr, cols + dc
    outside = (rr < 0) | (rr >= h) | (cc < 0) | (cc >= w)
    receiver = np.where(outside, -1, rr * w + cc)
    return receiver.astype(np.int64).ravel()


def flow_accumulation(filled: np.ndarray, receiver: np.ndarray) -> np.ndarray:
    """
    Akumulasi aliran dalam satuan jumlah sel hulu, termasuk selnya sendiri.

    Urutan topologisnya adalah elevasi terisi dari tinggi ke rendah. Karena
    priority-flood + epsilon menjamin penerima selalu lebih rendah, urutan itu
    pasti sah: satu sel selalu diproses sebelum sel yang menerimanya.
    """
    n = filled.size
    acc = np.ones(n, dtype=np.int64)
    order = np.argsort(filled.ravel(), kind="stable")[::-1]
    for i in order:
        j = receiver[i]
        if j >= 0:
            acc[j] += acc[i]
    return acc


def build_children(receiver: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Daftar sel hulu tiap sel dalam bentuk CSR, untuk penelusuran ke hulu."""
    n = receiver.size
    valid = receiver >= 0
    targets = receiver[valid]
    sources = np.nonzero(valid)[0]
    counts = np.bincount(targets, minlength=n)
    start = np.zeros(n + 1, dtype=np.int64)
    np.cumsum(counts, out=start[1:])
    order = np.argsort(targets, kind="stable")
    return start, sources[order]


def upstream_mask(outlet: int, start: np.ndarray, children: np.ndarray, n: int) -> np.ndarray:
    """Seluruh sel yang alirannya melewati `outlet`, termasuk selnya sendiri."""
    mask = np.zeros(n, dtype=bool)
    stack = deque([outlet])
    mask[outlet] = True
    while stack:
        cell = stack.pop()
        for k in range(start[cell], start[cell + 1]):
            up = children[k]
            if not mask[up]:
                mask[up] = True
                stack.append(up)
    return mask


def drains_into(source: int, target: int, receiver: np.ndarray, limit: int = 10_000_000) -> bool:
    """Apakah air dari `source` benar-benar melewati `target` di hilirnya."""
    cell = source
    for _ in range(limit):
        cell = receiver[cell]
        if cell < 0:
            return False
        if cell == target:
            return True
    return False




# --- raster ke poligon -----------------------------------------------------


def largest_component(mask: np.ndarray, shape: tuple[int, int]) -> np.ndarray:
    """Ambil gumpalan tersambung terbesar (4-ketetanggaan) dari sebuah topeng."""
    h, w = shape
    grid = mask.reshape(h, w)
    seen = np.zeros_like(grid)
    best = np.zeros_like(grid)
    best_size = 0
    for r0, c0 in zip(*np.nonzero(grid)):
        if seen[r0, c0]:
            continue
        comp = np.zeros_like(grid)
        stack = [(r0, c0)]
        seen[r0, c0] = True
        size = 0
        while stack:
            r, c = stack.pop()
            comp[r, c] = True
            size += 1
            for rr, cc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1)):
                if 0 <= rr < h and 0 <= cc < w and grid[rr, cc] and not seen[rr, cc]:
                    seen[rr, cc] = True
                    stack.append((rr, cc))
        if size > best_size:
            best_size, best = size, comp
    return best


def unpinch(grid: np.ndarray) -> np.ndarray:
    """
    Buang titik jepit diagonal dari topeng raster.

    Titik jepit adalah dua sel yang hanya bersentuhan di sudut, sementara kedua
    sel ortogonal di antaranya kosong. Di sudut itu ada DUA rusuk batas yang
    berangkat, jadi penyusunan cincin tidak lagi punya jawaban tunggal dan
    penelusurannya buntu. Sel yang dibuang adalah yang paling sedikit tetangga
    ortogonalnya, yaitu yang paling menjuntai — luasnya satu sel, ~0,001 km2.
    """
    grid = grid.copy()
    for _ in range(1000):
        a = grid[:-1, :-1] & grid[1:, 1:] & ~grid[:-1, 1:] & ~grid[1:, :-1]
        b = grid[:-1, 1:] & grid[1:, :-1] & ~grid[:-1, :-1] & ~grid[1:, 1:]
        if not a.any() and not b.any():
            return grid

        def neighbours(r: int, c: int) -> int:
            h, w = grid.shape
            return sum(
                bool(grid[rr, cc])
                for rr, cc in ((r - 1, c), (r + 1, c), (r, c - 1), (r, c + 1))
                if 0 <= rr < h and 0 <= cc < w
            )

        for rr, cc in zip(*np.nonzero(a)):
            pair = [(rr, cc), (rr + 1, cc + 1)]
            grid[min(pair, key=lambda p: neighbours(*p))] = False
        for rr, cc in zip(*np.nonzero(b)):
            pair = [(rr, cc + 1), (rr + 1, cc)]
            if grid[pair[0]] and grid[pair[1]]:
                grid[min(pair, key=lambda p: neighbours(*p))] = False
    raise SystemExit("titik jepit tidak habis-habis, topengnya patut dicurigai")


def trace_rings(grid: np.ndarray, lon0: float, lat0: float) -> list[list[tuple[float, float]]]:
    """
    Ubah topeng raster menjadi cincin poligon dengan menyusun rusuk batasnya.

    Tiap sel dianggap kotak selebar satu arcsec yang berpusat di titik sampelnya.
    Rusuk diarahkan supaya bagian dalam selalu berada di kiri, jadi cincin luar
    keluar berlawanan arah jarum jam dan lubang searah jarum jam, sesuai RFC 7946.
    """
    h, w = grid.shape
    half = SEC / 2.0
    edges: dict[tuple[float, float], tuple[float, float]] = {}

    def corner(r: int, c: int, dr: int, dc: int) -> tuple[float, float]:
        return (
            round(lon0 + (c + dc) * SEC - half, 9),
            round(lat0 - (r + dr) * SEC + half, 9),
        )

    for r, c in zip(*np.nonzero(grid)):
        nw = corner(r, c, 0, 0)
        ne = corner(r, c, 0, 1)
        sw = corner(r, c, 1, 0)
        se = corner(r, c, 1, 1)
        if r == 0 or not grid[r - 1, c]:
            edges[ne] = nw  # ke barat, dalam di selatan
        if r == h - 1 or not grid[r + 1, c]:
            edges[sw] = se  # ke timur, dalam di utara
        if c == 0 or not grid[r, c - 1]:
            edges[nw] = sw  # ke selatan, dalam di timur
        if c == w - 1 or not grid[r, c + 1]:
            edges[se] = ne  # ke utara, dalam di barat

    rings = []
    while edges:
        start = next(iter(edges))
        ring = [start]
        node = edges.pop(start)
        while node != start:
            ring.append(node)
            node = edges.pop(node)
        ring.append(start)
        rings.append(ring)
    return rings


def ring_area_deg(ring: list[tuple[float, float]]) -> float:
    """Luas bertanda dalam derajat persegi; positif berarti berlawanan jarum jam."""
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:]):
        total += x1 * y2 - x2 * y1
    return total / 2.0


def ring_area_km2(ring: list[tuple[float, float]]) -> float:
    lat = sum(p[1] for p in ring) / len(ring)
    return abs(ring_area_deg(ring)) * KM_PER_DEG_LAT * km_per_deg_lon(lat)


def simplify(ring: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    """Douglas-Peucker pada cincin tertutup, dengan titik terjauh sebagai jangkar."""
    if len(ring) < 5:
        return ring
    pts = ring[:-1]
    anchor = 0
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    first = _dp(pts[anchor : far + 1], tol)
    second = _dp(pts[far:] + [pts[anchor]], tol)
    out = first[:-1] + second
    if len(out) < 4:
        return ring
    return out


def _dp(points: list[tuple[float, float]], tol: float) -> list[tuple[float, float]]:
    if len(points) < 3:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0] - a[0], b[1] - a[1]
    norm = math.hypot(dx, dy)
    worst, index = -1.0, 0
    for i in range(1, len(points) - 1):
        p = points[i]
        if norm == 0:
            d = math.hypot(p[0] - a[0], p[1] - a[1])
        else:
            d = abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / norm
        if d > worst:
            worst, index = d, i
    if worst <= tol:
        return [a, b]
    left = _dp(points[: index + 1], tol)
    right = _dp(points[index:], tol)
    return left[:-1] + right


def clamp_to_bbox(ring: list[tuple[float, float]]) -> list[tuple[float, float]]:
    lon_min, lat_min, lon_max, lat_max = EVENT_BBOX
    return [
        (min(max(x, lon_min), lon_max), min(max(y, lat_min), lat_max)) for x, y in ring
    ]


def polygon_from_mask(
    mask: np.ndarray, shape: tuple[int, int], lon0: float, lat0: float
) -> list[list[list[float]]]:
    """Topeng raster -> cincin GeoJSON, cincin luar dulu lalu lubang-lubangnya."""
    grid = unpinch(largest_component(mask, shape))
    grid = largest_component(grid.ravel(), shape)  # membuang sel yang terputus oleh unpinch
    rings = trace_rings(grid, lon0, lat0)
    if not rings:
        raise SystemExit("topeng kosong, tidak ada yang bisa divektorkan")

    rings.sort(key=lambda r: abs(ring_area_deg(r)), reverse=True)
    outer = rings[0]
    holes = [r for r in rings[1:] if ring_area_km2(r) >= MIN_HOLE_KM2]

    out = []
    for i, ring in enumerate([outer] + holes):
        simple = clamp_to_bbox(simplify(ring, SIMPLIFY_DEG))
        if simple[0] != simple[-1]:
            simple.append(simple[0])
        area = ring_area_deg(simple)
        want_ccw = i == 0
        if (area > 0) != want_ccw:
            simple.reverse()
        # Lima desimal ~1,1 m. Sel DEM-nya sendiri 30 m, jadi desimal keenam
        # hanya menambah berkas tanpa menambah satu pun keterangan.
        out.append([[round(x, 5), round(y, 5)] for x, y in simple])
    return out


# --- program utama ---------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=os.path.join(ROOT, "data", "catchments.geojson"))
    parser.add_argument("--full", action="store_true", help="jangan potong ke kotak kejadian")
    parser.add_argument(
        "--snap",
        type=float,
        default=SNAP_RADIUS_M,
        help="radius pencarian alur dari pusat kota, meter (bawaan %(default)s)",
    )
    args = parser.parse_args()
    snap_radius = args.snap

    print("membaca DEM ...")
    z_raw, lon0, lat0 = load_window(WINDOW)
    h, w = z_raw.shape
    print(f"  jendela {w} x {h} sel, sudut barat laut {lon0:.5f}, {lat0:.5f}")
    z = fill_voids(z_raw)

    lat_mid = lat0 - (h / 2) * SEC
    dy_m = SEC * KM_PER_DEG_LAT * 1000.0
    dx_m = SEC * km_per_deg_lon(lat_mid) * 1000.0
    cell_km2 = (dx_m * dy_m) / 1e6

    print("mengisi cekungan (priority-flood + epsilon) ...")
    filled = priority_flood(z)
    print("menghitung arah aliran D8 ...")
    receiver = flow_direction(filled, dx_m, dy_m)
    print("menghitung akumulasi aliran ...")
    acc = flow_accumulation(filled, receiver)
    start, children = build_children(receiver)

    # Titik tuang: tiap kota ditempelkan ke sel berakumulasi tertinggi dalam
    # radius SNAP_RADIUS_M, yaitu alur terbesar di dekatnya.
    #
    # Sengaja TIDAK dipaksa ke satu batang sungai yang sama. Percobaan yang
    # memaksakannya menaruh titik tuang Cisarua 1,8 km dari pusat kotanya, dan
    # itu justru menghapus fakta yang ingin ditunjukkan peta: Cisarua duduk di
    # anak sungai sendiri, sedangkan Megamendung dan Gadog di batang Ciliwung.
    # Sifat tidak-tumpang-tindih tidak bergantung pada penyarangan; yang
    # menjaminnya adalah klaim serakah di bawah.
    def cell_lonlat(idx: int) -> tuple[float, float]:
        return lon0 + (idx % w) * SEC, lat0 - (idx // w) * SEC

    def metres_between(idx: int, lon: float, lat: float) -> float:
        clon, clat = cell_lonlat(idx)
        return math.hypot((clat - lat) * KM_PER_DEG_LAT, (clon - lon) * km_per_deg_lon(lat)) * 1000.0

    rad_r = int(math.ceil(snap_radius / dy_m))
    rad_c = int(math.ceil(snap_radius / dx_m))

    def snap_to_channel(lon: float, lat: float) -> int:
        """Sel berakumulasi tertinggi dalam lingkaran, bukan kotak, berjari-jari
        `snap_radius`. Kotak akan membuat "radius 900 m" diam-diam menjadi
        1273 m di arah diagonal."""
        rc = int(round((lat0 - lat) / SEC))
        cc = int(round((lon - lon0) / SEC))
        r_lo, r_hi = max(0, rc - rad_r), min(h, rc + rad_r + 1)
        c_lo, c_hi = max(0, cc - rad_c), min(w, cc + rad_c + 1)
        rows = np.arange(r_lo, r_hi)[:, None]
        cols = np.arange(c_lo, c_hi)[None, :]
        dist = np.hypot((rows - rc) * dy_m, (cols - cc) * dx_m)
        patch = np.where(dist <= snap_radius, acc.reshape(h, w)[r_lo:r_hi, c_lo:c_hi], -1)
        pr, pc = np.unravel_index(int(np.argmax(patch)), patch.shape)
        return (r_lo + pr) * w + (c_lo + pc)

    snapped = []
    for o in OUTLETS:
        idx = snap_to_channel(o["lon"], o["lat"])
        lon, lat = cell_lonlat(idx)
        snapped.append(
            {
                **o,
                "index": idx,
                "outlet_lon": lon,
                "outlet_lat": lat,
                "moved_m": metres_between(idx, o["lon"], o["lat"]),
                "upstream_km2": float(acc[idx]) * cell_km2,
            }
        )
        s = snapped[-1]
        print(
            f"  {o['id']} {o['name']}: titik tuang {s['moved_m']:.0f} m dari pusat kota, "
            f"hulu {s['upstream_km2']:.1f} km2 di {s['outlet_lon']:.5f}, {s['outlet_lat']:.5f}"
        )

    # Urutan hulu ke hilir menurut luas hulunya, lalu klaim serakah: yang hulunya
    # paling kecil mengambil bagiannya lebih dulu, yang lebih besar hanya
    # mendapat sisanya. Dua DAS yang bersarang jadi tidak saling menimpa, dan dua
    # DAS bersebelahan tetap utuh karena memang tidak beririsan sejak awal.
    snapped.sort(key=lambda s: s["upstream_km2"])
    for a in snapped:
        for b in snapped:
            if a is not b and drains_into(a["index"], b["index"], receiver):
                print(f"  {a['id']} mengalir ke {b['id']}")

    n = h * w
    lons = lon0 + np.tile(np.arange(w), h) * SEC
    lats = lat0 - np.arange(h).repeat(w) * SEC
    inside_bbox = (
        (lons >= EVENT_BBOX[0])
        & (lons <= EVENT_BBOX[2])
        & (lats >= EVENT_BBOX[1])
        & (lats <= EVENT_BBOX[3])
    )

    claimed = np.zeros(n, dtype=bool)
    features = []
    for s in snapped:
        full = upstream_mask(s["index"], start, children, n)
        own = full & ~claimed
        claimed |= own
        full_km2 = float(own.sum()) * cell_km2

        mask = own if args.full else own & inside_bbox
        if not mask.any():
            raise SystemExit(f"{s['id']} tidak menyisakan satu sel pun di dalam kotak kejadian")

        rings = polygon_from_mask(mask, (h, w), lon0, lat0)
        clipped_km2 = float(mask.sum()) * cell_km2
        print(
            f"  {s['id']} {s['name']}: sub-DAS {full_km2:.1f} km2, "
            f"di dalam kotak {clipped_km2:.1f} km2, {len(rings[0]) - 1} verteks"
            + (f", {len(rings) - 1} lubang" if len(rings) > 1 else "")
        )

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": s["id"],
                    "name": s["name"],
                    "outletLon": round(s["outlet_lon"], 6),
                    "outletLat": round(s["outlet_lat"], 6),
                    "upstreamAreaKm2": round(s["upstream_km2"], 1),
                    "subCatchmentAreaKm2": round(full_km2, 1),
                    "areaInEventBboxKm2": round(clipped_km2, 1),
                    "source": "SRTM 1 arcsec (~30 m), AWS Terrain Tiles S07E106 + S07E107",
                    "method": (
                        "priority-flood + epsilon, arah aliran D8, akumulasi aliran, "
                        "delineasi hulu dari titik tuang, dikurangi sub-DAS di hulunya"
                    ),
                    "note": (
                        "Sub-DAS inkremental: luas yang mengalir ke titik tuang ini tetapi "
                        "TIDAK melewati titik tuang DAS di hulunya. Poligon dipotong ke "
                        "EVENT_BBOX; subCatchmentAreaKm2 adalah luas sebelum dipotong."
                    ),
                },
                "geometry": {"type": "Polygon", "coordinates": rings},
            }
        )

    features.sort(key=lambda f: f["properties"]["id"])

    # Periksa janji yang dipegang lib/catchment: tiap DAS harus kebagian sel grid.
    print("memeriksa liputan grid kejadian ...")
    counts = {f["properties"]["id"]: 0 for f in features}
    lon_min, lat_min, lon_max, lat_max = EVENT_BBOX
    for iy in range(EVENT_NY):
        for ix in range(EVENT_NX):
            lon = lon_min + (ix + 0.5) * (lon_max - lon_min) / EVENT_NX
            lat = lat_min + (iy + 0.5) * (lat_max - lat_min) / EVENT_NY
            for f in features:
                if point_in_polygon(lon, lat, f["geometry"]["coordinates"]):
                    counts[f["properties"]["id"]] += 1
                    break
    for cid, k in counts.items():
        print(f"  {cid}: {k} sel dari {EVENT_NX * EVENT_NY}")
        if k == 0:
            raise SystemExit(f"{cid} tidak kebagian satu sel grid pun")

    fc = {
        "type": "FeatureCollection",
        "name": "das-hulu-ciliwung",
        "crs": {"type": "name", "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}},
        "features": features,
    }
    with open(args.out, "w", encoding="utf8") as fh:
        json.dump(fc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"ditulis: {args.out}")


def point_in_polygon(lon: float, lat: float, rings: list[list[list[float]]]) -> bool:
    """Salinan `pointInPolygon` di lib/catchment/geo.ts, untuk pemeriksaan di atas."""
    if not ring_contains(lon, lat, rings[0]):
        return False
    return not any(ring_contains(lon, lat, r) for r in rings[1:])


def ring_contains(lon: float, lat: float, ring: list[list[float]]) -> bool:
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat):
            xc = xj + (lat - yj) / (yi - yj) * (xi - xj)
            if lon < xc:
                inside = not inside
        j = i
    return inside


if __name__ == "__main__":
    main()
