// Flight panel (layers.html, disabled - see layers.html) - flight number, Track, poll interval; also polls GET /MMM-Earth3D/flights/status directly for status text.

const STATUS_POLL_MS = 3000;
const FLIGHT_NUMBER_DEBOUNCE_MS = 500;

let flightNumberEl;
let flightTrackEl;
let flightStatusHint;

function describeStatus (status) {
	if (!status.enabled || !status.flightNumber) {
		return "Enter a flight number above to start tracking.";
	}
	if (status.lastError) {
		return status.lastError;
	}
	if (!status.found) {
		return "No current match for \"" + status.flightNumber + "\" - not airborne, or not reporting a position right now.";
	}
	let text = "Tracking " + status.flightNumber;
	if (status.apiMode) {
		text += " (" + status.apiMode + " API)";
	}
	if (status.lastPollAt) {
		text += " - last update " + Math.max(0, Math.round((Date.now() - status.lastPollAt) / 1000)) + "s ago";
	}
	return text;
}

function refreshStatus () {
	fetch("/MMM-Earth3D/flights/status")
		.then((res) => res.json())
		.then((status) => {
			flightStatusHint.textContent = describeStatus(status);
		})
		.catch(() => {});
}

export function init (ctx) {
	flightNumberEl = document.getElementById("flightNumber");
	flightTrackEl = document.getElementById("flightTrack");
	flightStatusHint = document.getElementById("flightStatusHint");

	// A plain debounce (not ctx.send's own) so typing a flight number doesn't fire a request per keystroke.
	let debounceTimer = null;
	flightNumberEl.addEventListener("input", () => {
		clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			const value = flightNumberEl.value.trim();
			ctx.send({ flights: { enabled: Boolean(value), flightNumber: value } });
		}, FLIGHT_NUMBER_DEBOUNCE_MS);
	});

	flightTrackEl.addEventListener("change", () => {
		ctx.send({ flights: { track: flightTrackEl.checked } });
	});

	ctx.bindSlider("flightPollInterval", (value) => ctx.send({ flights: { pollInterval: value } }));

	refreshStatus();
	setInterval(refreshStatus, STATUS_POLL_MS);
}

export function applyConfig (config, ctx) {
	flightNumberEl.value = config.flights.flightNumber || "";
	flightTrackEl.checked = Boolean(config.flights.track);
	ctx.setSliderValue("flightPollInterval", config.flights.pollInterval);
}
