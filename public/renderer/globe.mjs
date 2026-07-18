// Globe positioning: owns this.threeGlobeObj/this.posX/this.posY/this.tiltX-Z/this.spinAngle (the globe's own pan/tilt/spin) - mixed onto Planet3DRenderer's prototype. The camera and its orbit target are never touched here, see camera.mjs.
import { TRANSITION_MS, POSITION_BOUND } from "./constants.mjs";
import { degToRad, clamp } from "./util.mjs";

export function handlePointerDown(event) {
	if (!event.shiftKey || !this.controls || this.flightTrackBlend.current > 0.001) {
		return;
	}
	event.preventDefault();
	const wasRotateEnabled = this.controls.enableRotate;
	this.controls.enableRotate = false;
	let lastX = event.clientX;
	let lastY = event.clientY;
	const onMove = (moveEvent) => {
		this.panGlobe(moveEvent.clientX - lastX, moveEvent.clientY - lastY);
		lastX = moveEvent.clientX;
		lastY = moveEvent.clientY;
	};
	const onUp = () => {
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		this.controls.enableRotate = wasRotateEnabled;
		this.config.camera.position.x = this.posX.to;
		this.config.camera.position.y = this.posY.to;
		this.scheduleInteractiveCommit({ position: { x: this.posX.to, y: this.posY.to } });
	};
	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
}

// Moves the globe (this.posX/this.posY), not the camera - converts a screen-pixel drag delta into a world-space offset along the camera's current screen-aligned right/up axes (same approach OrbitControls' own pan uses, just applied to the globe instead), then drops the resulting Z component since the globe's position is X/Y only.
export function panGlobe(deltaPixelX, deltaPixelY) {
	const THREE = this.THREE;
	const distance = this.camera.position.distanceTo(this.controls.target);
	const visibleHeight = 2 * distance * Math.tan(degToRad(this.camera.fov) / 2);
	const unitsPerPixel = visibleHeight / this.renderer.domElement.clientHeight;
	// A zero-size canvas (container mid-layout) would otherwise divide into a non-finite offset that silently freezes the globe with no visible error.
	if (!Number.isFinite(unitsPerPixel)) {
		return;
	}
	const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
	const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
	const offset = right.multiplyScalar(-deltaPixelX * unitsPerPixel).add(up.multiplyScalar(deltaPixelY * unitsPerPixel));
	// Integer scene units to match the control panel's whole-number position sliders - a sub-pixel drag can otherwise leave posX/posY with long decimal tails.
	const newX = clamp(Math.round(this.posX.to + offset.x), -POSITION_BOUND, POSITION_BOUND);
	const newY = clamp(Math.round(this.posY.to + offset.y), -POSITION_BOUND, POSITION_BOUND);
	this.posX.setTarget(newX, 0);
	this.posY.setTarget(newY, 0);
}

// Globe positioning entry point: retargets this.tiltX-Z/this.posX-Y (the globe's own resting tilt/pan) - never touches the camera or its orbit target.
export function applyGlobeTransform() {
	const { rotate, position } = this.config.camera;
	this.debugLog("applyGlobeTransform", { rotate, position });
	this.tiltX.setTarget(rotate.x, TRANSITION_MS);
	this.tiltY.setTarget(rotate.y, TRANSITION_MS);
	this.tiltZ.setTarget(rotate.z, TRANSITION_MS);
	this.posX.setTarget(position.x, TRANSITION_MS);
	this.posY.setTarget(position.y, TRANSITION_MS);
}

// Per-frame globe positioning: sets this.threeGlobeObj's own quaternion/position from the tweened tilt/spin/pan state - the camera/controls.target are only ever read here (for flight-track facing), never written.
export function updateGlobeTransform() {
	if (!this.threeGlobeObj) {
		return;
	}
	// Base orientation: tweened fixed tilt with accumulated spin applied as a local-axis rotation on top, built as a quaternion so it can slerp against the flight-tracking quaternion below without an Euler discontinuity.
	const qBase = new this.THREE.Quaternion().setFromEuler(
		new this.THREE.Euler(degToRad(this.tiltX.current), degToRad(this.tiltY.current), degToRad(this.tiltZ.current))
	);
	const qSpin = new this.THREE.Quaternion().setFromAxisAngle(new this.THREE.Vector3(0, 1, 0), this.spinAngle);
	let qFinal = qBase.multiply(qSpin);

	// flights.track slerps the globe's rotation to face the tracked flight toward the camera (rotating the globe, not the camera - a literal camera-follow fought OrbitControls' fixed target offset, see git history); spinAngle keeps accumulating so un-tracking resumes from wherever it landed.
	const flightPosition = (this.flightLayer && this.flightTrackBlend.current > 0.001)
		? this.flightLayer.getCurrentPosition()
		: null;
	if (flightPosition && this.camera && this.controls) {
		const coords = this.threeGlobeObj.getCoords(flightPosition.lat, flightPosition.lng, 0);
		const pointLocal = new this.THREE.Vector3(coords.x, coords.y, coords.z).normalize();
		const cameraDirWorld = this.camera.position.clone().sub(this.controls.target).normalize();
		const qTrack = new this.THREE.Quaternion().setFromUnitVectors(pointLocal, cameraDirWorld);
		qFinal = qFinal.slerp(qTrack, this.flightTrackBlend.current);
	}

	this.threeGlobeObj.quaternion.copy(qFinal);
	this.threeGlobeObj.position.set(this.posX.current, this.posY.current, 0);
	// The camera/OrbitControls target are deliberately left untouched - X/Y pan and flights.track both rely on panning the globe object itself.

	// Manual orbiting while a flight is tracked would fight the auto-recentering above, so drag is locked while any blend is active.
	if (this.controls) {
		this.controls.enableRotate = this.flightTrackBlend.current <= 0.001;
	}
}
