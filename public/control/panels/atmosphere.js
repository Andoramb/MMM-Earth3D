// Atmosphere panel (layers.html).

let atmospherePresetEl;

export function init (ctx) {
	atmospherePresetEl = document.getElementById("atmospherePreset");
	const atmospherePresets = (window.EARTH3D_PRESETS && window.EARTH3D_PRESETS.atmosphere) || [];
	ctx.populatePresetSelect(atmospherePresetEl, atmospherePresets, true, "none");

	function sendCustomAtmosphere (patch) {
		atmospherePresetEl.value = "custom";
		ctx.send({ atmosphere: Object.assign({ preset: "custom" }, patch) });
	}

	document.getElementById("atmosphereColor").addEventListener("input", (event) => {
		sendCustomAtmosphere({ color: event.target.value });
	});
	ctx.bindSlider("atmosphereAltitude", (value) => sendCustomAtmosphere({ altitude: value / 100 }));
	ctx.bindSlider("atmosphereOpacity", (value) => sendCustomAtmosphere({ opacity: value / 100 }));

	atmospherePresetEl.addEventListener("change", () => {
		if (atmospherePresetEl.value === "custom") {
			ctx.send({ atmosphere: { preset: "custom" } });
			return;
		}
		const preset = atmospherePresets.find((entry) => entry.id === atmospherePresetEl.value);
		if (!preset) {
			return;
		}
		document.getElementById("atmosphereColor").value = preset.atmosphere.color;
		ctx.setSliderValue("atmosphereAltitude", Math.round(preset.atmosphere.altitude * 100));
		ctx.setSliderValue("atmosphereOpacity", Math.round((preset.atmosphere.opacity !== undefined ? preset.atmosphere.opacity : 1) * 100));
		ctx.send({ atmosphere: { preset: preset.id } });
	});

	document.querySelector('[data-reset-target="atmosphereColor"]').addEventListener("click", () => {
		const value = ctx.resolveThemeValue("atmosphere", atmospherePresetEl, "color");
		document.getElementById("atmosphereColor").value = value;
		ctx.send({ atmosphere: { color: null } });
	});
	document.querySelector('[data-reset-target="atmosphereAltitude"]').addEventListener("click", () => {
		const value = ctx.resolveThemeValue("atmosphere", atmospherePresetEl, "altitude");
		ctx.setSliderValue("atmosphereAltitude", Math.round(value * 100));
		ctx.send({ atmosphere: { altitude: null } });
	});
	document.querySelector('[data-reset-target="atmosphereOpacity"]').addEventListener("click", () => {
		const value = ctx.resolveThemeValue("atmosphere", atmospherePresetEl, "opacity");
		ctx.setSliderValue("atmosphereOpacity", Math.round(value * 100));
		ctx.send({ atmosphere: { opacity: null } });
	});
}

export function applyConfig (config, ctx) {
	atmospherePresetEl.value = config.atmosphere.preset;
	document.getElementById("atmosphereColor").value = config.atmosphere.color;
	ctx.setSliderValue("atmosphereAltitude", Math.round(config.atmosphere.altitude * 100));
	ctx.setSliderValue("atmosphereOpacity", Math.round(config.atmosphere.opacity * 100));
}
