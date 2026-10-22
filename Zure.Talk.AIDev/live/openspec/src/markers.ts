import L from "leaflet";
import type { Plant } from "./data/plants";

export function plantLabel(p: Plant): string {
  return `${p.name} – ${p.maxOutputMw} MW`;
}

/** Draws one circle marker per plant and returns them keyed by plant id. */
export function addPlantMarkers(map: L.Map, plants: Plant[]): Map<number, L.CircleMarker> {
  const markers = new Map<number, L.CircleMarker>();
  for (const plant of plants) {
    const marker = L.circleMarker([plant.lat, plant.lon], {
      radius: 6,
      color: "#ffffff",
      weight: 1.5,
      fillColor: "#0b6e99",
      fillOpacity: 0.9,
      className: "plant-marker",
    })
      .bindTooltip(plantLabel(plant), { direction: "top", offset: [0, -6] })
      .addTo(map);

    const el = marker.getElement();
    if (el) {
      el.setAttribute("data-plant-id", String(plant.id));
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", plantLabel(plant));
      el.setAttribute("tabindex", "0");
      el.addEventListener("focus", () => marker.openTooltip());
      el.addEventListener("blur", () => marker.closeTooltip());
    }
    markers.set(plant.id, marker);
  }
  return markers;
}

/** Adds the "Source: NVE, data as of …" note to the map's top-right corner. */
export function addSourceNote(map: L.Map, fetchedAt: string): void {
  const control = new L.Control({ position: "topright" });
  control.onAdd = () => {
    const div = L.DomUtil.create("div", "data-source");
    div.innerHTML = `Source: <a href="https://www.nve.no/" target="_blank" rel="noopener">NVE</a>, data as of ${fetchedAt}`;
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  control.addTo(map);
}
