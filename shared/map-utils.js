// shared/map-utils.js - v33.0
// תוכן הקובץ זהה למה שסופק בתשובה הקודמת שלך.
// הוא כולל: ISRAEL_CENTER, WAREHOUSE_LOCATIONS, הגדרות אייקונים,
// initMap, geocodeAddress, updateMarker, removeOldMarkers, fitMapToBounds
// וייבוא של SmartLog.
import { SmartLog } from './firebase-init.js'; // ייבוא SmartLog לרישום שגיאות

// --- קבועים ---
export const ISRAEL_CENTER = [32.0853, 34.7818];
export const WAREHOUSE_LOCATIONS = {
    "החרש": [32.13266165049073, 34.898196599998755],
    "התלמיד": [32.16303427408473, 34.894926705310006]
};

// --- הגדרות אייקונים (Icons) ---
export const driverIconActive = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});

export const driverIconStuck = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});

export const driverIconLoading = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});

export const driverIconInactive = L.icon({ // אייקון נוסף לא פעיל
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});

export const orderIconNew = L.icon({ // שונה ל- orderIconActive
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});

export const warehouseIcon = L.icon({ // אייקון למחסן
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', // נשתמש באדום למחסן
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
});


// --- אתחול מפה ---
export function initMap(mapElementId, center = ISRAEL_CENTER, zoom = 9) {
    try {
        const mapElement = document.getElementById(mapElementId);
        if (!mapElement) {
            throw new Error(`Map container #${mapElementId} not found`);
        }
        if (window[`${mapElementId}_mapInstance`]) {
            window[`${mapElementId}_mapInstance`].remove();
        }

        const map = L.map(mapElementId).setView(center, zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);

        window[`${mapElementId}_mapInstance`] = map;
        SmartLog.info(`Map initialized in #${mapElementId}`, "Map.Init");
        return map;
    } catch (error) {
        SmartLog.error(error, "Map.Init", { mapElementId });
        const mapEl = document.getElementById(mapElementId);
        if (mapEl) mapEl.innerHTML = `<div class="p-4 text-center text-red-500">שגיאה בטעינת המפה.</div>`;
        return null;
    }
}

// --- Geocoding ---
export async function geocodeAddress(address) {
    if (!address) return null;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=il`;
    SmartLog.info(`Geocoding address: ${address}`, "Geocode.Nominatim");
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Nominatim API failed: ${response.status}`);
        const data = await response.json();
        if (data && data.length > 0) {
            const { lat, lon } = data[0];
            const coords = [parseFloat(lat), parseFloat(lon)];
            SmartLog.info(`Geocode success: [${coords[0]}, ${coords[1]}]`, "Geocode.Nominatim");
            return coords;
        } else {
            SmartLog.warn(`Geocode found no results for: ${address}`, "Geocode.Nominatim");
            return null;
        }
    } catch (error) {
        SmartLog.error(error, "Geocode.Nominatim", { address });
        return null;
    }
}

// --- פונקציות עזר נוספות למפה (אופציונלי) ---
export function updateMarker(mapInstance, markersObject, itemId, latLng, icon, popupContent, onClickHandler = null) {
    if (!mapInstance || !latLng || !latLng[0] || !latLng[1]) return;

    if (markersObject[itemId]) {
        markersObject[itemId].setLatLng(latLng).setIcon(icon).setPopupContent(popupContent);
    } else {
        markersObject[itemId] = L.marker(latLng, { icon })
            .addTo(mapInstance)
            .bindPopup(popupContent);
        if (onClickHandler) {
            markersObject[itemId].on('click', () => onClickHandler(itemId));
        }
    }
}

export function removeOldMarkers(mapInstance, markersObject, currentItemIds) {
    if (!mapInstance) return;
    Object.keys(markersObject).forEach(markerId => {
        if (!currentItemIds.includes(markerId)) {
            if (mapInstance.hasLayer(markersObject[markerId])) {
                mapInstance.removeLayer(markersObject[markerId]);
            }
            delete markersObject[markerId];
        }
    });
}

export function fitMapToBounds(mapInstance, activeMarkers) {
    if (!mapInstance || activeMarkers.length === 0) return;
    const markerLatLngs = activeMarkers
        .map(marker => marker.getLatLng ? marker.getLatLng() : null) // קבל LatLng אם קיים
        .filter(latLng => latLng !== null); // סנן החוצה אם אין LatLng תקין

    if (markerLatLngs.length === 0) return; // אין סמנים עם מיקום תקין

    const bounds = L.latLngBounds(markerLatLngs);
    if (bounds.isValid()) {
        try {
            mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        } catch (e) {
            SmartLog.warn("FitBounds error", "Map.Util", e);
        }
    } else {
        SmartLog.warn("FitBounds called with invalid bounds", "Map.Util", { markerCount: markerLatLngs.length });
    }
}
