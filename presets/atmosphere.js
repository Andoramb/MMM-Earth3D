/* global window */

// Atmosphere presets - select via config.atmosphere.preset, or "custom" for the manual fields below.
window.PLANET3D_PRESETS = window.PLANET3D_PRESETS || {};
window.PLANET3D_PRESETS.atmosphere = [
	{
		id: "none",
		name: "Disabled",
		atmosphere: { color: "#ffffff", altitude: 0, opacity: 0, strength: 1, fadeIn: 8 }
	},
	{
		id: "realistic",
		name: "Realistic",
		atmosphere: { color: "#4aa8ff", altitude: 0.15, opacity: 1, strength: 1, fadeIn: 8 }
	},
	{
		id: "vivid",
		name: "Vivid Blue",
		atmosphere: { color: "#66ccff", altitude: 0.22, opacity: 1, strength: 1, fadeIn: 8 }
	},
	{
		id: "subtle",
		name: "Subtle Haze",
		atmosphere: { color: "#a8c8ff", altitude: 0.08, opacity: 0.6, strength: 1, fadeIn: 8 }
	}
];
