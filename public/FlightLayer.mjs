/* global Log */
import * as THREE from "./vendor/three.module.min.js";

/*
 * FlightLayer
 * Renders one tracked flight's position as a small marker on the globe,
 * using three-globe's own objectsData()/objectThreeObject() layer (see
 * public/vendor/three-globe.mjs - grepped and confirmed present, though
 * unused anywhere else in this project until now) rather than a hand-rolled
 * mesh attached directly to threeGlobeObj the way CloudsLayer.mjs does -
 * this is a real data-driven layer the vendored library already supports
 * for exactly this ("moving marker on a globe") use case.
 *
 * Position updates arrive from node_helper's OpenSky poller roughly once
 * per flights.pollInterval seconds (see pushSample()) - tick() interpolates
 * smoothly between the last two samples over that same interval instead of
 * jumping on every poll, holding at the latest sample if the next poll is
 * late. Re-calling threeGlobeObj.objectsData([this.datum]) every frame with
 * the same datum object (mutated in place) is intentional, not wasteful:
 * three-globe's objects-layer digest() matches data by identity (a bound
 * property tagged directly onto the datum object - see the vendored
 * bundle's objectsLayer `update()`), so a repeat call on the same reference
 * takes the cheap onUpdateObj() reposition path, never onCreateObj() - this
 * is the same mechanism the library expects live/animated marker data to
 * use in general, not a misuse of a static-data API.
 *
 * Loaded via dynamic import(), not MM's getScripts() - see
 * Earth3DRenderer.js's ensureFlightLayer() (mirrors ensureCloudsLayer()'s
 * own comment on why: MM core's script loader only recognizes a fixed
 * extension set with no default case, so ".mjs" can silently no-op on some
 * core versions).
 */

// Visual size only (this isn't a real-world wingspan) - scaled against the
// globe's own radius (100 scene units) so it stays proportionate across
// quality-tier rebuilds, which can change the globe's tessellation but not
// its radius.
const MARKER_SCALE_FRACTION = 0.02;
const MARKER_COLOR = 0xff5533;

// How far above the surface the marker floats, as a fraction of globe
// radius - matches three-globe's own objectAltitude default order of
// magnitude, just enough to keep it clear of the terrain/bump map.
const MARKER_ALTITUDE = 0.02;

function lerp(a, b, t) {
	return a + (b - a) * t;
}

// Shortest-path interpolation for a wrapping angle (longitude across the
// +-180 antimeridian, or compass heading across 0/360) - a plain lerp would
// otherwise sweep the long way around when the two samples straddle the seam.
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

		// The single mutable datum three-globe's objects layer is fed - its
		// identity never changes (see the class comment above for why that
		// matters), only its fields, every tick().
		this.datum = { lat: 0, lng: 0, heading: 0 };

		this.prevSample = null;
		this.nextSample = null;
		this.transitionStartMs = 0;
		this.transitionDurationMs = 20000;
	}

	debugLog() {
		if (!this.debug) {
			return;
		}
		Log.info.apply(Log, ["[MMM-Earth3D:FlightLayer]"].concat(Array.prototype.slice.call(arguments)));
	}

	buildPlaneMesh() {
		const geometry = new THREE.ConeGeometry(this.globeRadius * MARKER_SCALE_FRACTION * 0.35, this.globeRadius * MARKER_SCALE_FRACTION, 8);
		// ConeGeometry's apex sits along +Y by default - rotate so it points
		// along +Z instead, matching objectRotation's yaw-about-local-Y
		// convention below (heading 0 = nose along the reference direction
		// objectFacesSurface's own frame treats as "north").
		geometry.rotateX(Math.PI / 2);
		const material = new THREE.MeshLambertMaterial({ color: MARKER_COLOR });
		this.mesh = new THREE.Mesh(geometry, material);
		this.mesh.visible = this.visible;
		return this.mesh;
	}

	// Establishes the objects-layer datum/accessors once. Never calls
	// objectsData() again from here - tick() does, every frame, with the
	// same datum (see the class comment above).
	attachTo(threeGlobeObj) {
		this.threeGlobeObj = threeGlobeObj;
		threeGlobeObj
			.objectsData([this.datum])
			.objectLat("lat")
			.objectLng("lng")
			.objectAltitude(MARKER_ALTITUDE)
			.objectRotation((d) => ({ y: d.heading || 0 }))
			.objectThreeObject(() => this.buildPlaneMesh());
	}

	setPollIntervalMs(ms) {
		this.transitionDurationMs = ms;
	}

	setVisible(visible) {
		this.visible = Boolean(visible);
		if (this.mesh) {
			this.mesh.visible = this.visible;
		}
	}

	// data: { found, lat, lng, heading, ... } from EARTH3D_FLIGHT_POSITION
	// (see Earth3DRenderer.js's updateFlightPosition()). found:false (no
	// current match, or a match with no live position report) hides the
	// marker and resets interpolation rather than leaving it parked at a
	// stale last-known spot.
	pushSample(data) {
		if (!data || !data.found || data.lat == null || data.lng == null) {
			this.setVisible(false);
			this.hasSample = false;
			this.prevSample = null;
			this.nextSample = null;
			return;
		}

		const heading = data.heading || 0;
		// First-ever sample: nothing to interpolate FROM yet, snap directly
		// instead of easing in from (0,0).
		this.prevSample = this.nextSample
			? { lat: this.datum.lat, lng: this.datum.lng, heading: this.datum.heading }
			: { lat: data.lat, lng: data.lng, heading };
		this.nextSample = { lat: data.lat, lng: data.lng, heading };
		this.transitionStartMs = performance.now();
		this.setVisible(true);
	}

	// Returns the currently-displayed (interpolated) lat/lng, or null if no
	// sample has arrived yet - consumed by Earth3DRenderer.tick() for the
	// flights.track camera-centering blend, so the marker and the "centered
	// on camera" point are always exactly the same spot.
	getCurrentPosition() {
		if (!this.hasSample) {
			return null;
		}
		return { lat: this.datum.lat, lng: this.datum.lng };
	}

	tick() {
		if (!this.threeGlobeObj || !this.nextSample) {
			return;
		}
		const now = performance.now();
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
		}
		this.threeGlobeObj = null;
		this.mesh = null;
		this.hasSample = false;
		this.prevSample = null;
		this.nextSample = null;
	}
}
window.FlightLayer = FlightLayer;
