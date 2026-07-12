/* global Globe */

/*
 * Earth3DRenderer
 * Owns the globe.gl/WebGL scene for MMM-Earth3D. Kept separate from the
 * MagicMirror module file so future features (clouds, day/night, markers,
 * live data overlays) grow here without touching MM lifecycle code.
 */
class Earth3DRenderer {
	constructor(container, config) {
		this.container = container;
		this.config = config;
		this.globe = this.buildGlobe();
	}

	buildGlobe() {
		const globe = new Globe(this.container)
			.width(this.config.width)
			.height(this.config.height)
			.backgroundColor("rgba(0,0,0,0)")
			.globeImageUrl(this.assetPath("img/earth-blue-marble.jpg"))
			.bumpImageUrl(this.assetPath("img/earth-topology.png"))
			.showAtmosphere(true)
			.atmosphereColor("lightskyblue")
			.atmosphereAltitude(0.15);

		const controls = globe.controls();
		controls.autoRotate = true;
		controls.autoRotateSpeed = this.config.rotationSpeed;
		controls.enableZoom = false;

		return globe;
	}

	assetPath(relativePath) {
		return "modules/MMM-Earth3D/public/" + relativePath;
	}

	destroy() {
		if (this.globe) {
			this.globe._destructor();
			this.globe = null;
		}
	}
}
