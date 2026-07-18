/* global MMMEarth3DSunCalc, Log */

// EarthCompositor: builds the day+night texture for three-globe's globeImageUrl() on an offscreen canvas; also fetches (not draws) the clouds image and its night-mask for CloudsLayer.mjs to shade.

// Terminator moves ~0.25deg/minute, imperceptibly slow, so this only needs to be a few minutes.
const DAY_NIGHT_RECOMPUTE_MS = 5 * 60 * 1000;

// Low-res grid for the day/night mask - a smooth curve computed densely and upscaled looks identical to full-res but far cheaper.
const MASK_WIDTH = 180;
const MASK_HEIGHT = 90;

// Twilight band half-width in degrees of solar altitude, roughly matching civil twilight, for a soft terminator edge.
const TWILIGHT_DEG = 6;

const CLOUDS_NIGHT_DARKEN = 0.85;

// NASA GIBS' satellite composite only updates once per day, so polling more often just re-requests the same image.
const CLOUDS_POLL_MS = 24 * 60 * 60 * 1000;

class EarthCompositor {
	constructor(config, onReady, onCloudsImage, onCloudsNightMask, assetPath) {
		this.config = config;
		this.onReady = onReady;
		this.onCloudsImage = onCloudsImage;
		this.onCloudsNightMask = onCloudsNightMask;
		this.assetPath = assetPath;

		this.dayImage = null;
		this.nightImage = null;
		this.cloudsRawImage = null;
		this.serverTimeOffsetMs = 0;

		this.canvas = document.createElement("canvas");
		this.ctx = this.canvas.getContext("2d");
		this.maskCanvas = document.createElement("canvas");
		this.maskCanvas.width = MASK_WIDTH;
		this.maskCanvas.height = MASK_HEIGHT;
		this.nightScratchCanvas = document.createElement("canvas");
		this.cloudMaskCanvas = document.createElement("canvas");
		this.cloudMaskCanvas.width = MASK_WIDTH;
		this.cloudMaskCanvas.height = MASK_HEIGHT;

		this.dayNightTimer = null;
		this.cloudsTimer = null;
		this.destroyed = false;
	}

	debugLog() {
		if (!this.config || !this.config.debug) {
			return;
		}
		Log.info.apply(Log, ["[MMM-Earth3D:EarthCompositor]"].concat(Array.prototype.slice.call(arguments)));
	}

	// Set once Earth3DRenderer hears back from node_helper - realtime dayNight should reflect the MagicMirror machine's clock, not the viewing browser's.
	setServerTimeOffset(offsetMs) {
		this.debugLog("setServerTimeOffset", offsetMs);
		this.serverTimeOffsetMs = offsetMs;
		this.recompute();
	}

	loadImage(url) {
		return new Promise((resolve, reject) => {
			const img = new Image();
			// Only for genuinely cross-origin sources - setting it unconditionally has caused canvas-tainting on machines with a stale cached non-CORS response for the same URL.
			if (isCrossOrigin(url)) {
				img.crossOrigin = "anonymous";
			}
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error("Failed to load image: " + url));
			img.src = url;
		});
	}

	async start(dayImageUrl) {
		this.destroyed = false;
		this.debugLog("start", { dayImageUrl, dayNight: this.config.dayNight, clouds: this.config.clouds });
		const tasks = [this.setDayImage(dayImageUrl, false)];
		if (!this.nightImage) {
			tasks.push(this.loadImage(this.assetPath("img/earth-night.jpg")).then((img) => {
				this.nightImage = img;
				this.debugLog("night image loaded", img.naturalWidth + "x" + img.naturalHeight);
			}).catch((err) => {
				Log.error("MMM-Earth3D: failed to load night texture (" + err.message + ") - day/night will have no night-side lights");
			}));
		}
		await Promise.all(tasks);
		await this.applyCloudsConfig();
		this.recompute();
		this.scheduleDayNight();
	}

	async setDayImage(url, recomputeAfter) {
		this.dayImage = await this.loadImage(url);
		this.debugLog("day image loaded", url, this.dayImage.naturalWidth + "x" + this.dayImage.naturalHeight);
		if (recomputeAfter !== false) {
			this.recompute();
		}
	}

	scheduleDayNight() {
		clearInterval(this.dayNightTimer);
		if (this.config.dayNight.mode === "disabled") {
			this.debugLog("scheduleDayNight: mode disabled, not scheduling recompute");
			return;
		}
		this.debugLog("scheduleDayNight: recompute every", DAY_NIGHT_RECOMPUTE_MS + "ms");
		this.dayNightTimer = setInterval(() => this.recompute(), DAY_NIGHT_RECOMPUTE_MS);
	}

	// Called on init and whenever config.clouds changes - loads the right clouds image and (re)starts polling for realtime sources.
	async applyCloudsConfig() {
		clearTimeout(this.cloudsTimer);

		if (!this.config.clouds.enabled) {
			return;
		}

		await this.refreshClouds();
		if (this.config.clouds.source === "realtime") {
			this.cloudsTimer = setTimeout(() => this.applyCloudsConfig(), CLOUDS_POLL_MS);
		}
	}

	async refreshClouds() {
		const url = this.config.clouds.source === "realtime" ? this.buildGibsUrl() : this.assetPath("img/clouds-static.png");
		this.debugLog("refreshClouds", url);
		try {
			this.cloudsRawImage = await this.loadImage(url);
		} catch (err) {
			// GIBS can fail/timeout - fall back to the vendored static texture rather than showing nothing.
			Log.warn("MMM-Earth3D: clouds image failed to load (" + err.message + "), falling back to static clouds");
			try {
				this.cloudsRawImage = await this.loadImage(this.assetPath("img/clouds-static.png"));
			} catch (fallbackErr) {
				return; // no-op: keep whatever clouds image (if any) was already showing
			}
		}
		this.debugLog("refreshClouds: loaded", this.cloudsRawImage.naturalWidth + "x" + this.cloudsRawImage.naturalHeight);
		this.onCloudsImage(this.cloudsRawImage);
		this.updateCloudNightMask(null);
	}

	// NASA GIBS' Worldview Snapshot API - the underlying composite only updates once per day.
	buildGibsUrl() {
		const date = new Date().toISOString().slice(0, 10);
		return "https://wvs.earthdata.nasa.gov/api/v1/snapshot"
			+ "?REQUEST=GetSnapshot&TIME=" + date
			+ "&BBOX=-90,-180,90,180&CRS=EPSG:4326"
			+ "&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor"
			+ "&WRAP=x&FORMAT=image/jpeg&WIDTH=2048&HEIGHT=1024";
	}

	recompute() {
		if (this.destroyed || !this.dayImage) {
			this.debugLog("recompute: skipped", { destroyed: this.destroyed, hasDayImage: Boolean(this.dayImage) });
			return;
		}

		const width = this.dayImage.naturalWidth;
		const height = this.dayImage.naturalHeight;
		this.canvas.width = width;
		this.canvas.height = height;

		this.ctx.clearRect(0, 0, width, height);
		this.ctx.drawImage(this.dayImage, 0, 0, width, height);

		// Computed once and shared with updateCloudNightMask() so toggling/polling day-night doesn't run the SunCalc grid twice.
		const dayNightEnabled = this.config.dayNight.mode !== "disabled";
		const grid = dayNightEnabled ? this.computeAltitudeGrid() : null;
		this.debugLog("recompute", { mode: this.config.dayNight.mode, dayNightEnabled, width, height, hasNightImage: Boolean(this.nightImage) });

		if (dayNightEnabled && this.nightImage) {
			this.drawNightOverlay(width, height, grid);
			this.debugLog("recompute: night overlay drawn");
		} else if (dayNightEnabled && !this.nightImage) {
			this.debugLog("recompute: dayNight enabled but night image not loaded yet - globe texture will show day-only this pass");
		}

		// A tainted canvas makes toDataURL() throw - surface that clearly instead of silently aborting with no visible error.
		let dataUrl;
		try {
			dataUrl = this.canvas.toDataURL("image/jpeg", 0.85);
		} catch (err) {
			Log.error("MMM-Earth3D: failed to export composited day/night texture (" + err.message + ") - day/night will not update");
			return;
		}
		this.debugLog("recompute: composited texture exported, length", dataUrl.length);
		this.onReady(dataUrl);

		this.updateCloudNightMask(grid);
	}

	// Grid of solar altitude (degrees), one entry per mask pixel - shared by drawNightOverlay and buildCloudNightMask so both derive from the same terminator.
	computeAltitudeGrid() {
		const mode = this.config.dayNight.mode;
		const now = new Date(Date.now() + this.serverTimeOffsetMs);
		// custom mode: fixed subsolar point at the equator, longitude from config.dayNight.rotate (0-360 -> -180..180) - no real astronomy.
		const customLng = ((this.config.dayNight.rotate % 360) + 360) % 360 - 180;

		const grid = new Float32Array(MASK_WIDTH * MASK_HEIGHT);
		let minAlt = Infinity;
		let maxAlt = -Infinity;
		for (let y = 0; y < MASK_HEIGHT; y++) {
			const lat = 90 - (y / (MASK_HEIGHT - 1)) * 180;
			for (let x = 0; x < MASK_WIDTH; x++) {
				const lng = (x / (MASK_WIDTH - 1)) * 360 - 180;
				// Both branches return degrees - the vendored SunCalc (window.MMMEarth3DSunCalc, not MM core's own window.SunCalc) converts internally.
				const altitudeDeg = mode === "realtime"
					? MMMEarth3DSunCalc.getPosition(now, lat, lng).altitude
					: solarAltitudeDeg(lat, lng, 0, customLng);
				grid[y * MASK_WIDTH + x] = altitudeDeg;
				if (altitudeDeg < minAlt) minAlt = altitudeDeg;
				if (altitudeDeg > maxAlt) maxAlt = altitudeDeg;
			}
		}
		// If min/max don't straddle +-TWILIGHT_DEG, the whole grid is on one side of the terminator - a legitimate no-visible-split result, not a bug.
		this.debugLog("computeAltitudeGrid", {
			mode,
			now: now.toISOString(),
			customLng,
			minAltDeg: minAlt.toFixed(1),
			maxAltDeg: maxAlt.toFixed(1)
		});
		return grid;
	}

	drawNightOverlay(width, height, grid) {
		const maskCtx = this.maskCanvas.getContext("2d");
		const imageData = maskCtx.createImageData(MASK_WIDTH, MASK_HEIGHT);
		for (let i = 0; i < grid.length; i++) {
			const idx = i * 4;
			imageData.data[idx] = 255;
			imageData.data[idx + 1] = 255;
			imageData.data[idx + 2] = 255;
			imageData.data[idx + 3] = nightAlpha(grid[i]);
		}
		maskCtx.putImageData(imageData, 0, 0);

		this.nightScratchCanvas.width = width;
		this.nightScratchCanvas.height = height;
		const nightCtx = this.nightScratchCanvas.getContext("2d");
		nightCtx.globalCompositeOperation = "source-over";
		nightCtx.clearRect(0, 0, width, height);
		nightCtx.drawImage(this.nightImage, 0, 0, width, height);
		nightCtx.globalCompositeOperation = "destination-in";
		nightCtx.drawImage(this.maskCanvas, 0, 0, width, height);

		this.ctx.drawImage(this.nightScratchCanvas, 0, 0);
	}

	// Hands CloudsLayer.mjs a small black/transparent alpha mask (or null) to shader-sample on its own mesh - not baked into the clouds texture or a second mesh, since CloudsLayer's independent parallax spin would drift either out of alignment (or z-fight, for a second mesh); its shader corrects for that rotation itself.
	updateCloudNightMask(grid) {
		if (this.destroyed || !this.cloudsRawImage) {
			this.debugLog("updateCloudNightMask: skipped", { destroyed: this.destroyed, hasCloudsImage: Boolean(this.cloudsRawImage) });
			return;
		}
		if (this.config.dayNight.mode === "disabled") {
			this.debugLog("updateCloudNightMask: dayNight disabled, clearing cloud mask");
			this.onCloudsNightMask(null);
			return;
		}
		this.buildCloudNightMask(grid || this.computeAltitudeGrid());
		this.debugLog("updateCloudNightMask: sending cloud mask canvas to CloudsLayer");
		this.onCloudsNightMask(this.cloudMaskCanvas);
	}

	// Black, alpha = nightAlpha * CLOUDS_NIGHT_DARKEN - transparent by day, fading to translucent black by night.
	buildCloudNightMask(grid) {
		const ctx = this.cloudMaskCanvas.getContext("2d");
		const imageData = ctx.createImageData(MASK_WIDTH, MASK_HEIGHT);
		for (let i = 0; i < grid.length; i++) {
			const idx = i * 4;
			imageData.data[idx] = 0;
			imageData.data[idx + 1] = 0;
			imageData.data[idx + 2] = 0;
			imageData.data[idx + 3] = Math.round(nightAlpha(grid[i]) * CLOUDS_NIGHT_DARKEN);
		}
		ctx.putImageData(imageData, 0, 0);
	}

	destroy() {
		this.destroyed = true;
		clearInterval(this.dayNightTimer);
		clearTimeout(this.cloudsTimer);
	}
}

function isCrossOrigin(url) {
	try {
		return new URL(url, window.location.href).origin !== window.location.origin;
	} catch (err) {
		return false;
	}
}

// Standard spherical solar-altitude formula (90 minus the great-circle angular distance to the subsolar point).
function solarAltitudeDeg(lat, lng, subsolarLat, subsolarLng) {
	const toRad = Math.PI / 180;
	const sinAlt = Math.sin(lat * toRad) * Math.sin(subsolarLat * toRad)
		+ Math.cos(lat * toRad) * Math.cos(subsolarLat * toRad) * Math.cos((lng - subsolarLng) * toRad);
	return Math.asin(Math.max(-1, Math.min(1, sinAlt))) / toRad;
}

// 0 = full day (transparent) .. 255 = full night (opaque), blended across the twilight band.
function nightAlpha(altitudeDeg) {
	if (altitudeDeg >= TWILIGHT_DEG) {
		return 0;
	}
	if (altitudeDeg <= -TWILIGHT_DEG) {
		return 255;
	}
	return Math.round(((TWILIGHT_DEG - altitudeDeg) / (2 * TWILIGHT_DEG)) * 255);
}
