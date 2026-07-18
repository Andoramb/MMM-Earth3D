// City panel (layers.html) - text field sets config.city.name, a ";"-separated list of names; button recenters on the first configured city.

let cityNameEl;
let cityFoundEl;
let cityCenterBtn;

export function init (ctx) {
	cityNameEl = document.getElementById("cityName");
	cityFoundEl = document.getElementById("cityFound");
	cityCenterBtn = document.getElementById("cityCenterBtn");

	// "change" not "input" - look up the name once typing is done, not on every keystroke.
	cityNameEl.addEventListener("change", () => {
		ctx.send({ city: { name: cityNameEl.value } }).then(ctx.refetch);
		// Every name triggers an async Nominatim lookup server-side - one extra refetch to catch it once it lands.
		setTimeout(() => ctx.refetch(), 2500);
	});

	cityCenterBtn.addEventListener("click", () => {
		ctx.send({ city: { center: true } });
	});
}

export function applyConfig (config) {
	cityNameEl.value = config.city.name || "";
	const cities = config.city.cities || [];
	cityFoundEl.textContent = cities.map((city) => city.lat !== null
		? "Found: " + city.matchedName + " (" + city.lat.toFixed(2) + ", " + city.lng.toFixed(2) + ")"
		: "No match for \"" + city.name + "\" (may still be resolving - try again in a moment)").join(" · ");
	cityCenterBtn.disabled = config.city.lat === null;
}
