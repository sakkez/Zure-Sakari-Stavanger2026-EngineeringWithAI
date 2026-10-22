import L from "leaflet";

export const OSM_TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Mainland Norway, Lindesnes to the North Cape, with a little margin.
export const NORWAY_BOUNDS = L.latLngBounds([57.9, 4.5], [71.2, 31.2]);

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { zoomControl: true, zoomSnap: 0.25 });
  L.tileLayer(OSM_TILE_URL, { attribution: OSM_ATTRIBUTION, maxZoom: 18 }).addTo(map);
  map.fitBounds(NORWAY_BOUNDS);
  return map;
}
