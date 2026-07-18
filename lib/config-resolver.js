
// Config-resolution engine for MMM-Planet3D.js: theme + preset + override -> this.config. Plain classic script (see public/vendor/suncalc.js for the pattern), functions take the module instance explicitly instead of using `this`.
window.MMMPlanet3DConfigResolver = {
	// --- Preset/theme validation: runs once at startup, drops a malformed preset with a warning instead of crashing the module ---

	validatePresets: function (moduleInstance, list, assetType, requiredFields) {
		if (!Array.isArray(list)) {
			return [];
		}
		return list.filter((preset) => {
			if (!preset || typeof preset.id !== "string" || typeof preset.name !== "string") {
				Log.warn(moduleInstance.name + ": skipping malformed " + assetType + " preset (missing id/name)");
				return false;
			}
			const payload = preset[assetType];
			if (!payload || typeof payload !== "object") {
				Log.warn(moduleInstance.name + ": skipping " + assetType + ' preset "' + preset.id + '" (missing ' + assetType + " payload)");
				return false;
			}
			for (let i = 0; i < requiredFields.length; i++) {
				if (payload[requiredFields[i]] === undefined) {
					Log.warn(moduleInstance.name + ": skipping " + assetType + ' preset "' + preset.id + '" (missing field "' + requiredFields[i] + '")');
					return false;
				}
			}
			return true;
		});
	},

	validateThemes: function (moduleInstance, list) {
		if (!Array.isArray(list)) {
			return [];
		}
		return list.filter((theme) => {
			if (!theme || typeof theme.id !== "string" || typeof theme.name !== "string") {
				Log.warn(moduleInstance.name + ": skipping malformed theme (missing id/name)");
				return false;
			}
			return true;
		});
	},

	// --- Config resolution: MM's default merge is shallow (a set atmosphere.altitude loses sibling fields), so the raw override is captured here to re-apply as the highest-priority layer after theme/preset resolution ---

	captureUserOverrides: function (moduleInstance) {
		const self = window.MMMPlanet3DConfigResolver;
		moduleInstance.userOverrides = {
			rotationSpeed: moduleInstance.config.rotationSpeed !== moduleInstance.defaults.rotationSpeed ? moduleInstance.config.rotationSpeed : undefined,
			quality: moduleInstance.config.quality !== moduleInstance.defaults.quality ? moduleInstance.config.quality : undefined,
			atmosphere: self.captureOverride(moduleInstance, "atmosphere"),
			texture: self.captureOverride(moduleInstance, "texture"),
			background: self.captureOverride(moduleInstance, "background", ["starfield"]),
			camera: self.captureOverride(moduleInstance, "camera", ["rotate", "position"]),
			dayNight: self.captureOverride(moduleInstance, "dayNight"),
			clouds: self.captureOverride(moduleInstance, "clouds", ["secondary"]),
			flights: self.captureOverride(moduleInstance, "flights"),
			city: self.captureOverride(moduleInstance, "city")
		};
	},

	captureOverride: function (moduleInstance, key, deepKeys) {
		const self = window.MMMPlanet3DConfigResolver;
		const raw = moduleInstance.config[key];
		if (raw === moduleInstance.defaults[key]) {
			return null;
		}
		const copy = Object.assign({}, raw);
		(deepKeys || []).forEach((deepKey) => {
			if (raw[deepKey]) {
				copy[deepKey] = self.normalizeVec3(raw[deepKey]);
			}
		});
		return copy;
	},

	// Resolves theme + per-asset preset + explicit overrides into a complete this.config - used at start() and via applyLiveConfig on live updates, one path for both.
	resolveConfig: function (moduleInstance) {
		const self = window.MMMPlanet3DConfigResolver;
		const theme = moduleInstance.config.theme !== "custom"
			? window.PLANET3D_THEMES.find((entry) => entry.id === moduleInstance.config.theme)
			: null;
		if (moduleInstance.config.theme !== "custom" && !theme) {
			Log.warn(moduleInstance.name + ': no theme with id "' + moduleInstance.config.theme + '", using custom values instead');
		}

		moduleInstance.config.rotationSpeed = self.resolveScalar(moduleInstance, "rotationSpeed", theme);
		moduleInstance.config.quality = self.resolveScalar(moduleInstance, "quality", theme);

		self.resolveAssetConfig(moduleInstance, "atmosphere", theme, []);
		self.resolveAssetConfig(moduleInstance, "texture", theme, []);
		self.resolveAssetConfig(moduleInstance, "background", theme, ["starfield"]);
		self.resolveAssetConfig(moduleInstance, "camera", theme, ["rotate", "position"]);
		self.resolveDirectConfig(moduleInstance, "dayNight", theme, []);
		self.resolveDirectConfig(moduleInstance, "clouds", theme, ["secondary"]);
		self.resolveDirectConfig(moduleInstance, "flights", theme, []);
		self.resolveCity(moduleInstance);
	},

	// city isn't preset/theme-driven - a ";"-separated list of names, one marker per name, each resolved via a live geocode lookup (node_helper.js/lib/geocoder.js); top-level lat/lng/matchedName mirror the first entry.
	resolveCity: function (moduleInstance) {
		const override = moduleInstance.userOverrides.city;
		const name = (override && override.name !== undefined) ? override.name : moduleInstance.defaults.city.name;
		const cities = String(name || "").split(";")
			.map((part) => part.trim())
			.filter(Boolean)
			.map((part) => ({
				name: part,
				lat: null,
				lng: null,
				matchedName: null
			}));
		moduleInstance.config.city = {
			name,
			cities,
			lat: cities.length ? cities[0].lat : null,
			lng: cities.length ? cities[0].lng : null,
			matchedName: cities.length ? cities[0].matchedName : null
		};
	},

	// Plain top-level values (rotationSpeed, quality): override > theme > default.
	resolveScalar: function (moduleInstance, key, theme) {
		if (moduleInstance.userOverrides[key] !== undefined) {
			return moduleInstance.userOverrides[key];
		}
		if (theme && theme[key] !== undefined) {
			return theme[key];
		}
		return moduleInstance.defaults[key];
	},

	// atmosphere/texture/camera: a theme can point at another preset's id (string) or supply literal values inline (object) - either way, unmentioned fields fall back to the module default.
	resolveAssetConfig: function (moduleInstance, assetType, theme, deepKeys) {
		const self = window.MMMPlanet3DConfigResolver;
		const defaults = moduleInstance.defaults[assetType];
		const override = moduleInstance.userOverrides[assetType];

		const resolved = Object.assign({}, defaults);
		deepKeys.forEach((key) => {
			resolved[key] = Object.assign({}, defaults[key]);
		});

		const themeValue = theme ? theme[assetType] : undefined;

		if (themeValue && typeof themeValue === "object") {
			self.mergeAssetPayload(resolved, themeValue, deepKeys);
			resolved.preset = "custom";
		} else {
			const presetId = (override && override.preset !== undefined) ? override.preset
				: (themeValue !== undefined) ? themeValue
					: defaults.preset;

			if (presetId && presetId !== "custom") {
				const preset = (window.PLANET3D_PRESETS[assetType] || []).find((entry) => entry.id === presetId);
				if (preset) {
					self.mergeAssetPayload(resolved, preset[assetType], deepKeys);
				} else {
					Log.warn(moduleInstance.name + ": no " + assetType + ' preset with id "' + presetId + '"');
				}
			}
			resolved.preset = presetId || "custom";
		}

		if (override) {
			self.mergeAssetPayload(resolved, override, deepKeys);
			if (override.preset !== undefined) {
				resolved.preset = override.preset;
			}
		}

		moduleInstance.config[assetType] = resolved;
	},

	// dayNight/clouds: no preset-registry indirection, just default < theme's inline object < user override.
	resolveDirectConfig: function (moduleInstance, key, theme, deepKeys) {
		const self = window.MMMPlanet3DConfigResolver;
		const defaults = moduleInstance.defaults[key];
		const override = moduleInstance.userOverrides[key];

		const resolved = Object.assign({}, defaults);
		deepKeys.forEach((k) => {
			resolved[k] = Object.assign({}, defaults[k]);
		});

		if (theme && theme[key]) {
			self.mergeAssetPayload(resolved, theme[key], deepKeys);
		}
		if (override) {
			self.mergeAssetPayload(resolved, override, deepKeys);
		}

		moduleInstance.config[key] = resolved;
	},

	// Shared by preset/theme/override merging: copies payload's fields onto resolved, normalizing [x,y,z] shorthand into {x,y,z} for deep fields.
	mergeAssetPayload: function (resolved, payload, deepKeys) {
		const self = window.MMMPlanet3DConfigResolver;
		Object.keys(payload).forEach((key) => {
			if (deepKeys.indexOf(key) !== -1 || key === "preset") {
				return;
			}
			resolved[key] = payload[key];
		});
		deepKeys.forEach((key) => {
			if (payload[key] !== undefined) {
				resolved[key] = Object.assign({}, resolved[key], self.normalizeVec3(payload[key]));
			}
		});
	},

	// Merges a live-update patch into the tracked override - a field value of `null` deletes the key so resolveConfig() falls through to preset/theme/default again, instead of pinning a stale resolved value.
	mergeOverride: function (moduleInstance, assetType, patch, deepKeys) {
		const self = window.MMMPlanet3DConfigResolver;
		// Deliberately {} not a copy of moduleInstance.defaults[assetType] - an override must stay sparse, or a single-field update would bake in and discard the rest of a theme's asset payload.
		const existing = moduleInstance.userOverrides[assetType] || {};
		const merged = Object.assign({}, existing);

		Object.keys(patch).forEach((key) => {
			if ((deepKeys || []).indexOf(key) !== -1) {
				return;
			}
			if (patch[key] === null) {
				delete merged[key];
			} else {
				merged[key] = patch[key];
			}
		});

		(deepKeys || []).forEach((key) => {
			if (!patch[key]) {
				return;
			}
			merged[key] = Object.assign({}, existing[key]);
			const normalized = self.normalizeVec3(patch[key]);
			Object.keys(normalized).forEach((subKey) => {
				if (normalized[subKey] === null) {
					delete merged[key][subKey];
				} else {
					merged[key][subKey] = normalized[subKey];
				}
			});
		});

		moduleInstance.userOverrides[assetType] = merged;
	},

	// Accepts [x, y, z] (any axis omittable) or {x, y, z} and always returns {x, y, z}, so rotate/position fields can be written either way.
	normalizeVec3: function (value) {
		if (!Array.isArray(value)) {
			return value;
		}
		const result = {};
		if (value[0] !== undefined) {
			result.x = value[0];
		}
		if (value[1] !== undefined) {
			result.y = value[1];
		}
		if (value[2] !== undefined) {
			result.z = value[2];
		}
		return result;
	}
};
