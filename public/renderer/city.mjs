// City/POI markers + "center camera on city" spin - mixed onto Planet3DRenderer's prototype. Uses three-globe's native labelsData layer (see https://github.com/vasturiano/three-globe/blob/master/example/labels/index.html), not CSS2D-mounted HTML - a 3D-anchored label tracks the globe's own transform automatically, with no separate render pass to keep in sync.
import { CENTER_ON_CITY_TRANSITION_MS } from "./constants.mjs";
import { degToRad } from "./util.mjs";

const LABEL_COLOR = "#ffffff";
const LABEL_SIZE_DEG = 0.9;
const LABEL_DOT_RADIUS_DEG = 0.35;
const LABEL_ALTITUDE = 0.01;

export function applyCity() {
	if (!this.threeGlobeObj) {
		return;
	}
	const city = this.config.city;
	this.debugLog("applyCity", city);
	const places = (city && city.cities) ? city.cities.filter((c) => c.lat !== null && c.lng !== null) : [];
	this.threeGlobeObj
		.labelsData(places)
		.labelLat("lat")
		.labelLng("lng")
		.labelText((p) => p.name)
		.labelSize(LABEL_SIZE_DEG)
		.labelDotRadius(LABEL_DOT_RADIUS_DEG)
		// A bare string accessor is a per-entry property lookup in three-globe's convention (matching labelLat("lat") above) - a constant needs a function, or it reads place["#ffffff"] (always undefined) instead.
		.labelColor(() => LABEL_COLOR)
		.labelAltitude(LABEL_ALTITUDE);
}

// Eases the globe's spin (only spinAngle, not tilt) so the given lat/lng faces the camera, by projecting city and camera direction onto the plane perpendicular to the tilted polar axis and solving the angle between them; undefined (city on the axis) leaves spin alone.
export function centerOnCity(lat, lng) {
	if (!this.threeGlobeObj || !this.camera || !this.THREE || typeof lat !== "number" || typeof lng !== "number") {
		return;
	}
	const THREE = this.THREE;
	const { rotate } = this.config.camera;
	const tiltQuat = new THREE.Quaternion().setFromEuler(
		new THREE.Euler(degToRad(rotate.x), degToRad(rotate.y), degToRad(rotate.z), "XYZ")
	);
	const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(tiltQuat);

	const coords = this.threeGlobeObj.getCoords(lat, lng, 0);
	const tiltedCity = new THREE.Vector3(coords.x, coords.y, coords.z).applyQuaternion(tiltQuat);
	const toCamera = this.camera.position.clone().sub(this.threeGlobeObj.position).normalize();

	const projectOnPlane = (v) => v.clone().sub(axis.clone().multiplyScalar(v.dot(axis)));
	const cityPerp = projectOnPlane(tiltedCity);
	const cameraPerp = projectOnPlane(toCamera);
	if (cityPerp.lengthSq() < 1e-6 || cameraPerp.lengthSq() < 1e-6) {
		this.debugLog("centerOnCity: azimuth undefined (city on tilt axis) - leaving spin alone", { lat, lng });
		return;
	}

	const targetAngle = Math.atan2(
		new THREE.Vector3().crossVectors(cityPerp, cameraPerp).dot(axis),
		cityPerp.dot(cameraPerp)
	);

	// spinAngle accumulates without wrapping, so pick the full-turn offset of targetAngle nearest the current spinAngle for the shortest visible rotation.
	const twoPi = Math.PI * 2;
	const target = targetAngle + Math.round((this.spinAngle - targetAngle) / twoPi) * twoPi;
	this.debugLog("centerOnCity", { lat, lng, from: this.spinAngle, to: target });
	this.spinOverrideTween = { from: this.spinAngle, to: target, startTime: performance.now(), duration: CENTER_ON_CITY_TRANSITION_MS };
}
