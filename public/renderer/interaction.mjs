// Wires Shift+drag pan / scroll zoom DOM listeners and debounces their commit back to the module - mixed onto Planet3DRenderer's prototype. Actual pan/zoom math lives in globe.mjs/camera.mjs.
import { INTERACTIVE_COMMIT_DEBOUNCE_MS } from "./constants.mjs";

// Shift+drag pans the globe on the X/Y plane (config.camera.position); plain scroll zooms (config.camera.zoom) - both tween instantly for direct-manipulation feel, then commit back to the module once the gesture settles so the resolved config (and control.html's next read of it) picks it up.
export function setupInteraction() {
	const el = this.renderer.domElement;
	el.addEventListener("wheel", (event) => this.handleWheel(event), { passive: false });
	el.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
}

export function scheduleInteractiveCommit(patch) {
	this.pendingInteractiveCommit = Object.assign(this.pendingInteractiveCommit || {}, patch);
	clearTimeout(this.interactiveCommitTimer);
	this.interactiveCommitTimer = setTimeout(() => {
		const pending = this.pendingInteractiveCommit;
		this.pendingInteractiveCommit = null;
		if (this.onInteractiveCameraChange) {
			this.onInteractiveCameraChange(pending);
		}
	}, INTERACTIVE_COMMIT_DEBOUNCE_MS);
}
