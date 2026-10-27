/**
 * Membangun `data/evacuation-routes.json` — lintasan evakuasi yang mengikuti
 * jalan sungguhan, satu untuk tiap pasangan DAS × posko.
 *
 * KENAPA DIHITUNG DI SINI, BUKAN DI PERAMBAN. Titik asalnya adalah titik berat
 * salah satu dari tiga DAS di `data/catchments.geojson`, dan tujuannya salah
 * satu dari empat posko di `lib/evacuation/data.ts`. Kedua daftar itu tetap,
 * jadi hanya ada dua belas lintasan yang mungkin dan tidak satu pun berubah
 * ketika hujan bergerak. Menghitungnya saat aplikasi berjalan berarti mengirim
 * graf jalan 871 KB ke peramban untuk menghasilkan dua belas jawaban yang sudah
 * bisa diketahui sebelum aplikasi dimuat.
 *
 * Yang TETAP dihitung di peramban adalah keamanan lintasan: hujan disampel di
 * sepanjang garis ini pada tiap langkah waktu. Itu memang berubah, dan memang
 * harus berubah.
 *
 *   node scripts/build-evacuation-routes.mjs
 *
 * Jalankan ulang setelah `data/roads.json`, `data/catchments.geojson`, atau
 * daftar posko berubah. `lib/evacuation/routes.ts` menolak memakai berkas ini
 * kalau titik asalnya sudah tidak cocok dengan geojson, jadi lintasan basi
 * tidak bisa diam-diam ikut tergambar.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { EVACUATION_POSTS } from "../lib/evacuation/data.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const KM_PER_DEG_LAT = 111.0;
const KM_PER_DEG_LON = 110.6;

/**
 * Laju rombongan evakuasi, km/jam. Bukan laju lalu lintas bebas: yang bergerak
 * adalah iring-iringan warga dan kendaraan pengangkut di jalan kabupaten yang
 * sedang hujan.
 */
const SPEED_KMH = 25;

/** Meter antara dua titik [lon, lat]. Bidang datar; galat < 0,1 % pada 10 km. */
function meters(a, b) {
  const dLat = (b[1] - a[1]) * KM_PER_DEG_LAT;
  const dLon = (b[0] - a[0]) * KM_PER_DEG_LON;
  return Math.hypot(dLat, dLon) * 1000;
}

/** Titik berat luasan sebuah cincin poligon. Sama dengan `ringCentroid` di runtime. */
function ringCentroid(ring) {
  let twiceArea = 0;
  let lon = 0;
  let lat = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = xj * yi - xi * yj;
    twiceArea += cross;
    lon += (xj + xi) * cross;
    lat += (yj + yi) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const n = ring.length;
    return [ring.reduce((s, p) => s + p[0], 0) / n, ring.reduce((s, p) => s + p[1], 0) / n];
  }
  return [lon / (3 * twiceArea), lat / (3 * twiceArea)];
}

/* ---------------------------------------------------------------------------
   Graf
--------------------------------------------------------------------------- */

const raw = JSON.parse(readFileSync(join(ROOT, "data", "roads.json"), "utf8"));

/** Geometri penuh sebuah rusuk, dari simpul a ke simpul b. */
function edgeShape(e) {
  const [a, b, , , inner] = e;
  return [raw.nodes[a], ...inner, raw.nodes[b]];
}

/**
 * Proyeksi sebuah titik ke ruas garis, dikembalikan bersama posisinya (0..1).
 * Dipakai untuk menempelkan titik asal dan posko ke jalan terdekat — keduanya
 * hampir tidak pernah persis berada di sebuah persimpangan.
 */
function projectOnSegment(p, a, b) {
  const ax = a[0] * KM_PER_DEG_LON;
  const ay = a[1] * KM_PER_DEG_LAT;
  const bx = b[0] * KM_PER_DEG_LON;
  const by = b[1] * KM_PER_DEG_LAT;
  const px = p[0] * KM_PER_DEG_LON;
  const py = p[1] * KM_PER_DEG_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const d2 = dx * dx + dy * dy;
  const t = d2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / d2));

  const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, point, distM: meters(p, point) * 1 };
}

/**
 * Rusuk terdekat dari sebuah titik, lengkap dengan letak proyeksinya.
 *
 * MENEMPEL KE RUSUK, BUKAN KE SIMPUL. Menempel ke simpul graf terdekat akan
 * memindahkan posko sampai ratusan meter ke persimpangan terdekat, dan garis
 * yang digambar akan berakhir di tempat yang bukan posko. Yang dicari di sini
 * adalah titik terdekat di sepanjang jalan, lalu jalannya dipotong di situ.
 */
function nearestOnGraph(p) {
  let best = null;
  for (let ei = 0; ei < raw.edges.length; ei++) {
    const shape = edgeShape(raw.edges[ei]);
    for (let k = 0; k < shape.length - 1; k++) {
      const pr = projectOnSegment(p, shape[k], shape[k + 1]);
      if (!best || pr.distM < best.distM) {
        best = { edgeIndex: ei, segIndex: k, t: pr.t, point: pr.point, distM: pr.distM };
      }
    }
  }
  return best;
}

/** Panjang sebuah polyline, meter. */
function lengthOf(shape) {
  let m = 0;
  for (let i = 0; i < shape.length - 1; i++) m += meters(shape[i], shape[i + 1]);
  return m;
}

/** Potong geometri rusuk pada titik tempel, hasilkan bagian awal dan akhir. */
function splitShape(shape, segIndex, t) {
  const cut = [
    shape[segIndex][0] + (shape[segIndex + 1][0] - shape[segIndex][0]) * t,
    shape[segIndex][1] + (shape[segIndex + 1][1] - shape[segIndex][1]) * t,
  ];
  const head = [...shape.slice(0, segIndex + 1), cut];
  const tail = [cut, ...shape.slice(segIndex + 1)];
  return { cut, head, tail };
}

/**
 * Graf kerja: daftar ketetanggaan yang bisa ditambahi simpul maya.
 *
 * Arah jalan satu arah TIDAK dihormati, dan itu keputusan sadar. Penandaan
 * `oneway` di wilayah ini jarang lengkap, dan pada evakuasi arus lalu lintas
 * memang dibalik oleh petugas di lapangan. Menghormatinya di sini akan
 * memanjangkan lintasan berdasarkan aturan yang tidak berlaku saat evakuasi
 * berjalan, dan memangkas lintasan yang sebenarnya bisa dipakai.
 */
function makeGraph() {
  const adj = new Map();
  const link = (from, to, len, shape, nameIdx) => {
    if (!adj.has(from)) adj.set(from, []);
    adj.get(from).push({ to, len, shape, nameIdx });
  };
  for (const e of raw.edges) {
    const [a, b, len, nameIdx] = e;
    const shape = edgeShape(e);
    link(a, b, len, shape, nameIdx);
    link(b, a, len, [...shape].reverse(), nameIdx);
  }
  return { adj, link, nextVirtual: raw.nodes.length };
}

/** Tempelkan sebuah titik ke graf sebagai simpul maya; kembalikan idnya. */
function attach(graph, p, label) {
  const snap = nearestOnGraph(p);
  if (!snap) throw new Error(`tidak ada jalan di dekat ${label}`);

  const e = raw.edges[snap.edgeIndex];
  const [a, b, , nameIdx] = e;
  const shape = edgeShape(e);
  const { cut, head, tail } = splitShape(shape, snap.segIndex, snap.t);

  const v = graph.nextVirtual++;
  const headLen = lengthOf(head);
  const tailLen = lengthOf(tail);

  /* Simpul maya disambungkan ke KEDUA ujung rusuk yang dipotongnya, jadi
     perute bebas memilih arah mana pun keluar dari titik tempel. Rusuk aslinya
     dibiarkan utuh — kendaraan lain memang masih boleh melewatinya. */
  graph.link(v, a, headLen, [...head].reverse(), nameIdx);
  graph.link(a, v, headLen, head, nameIdx);
  graph.link(v, b, tailLen, tail, nameIdx);
  graph.link(b, v, tailLen, [...tail].reverse(), nameIdx);

  return { id: v, point: cut, offsetM: snap.distM };
}

/* ---------------------------------------------------------------------------
   Dijkstra dengan tumpukan biner
--------------------------------------------------------------------------- */

function shortestPath(graph, from, to) {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const done = new Set();

  /* Antrean prioritas sederhana. Grafnya beberapa ribu simpul, jadi tumpukan
     biner tanpa penurunan-kunci sudah jauh lebih cepat daripada yang diperlukan;
     entri usang dibuang saat diambil. */
  const heap = [{ n: from, d: 0 }];
  const push = (item) => {
    heap.push(item);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].d <= heap[i].d) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let s = i;
        if (l < heap.length && heap[l].d < heap[s].d) s = l;
        if (r < heap.length && heap[r].d < heap[s].d) s = r;
        if (s === i) break;
        [heap[s], heap[i]] = [heap[i], heap[s]];
        i = s;
      }
    }
    return top;
  };

  while (heap.length > 0) {
    const { n, d } = pop();
    if (done.has(n)) continue;
    done.add(n);
    if (n === to) break;

    for (const e of graph.adj.get(n) ?? []) {
      if (done.has(e.to)) continue;
      const nd = d + e.len;
      if (nd < (dist.get(e.to) ?? Infinity)) {
        dist.set(e.to, nd);
        prev.set(e.to, { from: n, edge: e });
        push({ n: e.to, d: nd });
      }
    }
  }

  if (!prev.has(to) && from !== to) return null;

  const legs = [];
  let cur = to;
  while (cur !== from) {
    const step = prev.get(cur);
    if (!step) return null;
    legs.unshift(step.edge);
    cur = step.from;
  }
  return { legs, distM: dist.get(to) ?? 0 };
}

/* ---------------------------------------------------------------------------
   Petunjuk belok, diturunkan dari geometri — bukan ditulis tetap
--------------------------------------------------------------------------- */

/** Arah mata angin sebuah ruas, derajat searah jarum jam dari utara. */
function bearing(a, b) {
  const dx = (b[0] - a[0]) * KM_PER_DEG_LON;
  const dy = (b[1] - a[1]) * KM_PER_DEG_LAT;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

/** Selisih sudut ke rentang (-180, 180]. */
function angleDelta(from, to) {
  let d = to - from;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/**
 * Rangkai petunjuk belok dari lintasan yang sudah jadi.
 *
 * Ruas berturut-turut dengan nama jalan yang sama digabung menjadi satu
 * petunjuk, karena berbelok mengikuti lekukan jalan yang sama bukan sebuah
 * keputusan. Yang menjadi petunjuk hanyalah titik tempat nama jalannya berganti
 * DAN arahnya berubah cukup jauh untuk terasa sebagai belokan.
 */
function buildSteps(legs, names, postName, postAddress) {
  const groups = [];
  for (const leg of legs) {
    const name = leg.nameIdx >= 0 ? names[leg.nameIdx] : "";
    const last = groups[groups.length - 1];
    if (last && last.name === name) {
      last.shape.push(...leg.shape.slice(1));
      last.len += leg.len;
    } else {
      groups.push({ name, shape: [...leg.shape], len: leg.len });
    }
  }

  const steps = [];
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.shape.length < 2) continue;

    let direction = "straight";
    if (i > 0) {
      const prev = groups[i - 1].shape;
      const inBearing = bearing(prev[prev.length - 2], prev[prev.length - 1]);
      const outBearing = bearing(g.shape[0], g.shape[1]);
      const turn = angleDelta(inBearing, outBearing);
      if (turn > 28) direction = "turn-right";
      else if (turn < -28) direction = "turn-left";
    }

    /* Nama jalan yang kosong bukan kelalaian yang perlu ditutupi: banyak jalan
       kampung di wilayah ini memang tidak bernama di OpenStreetMap. Menyebutnya
       "jalan tanpa nama" lebih jujur daripada mengarangkan nama jalan besar
       terdekat, yang persis kesalahan versi sebelumnya. */
    const roadName = g.name || "Jalan tanpa nama di OpenStreetMap";

    const verb =
      direction === "turn-right"
        ? "Belok kanan ke"
        : direction === "turn-left"
          ? "Belok kiri ke"
          : i === 0
            ? "Bergerak menyusuri"
            : "Lurus mengikuti";

    steps.push({
      direction,
      instruction: `${verb} ${roadName}`,
      roadName,
      distanceMeter: Math.round(g.len),
    });
  }

  steps.push({
    direction: "arrive",
    instruction: `Tiba di ${postName}`,
    roadName: postAddress,
    distanceMeter: 0,
  });

  /* Petunjuk yang terlalu pendek untuk diucapkan digabung ke petunjuk
     sebelumnya. Tanpa ini satu lintasan bisa menghasilkan tiga puluh baris
     "lurus 12 meter" dari lekukan kecil di persimpangan. */
  const merged = [];
  for (const s of steps) {
    const last = merged[merged.length - 1];
    if (last && s.direction === "straight" && s.distanceMeter < 60) {
      last.distanceMeter += s.distanceMeter;
      continue;
    }
    merged.push({ ...s });
  }

  return merged.map((s, i) => ({ id: i + 1, ...s }));
}

/* ---------------------------------------------------------------------------
   Bangun
--------------------------------------------------------------------------- */

const geo = JSON.parse(readFileSync(join(ROOT, "data", "catchments.geojson"), "utf8"));

const origins = geo.features.map((f) => {
  const ring = f.geometry.coordinates[0];
  const c = ringCentroid(ring);
  return { id: f.properties.id, name: f.properties.name, lon: c[0], lat: c[1] };
});

const q = (v) => Math.round(v * 1e5) / 1e5;

const routes = [];
let failures = 0;

for (const origin of origins) {
  for (const post of EVACUATION_POSTS) {
    /* Graf dibangun ulang tiap pasangan: simpul maya dari pasangan sebelumnya
       tidak boleh ikut menjadi jalan pintas bagi pasangan berikutnya. */
    const graph = makeGraph();
    const from = attach(graph, [origin.lon, origin.lat], origin.name);
    const to = attach(graph, [post.lon, post.lat], post.name);

    const path = shortestPath(graph, from.id, to.id);
    if (!path) {
      failures++;
      process.stderr.write(`TIDAK TERHUBUNG: ${origin.name} -> ${post.name}\n`);
      routes.push({
        originId: origin.id,
        postId: post.id,
        reachable: false,
      });
      continue;
    }

    /* GARISNYA HANYA BERISI JALAN, TIDAK LEBIH.
     *
     * Versi pertama berkas ini menyambungkan titik berat DAS langsung ke garis
     * jalan, dan koordinat posko ke ujung yang lain. Terukur: penggal lurus di
     * kedua ujung itu mencapai 1.063 meter untuk satu pasangan — lebih dari
     * satu kilometer garis melintasi tempat yang tidak ada jalannya, yaitu
     * persis cacat yang seharusnya diperbaiki, hanya dipindah ke ujung.
     *
     * Sekarang `line` dimulai dan berakhir di titik tempel jalan. Penggal
     * aksesnya tetap dicatat sebagai data terpisah, jadi antarmuka bisa
     * menggambarnya dengan garis putus-putus dan menyebutkan panjangnya —
     * "tidak ada jalan terpetakan di sini" adalah keterangan yang berguna,
     * bukan sesuatu yang perlu disembunyikan dengan garis penuh. */
    const line = [];
    for (const leg of path.legs) {
      for (const p of leg.shape) {
        const prev = line[line.length - 1];
        if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) line.push(p);
      }
    }

    const roadM = lengthOf(line);

    routes.push({
      originId: origin.id,
      postId: post.id,
      reachable: true,
      /** Panjang lintasan DI ATAS JALAN, meter. */
      distanceMeter: Math.round(roadM),
      /**
       * Penggal lurus di kedua ujung yang tidak berada di atas jalan
       * terpetakan: dari titik berat DAS ke jalan terdekat, dan dari jalan
       * terdekat ke posko.
       */
      access: {
        origin: {
          meter: Math.round(from.offsetM),
          from: [q(origin.lon), q(origin.lat)],
          to: [q(from.point[0]), q(from.point[1])],
        },
        post: {
          meter: Math.round(to.offsetM),
          from: [q(to.point[0]), q(to.point[1])],
          to: [q(post.lon), q(post.lat)],
        },
      },
      /* Waktu tempuh dihitung dari panjang jalan saja. Penggal akses ditempuh
         dengan cara yang tidak diketahui — bisa jalan kaki, bisa jalan kampung
         yang belum terpetakan — jadi menaksirnya pada 25 km/jam akan mengarang
         angka yang tidak bisa dibantah. */
      durationMins: Math.max(4, Math.round((roadM / 1000 / SPEED_KMH) * 60)),
      steps: buildSteps(path.legs, raw.names, post.name, post.address),
      line: line.map(([lon, lat]) => [q(lon), q(lat)]),
    });
  }
}

const out = {
  source: "Dijkstra atas data/roads.json (OpenStreetMap, ODbL 1.0)",
  generatedAt: new Date().toISOString().slice(0, 10),
  speedKmh: SPEED_KMH,
  /* Titik asal yang dipakai ikut ditulis. `lib/evacuation/routes.ts`
     membandingkannya dengan titik berat yang dihitungnya sendiri dan menolak
     berkas ini kalau sudah bergeser, jadi geojson yang berubah tanpa
     membangun ulang tidak bisa menghasilkan lintasan basi yang diam-diam
     tergambar seolah masih benar. */
  origins: origins.map((o) => ({ id: o.id, name: o.name, lon: q(o.lon), lat: q(o.lat) })),
  routes,
};

writeFileSync(join(ROOT, "data", "evacuation-routes.json"), JSON.stringify(out));

const ok = routes.filter((r) => r.reachable);
const accessOf = (r) => r.access.origin.meter + r.access.post.meter;
process.stderr.write(
  `${ok.length}/${routes.length} lintasan terhubung${failures ? `, ${failures} gagal` : ""}\n` +
    `jalan ${Math.min(...ok.map((r) => r.distanceMeter))}..${Math.max(...ok.map((r) => r.distanceMeter))} m, ` +
    `akses bukan jalan ${Math.min(...ok.map(accessOf))}..${Math.max(...ok.map(accessOf))} m\n` +
    `${(JSON.stringify(out).length / 1024).toFixed(0)} KB ditulis ke data/evacuation-routes.json\n`,
);
