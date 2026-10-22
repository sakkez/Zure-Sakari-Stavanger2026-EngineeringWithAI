// Shared by scripts/fetch-plants.mjs (via Node type stripping) and the tests.
// Keep to erasable TypeScript: no enums, namespaces or runtime imports.
import type { Plant, PlantSnapshot } from "./plants";

export const NORWAY_BOX = { south: 57.9, north: 71.2, west: 4.5, east: 31.2 };

const STRING_FIELDS = ["name", "county", "municipality", "catchment"] as const;
const NUMBER_FIELDS = ["id", "lat", "lon", "maxOutputMw", "meanProductionGwh", "inOperationYear", "statkraftSharePct"] as const;

/** Returns a list of problems; an empty list means the snapshot is valid. */
export function validateSnapshot(snapshot: PlantSnapshot): string[] {
  const errors: string[] = [];
  if (!snapshot || !Array.isArray(snapshot.plants)) return ["snapshot has no plants array"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshot.fetchedAt ?? "")) errors.push(`fetchedAt is not YYYY-MM-DD: ${snapshot.fetchedAt}`);
  if (snapshot.plants.length === 0) errors.push("snapshot has no plants");

  const seen = new Set<number>();
  for (const p of snapshot.plants as Partial<Plant>[]) {
    const label = `${p.name ?? "?"} (${p.id ?? "?"})`;
    for (const f of STRING_FIELDS) {
      if (typeof p[f] !== "string" || p[f] === "") errors.push(`${label}: missing ${f}`);
    }
    for (const f of NUMBER_FIELDS) {
      if (typeof p[f] !== "number" || !Number.isFinite(p[f])) errors.push(`${label}: missing ${f}`);
    }
    if (p.type !== "power-plant" && p.type !== "pumped-storage") errors.push(`${label}: bad type ${p.type}`);
    if (typeof p.id === "number") {
      if (seen.has(p.id)) errors.push(`${label}: duplicate id`);
      seen.add(p.id);
    }
    if (typeof p.lat === "number" && typeof p.lon === "number") {
      const b = NORWAY_BOX;
      if (p.lat < b.south || p.lat > b.north || p.lon < b.west || p.lon > b.east) {
        errors.push(`${label}: location ${p.lat},${p.lon} outside Norway`);
      }
    }
    if (typeof p.statkraftSharePct === "number" && (p.statkraftSharePct <= 0 || p.statkraftSharePct > 100)) {
      errors.push(`${label}: share ${p.statkraftSharePct} out of range`);
    }
  }
  return errors;
}
