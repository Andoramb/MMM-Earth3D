/* global Log */
// Background sphere / star particles layer - mixed onto Planet3DRenderer's prototype.
import { BACKGROUND_SPHERE_RADIUS_MULTIPLIER, BACKGROUND_SPHERE_SEGMENTS } from "./constants.mjs";

// Toggles/swaps the background sphere or starfield layer; disabling just hides the current one rather than disposing it, so re-enabling is instant.
export function applyBackground() {
	const selection = this.resolveBackgroundSelection();
	this.debugLog("applyBackground", selection);
	this.applyStarfield(selection);
	if (!selection) {
		if (this.backgroundMesh) {
			this.backgroundMesh.visible = false;
		}
		return;
	}
	if (selection.type === "starfield") {
		if (this.backgroundMesh) {
			this.backgroundMesh.visible = false;
		}
		return;
	}
	if (this.backgroundMesh && this.backgroundMesh.userData.url === selection.url) {
		this.backgroundMesh.visible = true;
		return;
	}
	this.loadBackgroundTexture(selection.url);
}

// Pushes background.starfield's count/size/color/etc into the star point-clouds and toggles their visibility - selection is applyBackground()'s already-resolved choice.
export function applyStarfield(selection) {
	if (!this.starfieldLayer) {
		return;
	}
	const starfield = this.config.background.starfield;
	this.debugLog("applyStarfield", starfield);
	this.starfieldLayer.setVisible(Boolean(selection && selection.type === "starfield"));
	this.starfieldLayer.setConfig(starfield);
}

// Returns null (background off/unresolved), { type: "starfield" }, or { type: "image", url }.
export function resolveBackgroundSelection() {
	const background = this.config.background;
	if (!background || !background.enabled) {
		return null;
	}
	if (background.preset === "custom") {
		return background.imageUrl ? { type: "image", url: background.imageUrl } : null;
	}
	const preset = (window.PLANET3D_PRESETS.background || []).find((entry) => entry.id === background.preset);
	if (!preset) {
		return null;
	}
	if (preset.background.starfield) {
		return { type: "starfield" };
	}
	if (!preset.background.imageUrl) {
		return null;
	}
	return { type: "image", url: this.assetPath(preset.background.imageUrl) };
}

// requestId guards against a slow-loading earlier request clobbering a newer one that already finished.
export function loadBackgroundTexture(url) {
	if (!this.threeGlobeObj || !this.THREE) {
		return;
	}
	const requestId = ++this.backgroundLoadId;
	new this.THREE.TextureLoader().load(url, (texture) => {
		if (this.destroyed || requestId !== this.backgroundLoadId) {
			texture.dispose();
			return;
		}
		texture.colorSpace = this.THREE.SRGBColorSpace;
		if (!this.backgroundMesh) {
			const radius = this.threeGlobeObj.getGlobeRadius() * BACKGROUND_SPHERE_RADIUS_MULTIPLIER;
			const geometry = new this.THREE.SphereGeometry(radius, BACKGROUND_SPHERE_SEGMENTS, BACKGROUND_SPHERE_SEGMENTS);
			// Mirrored (not BackSide) so the inside view isn't texture-flipped - BackSide alone reverses apparent rotation vs the globe.
			geometry.scale(-1, 1, 1);
			const material = new this.THREE.MeshBasicMaterial({ map: texture });
			this.backgroundMesh = new this.THREE.Mesh(geometry, material);
			this.threeGlobeObj.add(this.backgroundMesh);
		} else {
			if (this.backgroundMesh.material.map) {
				this.backgroundMesh.material.map.dispose();
			}
			this.backgroundMesh.material.map = texture;
		}
		this.backgroundMesh.userData.url = url;
		this.backgroundMesh.visible = true;
	});
}

// StarfieldLayer.mjs is loaded the same way and for the same reason as
// CloudsLayer.mjs (see clouds.mjs). Built unconditionally regardless of the current
// background preset (like clouds/flights) so switching to the
// "star-particles" preset later is instant - applyBackground() drives its
// visibility once it exists.
export function ensureStarfieldLayer() {
	if (this.starfieldLayer || this.starfieldLayerImporting || this.destroyed) {
		return;
	}
	this.starfieldLayerImporting = true;
	import("../StarfieldLayer.mjs" + this.cacheBust)
		.then((module) => module.StarfieldLayer.create(this.threeGlobeObj.getGlobeRadius(), Boolean(this.config.debug), this.config.background.starfield, this.cacheBust))
		.then((layer) => {
			this.starfieldLayerImporting = false;
			if (this.destroyed || this.starfieldLayer) {
				return;
			}
			this.starfieldLayer = layer;
			if (this.threeGlobeObj) {
				this.starfieldLayer.attachTo(this.threeGlobeObj);
			}
			this.applyStarfield(this.resolveBackgroundSelection());
		})
		.catch((err) => {
			this.starfieldLayerImporting = false;
			Log.error("MMM-Planet3D: failed to load StarfieldLayer.mjs (" + err.message + ") - star particles will stay disabled");
		});
}
