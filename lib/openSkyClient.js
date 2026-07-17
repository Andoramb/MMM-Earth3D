const Log = require("logger");

/*
 * Thin wrapper around the OpenSky Network REST API (states/all), the free
 * data source behind the Flight layer (see lib/flightTracker.js). Two access
 * tiers, both genuinely free:
 *   - anonymous: no signup, 400 requests/day
 *   - registered: free OpenSky account + OAuth2 client-credentials app,
 *     4000 requests/day - see https://opensky-network.org/apidoc/rest.html
 * fetchStates() tries registered mode (if credentials are configured) and
 * transparently falls back to anonymous for that call if the token fetch or
 * the request itself fails (bad/expired credentials, network hiccup, etc) -
 * this module never throws for a bad registered credential, only for a
 * total failure (anonymous also unreachable).
 *
 * No npm dependency added for this - package.json has none today, and
 * Node's global fetch (stable since Node 18) is all this needs.
 */

const STATES_URL = "https://opensky-network.org/api/states/all";
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

// Refresh a bit before the token's real expiry rather than exactly at it, so
// a poll never fires with a token that expires mid-flight.
const TOKEN_EXPIRY_SAFETY_MARGIN_SEC = 30;

let cachedToken = null; // { accessToken, expiresAtMs, clientId } or null

function resetTokenCache() {
	cachedToken = null;
}

async function fetchToken(clientId, clientSecret) {
	const body = new URLSearchParams({
		grant_type: "client_credentials",
		client_id: clientId,
		client_secret: clientSecret
	});
	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: body.toString()
	});
	if (!res.ok) {
		throw new Error("OpenSky token request failed (" + res.status + ")");
	}
	const data = await res.json();
	return {
		accessToken: data.access_token,
		expiresAtMs: Date.now() + Math.max(0, (data.expires_in || 0) - TOKEN_EXPIRY_SAFETY_MARGIN_SEC) * 1000,
		clientId
	};
}

async function getBearerToken(clientId, clientSecret) {
	if (cachedToken && cachedToken.clientId === clientId && cachedToken.expiresAtMs > Date.now()) {
		return cachedToken.accessToken;
	}
	cachedToken = await fetchToken(clientId, clientSecret);
	return cachedToken.accessToken;
}

async function fetchStatesAnonymous() {
	const res = await fetch(STATES_URL);
	if (!res.ok) {
		throw new Error("OpenSky states/all failed (" + res.status + ")");
	}
	return res.json();
}

async function fetchStatesRegistered(clientId, clientSecret) {
	const token = await getBearerToken(clientId, clientSecret);
	const res = await fetch(STATES_URL, { headers: { authorization: "Bearer " + token } });
	if (!res.ok) {
		throw new Error("OpenSky states/all failed (" + res.status + ")");
	}
	return res.json();
}

// credentials: { clientId, clientSecret } or null/undefined for anonymous-only.
// Resolves to { data, mode, fallbackReason } where mode is "registered" or
// "anonymous" (whichever tier actually served this call) and fallbackReason
// is only set when registered mode was attempted but failed.
async function fetchStates(credentials) {
	if (credentials && credentials.clientId && credentials.clientSecret) {
		try {
			const data = await fetchStatesRegistered(credentials.clientId, credentials.clientSecret);
			return { data, mode: "registered" };
		} catch (err) {
			resetTokenCache();
			Log.warn("[MMM-Earth3D node_helper] OpenSky registered request failed (" + err.message + ") - falling back to anonymous for this poll");
			const data = await fetchStatesAnonymous();
			return { data, mode: "anonymous", fallbackReason: err.message };
		}
	}
	const data = await fetchStatesAnonymous();
	return { data, mode: "anonymous" };
}

module.exports = { fetchStates, resetTokenCache };
