
// Background presets - select via config.background.preset ("custom" + imageUrl for your own); only shown when config.background.enabled is true.
window.PLANET3D_PRESETS = window.PLANET3D_PRESETS || {};
window.PLANET3D_PRESETS.background = [
	{
		id: "night-sky",
		name: "Night Sky",
		background: {
			imageUrl: "img/backgrounds/night-sky.png"
		}
	},
	{
		id: "star-particles",
		name: "Star Particles",
		background: {
			// No imageUrl - flags Planet3DRenderer.mjs's resolveBackgroundSelection() to
			// use StarfieldLayer.mjs's real 3D point-cloud stars instead of a flat image.
			starfield: true
		}
	}
];
