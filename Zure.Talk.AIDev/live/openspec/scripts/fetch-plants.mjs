// Refreshes src/data/plants.json from NVE's public hydropower data.
// Usage: npm run data:plants
import { mkdtemp, rename, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSnapshot } from "../src/data/validate.ts";

const API_URL =
  process.env.NVE_API_URL ?? "https://api.nve.no/web/Powerplant/GetHydroPowerPlantsInOperation";
const GIS_URL =
  process.env.NVE_GIS_URL ??
  "https://kart.nve.no/enterprise/rest/services/Vannkraft1/MapServer/0/query";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/data/plants.json");
const STATKRAFT = /^STATKRAFT /i;
const TYPES = { Kraftverk: "power-plant", Pumpekraftverk: "pumped-storage" };

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} from ${url}`);
  return res.json();
}

function statkraftShare(plant) {
  return (plant.Eiere ?? [])
    .filter((o) => STATKRAFT.test(o.Navn ?? ""))
    .reduce((sum, o) => sum + (o.ProsentAndel ?? 0), 0);
}

async function fetchLocations(ids) {
  const body = new URLSearchParams({
    where: `vannkraftverknr IN (${ids.join(",")})`,
    outFields: "objectid,vannkraftverknr",
    outSR: "4326",
    returnGeometry: "true",
    f: "json",
  });
  const json = await getJson(GIS_URL, { method: "POST", body });
  if (json.error || !Array.isArray(json.features)) {
    throw new Error(`map service error: ${JSON.stringify(json.error ?? json).slice(0, 200)}`);
  }
  // Some plants have several points; keep the lowest objectid so the choice is stable.
  const byId = new Map();
  for (const f of [...json.features].sort((a, b) => a.attributes.objectid - b.attributes.objectid)) {
    const id = f.attributes.vannkraftverknr;
    if (!byId.has(id) && f.geometry) byId.set(id, { lat: f.geometry.y, lon: f.geometry.x });
  }
  return byId;
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

async function main() {
  const all = await getJson(API_URL);
  if (!Array.isArray(all)) throw new Error("NVE API did not return a list of plants");

  const selected = all.filter(
    (p) => p.ErIDrift && p.VannKVType in TYPES && statkraftShare(p) > 0,
  );
  const locations = await fetchLocations(selected.map((p) => p.VannKraftverkID));

  const missing = selected.filter((p) => !locations.has(p.VannKraftverkID));
  for (const p of missing) console.warn(`No location for ${p.Navn} (${p.VannKraftverkID}), left out`);

  const plants = selected
    .filter((p) => locations.has(p.VannKraftverkID))
    .map((p) => {
      const loc = locations.get(p.VannKraftverkID);
      return {
        id: p.VannKraftverkID,
        name: p.Navn,
        lat: round(loc.lat, 5),
        lon: round(loc.lon, 5),
        maxOutputMw: p.MaksYtelse,
        meanProductionGwh: round(p.MidProd_91_20 ?? 0, 1),
        type: TYPES[p.VannKVType],
        county: p.Fylke,
        municipality: p.Kommune,
        catchment: p.Nedborsfeltnavn,
        inOperationYear: p.ForsteUtnyttelseAvFalletDato ?? Number((p.IDriftDato ?? "").slice(0, 4)),
        statkraftSharePct: round(statkraftShare(p), 2),
      };
    })
    .sort((a, b) => a.id - b.id);

  const snapshot = {
    source: "NVE (Norwegian Water Resources and Energy Directorate), https://www.nve.no/",
    fetchedAt: new Date().toISOString().slice(0, 10),
    plants,
  };
  const errors = validateSnapshot(snapshot);
  if (errors.length) throw new Error(`snapshot failed validation:\n  ${errors.join("\n  ")}`);

  // Write to a temp file first so a failure never leaves a half-written snapshot.
  const dir = await mkdtemp(path.join(tmpdir(), "plants-"));
  const tmp = path.join(dir, "plants.json");
  await writeFile(tmp, JSON.stringify(snapshot, null, 2) + "\n");
  try {
    await rename(tmp, OUT);
  } catch {
    await copyFile(tmp, OUT); // rename fails across drives on Windows
  }
  await rm(dir, { recursive: true, force: true });
  console.log(`Wrote ${plants.length} plants to ${path.relative(process.cwd(), OUT)}`);
}

main().catch((err) => {
  console.error(`data:plants failed: ${err.message}`);
  process.exit(1);
});
