/* global Globe */

/*
 * Earth3DRenderer
 * Owns the globe.gl/WebGL scene for MMM-Earth3D. Kept separate from the
 * MagicMirror module file so future features (clouds, day/night, markers,
 * live data overlays) grow here without touching MM lifecycle code.
 */

// rotationSpeed config (0-100) maps onto globe.gl's raw autoRotateSpeed range.
const ROTATION_SPEED_MAX = 10;

// camera.zoom config (0-100) maps onto pointOfView's altitude (globe radii).
const ZOOM_ALTITUDE_MIN = 0.5; // 0   -> close
const ZOOM_ALTITUDE_MAX = 5; // 100 -> far

// quality presets: texture resolution, sphere tessellation (lower
// curvatureResolution = more polygons = smoother), antialiasing (renderer
// construction option, can't change after init) and a device-pixel-ratio cap.
const QUALITY_PRESETS = {
	low: { textureUrl: "img/earth-2k.jpg", curvatureResolution: 10, antialias: false, maxPixelRatio: 1 },
	medium: { textureUrl: "img/earth-2k.jpg", curvatureResolution: 6, antialias: true, maxPixelRatio: 1 },
	high: { textureUrl: "img/earth-4k.jpg", curvatureResolution: 3, antialias: true, maxPixelRatio: 2 },
	ultra: { textureUrl: "img/earth-8k.jpg", curvatureResolution: 1, antialias: true, maxPixelRatio: 3 }
};

class Earth3DRenderer {
	constructor(container, config) {
		this.container = container;
		this.config = config;
		this.globe = null;
		this.globeObject3D = null;
		this.destroyed = false;
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
		controls.autoRotate = true;
		controls.enableZoom = false;
		this.applyRotationSpeed();
		this.applyZoom();

		// The globe mesh isn't added to the scene synchronously (globe.gl
		// debounces its internal update digest), so poll until it appears.
		this.waitForGlobeObject();
	}

	// Live-update entry points: config is shared by reference with the
	// MMM-Earth3D module instance, so callers mutate this.config first and
	// then call the matching apply*() to push it onto the live globe.gl scene.

	applyRotationSpeed() {
		this.globe.controls().autoRotateSpeed = (clamp(this.config.rotationSpeed, 0, 100) / 100) * ROTATION_SPEED_MAX;
	}

	applyZoom() {
		this.globe.pointOfView({ altitude: this.zoomToAltitude(this.config.camera.zoom) }, 400);
	}

	// Antialiasing is a WebGLRenderer construction option and can't be
	// changed on an existing context, so quality changes rebuild the globe.
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
			this.applyGlobeTransform();
		} else {
			requestAnimationFrame(() => this.waitForGlobeObject());
		}
	}

	applyGlobeTransform() {
		if (!this.globeObject3D) {
			// Not resolved yet - the pending waitForGlobeObject() poll will
			// call this again once it is, picking up the latest config.
			return;
		}
		const { rotate, position } = this.config.camera;
		this.globeObject3D.rotation.set(degToRad(rotate.x), degToRad(rotate.y), degToRad(rotate.z));
		this.globeObject3D.position.set(position.x, position.y, position.z);

		// Keep the camera orbiting around the globe's new position, not the
		// original scene origin, so auto-rotation still looks centered.
		const controls = this.globe.controls();
		controls.target.copy(this.globeObject3D.position);
		controls.update();
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

function degToRad(deg) {
	return (deg * Math.PI) / 180;
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
