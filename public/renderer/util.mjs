// Small math helpers shared across renderer/* submodules.
import { ROTATION_SPEED_MAX_DEG_PER_SEC, ROTATION_SPEED_SATURATION } from "./constants.mjs";

export function rotationSpeedToDegPerSec(speed) {
	return (clamp(speed, 0, ROTATION_SPEED_SATURATION) / 100) * ROTATION_SPEED_MAX_DEG_PER_SEC;
}

export function degToRad(deg) {
	return (deg * Math.PI) / 180;
}

export function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

export function easeInOutCubic(t) {
	return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
