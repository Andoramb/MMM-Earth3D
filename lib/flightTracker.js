const fs = require("fs");
const Log = require("logger");
const openSkyClient = require("./openSkyClient");
const IATA_TO_ICAO = require("./iataToIcaoAirlines");

// Owns the Flight layer's OpenSky polling lifecycle for node_helper.js: given live `flights` config, polls states/all, matches the flight, pushes EARTH3D_FLIGHT_POSITION; flights.* is session state, not persisted (except the credentials file).

const MIN_POLL_INTERVAL_SEC = 10;
const MAX_POLL_INTERVAL_SEC = 300;
const DEFAULT_POLL_INTERVAL_SEC = 20;

// Backoff after consecutive poll failures - a 429's own retry-after (see openSkyClient's errorFromResponse()) wins over this exponential fallback (see nextDelayMs()).
const BACKOFF_BASE_MS = 30000; // 30s
const BACKOFF_MAX_MS = 10 * 60 * 1000; // 10 minutes

// OpenSky's flat state-vector array indices: https://openskynetwork.github.io/opensky-api/rest.html#response
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

// "UA123" (IATA) -> ["UAL123", "UA123"] (ICAO guess first, raw input as fallback). Returns [] for empty input.
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
	let consecutiveFailures = 0;
	let serverRetryAfterMs = null; // set from a 429's own retry-after header, cleared on success
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
			consecutiveFailures = 0;
			serverRetryAfterMs = null;
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
			consecutiveFailures++;
			serverRetryAfterMs = err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : null;
			status.lastError = err.message + (serverRetryAfterMs ? (" - retrying in " + Math.round(serverRetryAfterMs / 60000) + " min") : "");
			Log.error("[MMM-Earth3D node_helper] flight poll failed (" + consecutiveFailures + " consecutive): " + status.lastError);
		} finally {
			polling = false;
		}
	}

	function stopTimer() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
	}

	// Backs off exponentially from BACKOFF_BASE_MS while polls keep failing, resets once a poll succeeds.
	function nextDelayMs() {
		if (consecutiveFailures === 0) {
			return clampPollInterval(desired.pollInterval) * 1000;
		}
		if (serverRetryAfterMs) {
			return serverRetryAfterMs;
		}
		return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1));
	}

	// Self-rescheduling setTimeout chain (not setInterval) so the delay between polls can vary with nextDelayMs().
	function scheduleNext() {
		stopTimer();
		if (!desired.enabled || !desired.flightNumber) {
			return;
		}
		timer = setTimeout(() => {
			poll().then(scheduleNext);
		}, nextDelayMs());
	}

	function startTimer() {
		consecutiveFailures = 0;
		serverRetryAfterMs = null;
		stopTimer();
		if (!desired.enabled || !desired.flightNumber) {
			return;
		}
		// Poll immediately instead of making the control panel wait a full interval for a first result.
		poll().then(scheduleNext);
	}

	// Called on every EARTH3D_FLIGHTS_STATE push (see MMM-Earth3D.js's sendFlightsState()).
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
		// A fresh credential is a different rate-limit bucket, worth an immediate real attempt.
		consecutiveFailures = 0;
		serverRetryAfterMs = null;
		if (desired.enabled && desired.flightNumber) {
			stopTimer();
			poll().then(scheduleNext);
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

// Plain JSON, not presets/themes*.js's vm-evaluated `window.X = [...]` convention - this file holds an OpenSky OAuth2 client secret, never client-loadable.
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
