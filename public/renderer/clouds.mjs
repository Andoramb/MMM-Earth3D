/* global Log */
// Clouds layer glue (loading/toggling CloudsLayer.mjs) - mixed onto Planet3DRenderer's prototype.

export function applyClouds() {
	this.debugLog("applyClouds", this.config.clouds, "cloudsLayer ready:", Boolean(this.cloudsLayer));
	if (this.cloudsLayer) {
		this.cloudsLayer.setOpacity(this.config.clouds.opacity);
		this.cloudsLayer.setVisible(this.config.clouds.enabled);
		this.cloudsLayer.setDynamic(this.config.clouds.source === "dynamic");
		this.cloudsLayer.setContrast(this.config.clouds.contrast);
		this.cloudsLayer.setNightDarken(this.config.clouds.nightDarken);
		this.cloudsLayer.setAlphaCutoff(this.config.clouds.alphaCutoff);
		this.cloudsLayer.setSpeed(this.config.clouds.speed);
		this.cloudsLayer.setSpeedVariation(this.config.clouds.speedVariation);
		this.cloudsLayer.setSecondary(this.config.clouds.secondary);
	}
	if (this.compositor) {
		this.compositor.applyCloudsConfig();
	}
}

// CloudsLayer.mjs is loaded via dynamic import() rather than MM's getScripts(), since MM core's script loader can silently no-op on an unrecognized extension on some versions.
export function ensureCloudsLayer() {
	if (this.cloudsLayer || this.cloudsLayerImporting || this.destroyed) {
		return;
	}
	this.cloudsLayerImporting = true;
	// Relative specifier resolves against this script's own file URL (dynamic import()'s base), so "../" reaches back to public/.
	import("../CloudsLayer.mjs" + this.cacheBust)
		.then((module) => {
			this.cloudsLayerImporting = false;
			if (this.destroyed || this.cloudsLayer) {
				return;
			}
			this.cloudsLayer = new module.CloudsLayer(this.threeGlobeObj.getGlobeRadius(), Boolean(this.config.debug));
			if (this.pendingCloudsImage) {
				this.applyCloudsImage(this.pendingCloudsImage);
			} else {
				// Mirrors ensureFlightLayer()/ensureStarfieldLayer() syncing current config right after construction - without this, a clouds toggle that landed during this import stays unapplied until an image happens to load.
				this.cloudsLayer.setOpacity(this.config.clouds.opacity);
				this.cloudsLayer.setVisible(this.config.clouds.enabled);
				this.cloudsLayer.setDynamic(this.config.clouds.source === "dynamic");
				this.cloudsLayer.setContrast(this.config.clouds.contrast);
				this.cloudsLayer.setNightDarken(this.config.clouds.nightDarken);
				this.cloudsLayer.setAlphaCutoff(this.config.clouds.alphaCutoff);
				this.cloudsLayer.setSpeed(this.config.clouds.speed);
				this.cloudsLayer.setSpeedVariation(this.config.clouds.speedVariation);
				this.cloudsLayer.setSecondary(this.config.clouds.secondary);
			}
			this.cloudsLayer.setSunDirection(this.pendingCloudsSunDirection);
			if (this.threeGlobeObj) {
				this.cloudsLayer.attachTo(this.threeGlobeObj);
			}
		})
		.catch((err) => {
			this.cloudsLayerImporting = false;
			Log.error("MMM-Planet3D: failed to load CloudsLayer.mjs (" + err.message + ") - clouds will stay disabled");
		});
}

export function applyCloudsImage(image) {
	this.cloudsLayer.setTexture(image);
	this.cloudsLayer.setOpacity(this.config.clouds.opacity);
	this.cloudsLayer.setVisible(this.config.clouds.enabled);
	this.cloudsLayer.setDynamic(this.config.clouds.source === "dynamic");
	this.cloudsLayer.setContrast(this.config.clouds.contrast);
	this.cloudsLayer.setNightDarken(this.config.clouds.nightDarken);
	this.cloudsLayer.setAlphaCutoff(this.config.clouds.alphaCutoff);
	this.cloudsLayer.setSpeed(this.config.clouds.speed);
	this.cloudsLayer.setSpeedVariation(this.config.clouds.speedVariation);
	this.cloudsLayer.setSecondary(this.config.clouds.secondary);
	if (this.threeGlobeObj) {
		this.cloudsLayer.attachTo(this.threeGlobeObj);
	}
}
