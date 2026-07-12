/* global Globe */

/*
 * Earth3DRenderer
 * Owns the globe.gl/WebGL scene for MMM-Earth3D. Kept separate from the
 * MagicMirror module file so future features (clouds, day/night, markers,
 * live data overlays) grow here without touching MM lifecycle code.
 */

// rotationSpeed config (0-100) maps onto degrees/second of manual spin.
const ROTATION_SPEED_MAX_DEG_PER_SEC = 30; // 100 -> full revolution every 12s

// camera.zoom config (0-100) maps onto pointOfView's altitude (globe radii).
const ZOOM_ALTITUDE_MIN = 0.5; // 0   -> close
const ZOOM_ALTITUDE_MAX = 5; // 100 -> far

// Live config changes ease in over this long instead of jumping.
const TRANSITION_MS = 700;

// quality presets: texture resolution, sphere tessellation (lower
// curvatureResolution = more polygons = smoother), antialiasing (renderer
// construction option, can't change after init) and a device-pixel-ratio cap.
const QUALITY_PRESETS = {
	low: { textureUrl: "img/earth-2k.jpg", curvatureResolution: 10, antialias: false, maxPixelRatio: 1 },
	medium: { textureUrl: "img/earth-2k.jpg", curvatureResolution: 6, antialias: true, maxPixelRatio: 1 },
	high: { textureUrl: "img/earth-4k.jpg", curvatureResolution: 3, antialias: true, maxPixelRatio: 2 },
	ultra: { textureUrl: "img/earth-8k.jpg", curvatureResolution: 1, antialias: true, maxPixelRatio: 3 }
};

// Eases a single number from its current value to a target over a fixed
// duration. Used for every live-tunable property so changes glide in
// smoothly instead of jumping.
class TweenedValue {
	constructor(initial) {
		this.current = initial;
		this.from = initial;
		this.to = initial;
		this.startTime = 0;
		this.duration = 0;
	}

	setTarget(value, durationMs) {
		if (value === this.to) {
			return;
		}
		this.from = this.current;
		this.to = value;
		this.startTime = performance.now();
		this.duration = durationMs;
	}

	update(now) {
		if (this.duration <= 0) {
			this.current = this.to;
			return;
		}
		const t = Math.min((now - this.startTime) / this.duration, 1);
		this.current = this.from + (this.to - this.from) * easeInOutCubic(t);
		if (t >= 1) {
			this.duration = 0;
		}
	}
}

class Earth3DRenderer {
	constructor(container, config) {
		this.container = container;
		this.config = config;
		this.globe = null;
		this.globeObject3D = null;
		this.destroyed = false;
		this.animating = false;

		const { rotate, position } = config.camera;
		this.tiltX = new TweenedValue(rotate.x);
		this.tiltY = new TweenedValue(rotate.y);
		this.tiltZ = new TweenedValue(rotate.z);
		this.posX = new TweenedValue(position.x);
		this.posY = new TweenedValue(position.y);
		this.posZ = new TweenedValue(position.z);
		this.spinRate = new TweenedValue(rotationSpeedToDegPerSec(config.rotationSpeed));
		this.spinAngle = 0;
		this.lastFrameTime = null;

		this.init();
	}

	init() {
		const quality = QUALITY_PRESETS[this.config.quality] || QUALITY_PRESETS.high;

		this.globe = new Globe(this.container, {
			rendererConfig: { antialias: quality.antialias, alpha: true }
		})
			.width(this.config.width)
			.height(this.config.height)
			.backgroundColor("rgba(0,0,0,0)")
			.globeImageUrl(this.assetPath(quality.textureUrl))
			.bumpImageUrl(this.assetPath("img/earth-topology.png"))
			.globeCurvatureResolution(quality.curvatureResolution)
			.showAtmosphere(true)
			.atmosphereColor("lightskyblue")
			.atmosphereAltitude(0.15);

		this.globe.renderer().setPixelRatio(Math.min(quality.maxPixelRatio, window.devicePixelRatio));

		const controls = this.globe.controls();
		// Spin is applied manually each frame (see tick()) around the globe's
		// own local axis, so it correctly follows any fixed tilt. OrbitControls'
		// built-in autoRotate always orbits the camera around the world's
		// vertical axis instead, which looks wrong once the globe is tilted.
		controls.autoRotate = false;
		controls.enableZoom = false;

		this.applyZoom();

		// The globe mesh isn't added to the scene synchronously (globe.gl
		// debounces its internal update digest), so poll until it appears.
		this.waitForGlobeObject();

		if (!this.animating) {
			this.animating = true;
			requestAnimationFrame((now) => this.tick(now));
		}
	}

	// Live-update entry points: config is shared by reference with the
	// MMM-Earth3D module instance, so callers mutate this.config first and
	// then call the matching apply*() to ease the live globe.gl scene toward it.

	applyRotationSpeed() {
		this.spinRate.setTarget(rotationSpeedToDegPerSec(this.config.rotationSpeed), TRANSITION_MS);
	}

	applyZoom() {
		this.globe.pointOfView({ altitude: this.zoomToAltitude(this.config.camera.zoom) }, TRANSITION_MS);
	}

	applyGlobeTransform() {
		const { rotate, position } = this.config.camera;
		this.tiltX.setTarget(rotate.x, TRANSITION_MS);
		this.tiltY.setTarget(rotate.y, TRANSITION_MS);
		this.tiltZ.setTarget(rotate.z, TRANSITION_MS);
		this.posX.setTarget(position.x, TRANSITION_MS);
		this.posY.setTarget(position.y, TRANSITION_MS);
		this.posZ.setTarget(position.z, TRANSITION_MS);
	}

	// Antialiasing is a WebGLRenderer construction option and can't be
	// changed on an existing context, so quality changes rebuild the globe.
	// Tween/spin state is left untouched so tilt/position/rotation continue
	// smoothly across the rebuild.
	applyQuality() {
		if (this.globe) {
			this.globe._destructor();
			this.globe = null;
		}
		this.globeObject3D = null;
		this.init();
	}

	zoomToAltitude(zoom) {
		const t = clamp(zoom, 0, 100) / 100;
		return ZOOM_ALTITUDE_MIN + t * (ZOOM_ALTITUDE_MAX - ZOOM_ALTITUDE_MIN);
	}

	waitForGlobeObject() {
		if (this.destroyed) {
			return;
		}
		// The globe mesh is the sole Group-type child of the scene (skysphere
		// is a Mesh, lights have their own types) - not officially documented
		// by globe.gl, but reliable across the installed version.
		const globeObject = this.globe.scene().children.find((child) => child.type === "Group");
		if (globeObject) {
			this.globeObject3D = globeObject;
		} else {
			requestAnimationFrame(() => this.waitForGlobeObject());
		}
	}

	tick(now) {
		if (this.destroyed) {
			this.animating = false;
			return;
		}

		const deltaSeconds = this.lastFrameTime !== null ? (now - this.lastFrameTime) / 1000 : 0;
		this.lastFrameTime = now;

		this.tiltX.update(now);
		this.tiltY.update(now);
		this.tiltZ.update(now);
		this.posX.update(now);
		this.posY.update(now);
		this.posZ.update(now);
		this.spinRate.update(now);
		this.spinAngle += degToRad(this.spinRate.current) * deltaSeconds;

		if (this.globeObject3D) {
			// Reset to the (tweened) fixed tilt, then apply the total
			// accumulated spin as a local-axis rotation on top of it, so the
			// spin always turns around the globe's own (tilted) polar axis.
			this.globeObject3D.rotation.set(degToRad(this.tiltX.current), degToRad(this.tiltY.current), degToRad(this.tiltZ.current));
			this.globeObject3D.rotateY(this.spinAngle);
			this.globeObject3D.position.set(this.posX.current, this.posY.current, this.posZ.current);

			// Keep the camera's orbit target on the globe's current position
			// so manual dragging (if enabled later) stays centered on it.
			this.globe.controls().target.set(this.posX.current, this.posY.current, this.posZ.current);
		}

		requestAnimationFrame((t) => this.tick(t));
	}

	assetPath(relativePath) {
		return "modules/MMM-Earth3D/public/" + relativePath;
	}

	destroy() {
		this.destroyed = true;
		if (this.globe) {
			this.globe._destructor();
			this.globe = null;
			this.globeObject3D = null;
		}
	}
}

function rotationSpeedToDegPerSec(speed) {
	return (clamp(speed, 0, 100) / 100) * ROTATION_SPEED_MAX_DEG_PER_SEC;
}

function degToRad(deg) {
	return (deg * Math.PI) / 180;
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function easeInOutCubic(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
