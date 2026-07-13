/* global window */

/*
 * Starfield / space background presets for MMM-Earth3D.
 *
 * NOT YET RENDERED - Earth3DRenderer doesn't draw a starfield yet, this is
 * data-only scaffolding so the registry/theme shape is ready when that
 * feature is implemented. Kept deliberately minimal: a future
 * folder-scanning background picker (see tasklist.md) may replace
 * `imageUrl` with a directory listing instead of a fixed preset list, so
 * avoid building more structure on top of this until that's settled.
 */
window.EARTH3D_PRESETS = window.EARTH3D_PRESETS || {};
window.EARTH3D_PRESETS.stars = [
	{
		id: "none",
		name: "No stars",
		stars: { imageUrl: null }
	}
];
