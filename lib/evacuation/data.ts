export interface EvacuationPost {
  id: string;
  name: string;
  category: "GOR" | "Puskesmas" | "Kantor Desa" | "Sekolah";
  lat: number;
  lon: number;
  capacity: number;
  occupied: number;
  status: "SIAP" | "HAMPIR PENUH" | "PENUH";
  facilities: string[];
  phone: string;
  address: string;
}

export interface RouteWaypoint {
  lat: number;
  lon: number;
  instruction?: string;
}

export interface EvacuationRoute {
  id: string;
  targetPostId: string;
  postName: string;
  startName: string;
  distanceKm: number;
  durationMins: number;
  safetyStatus: "AMAN" | "WASPADA" | "BAHAYA";
  maxRainRateMmH: number;
  waypoints: RouteWaypoint[];
}

/** Daftar Posko Evakuasi Resmi di Wilayah Hulu Ciliwung (Bogor) */
export const EVACUATION_POSTS: EvacuationPost[] = [
  {
    id: "POSKO-01",
    name: "Posko Utama GOR Cisarua",
    category: "GOR",
    lat: -6.698,
    lon: 106.932,
    capacity: 500,
    occupied: 180,
    status: "SIAP",
    facilities: ["Dapur Umum", "Posko Kesehatan", "Genset Darurat", "Tenda Pengungsi", "Sanitasi"],
    phone: "0812-9900-1122",
    address: "Jl. Raya Puncak No. 42, Cisarua, Bogor",
  },
  {
    id: "POSKO-02",
    name: "Posko SMPN 1 Megamendung",
    category: "Sekolah",
    lat: -6.672,
    lon: 106.962,
    capacity: 350,
    occupied: 140,
    status: "SIAP",
    facilities: ["Dapur Umum", "Ruang Kelas Pengungsian", "Posko Medis BPBD", "Air Bersih"],
    phone: "0813-8811-2233",
    address: "Jl. Megamendung No. 18, Megamendung, Bogor",
  },
  {
    id: "POSKO-03",
    name: "Posko Bencana Kantor Desa Gadog",
    category: "Kantor Desa",
    lat: -6.658,
    lon: 106.945,
    capacity: 250,
    occupied: 70,
    status: "SIAP",
    facilities: ["Posko Komando BPBD", "Mobil Ambulans Siaga", "Logistik Makanan", "Wifi Darurat"],
    phone: "0811-7722-3344",
    address: "Jl. Raya Simpang Gadog No. 5, Gadog, Bogor",
  },
  {
    id: "POSKO-04",
    name: "Posko Medis Puskesmas Cisarua",
    category: "Puskesmas",
    lat: -6.712,
    lon: 106.92,
    capacity: 150,
    occupied: 60,
    status: "SIAP",
    facilities: ["Unit Gawat Darurat (UGD)", "Farmasi", "Ambulans 24 Jam", "Dokter Jaga"],
    phone: "0812-4455-6677",
    address: "Jl. Raya Cisarua No. 102, Cisarua, Bogor",
  },
];
