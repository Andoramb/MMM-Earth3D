/* global PlanetCompositor, Log */

// Planet3DRenderer: owns the three-globe/Three.js scene for MMM-Planet3D, kept separate from the MM module file. The class body here is just lifecycle (construct/init/tick/destroy) - every apply*/ensure*/update* method is mixed in from renderer/*.mjs below, grouped by concern (camera positioning, globe positioning, texture, background, clouds, flights, city).
import { OCCLUSION_CHECK_MS, QUALITY_PRESETS, FLIGHT_MARKER_REFERENCE_ZOOM } from "./renderer/constants.mjs";
import { degToRad, easeInOutCubic, rotationSpeedToDegPerSec } from "./renderer/util.mjs";
import { TweenedValue } from "./renderer/tween.mjs";
import { loadThreeGlobeDeps, createRenderer, createScene, createGlobe, createCamera, createLights, createControls, disposeObject3D, teardownScene } from "./renderer/scene-setup.mjs";
import { captureCameraState, restoreCameraState, handleWheel, applyZoom, getZoomMax, zoomToAltitude, updateCameraFraming } from "./renderer/camera.mjs";
import { handlePointerDown, panGlobe, applyGlobeTransform, updateGlobeTransform } from "./renderer/globe.mjs";
import { setupInteraction, scheduleInteractiveCommit } from "./renderer/interaction.mjs";
import { gibsBlueMarbleTileUrl, resolveTextureUrls, applyTexture, applyTileEngine, applyQuality } from "./renderer/texture.mjs";
import { applyBackground, applyStarfield, resolveBackgroundSelection, loadBackgroundTexture, ensureStarfieldLayer } from "./renderer/background.mjs";
import { applyClouds, ensureCloudsLayer, applyCloudsImage } from "./renderer/clouds.mjs";
import { applyFlights, updateFlightPosition, ensureFlightLayer } from "./renderer/flights.mjs";
import { applyCity, centerOnCity } from "./renderer/city.mjs";
import { applyRotationSpeed, applyAtmosphere, applyAtmosphereGlow, applyDayNight, setServerTimeOffset } from "./renderer/simple-updates.mjs";
import { applyAtmosphereFade, ensureAtmosphereFadeLayer } from "./renderer/atmosphere-fade.mjs";

export class Planet3DRenderer {
	constructor(container, config, cacheBust, onInteractiveCameraChange) {
		this.container = container;
		this.config = config;
		// Only applied to CloudsLayer.mjs/FlightLayer.mjs's own imports, not loadThreeGlobeDeps()'s three - cache-busting those would fragment the single-shared-THREE guarantee.
		this.cacheBust = cacheBust ? ("?v=" + cacheBust) : "";
		// Fired once a Shift+drag/scroll gesture settles (see setupInteraction()) so MMM-Planet3D.js can pin the result into the tracked override.
		this.onInteractiveCameraChange = onInteractiveCameraChange || null;

		this.THREE = null;
		this.ThreeGlobeCtor = null;
		this.OrbitControlsCtor = null;

		this.renderer = null;
		this.scene = null;
		this.camera = null;
		this.controls = null;
		this.threeGlobeObj = null;

		this.compositor = null;
		this.atmosphereFadeLayer = null;
		this.atmosphereFadeLayerImporting = false;
		this.cloudsLayer = null;
		this.flightLayer = null;
		this.flightLayerImporting = false;
		this.starfieldLayer = null;
		this.starfieldLayerImporting = false;
		this.backgroundMesh = null;
		this.backgroundLoadId = 0;
		this.destroyed = false;
		this.animating = false;
		this.serverTimeOffsetMs = 0;
		this.pendingCloudsSunDirection = null;
		// Set by applyQuality() right before a rebuild, consumed by createControls() right after - see camera.mjs.
		this.pendingCameraState = null;

		const { rotate, position } = config.camera;
		this.tiltX = new TweenedValue(rotate.x);
		this.tiltY = new TweenedValue(rotate.y);
		this.tiltZ = new TweenedValue(rotate.z);
		this.posX = new TweenedValue(position.x);
		this.posY = new TweenedValue(position.y);
		this.zoomAltitude = new TweenedValue(this.zoomToAltitude(config.camera.zoom));
		// Reference camera distance the flight marker's geometry was authored to look right at - tick() divides current distance by this to counteract perspective for a constant on-screen size.
		this.flightMarkerReferenceDistance = 1 + this.zoomToAltitude(FLIGHT_MARKER_REFERENCE_ZOOM);
		this.spinRate = new TweenedValue(rotationSpeedToDegPerSec(config.rotationSpeed));
		this.spinAngle = 0;
		// 0 = normal spin/tilt (flights.track off), 1 = fully blended toward facing the tracked flight (see applyFlights()/tick()).
		this.flightTrackBlend = new TweenedValue(0);
		// Set by centerOnCity() - a one-shot override driving spinAngle to a target over CENTER_ON_CITY_TRANSITION_MS, then clears itself so normal spin resumes from wherever it landed.
		this.spinOverrideTween = null;
		this.lastFrameTime = null;

		this.init();

		// container.style.width/height may be px or "100vw"/"100vh" - track the container's actual rendered size instead of trusting config.width/height, kept in sync as the screen resizes.
		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.container);

		// Some MM setups stack more than one fullscreen_below module with no explicit z-index, so a later one can paint over this one - checkOcclusion() sets this.occluded, and tick() skips the draw call while covered.
		this.occluded = false;
		this.occlusionInterval = setInterval(() => this.checkOcclusion(), OCCLUSION_CHECK_MS);
	}

	// Hit-tests the container's center point - catches occlusion by a default-pointer-events element, not one with pointer-events:none (elementFromPoint skips those).
	checkOcclusion() {
		if (this.destroyed || !this.renderer) {
			return;
		}
		const rect = this.container.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) {
			return;
		}
		const topElement = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
		const occluded = !topElement || !this.container.contains(topElement);
		this.occluded = occluded;
	}

	// Falls back to config.width/height (then 500) only before the container has been laid out at all.
	getContainerSize() {
		const rect = this.container.getBoundingClientRect();
		return {
			width: Math.round(rect.width) || this.config.width || 500,
			height: Math.round(rect.height) || this.config.height || 500
		};
	}

	handleResize() {
		if (!this.renderer || !this.camera) {
			return;
		}
		const size = this.getContainerSize();
		this.renderer.setSize(size.width, size.height, false);
		this.camera.aspect = size.width / size.height;
		this.camera.updateProjectionMatrix();
	}

	async init() {
		const quality = QUALITY_PRESETS[this.config.quality] || QUALITY_PRESETS.high;
		const textures = this.resolveTextureUrls();
		const size = this.getContainerSize();

		// Only loaded once - a quality-triggered rebuild (see applyQuality()) finds these already cached.
		if (!this.ThreeGlobeCtor) {
			try {
				const deps = await loadThreeGlobeDeps();
				this.THREE = deps.THREE;
				this.ThreeGlobeCtor = deps.ThreeGlobe;
				this.OrbitControlsCtor = deps.OrbitControls;
			} catch (err) {
				Log.error("MMM-Planet3D: failed to load three-globe/OrbitControls (" + err.message + ") - globe will not render");
				return;
			}
			if (this.destroyed) {
				return;
			}
		}

		this.createRenderer(quality, size);
		this.createScene();
		this.createGlobe(textures, quality);
		this.createCamera(size);
		this.createLights();
		this.createControls();

		this.applyAtmosphere();
		this.applyZoom();
		this.applyBackground();
		this.applyCity();

		this.ensureCloudsLayer();
		this.ensureFlightLayer();
		this.ensureStarfieldLayer();
		this.ensureAtmosphereFadeLayer();

		if (!this.compositor) {
			this.compositor = new PlanetCompositor(
				this.config,
				(dataUrl) => {
					this.debugLog("compositor onReady: applying globeImageUrl, length", dataUrl.length, "threeGlobeObj ready:", Boolean(this.threeGlobeObj));
					if (this.threeGlobeObj) {
						this.threeGlobeObj.globeImageUrl(dataUrl);
					}
				},
				(image) => {
					this.debugLog("compositor onCloudsImage", image.naturalWidth + "x" + image.naturalHeight, "cloudsLayer ready:", Boolean(this.cloudsLayer));
					this.pendingCloudsImage = image;
					if (this.cloudsLayer) {
						this.applyCloudsImage(image);
					}
				},
				(direction) => {
					this.debugLog("compositor onCloudsSunDirection", Boolean(direction), "cloudsLayer ready:", Boolean(this.cloudsLayer));
					this.pendingCloudsSunDirection = direction;
					if (this.cloudsLayer) {
						this.cloudsLayer.setSunDirection(direction);
					}
				},
				(path) => this.assetPath(path)
			);
		}
		// Tile mode owns the color map directly (globeTileEngineUrl) - the day/night compositor and globeImageUrl are mutually exclusive on the same three-globe material, so it's left unstarted (clouds/day-night stay off for this preset).
		if (textures.tileEngine) {
			this.applyTileEngine();
		} else {
			this.compositor.start(textures.image);
		}

		this.startRenderLoop();
	}

	startRenderLoop() {
		if (this.animating) {
			return;
		}
		this.animating = true;
		requestAnimationFrame((now) => this.tick(now));
	}

	debugLog() {
		if (!this.config || !this.config.debug) {
			return;
		}
		Log.info.apply(Log, ["[MMM-Planet3D:Planet3DRenderer]"].concat(Array.prototype.slice.call(arguments)));
	}

	tick(now) {
		if (this.destroyed) {
			this.animating = false;
			return;
		}

		const deltaSeconds = this.lastFrameTime !== null ? (now - this.lastFrameTime) / 1000 : 0;
		this.lastFrameTime = now;

		// Globe-owned tweens (tilt/pan/spin/flight-blend) - this.zoomAltitude (camera-owned) updates separately, right before updateCameraFraming() uses it.
		this.tiltX.update(now);
		this.tiltY.update(now);
		this.tiltZ.update(now);
		this.posX.update(now);
		this.posY.update(now);
		this.spinRate.update(now);
		this.flightTrackBlend.update(now);
		if (this.spinOverrideTween) {
			const t = Math.min((now - this.spinOverrideTween.startTime) / this.spinOverrideTween.duration, 1);
			this.spinAngle = this.spinOverrideTween.from + (this.spinOverrideTween.to - this.spinOverrideTween.from) * easeInOutCubic(t);
			if (t >= 1) {
				this.spinOverrideTween = null;
			}
		} else {
			this.spinAngle += degToRad(this.spinRate.current) * deltaSeconds;
		}

		this.zoomAltitude.update(now);

		if (this.cloudsLayer) {
			this.cloudsLayer.tick(now);
		}
		if (this.flightLayer) {
			this.flightLayer.setDistanceScale((1 + this.zoomAltitude.current) / this.flightMarkerReferenceDistance);
			this.flightLayer.tick(now);
		}
		if (this.starfieldLayer) {
			this.starfieldLayer.tick(now);
		}
		this.applyAtmosphereGlow();

		this.updateGlobeTransform();
		this.updateCameraFraming();

		if (this.renderer && this.scene && this.camera && !this.occluded) {
			this.renderer.render(this.scene, this.camera);
		}

		requestAnimationFrame((t) => this.tick(t));
	}

	assetPath(relativePath) {
		return "modules/MMM-Planet3D/public/" + relativePath;
	}

	destroy() {
		this.destroyed = true;
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		if (this.occlusionInterval) {
			clearInterval(this.occlusionInterval);
			this.occlusionInterval = null;
		}
		if (this.compositor) {
			this.compositor.destroy();
			this.compositor = null;
		}
		if (this.atmosphereFadeLayer) {
			this.atmosphereFadeLayer.destroy();
			this.atmosphereFadeLayer = null;
		}
		if (this.cloudsLayer) {
			this.cloudsLayer.destroy();
			this.cloudsLayer = null;
		}
		if (this.flightLayer) {
			this.flightLayer.destroy();
			this.flightLayer = null;
		}
		this.teardownScene();
	}
}

// Each renderer/*.mjs submodule exports plain functions written as if they were methods (using `this`) - mixing them onto the prototype here is what actually makes them methods, with zero per-method boilerplate.
Object.assign(Planet3DRenderer.prototype, {
	createRenderer, createScene, createGlobe, createCamera, createLights, createControls, disposeObject3D, teardownScene,
	captureCameraState, restoreCameraState, handleWheel, applyZoom, getZoomMax, zoomToAltitude, updateCameraFraming,
	handlePointerDown, panGlobe, applyGlobeTransform, updateGlobeTransform,
	setupInteraction, scheduleInteractiveCommit,
	gibsBlueMarbleTileUrl, resolveTextureUrls, applyTexture, applyTileEngine, applyQuality,
	applyBackground, applyStarfield, resolveBackgroundSelection, loadBackgroundTexture, ensureStarfieldLayer,
	applyClouds, ensureCloudsLayer, applyCloudsImage,
	applyFlights, updateFlightPosition, ensureFlightLayer,
	applyCity, centerOnCity,
	applyRotationSpeed, applyAtmosphere, applyAtmosphereGlow, applyDayNight, setServerTimeOffset,
	applyAtmosphereFade, ensureAtmosphereFadeLayer
});
