// Planet texture/quality: resolving preset+quality into image URLs and applying them (or NASA GIBS tiles) to the globe - mixed onto Planet3DRenderer's prototype.
import { QUALITY_PRESETS, GIBS_TILE_MAX_LEVEL } from "./constants.mjs";

export function gibsBlueMarbleTileUrl(x, y, level) {
	return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${level}/${y}/${x}.jpeg`;
}

export function resolveTextureUrls() {
	const texture = this.config.texture;
	if (texture.preset === "custom" && texture.imageUrl) {
		return {
			image: texture.imageUrl,
			bump: texture.bumpImageUrl || null
		};
	}

	const preset = (window.PLANET3D_PRESETS.texture || []).find((entry) => entry.id === texture.preset);
	if (!preset) {
		return { image: null, bump: null };
	}
	if (preset.texture.tileEngine) {
		return { image: null, bump: null, tileEngine: true };
	}

	const quality = QUALITY_PRESETS[this.config.quality] || QUALITY_PRESETS.high;
	const images = preset.texture.images;
	const image = images[quality.textureRes] || images["4k"] || Object.values(images)[0];
	const bump = preset.texture.bumpImage;

	return {
		image: image ? this.assetPath(image) : null,
		bump: bump ? this.assetPath(bump) : null
	};
}

// The color map goes through the compositor instead of globeImageUrl directly, since the night layer blends on top of it.
export function applyTexture() {
	const textures = this.resolveTextureUrls();
	this.debugLog("applyTexture", textures);
	if (textures.tileEngine) {
		this.applyTileEngine();
		return;
	}
	if (this.threeGlobeObj) {
		// three-globe keeps its globeObj hidden while globeTileEngineUrl is set, even after globeImageUrl changes - must clear it to leave tile-engine mode.
		this.threeGlobeObj.globeTileEngineUrl(null);
		if (textures.bump) {
			this.threeGlobeObj.bumpImageUrl(textures.bump);
		}
	}
	if (this.compositor) {
		this.compositor.setDayImage(textures.image);
	}
}

// Live, zoomable NASA GIBS satellite tiles instead of the fixed-resolution day/night composite - see GIBS_TILE_MAX_LEVEL above for why level is capped.
export function applyTileEngine() {
	if (!this.threeGlobeObj) {
		return;
	}
	this.debugLog("applyTileEngine");
	this.threeGlobeObj.globeTileEngineUrl(this.gibsBlueMarbleTileUrl).globeTileEngineMaxLevel(GIBS_TILE_MAX_LEVEL);
}

// Antialiasing can't change on an existing WebGL context, so quality changes rebuild the scene - tween/spin state is left untouched, and the texture resolution key is re-picked for the new tier.
export function applyQuality() {
	this.debugLog("applyQuality", this.config.quality);
	// Captured before teardown - restoreCameraState() (called from createControls()) restores it once the rebuild finishes.
	this.captureCameraState();
	// Destroy cloudsLayer BEFORE the globe - avoids a double-dispose when teardownScene() walks the scene; init() rebuilds it fresh.
	if (this.cloudsLayer) {
		this.cloudsLayer.destroy();
		this.cloudsLayer = null;
	}
	if (this.flightLayer) {
		this.flightLayer.destroy();
		this.flightLayer = null;
	}
	this.teardownScene();
	this.init();
}
