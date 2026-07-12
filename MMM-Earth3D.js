/* global Module */

/*
 * MMM-Earth3D
 * A MagicMirror module for a rotating 3D Earth (globe.gl).
 */
Module.register("MMM-Earth3D", {
	// Default module config.
	defaults: {
		width: 500,
		height: 500,
		rotationSpeed: 0.3
	},

	start: function () {
		Log.info("Starting module: " + this.name);
	},

	getStyles: function () {
		return ["MMM-Earth3D.css"];
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "MMM-Earth3D";
		wrapper.innerHTML = "&#127760; Earth3D module loaded";
		return wrapper;
	}
});
