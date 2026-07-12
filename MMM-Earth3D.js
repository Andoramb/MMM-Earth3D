/* global Module, Earth3DRenderer */

/*
 * MMM-Earth3D
 * A MagicMirror module for a rotating 3D Earth (globe.gl).
 */
Module.register("MMM-Earth3D", {
	// Default module config.
	defaults: {
		width: 500,
		height: 500,

		rotationSpeed: 20, // 0-100, spin speed around the globe's vertical axis

		camera: {
			zoom: 50, // 0-100, 0 = close, 100 = far
			rotate: { x: 0, y: 0, z: 0 }, // degrees, fixed tilt of the globe's resting orientation
			position: { x: 0, y: 0, z: 0 } // scene-unit offset (globe radius = 100 units, not CSS pixels)
		},

		quality: "high" // low | medium | high | ultra
	},

	renderer: null,

	start: function () {
		Log.info("Starting module: " + this.name);
		// MM's default config merge is shallow, so a user overriding only
		// e.g. camera.zoom would otherwise silently drop rotate/position.
		this.config.camera = Object.assign({}, this.defaults.camera, this.config.camera, {
			rotate: Object.assign({}, this.defaults.camera.rotate, (this.config.camera || {}).rotate),
			position: Object.assign({}, this.defaults.camera.position, (this.config.camera || {}).position)
		});
	},

	getStyles: function () {
		return ["MMM-Earth3D.css"];
	},

	getScripts: function () {
		return [this.file("public/vendor/globe.gl.min.js"), this.file("public/Earth3DRenderer.js")];
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "MMM-Earth3D";
		wrapper.id = "earth3d-" + this.identifier;
		wrapper.style.width = this.config.width + "px";
		wrapper.style.height = this.config.height + "px";
		return wrapper;
	},

	// globe.gl needs the container attached to the live DOM to measure its
	// size, so the globe is built after MM's initial DOM pass completes.
	notificationReceived: function (notification, payload) {
		if (notification === "DOM_OBJECTS_CREATED") {
			const container = document.getElementById("earth3d-" + this.identifier);
			this.renderer = new Earth3DRenderer(container, this.config);
			return;
		}

		if (notification === "EARTH3D_SET_CONFIG" && this.renderer) {
			this.applyLiveConfig(payload || {});
		}
	},

	// Live-tunes the running globe without a page reload. Send this
	// notification from a MMM-Remote-Control custom notification, e.g.:
	// POST /api/notification/EARTH3D_SET_CONFIG  { "camera": { "zoom": 30 } }
	applyLiveConfig: function (partial) {
		if (partial.rotationSpeed !== undefined) {
			this.config.rotationSpeed = partial.rotationSpeed;
			this.renderer.applyRotationSpeed();
		}

		if (partial.camera) {
			if (partial.camera.zoom !== undefined) {
				this.config.camera.zoom = partial.camera.zoom;
				this.renderer.applyZoom();
			}
			if (partial.camera.rotate) {
				Object.assign(this.config.camera.rotate, partial.camera.rotate);
				this.renderer.applyGlobeTransform();
			}
			if (partial.camera.position) {
				Object.assign(this.config.camera.position, partial.camera.position);
				this.renderer.applyGlobeTransform();
			}
		}

		if (partial.quality !== undefined && partial.quality !== this.config.quality) {
			this.config.quality = partial.quality;
			this.renderer.applyQuality();
		}
	},

	stop: function () {
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
	}
});
