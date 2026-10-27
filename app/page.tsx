import fs from "node:fs";
import path from "node:path";
import Dashboard from "@/components/Dashboard";
import { parseCatchments } from "@/components/preview/catchments";
import type { Link } from "@/lib/types";

/* Berkas di `data/` dibaca di server supaya `catchments.geojson` tidak perlu
   aturan bundler tambahan, dan supaya topologi tautan tidak pernah menyimpang
   dari berkas aslinya milik Adnan. */
function readJson<T>(relative: string): T {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), relative), "utf8")) as T;
}

export default function Home() {
  const links = readJson<Link[]>("data/links.json");
  const catchments = readJson<Parameters<typeof parseCatchments>[0]>("data/catchments.geojson");

  return <Dashboard links={links} catchmentDefs={parseCatchments(catchments)} />;
}
