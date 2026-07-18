/* global Log */
import * as THREE from "./vendor/three.module.min.js";

// FlightLayer: renders the tracked flight's marker via three-globe's objectsData()/objectThreeObject() layer; tick() interpolates smoothly between OpenSky polls (see pushSample()).

// Visual size only, scaled against the globe's own radius (100 scene units) so it stays proportionate across quality-tier rebuilds.
const MARKER_SCALE_FRACTION = 0.02;
const MARKER_COLOR = 0xff5533;

// Fraction of globe radius the marker floats above the surface, clear of the terrain/bump map.
const MARKER_ALTITUDE = 0.02;

// Hide the marker once this many poll intervals pass with no new sample, so a stuck poller doesn't leave it frozen forever.
const STALE_AFTER_INTERVALS = 3;

// Ground track since tracking started (see pathsData()/pushSample()) - capped so a long session doesn't grow the line geometry forever.
const TRAIL_MAX_POINTS = 500;
const TRAIL_ALTITUDE = MARKER_ALTITUDE;
const TRAIL_COLOR_OLD = "rgba(255,85,51,0.05)";
const TRAIL_COLOR_NEW = "rgba(255,85,51,0.85)";
const TRAIL_STROKE = 0.35;

function lerp(a, b, t) {
	return a + (b - a) * t;
}

// Shortest-path interpolation for a wrapping angle (longitude across +-180, or heading across 0/360).
function lerpAngle(a, b, t, period) {
	const diff = (((b - a + period / 2) % period) + period) % period - period / 2;
	return a + diff * t;
}

export class FlightLayer {
	constructor(globeRadius, debug) {
		this.globeRadius = globeRadius;
		this.debug = Boolean(debug);
		this.threeGlobeObj = null;
		this.mesh = null;
		this.visible = false;
		this.hasSample = false;

		// Single mutable datum fed to objectsData() - identity never changes, only its fields, every tick().
		this.datum = { lat: 0, lng: 0, heading: 0 };

		this.prevSample = null;
		this.nextSample = null;
		this.transitionStartMs = 0;
		this.transitionDurationMs = 20000;
		this.lastSampleReceivedMs = null;
		this.stale = false;

		// Ground track since tracking started - same mutable-array-identity trick as this.datum; replaced (not emptied) when the tracked flight changes.
		this.trail = [];
		this.trackedFlightNumber = null;

		// Counteracts camera perspective so the marker reads as a constant on-screen size regardless of zoom (see Earth3DRenderer.tick()'s setDistanceScale()).
		this.distanceScale = 1;
	}

	debugLog() {
		if (!this.debug) {
			return;
		}
		Log.info.apply(Log, ["[MMM-Earth3D:FlightLayer]"].concat(Array.prototype.slice.call(arguments)));
	}

	buildPlaneMesh() {
		const geometry = new THREE.ConeGeometry(this.globeRadius * MARKER_SCALE_FRACTION * 0.35, this.globeRadius * MARKER_SCALE_FRACTION, 8);
		// ConeGeometry's apex sits along +Y by default - rotate to +Z to match objectRotation's yaw-about-local-Y convention below.
		geometry.rotateX(Math.PI / 2);
		const material = new THREE.MeshLambertMaterial({ color: MARKER_COLOR });
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.visible = this.visible && !this.stale;
		this.mesh.scale.setScalar(this.distanceScale);
		return this.mesh;
	}

	// Establishes the objects-layer datum/accessors once - tick() calls objectsData() again every frame, with the same datum.
	attachTo(threeGlobeObj) {
		this.threeGlobeObj = threeGlobeObj;
		threeGlobeObj
			.objectsData([this.datum])
			.objectLat("lat")
			.objectLng("lng")
			.objectAltitude(MARKER_ALTITUDE)
			.objectRotation((d) => ({ y: d.heading || 0 }))
			.objectThreeObject(() => this.buildPlaneMesh());

		// pathColor returning a 2-entry array gives the fading-tail gradient. Not calling pathsData() here while this.trail is empty - three-globe throws on a zero-point path.
		threeGlobeObj
			.pathPointAlt(TRAIL_ALTITUDE)
			.pathColor(() => [TRAIL_COLOR_OLD, TRAIL_COLOR_NEW])
			.pathStroke(TRAIL_STROKE)
			.pathDashGap(0)
			.pathTransitionDuration(600);
	}

	setPollIntervalMs(ms) {
		this.transitionDurationMs = ms;
	}

	setDistanceScale(scale) {
		this.distanceScale = scale;
		if (this.mesh) {
			this.mesh.scale.setScalar(this.distanceScale);
		}
	}

	setVisible(visible) {
		const wasVisible = this.visible;
		this.visible = Boolean(visible);
		this.syncMeshVisibility();
		// Trail visibility only follows this.visible, not staleness - a live-signal gap shouldn't wipe out history already drawn.
		if (this.visible !== wasVisible && this.threeGlobeObj) {
			this.threeGlobeObj.pathsData(this.visible && this.trail.length ? [this.trail] : []);
		}
	}

	// Marker visibility is `visible` AND "not currently stale" - either alone hides it.
	syncMeshVisibility() {
		if (this.mesh) {
			this.mesh.visible = this.visible && !this.stale;
		}
	}

	// data: { found, lat, lng, heading, ... } from EARTH3D_FLIGHT_POSITION - found:false hides the marker and resets interpolation.
	pushSample(data) {
		if (!data || !data.found || data.lat == null || data.lng == null) {
			this.setVisible(false);
			this.hasSample = false;
			this.prevSample = null;
			this.nextSample = null;
			return;
		}

		const heading = data.heading || 0;
		// First-ever sample: snap directly instead of easing in from (0,0).
		this.prevSample = this.nextSample
			? { lat: this.datum.lat, lng: this.datum.lng, heading: this.datum.heading }
			: { lat: data.lat, lng: data.lng, heading };
		this.nextSample = { lat: data.lat, lng: data.lng, heading };
		this.transitionStartMs = performance.now();
		this.lastSampleReceivedMs = this.transitionStartMs;
		this.stale = false;
		this.setVisible(true);
		this.pushTrailPoint(data);
	}

	// Appends to the ground track, starting a fresh trail array when the tracked flight changes; skips duplicate points (OpenSky repeats stale state vectors).
	pushTrailPoint(data) {
		if (data.flightNumber !== this.trackedFlightNumber) {
			this.trackedFlightNumber = data.flightNumber;
			this.trail = [];
		}
		const last = this.trail[this.trail.length - 1];
		if (!last || last[0] !== data.lat || last[1] !== data.lng) {
			this.trail.push([data.lat, data.lng]);
			if (this.trail.length > TRAIL_MAX_POINTS) {
				this.trail.shift();
			}
		}
		if (this.threeGlobeObj) {
			this.threeGlobeObj.pathsData([this.trail]);
		}
	}

	// Currently-displayed (interpolated) lat/lng, or null - consumed by Earth3DRenderer.tick()'s flights.track camera-centering blend.
	getCurrentPosition() {
		if (!this.hasSample || this.stale) {
			return null;
		}
		return { lat: this.datum.lat, lng: this.datum.lng };
	}

	tick() {
		if (!this.threeGlobeObj || !this.nextSample) {
			return;
		}
		const now = performance.now();

		const staleNow = this.lastSampleReceivedMs !== null
			&& (now - this.lastSampleReceivedMs) > this.transitionDurationMs * STALE_AFTER_INTERVALS;
		if (staleNow !== this.stale) {
			this.stale = staleNow;
			this.syncMeshVisibility();
		}

		const elapsed = now - this.transitionStartMs;
		const alpha = this.transitionDurationMs > 0 ? Math.min(elapsed / this.transitionDurationMs, 1) : 1;

		this.datum.lat = lerp(this.prevSample.lat, this.nextSample.lat, alpha);
		this.datum.lng = lerpAngle(this.prevSample.lng, this.nextSample.lng, alpha, 360);
		this.datum.heading = lerpAngle(this.prevSample.heading, this.nextSample.heading, alpha, 360);
		this.hasSample = true;

		this.threeGlobeObj.objectsData([this.datum]);
	}

	destroy() {
		if (this.threeGlobeObj) {
			this.threeGlobeObj.objectsData([]);
			this.threeGlobeObj.pathsData([]);
		}
		this.threeGlobeObj = null;
		this.mesh = null;
		this.hasSample = false;
		this.prevSample = null;
		this.nextSample = null;
		this.trail = [];
		this.trackedFlightNumber = null;
	}
}
window.FlightLayer = FlightLayer;
