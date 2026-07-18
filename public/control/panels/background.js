// Background panel (planet-env.html) - single select combining on/off and preset choice, "Disabled" last.

let backgroundSelectEl;
let backgroundHintEl;

function syncHint () {
	backgroundHintEl.classList.toggle("visible", backgroundSelectEl.value !== "disabled");
}

export function init (ctx) {
	backgroundSelectEl = document.getElementById("backgroundPreset");
	backgroundHintEl = document.getElementById("backgroundHint");

	const presets = (window.EARTH3D_PRESETS && window.EARTH3D_PRESETS.background) || [];
	for (const preset of presets) {
		const option = document.createElement("option");
		option.value = preset.id;
		option.textContent = preset.name;
		backgroundSelectEl.append(option);
	}
	const disabledOption = document.createElement("option");
	disabledOption.value = "disabled";
	disabledOption.textContent = "Disabled";
	backgroundSelectEl.append(disabledOption);

	backgroundSelectEl.addEventListener("change", () => {
		syncHint();
		if (backgroundSelectEl.value === "disabled") {
			ctx.send({ background: { enabled: false } });
		} else {
			ctx.send({ background: { enabled: true, preset: backgroundSelectEl.value } });
		}
	});
	syncHint();
}

export function applyConfig (config) {
	backgroundSelectEl.value = config.background.enabled ? config.background.preset : "disabled";
	syncHint();
}
