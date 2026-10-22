import { test, expect } from "@playwright/test";
import snapshotJson from "../../src/data/plants.json" with { type: "json" };
import type { PlantSnapshot } from "../../src/data/plants";
import { validateSnapshot } from "../../src/data/validate";

const snapshot = snapshotJson as PlantSnapshot;

test.describe("Requirement: Each plant record is complete", () => {
  test("Snapshot is valid", () => {
    expect(validateSnapshot(snapshot)).toEqual([]);
  });

  test("validator catches bad records", () => {
    const bad = structuredClone(snapshot);
    bad.plants[0].lat = 40;
    bad.plants[1].id = bad.plants[2].id;
    bad.plants[3].statkraftSharePct = 0;
    const errors = validateSnapshot(bad);
    expect(errors.some((e) => e.includes("outside Norway"))).toBe(true);
    expect(errors.some((e) => e.includes("duplicate id"))).toBe(true);
    expect(errors.some((e) => e.includes("out of range"))).toBe(true);
  });
});

test.describe("Requirement: Dataset includes Statkraft's generating plants", () => {
  test("Pumps and other owners are excluded", () => {
    expect(snapshot.plants.length).toBeGreaterThan(0);
    for (const p of snapshot.plants) {
      expect(["power-plant", "pumped-storage"]).toContain(p.type);
      expect(p.statkraftSharePct).toBeGreaterThan(0);
    }
  });
});
