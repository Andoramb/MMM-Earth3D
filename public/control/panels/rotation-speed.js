// Rotation-speed panel (planet-env.html) - the globe's own spin, a plain top-level scalar.

export function init (ctx) {
	ctx.bindSlider("rotationSpeed", (value) => ctx.send({ rotationSpeed: value }));

	document.querySelector('[data-reset-target="rotationSpeed"]').addEventListener("click", () => {
		ctx.setSliderValue("rotationSpeed", ctx.MODULE_DEFAULTS.rotationSpeed);
		ctx.send({ rotationSpeed: null });
	});
}

export function applyConfig (config, ctx) {
	ctx.setSliderValue("rotationSpeed", config.rotationSpeed);
}
