/**
 * Membangun `data/roads.json` — graf jalan yang dipakai perutean evakuasi.
 *
 * KENAPA ADA BERKAS INI. Sebelumnya lintasan evakuasi digambar sebagai garis
 * lurus dari titik berat DAS ke posko, dengan dua titik tengah yang digeser
 * 15 persen tegak lurus supaya TERLIHAT berbelok. Garis itu menyeberangi
 * lembah, sungai, dan kebun teh tanpa satu pun jalan di bawahnya, dan jaraknya
 * adalah jarak burung terbang yang disebut "jarak tempuh". Untuk konsol yang
 * seluruh argumennya bersandar pada "angkanya bisa dibantah", itu satu-satunya
 * angka di layar yang tidak bisa dibantah karena memang tidak diukur dari apa
 * pun.
 *
 * Sekarang lintasannya dicari di atas jaringan jalan OpenStreetMap yang nyata.
 *
 * DATANYA DIBEKUKAN KE DALAM REPOSITORI, BUKAN DIAMBIL SAAT APLIKASI BERJALAN.
 * Konsol ini dipakai ketika hujan sedang turun; menggantungkan gambar lintasan
 * evakuasi pada satu panggilan jaringan ke server pihak ketiga berarti fitur
 * itu mati justru pada saat ia dibutuhkan. Jaringan jalan juga hampir tidak
 * berubah dari pekan ke pekan, jadi tidak ada yang didapat dari mengambilnya
 * berulang kali.
 *
 * Jalankan ulang ketika wilayah cakupan berubah:
 *   node scripts/build-road-graph.mjs
 *
 * Overpass membatasi laju dengan ketat dan membalas 429 setelah beberapa
 * permintaan berturut-turut. Simpan sekali balasannya, lalu bangun ulang
 * berkali-kali dari salinan itu tanpa menyentuh jaringan:
 *   node scripts/build-road-graph.mjs --from overpass.json
 *
 * Sumber: OpenStreetMap, ODbL 1.0. Atribusi wajib ikut ditampilkan di peta —
 * `components/map/RainMap.tsx` sudah memuatnya untuk ubin dasar.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "data", "roads.json");

/**
 * Kotak batas wilayah. Sedikit lebih luas daripada kotak batas medan hujan di
 * `data/catchment-config.json`, karena posko dan lintasan menuju ke sana boleh
 * berada di luar wilayah yang hujannya direkonstruksi.
 */
const BBOX = { south: -6.735, west: 106.895, north: -6.64, east: 106.995 };

/**
 * Kelas jalan yang boleh dilalui rombongan evakuasi.
 *
 * `path`, `track`, `footway`, dan `steps` sengaja TIDAK diikutkan. Semuanya
 * bisa dilewati orang berjalan kaki, dan justru itu masalahnya: rute yang
 * memakainya akan terlihat lebih pendek di layar sambil mustahil dilalui
 * ambulans, dan operator tidak punya cara tahu bedanya dari gambar.
 */
const HIGHWAY =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|" +
  "motorway_link|trunk_link|primary_link|secondary_link|tertiary_link|living_street|road)$";

/** Cermin Overpass, dicoba berurutan. Yang pertama sering 504 saat sibuk. */
const MIRRORS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const QUERY = `[out:json][timeout:120];way["highway"~"${HIGHWAY}"](${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east});out geom;`;

const KM_PER_DEG_LAT = 111.0;
const KM_PER_DEG_LON = 110.6;

/** Jarak dalam meter. Aproksimasi bidang datar; pada petak 10 km galatnya < 0,1 %. */
function meters(a, b) {
  const dLat = (b.lat - a.lat) * KM_PER_DEG_LAT;
  const dLon = (b.lon - a.lon) * KM_PER_DEG_LON;
  return Math.sqrt(dLat * dLat + dLon * dLon) * 1000;
}

async function fetchWays() {
  let lastError = null;
  for (const url of MIRRORS) {
    try {
      process.stderr.write(`mengambil dari ${url}\n`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: QUERY }),
      });
      if (!res.ok) {
        lastError = new Error(`${url} membalas ${res.status}`);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json.elements) && json.elements.length > 0) return json.elements;
      lastError = new Error(`${url} membalas tanpa elemen`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("seluruh cermin Overpass gagal");
}

function build(ways) {
  /* --- 1. Simpul mana yang persimpangan ---------------------------------
     Sebuah simpul OSM menjadi simpul graf kalau ia dipakai lebih dari satu
     ruas (persimpangan sungguhan) atau berada di ujung sebuah ruas. Titik di
     antaranya hanya bentuk jalan, bukan tempat keputusan diambil; menyimpannya
     sebagai simpul graf akan melipatgandakan ukuran berkas tanpa mengubah satu
     pun lintasan yang dihasilkan. */
  const useCount = new Map();
  for (const w of ways) {
    if (!Array.isArray(w.nodes)) continue;
    for (const id of w.nodes) useCount.set(id, (useCount.get(id) ?? 0) + 1);
  }

  const isJunction = (id, way, index) =>
    index === 0 || index === way.nodes.length - 1 || (useCount.get(id) ?? 0) > 1;

  /* --- 2. Potong tiap ruas pada persimpangannya --------------------------
     Geometri di antara dua persimpangan disimpan utuh, jadi garis yang
     digambar mengikuti lekuk jalan yang sebenarnya, bukan tali busur antar
     persimpangan. Inilah yang membuat lintasan di peta terlihat seperti jalan. */
  const nodeIndex = new Map(); // id OSM -> indeks simpul graf
  const nodes = []; // [lon, lat]
  const edges = []; // { a, b, len, name, shape }

  const nodeOf = (osmId, pt) => {
    let idx = nodeIndex.get(osmId);
    if (idx === undefined) {
      idx = nodes.length;
      nodeIndex.set(osmId, idx);
      nodes.push([pt.lon, pt.lat]);
    }
    return idx;
  };

  for (const w of ways) {
    if (!Array.isArray(w.nodes) || !Array.isArray(w.geometry)) continue;
    if (w.nodes.length !== w.geometry.length) continue; // ruas terpotong tepi kotak

    const name = w.tags?.name ?? w.tags?.ref ?? "";

    let startI = 0;
    for (let i = 1; i < w.nodes.length; i++) {
      if (!isJunction(w.nodes[i], w, i)) continue;

      const shape = w.geometry.slice(startI, i + 1);
      let len = 0;
      for (let k = 0; k < shape.length - 1; k++) len += meters(shape[k], shape[k + 1]);

      const a = nodeOf(w.nodes[startI], w.geometry[startI]);
      const b = nodeOf(w.nodes[i], w.geometry[i]);

      /* Gelung (a === b) dan ruas sepanjang nol dibuang: keduanya tidak pernah
         memperpendek lintasan mana pun dan hanya menambah cabang di Dijkstra. */
      if (a !== b && len > 0.5) {
        edges.push({ a, b, len, name, shape: shape.map((p) => [p.lon, p.lat]) });
      }
      startI = i;
    }
  }

  /* --- 3. Sisakan komponen terhubung terbesar ----------------------------
     Jaringan hasil potongan kotak batas selalu meninggalkan serpihan: jalan
     kompleks yang jalan penghubungnya berada di luar kotak, atau kesalahan
     penggambaran di OSM. Kalau titik asal tersambar salah satu serpihan itu,
     perutean akan gagal atau menghasilkan lintasan yang mustahil. Membuangnya
     di sini membuat kegagalan seperti itu tidak bisa terjadi saat berjalan. */
  const adj = Array.from({ length: nodes.length }, () => []);
  edges.forEach((e, i) => {
    adj[e.a].push(i);
    adj[e.b].push(i);
  });

  const comp = new Int32Array(nodes.length).fill(-1);
  let best = { id: -1, size: 0 };
  let cid = 0;
  for (let s = 0; s < nodes.length; s++) {
    if (comp[s] !== -1) continue;
    let size = 0;
    const stack = [s];
    comp[s] = cid;
    while (stack.length) {
      const n = stack.pop();
      size++;
      for (const ei of adj[n]) {
        const other = edges[ei].a === n ? edges[ei].b : edges[ei].a;
        if (comp[other] === -1) {
          comp[other] = cid;
          stack.push(other);
        }
      }
    }
    if (size > best.size) best = { id: cid, size };
    cid++;
  }

  /* --- 4. Nomori ulang dan padatkan --------------------------------------
     Koordinat dibulatkan ke 5 desimal, sekitar 1,1 meter di lintang ini. Itu
     jauh lebih halus daripada lebar jalan mana pun di sini, dan memangkas
     berkasnya lebih dari separuh. */
  const q = (v) => Math.round(v * 1e5) / 1e5;

  const remap = new Int32Array(nodes.length).fill(-1);
  const outNodes = [];
  for (let i = 0; i < nodes.length; i++) {
    if (comp[i] !== best.id) continue;
    remap[i] = outNodes.length;
    outNodes.push([q(nodes[i][0]), q(nodes[i][1])]);
  }

  const names = [];
  const nameIndex = new Map();
  const nameOf = (n) => {
    if (!n) return -1;
    let i = nameIndex.get(n);
    if (i === undefined) {
      i = names.length;
      nameIndex.set(n, i);
      names.push(n);
    }
    return i;
  };

  const outEdges = [];
  for (const e of edges) {
    if (comp[e.a] !== best.id) continue;
    /* Titik ujung tidak diulang di dalam `shape`: keduanya sudah ada sebagai
       simpul, dan perute menyambungnya kembali saat merangkai lintasan. */
    const inner = e.shape.slice(1, -1).map(([lon, lat]) => [q(lon), q(lat)]);
    outEdges.push([remap[e.a], remap[e.b], Math.round(e.len), nameOf(e.name), inner]);
  }

  return {
    /* Setiap berkas data di proyek ini menyebutkan asalnya. */
    source: "OpenStreetMap via Overpass API",
    license: "ODbL 1.0",
    generatedAt: new Date().toISOString().slice(0, 10),
    bbox: [BBOX.west, BBOX.south, BBOX.east, BBOX.north],
    names,
    nodes: outNodes,
    /** [simpulA, simpulB, panjangMeter, indeksNama, titikBentukDiAntaranya] */
    edges: outEdges,
  };
}

const fromArg = process.argv.indexOf("--from");
const ways =
  fromArg !== -1 && process.argv[fromArg + 1]
    ? JSON.parse(readFileSync(process.argv[fromArg + 1], "utf8")).elements
    : await fetchWays();

process.stderr.write(`${ways.length} ruas jalan diterima\n`);

const graph = build(ways);
writeFileSync(OUT, JSON.stringify(graph));

process.stderr.write(
  `${graph.nodes.length} simpul, ${graph.edges.length} rusuk, ` +
    `${graph.names.length} nama jalan\n` +
    `${(JSON.stringify(graph).length / 1024).toFixed(0)} KB ditulis ke data/roads.json\n`,
);
