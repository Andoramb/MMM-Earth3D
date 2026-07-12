/* global Module */

/*
 * MMM-Earth3D
 * A MagicMirror module for a rotating 3D Earth (globe.gl).
 */
Module.register("MMM-Earth3D", {
	// Default module config.
	defaults: {},

	start: function () {
		Log.info("Starting module: " + this.name);
	},

	getStyles: function () {
		return ["MMM-Earth3D.css"];
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		wrapper.className = "MMM-Earth3D";
		return wrapper;
	}
});
