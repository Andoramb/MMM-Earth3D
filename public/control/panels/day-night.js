// Day/Night panel (layers.html).

let dayNightModeEl;
let dayNightRotateRow;

function syncVisibility () {
	dayNightRotateRow.classList.toggle("visible", dayNightModeEl.value === "custom");
}

export function init (ctx) {
	dayNightModeEl = document.getElementById("dayNightMode");
	dayNightRotateRow = document.getElementById("dayNightRotateRow");

	dayNightModeEl.addEventListener("change", () => {
		syncVisibility();
		ctx.send({ dayNight: { mode: dayNightModeEl.value } });
	});
	syncVisibility();
	ctx.bindSlider("dayNightRotate", (value) => ctx.send({ dayNight: { rotate: value } }));
}

export function applyConfig (config, ctx) {
	dayNightModeEl.value = config.dayNight.mode;
	ctx.setSliderValue("dayNightRotate", config.dayNight.rotate);
	syncVisibility();
}
