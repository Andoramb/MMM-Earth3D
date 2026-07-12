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
	notificationReceived: function (notification) {
		if (notification === "DOM_OBJECTS_CREATED") {
			const container = document.getElementById("earth3d-" + this.identifier);
			this.renderer = new Earth3DRenderer(container, this.config);
		}
	},

	stop: function () {
		if (this.renderer) {
			this.renderer.destroy();
			this.renderer = null;
		}
	}
});
