// Camera positioning: owns this.camera/this.controls/this.zoomAltitude (view distance and orbit target) - mixed onto Planet3DRenderer's prototype. See globe.mjs for the separate object the globe itself is moved/spun through.
import {
	TRANSITION_MS, WHEEL_ZOOM_STEP, WHEEL_ZOOM_TWEEN_MS,
	ZOOM_ALTITUDE_MIN, ZOOM_ALTITUDE_MAX, ZOOM_EXTENDED_MAX, ZOOM_ALTITUDE_SUPER_MIN,
	ZOOM_TILE_EXTENDED_MAX, ZOOM_ALTITUDE_TILE_MIN
} from "./constants.mjs";
import { clamp } from "./util.mjs";

// Snapshots the camera's manually-orbited view before a quality-triggered rebuild (see applyQuality()) - restoreCameraState() puts it back once the new camera/controls exist.
export function captureCameraState() {
	if (this.camera && this.controls) {
		this.pendingCameraState = { position: this.camera.position.clone(), target: this.controls.target.clone() };
	}
}

// createCamera() always starts fresh at (0,0,1)/target-origin - without this a quality change would silently snap the view back to the default framing instead of keeping the user's orbit/zoom.
export function restoreCameraState() {
	if (!this.pendingCameraState) {
		return;
	}
	this.camera.position.copy(this.pendingCameraState.position);
	this.controls.target.copy(this.pendingCameraState.target);
	this.controls.update();
	this.pendingCameraState = null;
}

// Scroll-zoom: drives config.camera.zoom/this.zoomAltitude (camera distance), never the globe's own position.
export function handleWheel(event) {
	event.preventDefault();
	const step = event.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
	const zoom = clamp(this.config.camera.zoom + step, 0, this.getZoomMax());
	this.config.camera.zoom = zoom;
	this.zoomAltitude.setTarget(this.zoomToAltitude(zoom), WHEEL_ZOOM_TWEEN_MS);
	this.scheduleInteractiveCommit({ zoom });
}

// Camera positioning entry point: retargets this.zoomAltitude (view distance) only - see updateCameraFraming() for how it turns into an actual camera.position each frame.
export function applyZoom() {
	this.debugLog("applyZoom", this.config.camera.zoom);
	this.zoomAltitude.setTarget(this.zoomToAltitude(this.config.camera.zoom), TRANSITION_MS);
}

// tile-engine has no fixed source resolution to run out of, so it gets a third, closer sub-range (200-400) on top of the normal 0-200.
export function getZoomMax() {
	return (this.config.texture && this.config.texture.preset === "tile-engine") ? ZOOM_TILE_EXTENDED_MAX : ZOOM_EXTENDED_MAX;
}

// Piecewise so the existing 0-100/100-200 mapping is unaffected, while 200-400 (tile-engine only) extends into a third closer sub-range instead of extrapolating (which would go negative past zoom:200).
export function zoomToAltitude(zoom) {
	const max = this.getZoomMax();
	const z = clamp(zoom, 0, max);
	if (z <= 100) {
		const t = z / 100;
		return ZOOM_ALTITUDE_MAX - t * (ZOOM_ALTITUDE_MAX - ZOOM_ALTITUDE_MIN);
	}
	if (z <= ZOOM_EXTENDED_MAX) {
		const t = (z - 100) / (ZOOM_EXTENDED_MAX - 100);
		return ZOOM_ALTITUDE_MIN - t * (ZOOM_ALTITUDE_MIN - ZOOM_ALTITUDE_SUPER_MIN);
	}
	const t = (z - ZOOM_EXTENDED_MAX) / (max - ZOOM_EXTENDED_MAX);
	return ZOOM_ALTITUDE_SUPER_MIN - t * (ZOOM_ALTITUDE_SUPER_MIN - ZOOM_ALTITUDE_TILE_MIN);
}

// Per-frame camera positioning: keeps the camera's current bearing around controls.target, only ever changing its distance to match this.zoomAltitude - never touches this.threeGlobeObj's own position/rotation.
export function updateCameraFraming() {
	if (!this.camera || !this.controls || !this.threeGlobeObj) {
		return;
	}
	const offset = this.camera.position.clone().sub(this.controls.target);
	offset.setLength(this.threeGlobeObj.getGlobeRadius() * (1 + this.zoomAltitude.current));
	this.camera.position.copy(this.controls.target).add(offset);
	this.controls.update();
	// three-globe's tile engine only fetches/builds tiles in response to this call - without it globeTileEngineUrl mode never requests a single tile and renders fully transparent.
	this.threeGlobeObj.setPointOfView(this.camera);
}
