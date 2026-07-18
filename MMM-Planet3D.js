/* global Module, MMMPlanet3DConfigResolver, window */

// MMM-Planet3D: a MagicMirror module for a rotating 3D planet (three-globe/Three.js).
Module.register("MMM-Planet3D", {
	// Default module config.
	defaults: {
		// null = auto: fills the screen on a fullscreen_* position, or falls back to 500x500 on a normal position. Set both to force a fixed pixel size.
		width: null,
		height: null,

		rotationSpeed: 20, // 0-100, spin speed around the globe's own polar axis

		theme: "custom", // string id from presets/themes.js, or "custom" to use the asset configs below

		atmosphere: {
			preset: "custom", // string id from presets/atmosphere.js, or "custom" for the fields below
			color: "#4aa8ff",
			altitude: 0.15,
			opacity: 1,
			strength: 1, // glow intensity multiplier, 1 = three-globe's default
			fadeIn: 8 // degrees in from the limb over which the inward haze layer ramps up to full brightness (see AtmosphereFadeLayer.mjs)
		},

		texture: {
			preset: "blue-marble", // string id from presets/earthTextures.js, or "custom" with imageUrl/bumpImageUrl below
			imageUrl: null,
			bumpImageUrl: null
		},

		background: {
			enabled: false, // off by default - opt in once you've picked a look you like
			preset: "night-sky", // string id from presets/backgrounds.js, or "custom" with imageUrl below
			imageUrl: null,
			// Live tuning for the "star-particles" preset - see StarfieldLayer.mjs's DEFAULT_CONFIG (kept in sync with these).
			starfield: {
				count: 6600, // total stars across all 4 depth layers
				size: 1, // multiplier on each layer's base point size
				sizeVariation: 0.5, // 0-1, per-star size randomness spread
				color: "#ffffff", // base star color
				colorVariation: 0.4, // 0-1, hue/saturation scatter away from color
				fading: true, // breathing/twinkle size pulse
				effectVariation: 0, // 0-1, desyncs each star's twinkle phase (0 = all pulse in unison)
				effectSpeed: 1 // multiplier on each layer's base twinkle speed
			}
		},

		camera: {
			preset: "custom", // string id from presets/camera.js, or "custom" for the fields below
			zoom: 50, // 0-100, 0 = far (zoomed out), 100 = close (zoomed in)
			rotate: { x: 0, y: 0, z: 0 }, // degrees, fixed tilt of the globe's resting orientation - also accepts [x, y, z]
			position: { x: 0, y: 0 } // scene-unit offset (globe radius = 100 units, not CSS pixels) - also accepts [x, y]; also live-settable by Shift+drag on the display itself (see Planet3DRenderer.mjs's setupInteraction())
		},

		quality: "medium", // low | medium | high | ultra

		dayNight: {
			mode: "disabled", // "disabled" | "realtime" | "custom"
			rotate: 0 // degrees, terminator angle - only used when mode is "custom"
		},

		clouds: {
			enabled: false,
			source: "static", // "static" (vendored Blue Marble clouds) | "realtime" (NASA GIBS, polled every 24h - that's how often the underlying satellite composite actually updates) | "dynamic" (same vendored texture, animated with a layered/noise-warped shader for a more lifelike drift - no network)
			opacity: 0.8, // 0-1
			contrast: 1, // multiplier on the base layer's texture contrast, 1 = unchanged
			speed: 1, // multiplier on the base layer's rotation speed, 1 = unchanged
			speedVariation: 1, // multiplier on the base layer's speed-wobble magnitude, 1 = unchanged
			nightDarken: 0.85, // 0-1, how much darker clouds get on the night side (see PlanetCompositor's dayNight.mode) - 0 = clouds never darken, 1 = fully black
			alphaCutoff: 0, // 0-1, fades out cloud fragments whose texture alpha (cloud density) is below this (with a soft feathered edge, not a hard cut) instead of blending them at full strength - 0 disables (default), higher values punch out thin/hazy wisps for a more defined cloud shape
			secondary: { // high-altitude layer, only used when source is "dynamic" ("Dual")
				opacity: 1, // multiplier on the secondary layer's own opacity formula, 1 = unchanged
				contrast: 1, // multiplier on the secondary layer's texture contrast, 1 = unchanged
				speed: 1, // multiplier on the secondary layer's rotation speed, 1 = unchanged
				speedVariation: 1 // multiplier on the secondary layer's speed-wobble magnitude, 1 = unchanged
			}
		},

		// Session/operational, not a visual look - excluded from theme switching and "Save into theme" (see SKILL.md); node_helper's poller learns this over PLANET3D_FLIGHTS_STATE.
		flights: {
			enabled: false, // shows the tracked flight's marker and drives node_helper's OpenSky polling
			flightNumber: "", // IATA flight number, e.g. "UA123" - resolved to an OpenSky callsign server-side (see lib/iataToIcaoAirlines.js)
			track: false, // true = globe/background rotate to keep the tracked flight centered on camera (see Planet3DRenderer.tick()); false = normal camera behavior
			pollInterval: 20 // seconds between OpenSky polls while enabled, 10-300
		},

		city: {
			name: "" // ";"-separated list of place/POI names, each resolved via live Nominatim geocoding (node_helper.js) - one marker per name. Empty = no marker.
		},

		// OpenSky OAuth2 client credentials for the registered tier - config.js-only, kept out of `flights`/`this.config` entirely since the latter is echoed verbatim over the LAN and persisted into theme files. Set directly: flightCredentials: { clientId, clientSecret } (or manage live via POST /MMM-Planet3D/flights/credentials - config.js wins on restart if both are used).
		flightCredentials: null,

		debug: false // logs every live-config notification and apply*() call to the browser console via Log.info
	},

	// Every default field above can also be set directly inside a presets/themes.js entry (id reference or literal values) - see "Custom themes" in README.md.

	renderer: null,
	userOverrides: null,
	serverTimeOffsetMs: 0,
	pendingGeocodeNames: null,
	pendingCityCenter: false,

	debugLog: function () {
		if (!this.config || !this.config.debug) {
			return;
		}
		Log.info.apply(Log, ["[MMM-Planet3D:" + this.identifier + "]"].concat(Array.prototype.slice.call(arguments)));
	},

	start: function () {
		Log.info("Starting module: " + this.name);

		// MM's per-module socket is lazily created only by sendSocketNotification() - calling socket() directly establishes it so node_helper's un-prompted emits actually have a listener.
		this.socket();

		// Asks node_helper (on the actual MagicMirror host) for its clock, not whatever machine's browser is viewing this page - stays 0 (trust this browser) until the reply arrives.
		this.serverTimeOffsetMs = 0;
		this.sendSocketNotification("PLANET3D_REQUEST_SERVER_TIME");

		window.PLANET3D_PRESETS = window.PLANET3D_PRESETS || {};
		window.PLANET3D_PRESETS.atmosphere = this.validatePresets(window.PLANET3D_PRESETS.atmosphere, "atmosphere", ["color", "altitude"]);
		window.PLANET3D_PRESETS.texture = this.validatePresets(window.PLANET3D_PRESETS.texture, "texture", ["images"]);
		// No single required field - a background preset is either image-based (imageUrl) or
		// particle-based (starfield: true, see presets/backgrounds.js/StarfieldLayer.mjs).
		window.PLANET3D_PRESETS.background = this.validatePresets(window.PLANET3D_PRESETS.background, "background", []);
		window.PLANET3D_PRESETS.camera = this.validatePresets(window.PLANET3D_PRESETS.camera, "camera", ["zoom", "rotate", "position"]);
		// User-created themes (gitignored presets/themes-user.js) are merged in after the shipped defaults into one combined list.
		window.PLANET3D_THEMES = this.validateThemes((window.PLANET3D_THEMES || []).concat(window.PLANET3D_USER_THEMES || []));

		this.pendingGeocodeNames = new Set();

		this.captureUserOverrides();
		this.resolveConfig();
		this.requestGeocodeForUnresolvedCities();
		this.sendFlightsState();
		this.sendFlightCredentials();
	},

	getStyles: function () {
		return [this.file("css/MMM-Planet3D.css")];
	},

	// ES-module assets (Planet3DRenderer.mjs + its renderer/*.mjs submodules, CloudsLayer.mjs, three.js, three-globe, OrbitControls) are NOT listed here - MM core's getScripts() extension-sniffing can silently no-op on them, so notificationReceived()'s DOM_OBJECTS_CREATED handler loads Planet3DRenderer.mjs itself via dynamic import(). Do NOT append "?v=" cache-busters to these URLs (tried, reverted - broke MM core's own script-vs-style detection entirely). public/vendor/suncalc.js is deliberately vendored, not MM core's own window.SunCalc (incompatible units/versions across core releases).
	getScripts: function () {
		this.cacheBust = Date.now();
		return [
			this.file("public/vendor/suncalc.js"),
			this.file("lib/config-resolver.js"),
			this.file("presets/atmosphere.js"),
			this.file("presets/earthTextures.js"),
			this.file("presets/backgrounds.js"),
			this.file("presets/camera.js"),
			this.file("presets/themes.js"),
			this.file("presets/themes-user.js"),
			this.file("public/PlanetCompositor.js")
		];
	},

	// --- Preset/theme validation and config resolution: see lib/config-resolver.js ---

	validatePresets: function (list, assetType, requiredFields) {
		return MMMPlanet3DConfigResolver.validatePresets(this, list, assetType, requiredFields);
	},

	validateThemes: function (list) {
		return MMMPlanet3DConfigResolver.validateThemes(this, list);
	},

	captureUserOverrides: function () {
		MMMPlanet3DConfigResolver.captureUserOverrides(this);
	},

	resolveConfig: function () {
		MMMPlanet3DConfigResolver.resolveConfig(this);
	},

	resolveCity: function () {
		MMMPlanet3DConfigResolver.resolveCity(this);
	},

	// Every city.cities entry is resolved via a live Nominatim lookup through node_helper - deduped against pendingGeocodeNames so a slow reply isn't re-requested by a later resolveConfig() call.
	requestGeocodeForUnresolvedCities: function () {
		const batch = [];
		this.config.city.cities.forEach((city) => {
			if (city.lat === null && !this.pendingGeocodeNames.has(city.name)) {
				this.pendingGeocodeNames.add(city.name);
				batch.push(city.name);
			}
		});
		if (batch.length) {
			this.sendSocketNotification("PLANET3D_GEOCODE_REQUEST", { names: batch });
		}
	},

	mergeOverride: function (assetType, patch, deepKeys) {
		MMMPlanet3DConfigResolver.mergeOverride(this, assetType, patch, deepKeys);
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "MMM-Planet3D";
		wrapper.id = "planet3d-" + this.identifier;

		if (typeof this.config.width === "number" && typeof this.config.height === "number") {
			wrapper.style.width = this.config.width + "px";
			wrapper.style.height = this.config.height + "px";
		} else if (this.isFullscreenPosition()) {
			// position:fixed to the viewport sidesteps MM's region/container chain, so the globe fills the screen instead of needing a guessed size.
			wrapper.classList.add("MMM-Planet3D--fullscreen");
		} else {
			Log.warn(this.name + ": width/height not set and position \"" + this.data.position
				+ "\" isn't fullscreen_above/below, so the module can't auto-size from layout alone - "
				+ "falling back to 500x500. Set width/height explicitly, or use a fullscreen_* position.");
			wrapper.style.width = "500px";
			wrapper.style.height = "500px";
		}

		return wrapper;
	},

	isFullscreenPosition: function () {
		return typeof this.data.position === "string" && this.data.position.indexOf("fullscreen") === 0;
	},

	// The renderer needs the container attached to the live DOM to measure its size, so it's built after MM's initial DOM pass completes.
	notificationReceived: function (notification, payload) {
		if (notification === "DOM_OBJECTS_CREATED") {
			this.debugLog("DOM_OBJECTS_CREATED - loading Planet3DRenderer.mjs");
			const container = document.getElementById("planet3d-" + this.identifier);
			// this.file() returns a root-relative path with no leading "/" (fine for a <script src>/getScripts() URL, but import()'s specifier resolution treats that as an invalid bare module specifier) - the leading "/" makes it a real absolute path.
			import("/" + this.file("public/Planet3DRenderer.mjs") + (this.cacheBust ? ("?v=" + this.cacheBust) : ""))
				.then((module) => {
					this.renderer = new module.Planet3DRenderer(container, this.config, this.cacheBust, (patch) => this.handleInteractiveCameraChange(patch));
					this.renderer.setServerTimeOffset(this.serverTimeOffsetMs);
				})
				.catch((err) => {
					Log.error(this.name + ": failed to load Planet3DRenderer.mjs (" + err.message + ") - globe will not render");
				});
			return;
		}

		if (notification === "PLANET3D_SET_CONFIG") {
			this.handleSetConfig("notification", payload);
		}
	},

	// Same live-tune entry point as notificationReceived's PLANET3D_SET_CONFIG, but from this module's own node_helper (POST /MMM-Planet3D/set-config), which is what control.html actually uses.
	socketNotificationReceived: function (notification, payload) {
		if (notification === "PLANET3D_SET_CONFIG") {
			this.handleSetConfig("socket", payload);
			return;
		}

		if (notification === "PLANET3D_SERVER_TIME") {
			this.serverTimeOffsetMs = payload.now - Date.now();
			this.debugLog("PLANET3D_SERVER_TIME", payload, "offsetMs:", this.serverTimeOffsetMs);
			if (this.renderer) {
				this.renderer.setServerTimeOffset(this.serverTimeOffsetMs);
			}
			return;
		}

		// Live position from node_helper's OpenSky poller - not a config change, so bypasses handleSetConfig()/applyLiveConfig() and goes straight to the renderer.
		if (notification === "PLANET3D_FLIGHT_POSITION") {
			this.debugLog("PLANET3D_FLIGHT_POSITION", payload);
			if (this.renderer) {
				this.renderer.updateFlightPosition(payload);
			}
			return;
		}

		// Reply to PLANET3D_GEOCODE_REQUEST - updates the matching city.cities entry in place and refreshes the marker/centering as each name resolves, rather than waiting on the whole batch.
		if (notification === "PLANET3D_GEOCODE_RESULT") {
			this.pendingGeocodeNames.delete(payload.name);
			const city = this.config.city.cities.find((entry) => entry.name === payload.name);
			if (!city) {
				return;
			}
			city.lat = payload.lat;
			city.lng = payload.lng;
			city.matchedName = payload.matchedName;
			const cities = this.config.city.cities;
			this.config.city.lat = cities.length ? cities[0].lat : null;
			this.config.city.lng = cities.length ? cities[0].lng : null;
			this.config.city.matchedName = cities.length ? cities[0].matchedName : null;
			if (this.renderer) {
				this.renderer.applyCity();
			}
			if (this.pendingCityCenter && cities.length && cities[0].name === payload.name) {
				this.pendingCityCenter = false;
				if (this.renderer && this.config.city.lat !== null) {
					this.renderer.centerOnCity(this.config.city.lat, this.config.city.lng);
				}
			}
			return;
		}

		// control.html's Home page buttons need the resolved config/overrides - answered via node_helper's GET /MMM-Planet3D/config, which relays the request/reply here.
		if (notification === "PLANET3D_REQUEST_CONFIG") {
			// this.config.flightCredentials is never sent here - the exact "echoed back verbatim over the LAN" path defaults.flightCredentials exists to protect against.
			const safeConfig = Object.assign({}, this.config);
			delete safeConfig.flightCredentials;
			this.sendSocketNotification("PLANET3D_CONFIG_STATE", {
				config: safeConfig,
				overrides: this.userOverrides
			});
		}
	},

	// Shared by both delivery paths above - warns unconditionally when the renderer isn't ready yet, since a dropped update is otherwise completely silent.
	handleSetConfig: function (via, payload) {
		this.debugLog("PLANET3D_SET_CONFIG via " + via, JSON.stringify(payload), "renderer ready:", Boolean(this.renderer));
		if (!this.renderer) {
			Log.warn(this.name + ": PLANET3D_SET_CONFIG received via " + via + " before the renderer was ready - ignoring: " + JSON.stringify(payload));
			return;
		}
		this.applyLiveConfig(payload || {});
	},

	// Fired by Planet3DRenderer.mjs's Shift+drag/scroll interaction once a gesture ends - the renderer already reflects the change live, this just pins it into the tracked override so it survives future resolveConfig() calls and shows up next time control.html reads this.config over PLANET3D_REQUEST_CONFIG.
	handleInteractiveCameraChange: function (patch) {
		this.debugLog("handleInteractiveCameraChange", JSON.stringify(patch));
		this.mergeOverride("camera", Object.assign({ preset: "custom" }, patch), ["rotate", "position"]);
		this.resolveConfig();
	},

	// Tells node_helper's flight tracker the resolved flights config, so its OpenSky polling stays in sync regardless of which of the three ways a config change can arrive.
	sendFlightsState: function () {
		this.sendSocketNotification("PLANET3D_FLIGHTS_STATE", this.config.flights);
	},

	// A completely separate path from sendFlightsState() (see defaults.flightCredentials) - only sent once at start(), since config.js doesn't change without a restart.
	sendFlightCredentials: function () {
		const creds = this.config.flightCredentials;
		if (creds && creds.clientId && creds.clientSecret) {
			this.sendSocketNotification("PLANET3D_FLIGHT_CREDENTIALS", { clientId: creds.clientId, clientSecret: creds.clientSecret });
		}
	},

	// Live-tunes the running globe without a page reload - reachable via this module's own node_helper (POST /MMM-Planet3D/set-config, what control.html uses) or MMM-Remote-Control's generic notification API.
	applyLiveConfig: function (partial) {
		const themeChanged = partial.theme !== undefined;

		// Picking a theme means "give me that theme's whole look" - clear a field's override (unless this same payload also sets it directly) so an earlier override doesn't permanently outrank every future theme switch.
		if (themeChanged) {
			if (partial.rotationSpeed === undefined) {
				this.userOverrides.rotationSpeed = undefined;
			}
			if (partial.quality === undefined) {
				this.userOverrides.quality = undefined;
			}
			["atmosphere", "texture", "background", "camera", "dayNight", "clouds"].forEach((key) => {
				if (partial[key] === undefined) {
					this.userOverrides[key] = null;
				}
			});
		}

		if (partial.rotationSpeed !== undefined) {
			this.userOverrides.rotationSpeed = partial.rotationSpeed === null ? undefined : partial.rotationSpeed;
		}
		if (partial.quality !== undefined) {
			this.userOverrides.quality = partial.quality === null ? undefined : partial.quality;
		}
		if (themeChanged) {
			this.config.theme = partial.theme;
		}

		const atmosphereChanged = Boolean(partial.atmosphere);
		const textureChanged = Boolean(partial.texture);
		const backgroundChanged = Boolean(partial.background);
		const cameraChanged = Boolean(partial.camera);
		const dayNightChanged = Boolean(partial.dayNight);
		const cloudsChanged = Boolean(partial.clouds);
		const flightsChanged = Boolean(partial.flights);

		// "center" is a one-shot action, not persisted state - stripped out here so it never bakes into userOverrides.city and re-triggers on every future resolve.
		const cityPatch = partial.city ? Object.assign({}, partial.city) : null;
		const shouldCenterCity = Boolean(cityPatch && cityPatch.center);
		if (cityPatch) {
			delete cityPatch.center;
		}
		const cityChanged = Boolean(cityPatch && Object.keys(cityPatch).length > 0);

		this.debugLog("applyLiveConfig flags", { themeChanged, atmosphereChanged, textureChanged, backgroundChanged, cameraChanged, dayNightChanged, cloudsChanged, flightsChanged, cityChanged, shouldCenterCity, rotationSpeedChanged: partial.rotationSpeed !== undefined, qualityChanged: partial.quality !== undefined });

		if (atmosphereChanged) {
			this.mergeOverride("atmosphere", partial.atmosphere, []);
		}
		if (textureChanged) {
			this.mergeOverride("texture", partial.texture, []);
		}
		if (backgroundChanged) {
			this.mergeOverride("background", partial.background, ["starfield"]);
		}
		if (cameraChanged) {
			this.mergeOverride("camera", partial.camera, ["rotate", "position"]);
		}
		if (dayNightChanged) {
			this.mergeOverride("dayNight", partial.dayNight, []);
		}
		if (cloudsChanged) {
			this.mergeOverride("clouds", partial.clouds, ["secondary"]);
		}
		if (flightsChanged) {
			this.mergeOverride("flights", partial.flights, []);
		}
		if (cityChanged) {
			this.mergeOverride("city", cityPatch, []);
		}

		const previousQuality = this.config.quality;

		if (themeChanged || atmosphereChanged || textureChanged || backgroundChanged || cameraChanged
			|| dayNightChanged || cloudsChanged || flightsChanged || cityChanged
			|| partial.rotationSpeed !== undefined || partial.quality !== undefined) {
			this.resolveConfig();
			this.requestGeocodeForUnresolvedCities();
			// flightCredentials redacted even in debug output.
			const debugConfig = Object.assign({}, this.config);
			if (debugConfig.flightCredentials) {
				debugConfig.flightCredentials = "[redacted]";
			}
			this.debugLog("resolved config after applyLiveConfig", JSON.stringify(debugConfig));
		}

		if (themeChanged || partial.rotationSpeed !== undefined) {
			this.renderer.applyRotationSpeed();
		}
		if (themeChanged || atmosphereChanged) {
			this.renderer.applyAtmosphere();
		}
		if (themeChanged || textureChanged) {
			this.renderer.applyTexture();
		}
		if (themeChanged || backgroundChanged) {
			this.renderer.applyBackground();
		}
		if (themeChanged || cameraChanged) {
			this.renderer.applyZoom();
			this.renderer.applyGlobeTransform();
		}
		if (themeChanged || dayNightChanged) {
			this.renderer.applyDayNight();
		}
		if (themeChanged || cloudsChanged) {
			this.renderer.applyClouds();
		}
		if (flightsChanged) {
			// Not gated by themeChanged (unlike every field above) - flights is deliberately not part of theme switching.
			this.renderer.applyFlights();
			this.sendFlightsState();
		}
		if (cityChanged) {
			this.renderer.applyCity();
		}
		// After applyCity() so a combined {name, center:true} request centers on the marker it just placed, not the previous one.
		if (shouldCenterCity) {
			if (this.config.city.lat !== null) {
				this.renderer.centerOnCity(this.config.city.lat, this.config.city.lng);
			} else if (this.config.city.cities.length && this.config.city.cities[0].lat === null) {
				// First city entry is still awaiting a geocode reply - honor the center request once PLANET3D_GEOCODE_RESULT resolves it.
				this.pendingCityCenter = true;
			}
		}
		if (this.config.quality !== previousQuality) {
			this.renderer.applyQuality();
		}
	},

	stop: function () {
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
	}
});
