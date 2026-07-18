// Clouds panel (layers.html).

let cloudsSourceEl;
let cloudsSourceHint;
let cloudsDynamicHint;
let cloudsOpacityRow;
let cloudsContrastRow;
let cloudsSpeedRow;
let cloudsSpeedVariationRow;
let cloudsNightDarkenRow;
let cloudsAlphaCutoffRow;
let cloudsSecondaryControls;

function syncVisibility () {
	const enabled = cloudsSourceEl.value !== "disabled";
	cloudsOpacityRow.classList.toggle("visible", enabled);
	cloudsContrastRow.classList.toggle("visible", enabled);
	cloudsSpeedRow.classList.toggle("visible", enabled);
	cloudsSpeedVariationRow.classList.toggle("visible", enabled);
	cloudsNightDarkenRow.classList.toggle("visible", enabled);
	cloudsAlphaCutoffRow.classList.toggle("visible", enabled);
	cloudsSourceHint.classList.toggle("visible", cloudsSourceEl.value === "realtime");
	cloudsDynamicHint.classList.toggle("visible", cloudsSourceEl.value === "dynamic");
	cloudsSecondaryControls.classList.toggle("visible", cloudsSourceEl.value === "dynamic");
}

export function init (ctx) {
	cloudsSourceEl = document.getElementById("cloudsSource");
	cloudsSourceHint = document.getElementById("cloudsSourceHint");
	cloudsDynamicHint = document.getElementById("cloudsDynamicHint");
	cloudsOpacityRow = document.getElementById("cloudsOpacityRow");
	cloudsContrastRow = document.getElementById("cloudsContrastRow");
	cloudsSpeedRow = document.getElementById("cloudsSpeedRow");
	cloudsSpeedVariationRow = document.getElementById("cloudsSpeedVariationRow");
	cloudsNightDarkenRow = document.getElementById("cloudsNightDarkenRow");
	cloudsAlphaCutoffRow = document.getElementById("cloudsAlphaCutoffRow");
	cloudsSecondaryControls = document.getElementById("cloudsSecondaryControls");

	cloudsSourceEl.addEventListener("change", () => {
		syncVisibility();
		if (cloudsSourceEl.value === "disabled") {
			ctx.send({ clouds: { enabled: false } });
		} else {
			ctx.send({ clouds: { enabled: true, source: cloudsSourceEl.value } });
		}
	});
	ctx.bindSlider("cloudsOpacity", (value) => ctx.send({ clouds: { opacity: value / 100 } }));
	ctx.bindSlider("cloudsContrast", (value) => ctx.send({ clouds: { contrast: value / 100 } }));
	ctx.bindSlider("cloudsSpeed", (value) => ctx.send({ clouds: { speed: value / 100 } }));
	ctx.bindSlider("cloudsSpeedVariation", (value) => ctx.send({ clouds: { speedVariation: value / 100 } }));
	ctx.bindSlider("cloudsNightDarken", (value) => ctx.send({ clouds: { nightDarken: value / 100 } }));
	ctx.bindSlider("cloudsAlphaCutoff", (value) => ctx.send({ clouds: { alphaCutoff: value / 100 } }));
	ctx.bindSlider("cloudsSecondaryOpacity", (value) => ctx.send({ clouds: { secondary: { opacity: value / 100 } } }));
	ctx.bindSlider("cloudsSecondaryContrast", (value) => ctx.send({ clouds: { secondary: { contrast: value / 100 } } }));
	ctx.bindSlider("cloudsSecondarySpeed", (value) => ctx.send({ clouds: { secondary: { speed: value / 100 } } }));
	ctx.bindSlider("cloudsSecondarySpeedVariation", (value) => ctx.send({ clouds: { secondary: { speedVariation: value / 100 } } }));

	function bindReset (id, field, deepKey) {
		document.querySelector('[data-reset-target="' + id + '"]').addEventListener("click", () => {
			const value = ctx.resolveThemeValue("clouds", null, field, deepKey);
			ctx.setSliderValue(id, Math.round(value * 100));
			ctx.send({ clouds: deepKey ? { secondary: { [field]: null } } : { [field]: null } });
		});
	}
	bindReset("cloudsOpacity", "opacity");
	bindReset("cloudsContrast", "contrast");
	bindReset("cloudsSpeed", "speed");
	bindReset("cloudsSpeedVariation", "speedVariation");
	bindReset("cloudsNightDarken", "nightDarken");
	bindReset("cloudsAlphaCutoff", "alphaCutoff");
	bindReset("cloudsSecondaryOpacity", "opacity", "secondary");
	bindReset("cloudsSecondaryContrast", "contrast", "secondary");
	bindReset("cloudsSecondarySpeed", "speed", "secondary");
	bindReset("cloudsSecondarySpeedVariation", "speedVariation", "secondary");

	syncVisibility();
}

export function applyConfig (config, ctx) {
	cloudsSourceEl.value = config.clouds.enabled ? config.clouds.source : "disabled";
	ctx.setSliderValue("cloudsOpacity", Math.round(config.clouds.opacity * 100));
	ctx.setSliderValue("cloudsContrast", Math.round(config.clouds.contrast * 100));
	ctx.setSliderValue("cloudsSpeed", Math.round(config.clouds.speed * 100));
	ctx.setSliderValue("cloudsSpeedVariation", Math.round(config.clouds.speedVariation * 100));
	ctx.setSliderValue("cloudsNightDarken", Math.round(config.clouds.nightDarken * 100));
	ctx.setSliderValue("cloudsAlphaCutoff", Math.round(config.clouds.alphaCutoff * 100));
	ctx.setSliderValue("cloudsSecondaryOpacity", Math.round(config.clouds.secondary.opacity * 100));
	ctx.setSliderValue("cloudsSecondaryContrast", Math.round(config.clouds.secondary.contrast * 100));
	ctx.setSliderValue("cloudsSecondarySpeed", Math.round(config.clouds.secondary.speed * 100));
	ctx.setSliderValue("cloudsSecondarySpeedVariation", Math.round(config.clouds.secondary.speedVariation * 100));
	syncVisibility();
}
