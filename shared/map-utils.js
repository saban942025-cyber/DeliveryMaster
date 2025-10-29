// shared/map-utils.js - V33.0 (Fixed L is not defined)

import { SmartLog } from './firebase-init.js';

// --- קבועים ---
export const ISRAEL_CENTER = [32.0853, 34.7818];
export const WAREHOUSE_LOCATIONS = {
    "החרש": [32.13266165049073, 34.898196599998755],
    "התלמיד": [32.16303427408473, 34.894926705310006]
};

// --- משתנים פנימיים לאייקונים (Icons) ---
let driverIconActive;
let driverIconStuck;
let driverIconLoading;
let driverIconInactive;
let orderIconNew;
let warehouseIcon;

// --- פונקציית אתחול רכיבי המפה (חובה לקרוא לה פעם אחת) ---
/**
 * מגדיר את כל האייקונים של Leaflet. חובה לקרוא לה רק לאחר טעינת Leaflet.js
 */
export function initializeMapComponents() {
    if (typeof L === 'undefined') {
         SmartLog.error(new Error("Leaflet is not defined!"), "Map.Setup", { message: "Attempted to initialize icons before L loaded." });
         return false;
    }
    
    const ICON_BASE = {
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png', shadowSize: [41, 41]
    };

    driverIconActive = L.icon({ ...ICON_BASE, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png' });
    driverIconStuck = L.icon({ ...ICON_BASE, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' });
    driverIconLoading = L.icon({ ...ICON_BASE, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-yellow.png' });
    driverIconInactive = L.icon({ ...ICON_BASE, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-grey.png' });
    orderIconNew = L.icon({ ...ICON_BASE, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png' });
    warehouseIcon = L.icon({ ...ICON_BASE, iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png' });
    
    SmartLog.info("Map icons initialized.", "Map.Setup");
    return true;
}

// --- ייצוא האייקונים באמצעות פונקציות Getter ---
// פונקציות אלו מחזירות את האייקון המאותר רק לאחר initializeMapComponents() נקרא
export const getDriverIconActive = () => driverIconActive;
export const getDriverIconStuck = () => driverIconStuck;
export const getDriverIconLoading = () => driverIconLoading;
export const getDriverIconInactive = () => driverIconInactive;
export const getOrderIconNew = () => orderIconNew;
export const getWarehouseIcon = () => warehouseIcon;


// --- אתחול מפה ---
export function initMap(mapElementId, center = ISRAEL_CENTER, zoom = 9) {
    try {
        const mapElement = document.getElementById(mapElementId);
        if (!mapElement) { throw new Error(`Map container #${mapElementId} not found`); }
        if (window[`${mapElementId}_mapInstance`]) { window[`${mapElementId}_mapInstance`].remove(); }

        const map = L.map(mapElementId).setView(center, zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19, attribution: '&copy; OpenStreetMap'
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
            const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
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

// --- פונקציות עזר נוספות למפה ---
export function updateMarker(mapInstance, markersObject, itemId, latLng, icon, popupContent, onClickHandler = null) {
    if (!mapInstance || !latLng || !latLng[0] || !latLng[1]) return;
    if (markersObject[itemId]) {
        markersObject[itemId].setLatLng(latLng).setIcon(icon).setPopupContent(popupContent);
    } else {
        markersObject[itemId] = L.marker(latLng, { icon })
            .addTo(mapInstance)
            .bindPopup(popupContent);
        if (onClickHandler) { markersObject[itemId].on('click', () => onClickHandler(itemId)); }
    }
}

export function removeOldMarkers(mapInstance, markersObject, currentItemIds) {
    if (!mapInstance) return;
    Object.keys(markersObject).forEach(markerId => {
        if (!currentItemIds.includes(markerId)) {
            if (mapInstance.hasLayer(markersObject[markerId])) { mapInstance.removeLayer(markersObject[markerId]); }
            delete markersObject[markerId];
        }
    });
}

export function fitMapToBounds(mapInstance, activeMarkers) {
    if (!mapInstance || activeMarkers.length === 0) return;
    const markerLatLngs = activeMarkers.map(marker => marker.getLatLng ? marker.getLatLng() : null).filter(latLng => latLng !== null);
    if (markerLatLngs.length === 0) return;
    const bounds = L.latLngBounds(markerLatLngs);
    if (bounds.isValid()) {
        try { mapInstance.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 }); } catch (e) { SmartLog.warn("FitBounds error", "Map.Util", e); }
    } else { SmartLog.warn("FitBounds called with invalid bounds", "Map.Util", { markerCount: markerLatLngs.length }); }
}

export function calculateRouteDistance(points) { // Helper
    let totalDistance = 0; 
    if (!points || points.length < 2) return 0;
    
    for (let i = 1; i < points.length; i++) { 
        try { 
            const d = L.latLng(points[i-1]).distanceTo(L.latLng(points[i])); 
            totalDistance += d; 
        } catch(e){} 
    } 
    return totalDistance; 
}
