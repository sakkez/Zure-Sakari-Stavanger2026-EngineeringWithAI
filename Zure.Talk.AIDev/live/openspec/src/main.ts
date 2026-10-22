import "leaflet/dist/leaflet.css";
import "./style.css";
import type { CircleMarker, Map as LeafletMap } from "leaflet";
import { createMap } from "./map";
import { snapshot, type Plant } from "./data/plants";
import { addPlantMarkers, addSourceNote } from "./markers";

declare global {
  interface Window {
    __map?: LeafletMap;
    __plants?: Plant[];
    __markers?: Map<number, CircleMarker>;
  }
}

const el = document.getElementById("map");
if (!el) throw new Error("#map element missing");

const map = createMap(el);
const markers = addPlantMarkers(map, snapshot.plants);
addSourceNote(map, snapshot.fetchedAt);

// Exposed for end-to-end tests.
window.__map = map;
window.__plants = snapshot.plants;
window.__markers = markers;
