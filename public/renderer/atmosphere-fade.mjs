/* global Log */
// Atmosphere fade-in layer glue (loading/tuning AtmosphereFadeLayer.mjs) - mixed onto Planet3DRenderer's prototype.

const PEAK_ALPHA = 0.35; // glow strength at disk center before the opacity/strength multipliers below

export function applyAtmosphereFade() {
	if (!this.atmosphereFadeLayer) {
		return;
	}
	const { color, opacity, strength, fadeIn } = this.config.atmosphere;
	this.atmosphereFadeLayer.setColor(color);
	this.atmosphereFadeLayer.setPeakAlpha(PEAK_ALPHA * Math.min(Math.max(opacity, 0), 1) * (strength ?? 1));
	this.atmosphereFadeLayer.setFadeInDegrees(fadeIn ?? 0);
}

// AtmosphereFadeLayer.mjs is loaded via dynamic import() rather than MM's getScripts(), since MM core's script loader can silently no-op on an unrecognized extension on some versions.
export function ensureAtmosphereFadeLayer() {
	if (this.atmosphereFadeLayer || this.atmosphereFadeLayerImporting || this.destroyed) {
		return;
	}
	this.atmosphereFadeLayerImporting = true;
	import("../AtmosphereFadeLayer.mjs" + this.cacheBust)
		.then((module) => {
			this.atmosphereFadeLayerImporting = false;
			if (this.destroyed || this.atmosphereFadeLayer) {
				return;
			}
			this.atmosphereFadeLayer = new module.AtmosphereFadeLayer(this.threeGlobeObj.getGlobeRadius());
			if (this.threeGlobeObj) {
				this.atmosphereFadeLayer.attachTo(this.threeGlobeObj);
			}
			this.applyAtmosphereFade();
		})
		.catch((err) => {
			this.atmosphereFadeLayerImporting = false;
			Log.error("MMM-Planet3D: failed to load AtmosphereFadeLayer.mjs (" + err.message + ") - the inward atmosphere fade will stay disabled");
		});
}
