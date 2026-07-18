// Shared core for the control panel - scans each page for [data-panel="<name>"], dynamically imports panels/<name>.js, and mounts it (exports: init(ctx), applyConfig(config, ctx)).

// Mirrors MMM-Planet3D.js's `defaults` - keep in sync if those change.
export const MODULE_DEFAULTS = {
	rotationSpeed: 20,
	atmosphere: { color: "#4aa8ff", altitude: 0.15, opacity: 1, strength: 1, fadeIn: 8 },
	camera: { zoom: 50, rotate: { x: 0, y: 0, z: 0 }, position: { x: 0, y: 0 } },
	background: {
		starfield: { count: 6600, size: 1, sizeVariation: 0.5, color: "#ffffff", colorVariation: 0.4, effectVariation: 0, effectSpeed: 1 }
	},
	dayNight: { mode: "disabled", rotate: 0 },
	clouds: {
		opacity: 0.8, contrast: 1, speed: 1, speedVariation: 1,
		secondary: { opacity: 1, contrast: 1, speed: 1, speedVariation: 1 }
	}
};

const statusEl = document.getElementById("status");

function setStatus (message, isError) {
	statusEl.textContent = message;
	statusEl.className = "status" + (isError ? " error" : "");
}

// --- Networking ---------------------------------------------------------

let debounceTimer = null;

// Returns a Promise so callers that need it can chain .then(refetch) - plain slider drags just fire-and-forget it.
function send (payload) {
	clearTimeout(debounceTimer);
	return new Promise((resolve, reject) => {
		debounceTimer = setTimeout(() => {
			fetch("/MMM-Planet3D/set-config", {
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
	return fetch("/MMM-Planet3D/theme", {
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

// --- Resolved config readback: asks node_helper (GET /MMM-Planet3D/config), which relays to the real module instance for the actual resolution ---

let currentConfig = null;
let currentOverrides = {};

function fetchResolvedConfig () {
	return fetch("/MMM-Planet3D/config")
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

// firstId pulls that preset (e.g. an atmosphere "Disabled" entry) ahead of the "Custom" option.
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
	const list = (window.PLANET3D_PRESETS && window.PLANET3D_PRESETS[assetType]) || [];
	return list.find((entry) => entry.id === id);
}

// Built-in and user-created (gitignored presets/themes-user.js) themes as one combined list, for resolveThemeValue() below and reset (↺) buttons.
const themes = (window.PLANET3D_THEMES || []).concat(window.PLANET3D_USER_THEMES || []);
const defaultThemeIds = new Set((window.PLANET3D_THEMES || []).map((theme) => theme.id));

// Reads one field out of an asset payload, tolerating a missing deepKey sub-object instead of throwing.
function readField (payload, field, deepKey) {
	if (!payload) {
		return undefined;
	}
	return deepKey ? (payload[deepKey] || {})[field] : payload[field];
}

// Resolves a field without any manual override: own preset dropdown (null if none, e.g. clouds/dayNight) -> active theme -> module default. Feeds the reset (↺) buttons.
function resolveThemeValue (assetType, presetSelectEl, field, deepKey) {
	const presetId = presetSelectEl ? presetSelectEl.value : "custom";
	if (presetId !== "custom") {
		const preset = findPreset(assetType, presetId);
		const value = readField(preset && preset[assetType], field, deepKey);
		if (value !== undefined) {
			return value;
		}
	}

	const themeId = currentConfig ? currentConfig.theme : "custom";
	if (themeId !== "custom") {
		const theme = themes.find((entry) => entry.id === themeId);
		const themeValue = theme ? theme[assetType] : undefined;
		if (typeof themeValue === "string") {
			const preset = findPreset(assetType, themeValue);
			const value = readField(preset && preset[assetType], field, deepKey);
			if (value !== undefined) {
				return value;
			}
		} else {
			const value = readField(themeValue, field, deepKey);
			if (value !== undefined) {
				return value;
			}
		}
	}

	return readField(MODULE_DEFAULTS[assetType], field, deepKey);
}

// --- Panel context: passed to every panel module's init()/applyConfig() ---

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
	getConfig: () => currentConfig,
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
