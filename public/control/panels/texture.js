// Texture + quality panel (planet-env.html, "Planet" fieldset) - quality is a separate top-level scalar sharing this fieldset.

let texturePresetEl;

export function init (ctx) {
	texturePresetEl = document.getElementById("texturePreset");
	const texturePresets = (window.EARTH3D_PRESETS && window.EARTH3D_PRESETS.texture) || [];
	ctx.populatePresetSelect(texturePresetEl, texturePresets, false);
	texturePresetEl.addEventListener("change", () => {
		ctx.send({ texture: { preset: texturePresetEl.value } });
	});

	document.getElementById("quality").addEventListener("change", (event) => {
		ctx.send({ quality: event.target.value });
	});
}

export function applyConfig (config) {
	texturePresetEl.value = config.texture.preset;
	document.getElementById("quality").value = config.quality;
}
