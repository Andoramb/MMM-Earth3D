const fs = require("fs");
const Log = require("logger");
const openSkyClient = require("./openSkyClient");
const IATA_TO_ICAO = require("./iataToIcaoAirlines");

/*
 * Owns the Flight layer's OpenSky polling lifecycle for node_helper.js:
 * given the module's live `flights` config (pushed over the socket as
 * EARTH3D_FLIGHTS_STATE - see MMM-Earth3D.js's sendFlightsState()), starts/
 * stops/reschedules a setInterval poll, matches the configured flight number
 * against OpenSky's states/all snapshot, and pushes found positions back to
 * the module (EARTH3D_FLIGHT_POSITION) for Earth3DRenderer/FlightLayer.mjs
 * to render. Also serves the control panel's status line (getStatus(), see
 * node_helper.js's GET /MMM-Earth3D/flights/status) and manages the OpenSky
 * OAuth2 client credentials file (never sent to the module/browser - see
 * setCredentials()/getCredentialsConfigured()).
 *
 * flights.flightNumber/track/pollInterval/enabled are deliberately NOT
 * theme-templated or persisted into presets/themes-user.js (see
 * node_helper.js's saveThemeOverrides() and SKILL.md) - they're session/
 * operational state, not a visual look, so this tracker's only source of
 * truth is whatever EARTH3D_FLIGHTS_STATE last reported; nothing here
 * persists across a MagicMirror restart except the credentials file.
 */

const MIN_POLL_INTERVAL_SEC = 10;
const MAX_POLL_INTERVAL_SEC = 300;
const DEFAULT_POLL_INTERVAL_SEC = 20;

// OpenSky's flat state-vector array indices (see
// https://openskynetwork.github.io/opensky-api/rest.html#response).
const STATE_INDEX = {
	callsign: 1,
	longitude: 5,
	latitude: 6,
	baroAltitude: 7,
	onGround: 8,
	velocity: 9,
	trueTrack: 10,
	timePosition: 3,
	lastContact: 4
};

// "UA123" (IATA) -> ["UAL123", "UA123"] (ICAO guess first, raw input as a
// fallback for anyone who already types the ICAO form). Returns [] for
// empty input.
function resolveCandidateCallsigns(flightNumber) {
	const raw = String(flightNumber || "").trim().toUpperCase().replace(/\s+/g, "");
	if (!raw) {
		return [];
	}
	const candidates = [];
	const match = raw.match(/^([A-Z0-9]{2})(\d[A-Z0-9]*)$/);
	if (match) {
		const icaoPrefix = IATA_TO_ICAO[match[1]];
		if (icaoPrefix) {
			candidates.push(icaoPrefix + match[2]);
		}
	}
	if (candidates.indexOf(raw) === -1) {
		candidates.push(raw);
	}
	return candidates;
}

function findMatchingState(states, candidates) {
	if (!Array.isArray(states) || !candidates.length) {
		return null;
	}
	for (const state of states) {
		const callsign = String(state[STATE_INDEX.callsign] || "").trim().toUpperCase();
		if (callsign && candidates.indexOf(callsign) !== -1) {
			return state;
		}
	}
	return null;
}

function clampPollInterval(seconds) {
	const value = Number(seconds) || DEFAULT_POLL_INTERVAL_SEC;
	return Math.min(MAX_POLL_INTERVAL_SEC, Math.max(MIN_POLL_INTERVAL_SEC, value));
}

function createFlightTracker(options) {
	const sendSocketNotification = options.sendSocketNotification;
	const credentialsFile = options.credentialsFile;

	let desired = { enabled: false, flightNumber: "", track: false, pollInterval: DEFAULT_POLL_INTERVAL_SEC };
	let credentials = loadCredentials(credentialsFile);
	let timer = null;
	let polling = false;
	const status = {
		flightNumber: "",
		found: false,
		lat: null,
		lng: null,
		altitude: null,
		heading: null,
		velocity: null,
		onGround: null,
		timestamp: null,
		lastPollAt: null,
		lastError: null,
		apiMode: null
	};

	function sendPosition(payload) {
		sendSocketNotification("EARTH3D_FLIGHT_POSITION", payload);
	}

	async function poll() {
		if (!desired.enabled || !desired.flightNumber || polling) {
			return;
		}
		const candidates = resolveCandidateCallsigns(desired.flightNumber);
		if (!candidates.length) {
			return;
		}
		polling = true;
		status.lastPollAt = Date.now();
		status.flightNumber = desired.flightNumber;
		try {
			const { data, mode, fallbackReason } = await openSkyClient.fetchStates(credentials);
			status.apiMode = mode;
			status.lastError = fallbackReason ? ("Registered OpenSky request failed (" + fallbackReason + ") - used anonymous for this poll") : null;

			const match = findMatchingState(data && data.states, candidates);
			const hasPosition = match && match[STATE_INDEX.latitude] != null && match[STATE_INDEX.longitude] != null;

			if (!hasPosition) {
				status.found = false;
				sendPosition({ found: false, flightNumber: desired.flightNumber });
				return;
			}

			status.found = true;
			status.lat = match[STATE_INDEX.latitude];
			status.lng = match[STATE_INDEX.longitude];
			status.altitude = match[STATE_INDEX.baroAltitude];
			status.heading = match[STATE_INDEX.trueTrack] || 0;
			status.velocity = match[STATE_INDEX.velocity];
			status.onGround = Boolean(match[STATE_INDEX.onGround]);
			status.timestamp = (match[STATE_INDEX.timePosition] || match[STATE_INDEX.lastContact] || Date.now() / 1000) * 1000;

			sendPosition({
				found: true,
				flightNumber: desired.flightNumber,
				callsign: String(match[STATE_INDEX.callsign] || "").trim(),
				lat: status.lat,
				lng: status.lng,
				altitude: status.altitude,
				heading: status.heading,
				velocity: status.velocity,
				onGround: status.onGround,
				timestamp: status.timestamp
			});
		} catch (err) {
			status.lastError = err.message;
			Log.error("[MMM-Earth3D node_helper] flight poll failed: " + err.message);
		} finally {
			polling = false;
		}
	}

	function stopTimer() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	function startTimer() {
		stopTimer();
		if (!desired.enabled || !desired.flightNumber) {
			return;
		}
		timer = setInterval(poll, clampPollInterval(desired.pollInterval) * 1000);
		poll(); // don't make the control panel wait a full interval for a first result
	}

	// Called on every EARTH3D_FLIGHTS_STATE push (module startup, and every
	// live flights config change - see MMM-Earth3D.js's sendFlightsState()).
	function configure(flightsState) {
		const next = {
			enabled: Boolean(flightsState && flightsState.enabled),
			flightNumber: String((flightsState && flightsState.flightNumber) || "").trim(),
			track: Boolean(flightsState && flightsState.track),
			pollInterval: clampPollInterval(flightsState && flightsState.pollInterval)
		};
		const pollLifecycleChanged = next.enabled !== desired.enabled
			|| next.flightNumber !== desired.flightNumber
			|| next.pollInterval !== desired.pollInterval;
		desired = next;
		if (!next.enabled || !next.flightNumber) {
			stopTimer();
			status.found = false;
			return;
		}
		if (pollLifecycleChanged) {
			startTimer();
		}
	}

	function setCredentials(body) {
		if (body && body.clear) {
			credentials = null;
		} else {
			const clientId = (body && body.clientId || "").trim();
			const clientSecret = (body && body.clientSecret || "").trim();
			if (!clientId || !clientSecret) {
				throw new Error("clientId and clientSecret are both required (or pass {\"clear\": true} to remove saved credentials)");
			}
			credentials = { clientId, clientSecret };
		}
		saveCredentials(credentialsFile, credentials);
		openSkyClient.resetTokenCache();
		if (desired.enabled && desired.flightNumber) {
			poll();
		}
	}

	function getCredentialsConfigured() {
		return Boolean(credentials && credentials.clientId && credentials.clientSecret);
	}

	function getStatus() {
		return Object.assign({}, status, {
			enabled: desired.enabled,
			track: desired.track,
			pollInterval: desired.pollInterval,
			credentialsConfigured: getCredentialsConfigured()
		});
	}

	return { configure, setCredentials, getCredentialsConfigured, getStatus };
}

// Plain JSON (not the vm-evaluated `window.X = [...]` convention
// presets/themes*.js uses - see node_helper.js's readThemesFile()) since
// this file must never be client-`<script>`-loadable: it holds an OpenSky
// OAuth2 client secret.
function loadCredentials(file) {
	try {
		if (!fs.existsSync(file)) {
			return null;
		}
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		return (parsed && parsed.clientId && parsed.clientSecret) ? parsed : null;
	} catch (err) {
		Log.warn("[MMM-Earth3D node_helper] could not read flight-credentials.json (" + err.message + ") - starting with no OpenSky credentials configured");
		return null;
	}
}

function saveCredentials(file, credentials) {
	if (!credentials) {
		if (fs.existsSync(file)) {
			fs.unlinkSync(file);
		}
		return;
	}
	fs.writeFileSync(file, JSON.stringify(credentials, null, "\t") + "\n", { mode: 0o600 });
}

module.exports = { createFlightTracker, resolveCandidateCallsigns };
