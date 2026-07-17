/*
 * Shared core for the MMM-Earth3D control panel (public/control/*.html).
 *
 * Each page (home.html, planet-env.html, layers.html) marks the fieldsets it
 * contains with a `data-panel="<name>"` attribute. On load, this file scans
 * the page for those attributes, dynamically imports the matching module
 * from panels/<name>.js, and mounts it - so a page only pays for the panels
 * it actually declares, and adding a new config field to a page is just
 * adding a data-panel block to its HTML plus a panels/<name>.js file, no
 * central registry to edit. Real ES modules throughout (this file and every
 * panel), not classic scripts - control.html is fetched directly by a
 * browser hitting the control panel URL, not loaded through MagicMirror's
 * own module script loader (see MMM-Earth3D.js's getScripts()), so there's
 * no extension-sniffing constraint here.
 *
 * A panel module exports:
 *   init(ctx)              - wire up DOM event listeners, once, at load
 *   applyConfig(config, ctx) - reflect the module's resolved config onto the DOM
 * Both are optional. Panels query the DOM directly by element id (ids are
 * unique across a page, same as the control panel's original monolithic
 * script) rather than being scoped to their data-panel container - a single
 * panel name may legitimately appear on more than one container in a page
 * (see planet-env.html's "camera" panel, spanning the Camera and Position
 * fieldsets), so containers are only used to *discover* which panels a page
 * needs, not to scope their queries.
 */

// Mirrors MMM-Earth3D.js's `defaults` - keep in sync if those change.
export const MODULE_DEFAULTS = {
	rotationSpeed: 20,
	atmosphere: { color: "#4aa8ff", altitude: 0.15, opacity: 1 },
	camera: { zoom: 50, rotate: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0, z: 0 } }
};

const statusEl = document.getElementById("status");

function setStatus (message, isError) {
	statusEl.textContent = message;
	statusEl.className = "status" + (isError ? " error" : "");
}

// --- Networking ---------------------------------------------------------

let debounceTimer = null;

// Returns a Promise so callers that need to know the config actually
// settled (theme switches, the theme-management buttons) can chain
// .then(refetch) - plain slider drags just fire-and-forget it.
function send (payload) {
	clearTimeout(debounceTimer);
	return new Promise((resolve, reject) => {
		debounceTimer = setTimeout(() => {
			fetch("/MMM-Earth3D/set-config", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload)
			})
				.then((res) => {
					if (!res.ok) {
						throw new Error("Request failed (" + res.status + ")");
					}
					setStatus("Updated " + new Date().toLocaleTimeString());
					resolve();
				})
				.catch((err) => {
					setStatus(err.message, true);
					reject(err);
				});
		}, 120);
	});
}

function postThemeAction (body) {
	return fetch("/MMM-Earth3D/theme", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	})
		.then((res) => res.json().then((data) => {
			if (!res.ok) {
				throw new Error(data.error || ("Request failed (" + res.status + ")"));
			}
			return data;
		}))
		.then((data) => {
			setStatus(data.message || "Theme updated");
			window.location.reload();
		})
		.catch((err) => setStatus(err.message, true));
}

// --- Resolved config readback --------------------------------------
// The actual field-by-field resolution (theme -> preset -> override)
// happens client-side in MMM-Earth3D.js, in the browser tab running the
// real module - this page has no way to compute it itself, so instead it
// asks node_helper (GET /MMM-Earth3D/config), which relays the question
// to that module instance and answers with whatever it reports back: both
// the fully-resolved config and the sparse userOverrides (the "current
// non-default changes" the theme panel's Save button captures).

let currentConfig = null;
let currentOverrides = {};

function fetchResolvedConfig () {
	return fetch("/MMM-Earth3D/config")
		.then((res) => {
			if (!res.ok) {
				return res.json().then((body) => {
					throw new Error((body && body.error) || ("Request failed (" + res.status + ")"));
				});
			}
			return res.json();
		})
		.then((state) => {
			currentConfig = state.config;
			currentOverrides = state.overrides || {};
			panels.forEach((panel) => panel.applyConfig && panel.applyConfig(currentConfig, ctx));
		})
		.catch((err) => setStatus(err.message, true));
}

// --- Shared DOM helpers -------------------------------------------------

function bindSlider (id, onChange) {
	const input = document.getElementById(id);
	const valueEl = document.getElementById(id + "-val");
	input.addEventListener("input", () => {
		if (valueEl) {
			valueEl.textContent = input.value;
		}
		onChange(Number(input.value));
	});
}

function setSliderValue (id, value) {
	document.getElementById(id).value = value;
	const valueEl = document.getElementById(id + "-val");
	if (valueEl) {
		valueEl.textContent = value;
	}
}

// firstId pulls that preset (e.g. an atmosphere "Disabled" entry) ahead of
// the "Custom" option, since off/on is a more natural first choice than
// jumping straight to manual tuning.
function populatePresetSelect (selectEl, presets, includeCustom, firstId) {
	while (selectEl.firstChild) {
		selectEl.removeChild(selectEl.firstChild);
	}

	const appendOption = (preset) => {
		const option = document.createElement("option");
		option.value = preset.id;
		option.textContent = preset.name;
		selectEl.append(option);
	};

	const firstPreset = firstId ? (presets || []).find((entry) => entry.id === firstId) : null;
	if (firstPreset) {
		appendOption(firstPreset);
	}
	if (includeCustom) {
		appendOption({ id: "custom", name: "Custom" });
	}
	for (const preset of presets || []) {
		if (preset === firstPreset) {
			continue;
		}
		appendOption(preset);
	}
}

function findPreset (assetType, id) {
	const list = (window.EARTH3D_PRESETS && window.EARTH3D_PRESETS[assetType]) || [];
	return list.find((entry) => entry.id === id);
}

// Built-in (presets/themes.js) and user-created (presets/themes-user.js,
// gitignored - see node_helper.js) themes are one combined list; every page
// loads both preset script tags (even pages with no theme dropdown of their
// own) purely so this list - and resolveThemeValue() below - is available
// for reset (↺) buttons to consult the active theme.
const themes = (window.EARTH3D_THEMES || []).concat(window.EARTH3D_USER_THEMES || []);
const defaultThemeIds = new Set((window.EARTH3D_THEMES || []).map((theme) => theme.id));

// Resolves what a field's value would be WITHOUT any manual override: this
// asset's own preset (if selected) -> the active theme's choice for this
// asset -> the hardcoded module default. Used to draw the reset buttons'
// target values. Reads the active theme off the last-fetched resolved
// config (currentConfig.theme) rather than a DOM element, since - unlike
// the old single-page layout - the theme dropdown may live on a different
// page entirely from the reset button being clicked.
function resolveThemeValue (assetType, presetSelectEl, field, deepKey) {
	const presetId = presetSelectEl.value;
	if (presetId !== "custom") {
		const preset = findPreset(assetType, presetId);
		if (preset) {
			const payload = preset[assetType];
			return deepKey ? payload[deepKey][field] : payload[field];
		}
	}

	const themeId = currentConfig ? currentConfig.theme : "custom";
	if (themeId !== "custom") {
		const theme = themes.find((entry) => entry.id === themeId);
		if (theme && theme[assetType]) {
			const preset = findPreset(assetType, theme[assetType]);
			if (preset) {
				const payload = preset[assetType];
				return deepKey ? payload[deepKey][field] : payload[field];
			}
		}
	}

	const fallback = MODULE_DEFAULTS[assetType];
	return deepKey ? fallback[deepKey][field] : fallback[field];
}

// --- Panel context --------------------------------------------------
// Passed to every panel module's init()/applyConfig() - the same shared
// surface a single monolithic script used to close over directly.

const ctx = {
	send,
	postThemeAction,
	setStatus,
	bindSlider,
	setSliderValue,
	populatePresetSelect,
	findPreset,
	resolveThemeValue,
	MODULE_DEFAULTS,
	themes,
	defaultThemeIds,
	getOverrides: () => currentOverrides,
	refetch: fetchResolvedConfig
};

// --- Panel discovery ------------------------------------------------

const panelNames = Array.from(new Set(
	Array.from(document.querySelectorAll("[data-panel]")).map((el) => el.dataset.panel)
));
let panels = [];

Promise.all(panelNames.map((name) => import(`./panels/${name}.js`)))
	.then((modules) => {
		panels = modules;
		panels.forEach((panel) => panel.init && panel.init(ctx));
		return fetchResolvedConfig();
	})
	.catch((err) => setStatus("Failed to load control panel: " + err.message, true));
