/*
 * Flight panel (layers.html) - flight number, Track toggle, poll interval,
 * and the optional OpenSky API credentials, backed by node_helper.js's
 * flight tracker (lib/flightTracker.js).
 *
 * Unlike every other panel, this one also polls its own small status
 * endpoint directly (GET /MMM-Earth3D/flights/status) rather than relying
 * purely on core.js's fetchResolvedConfig()/applyConfig() - flights.* is
 * deliberately not part of theme/override resolution (see defaults.flights'
 * own comment in MMM-Earth3D.js), and node_helper owns the actual poll
 * result (found/not found, last error, which API tier answered), none of
 * which lives in the module's resolved config at all.
 */

const STATUS_POLL_MS = 3000;
const FLIGHT_NUMBER_DEBOUNCE_MS = 500;

let flightNumberEl;
let flightTrackEl;
let flightStatusHint;
let flightClientIdEl;
let flightClientSecretEl;
let flightCredentialsHint;

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

function refreshCredentialsHint () {
	fetch("/MMM-Earth3D/flights/credentials")
		.then((res) => res.json())
		.then((data) => {
			flightCredentialsHint.textContent = data.configured
				? "Using your saved OpenSky credentials (4000 requests/day, falls back to anonymous automatically if they ever fail)."
				: "No OpenSky credentials saved - using anonymous access (400 requests/day).";
		})
		.catch(() => {});
}

export function init (ctx) {
	flightNumberEl = document.getElementById("flightNumber");
	flightTrackEl = document.getElementById("flightTrack");
	flightStatusHint = document.getElementById("flightStatusHint");
	flightClientIdEl = document.getElementById("flightClientId");
	flightClientSecretEl = document.getElementById("flightClientSecret");
	flightCredentialsHint = document.getElementById("flightCredentialsHint");

	// A plain debounce (not ctx.send's own - that one just batches rapid
	// calls into the last-wins payload, which is fine, but a flight number
	// is typed character-by-character and shouldn't fire a request per
	// keystroke) before enabling/renaming the tracked flight.
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

	document.getElementById("flightSaveCredentialsBtn").addEventListener("click", () => {
		const clientId = flightClientIdEl.value.trim();
		const clientSecret = flightClientSecretEl.value.trim();
		if (!clientId || !clientSecret) {
			ctx.setStatus("Client ID and secret are both required", true);
			return;
		}
		fetch("/MMM-Earth3D/flights/credentials", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ clientId, clientSecret })
		})
			.then((res) => res.json().then((data) => {
				if (!res.ok) {
					throw new Error(data.error || ("Request failed (" + res.status + ")"));
				}
				return data;
			}))
			.then(() => {
				flightClientSecretEl.value = "";
				ctx.setStatus("OpenSky credentials saved");
				refreshCredentialsHint();
			})
			.catch((err) => ctx.setStatus(err.message, true));
	});

	document.getElementById("flightClearCredentialsBtn").addEventListener("click", () => {
		fetch("/MMM-Earth3D/flights/credentials", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ clear: true })
		})
			.then(() => {
				flightClientIdEl.value = "";
				flightClientSecretEl.value = "";
				ctx.setStatus("OpenSky credentials cleared");
				refreshCredentialsHint();
			})
			.catch((err) => ctx.setStatus(err.message, true));
	});

	refreshCredentialsHint();
	refreshStatus();
	setInterval(refreshStatus, STATUS_POLL_MS);
}

export function applyConfig (config, ctx) {
	flightNumberEl.value = config.flights.flightNumber || "";
	flightTrackEl.checked = Boolean(config.flights.track);
	ctx.setSliderValue("flightPollInterval", config.flights.pollInterval);
}
