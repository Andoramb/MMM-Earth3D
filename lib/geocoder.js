const fs = require("fs");
const path = require("path");
const Log = require("logger");

// Live geocoding for config.city.name entries - OpenStreetMap Nominatim (free, no key), used for any place/POI, not just cities.

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "MMM-Planet3D/1.0 (https://github.com/Andoramb/MMM-Planet3D)";
const MIN_REQUEST_GAP_MS = 1000; // Nominatim usage policy: max 1 request/second

const CACHE_FILE = path.join(__dirname, "..", "presets", ".geocode-cache.json");

let cache = loadCache();
let lastRequestAt = 0;

function loadCache() {
	try {
		if (!fs.existsSync(CACHE_FILE)) {
			return new Map();
		}
		const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
		return new Map(Object.entries(parsed));
	} catch (err) {
		Log.warn("[MMM-Planet3D geocoder] could not read presets/.geocode-cache.json (" + err.message + ") - starting with an empty cache");
		return new Map();
	}
}

function saveCache() {
	try {
		fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(cache), null, "\t") + "\n");
	} catch (err) {
		Log.warn("[MMM-Planet3D geocoder] could not write presets/.geocode-cache.json (" + err.message + ")");
	}
}

async function waitForRateLimit() {
	const elapsed = Date.now() - lastRequestAt;
	if (elapsed < MIN_REQUEST_GAP_MS) {
		await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_GAP_MS - elapsed));
	}
	lastRequestAt = Date.now();
}

async function geocode(query) {
	const key = String(query || "").trim().toLowerCase();
	if (!key) {
		return null;
	}
	if (cache.has(key)) {
		return cache.get(key);
	}

	let result = null;
	try {
		await waitForRateLimit();
		const url = NOMINATIM_URL + "?format=json&q=" + encodeURIComponent(key) + "&limit=1";
		const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
		if (!res.ok) {
			throw new Error("Nominatim request failed (" + res.status + ")");
		}
		const data = await res.json();
		if (Array.isArray(data) && data.length) {
			result = {
				lat: parseFloat(data[0].lat),
				lng: parseFloat(data[0].lon),
				matchedName: data[0].display_name
			};
		}
	} catch (err) {
		Log.warn("[MMM-Planet3D geocoder] lookup for \"" + query + "\" failed (" + err.message + ")");
		return null;
	}

	cache.set(key, result);
	saveCache();
	return result;
}

module.exports = { geocode };
