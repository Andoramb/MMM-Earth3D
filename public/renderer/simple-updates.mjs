// Small config->three-globe update methods that don't warrant their own file - mixed onto Planet3DRenderer's prototype.
import { TRANSITION_MS } from "./constants.mjs";
import { rotationSpeedToDegPerSec } from "./util.mjs";

export function applyRotationSpeed() {
	this.debugLog("applyRotationSpeed", this.config.rotationSpeed);
	this.spinRate.setTarget(rotationSpeedToDegPerSec(this.config.rotationSpeed), TRANSITION_MS);
}

// three-globe's default coefficient uniform (see public/vendor/three-globe.mjs) - strength 1 reproduces it exactly.
const ATMOSPHERE_BASE_COEFFICIENT = 0.1;

// Regular chainable three-globe props apply live with no rebuild; opacity isn't native to three-globe, approximated here as a visibility threshold.
export function applyAtmosphere() {
	const { color, altitude, opacity } = this.config.atmosphere;
	const visible = opacity > 0;
	this.debugLog("applyAtmosphere", { color, altitude, opacity, visible });
	if (!this.threeGlobeObj) {
		return;
	}
	this.threeGlobeObj.showAtmosphere(visible);
	if (visible) {
		this.threeGlobeObj.atmosphereColor(color).atmosphereAltitude(altitude);
	}
	this.applyAtmosphereGlow();
	this.applyAtmosphereFade();
}

// three-globe debounces and rebuilds the atmosphere mesh/material, so tick() calls this every frame; the mesh is nested, hence traverse() not children.find().
export function applyAtmosphereGlow() {
	if (!this.threeGlobeObj) {
		return;
	}
	const strength = this.config.atmosphere.strength ?? 1;
	const opacity = Math.min(Math.max(this.config.atmosphere.opacity, 0), 1);
	let atmosphereMesh = null;
	this.threeGlobeObj.traverse((child) => {
		if (child.__globeObjType === "atmosphere") {
			atmosphereMesh = child;
		}
	});
	if (atmosphereMesh) {
		atmosphereMesh.material.uniforms.coefficient.value = ATMOSPHERE_BASE_COEFFICIENT * strength * opacity;
	}
}

// Live-update entry point for the day/night layer.
export function applyDayNight() {
	this.debugLog("applyDayNight", this.config.dayNight);
	if (this.compositor) {
		this.compositor.scheduleDayNight();
		this.compositor.recompute();
	}
}

// Kept here (not just forwarded to the compositor) since the compositor might not exist yet if this arrives before DOM_OBJECTS_CREATED.
export function setServerTimeOffset(offsetMs) {
	this.debugLog("setServerTimeOffset", offsetMs);
	this.serverTimeOffsetMs = offsetMs;
	if (this.compositor) {
		this.compositor.setServerTimeOffset(offsetMs);
	}
}
