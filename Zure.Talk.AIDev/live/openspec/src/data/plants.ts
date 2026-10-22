import snapshotJson from "./plants.json";

export type PlantType = "power-plant" | "pumped-storage";

export interface Plant {
  /** NVE plant number (VannKraftverkID). */
  id: number;
  name: string;
  lat: number;
  lon: number;
  maxOutputMw: number;
  meanProductionGwh: number;
  type: PlantType;
  county: string;
  municipality: string;
  catchment: string;
  inOperationYear: number;
  /** Statkraft companies' combined ownership share, 0 < share <= 100. */
  statkraftSharePct: number;
}

export interface PlantSnapshot {
  source: string;
  /** Date the data was fetched, YYYY-MM-DD. */
  fetchedAt: string;
  plants: Plant[];
}

export const snapshot = snapshotJson as PlantSnapshot;
