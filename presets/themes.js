/* global window */

/*
 * Themes for MMM-Earth3D: named bundles covering every configurable field.
 *
 * Select one via config.theme = "<id>", or leave config.theme = "custom"
 * (the default) to configure everything individually instead.
 *
 * A theme entry can set ANY module config field - rotationSpeed, quality,
 * atmosphere, texture, camera, dayNight, clouds - and anything it doesn't
 * mention just falls back to its normal preset/default. For
 * atmosphere/texture/camera specifically, you can either:
 *   - reference another preset's id (a string, e.g. camera: "close-up"), or
 *   - supply literal values inline (an object, e.g.
 *     camera: { zoom: 30, rotate: [10, 0, 0] })
 * rotate/position accept either { x, y, z } or the more compact [x, y, z]
 * array form (any axis may be omitted) in both cases.
 *
 * Explicit config in config.js (or a live EARTH3D_SET_CONFIG update) always
 * wins over whatever a theme supplies, field by field - see "Custom themes"
 * in README.md for the full resolution order.
 *
 * `stars.js` is listed here for forward-compatibility but isn't rendered
 * yet (see presets/stars.js). There's no `clouds` preset reference - the
 * clouds layer is a separate `clouds.*` config namespace (enabled/source/
 * pollInterval), not a preset-registry asset, since it's fetched/composited
 * rather than picked from a style list; set it directly, e.g.
 * `clouds: { enabled: true, source: "static" }`, same as any other field.
 */
window.EARTH3D_THEMES = [
	{
		id: "realistic",
		name: "Realistic",
		atmosphere: "realistic",
		texture: "blue-marble",
		camera: "default",
		stars: "none"
	},
	{
		id: "nasa",
		name: "NASA",
		atmosphere: "vivid",
		texture: "blue-marble",
		camera: "default",
		stars: "none"
	},
	{
		id: "minimal",
		name: "Minimal",
		atmosphere: "none",
		texture: "blue-marble",
		camera: "wide",
		stars: "none"
	},
	{
		id: "close-up",
		name: "Close-up",
		atmosphere: "subtle",
		texture: "blue-marble",
		camera: "close-up",
		stars: "none"
	},
	{
		id: "mission-control",
		name: "Mission Control",
		rotationSpeed: 35,
		quality: "ultra",
		atmosphere: { color: "#7fd4ff", altitude: 0.18 },
		texture: "blue-marble",
		camera: {
			zoom: 40,
			rotate: [15, 0, 0], // array shorthand for { x: 15, y: 0, z: 0 }
			position: [0, 0, 0]
		},
		dayNight: { mode: "realtime" },
		clouds: { enabled: true, source: "static" }
	}
];
