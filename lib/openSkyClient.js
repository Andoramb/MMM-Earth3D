const Log = require("logger");

// Thin wrapper around OpenSky's REST API (states/all) - anonymous (400 req/day) vs registered (4000 req/day, OAuth2); fetchStates() falls back to anonymous if registered fails.

const STATES_URL = "https://opensky-network.org/api/states/all";
const TOKEN_URL = "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

// Refresh a bit before the token's real expiry so a poll never fires with an expired token.
const TOKEN_EXPIRY_SAFETY_MARGIN_SEC = 30;

let cachedToken = null; // { accessToken, expiresAtMs, clientId } or null

function resetTokenCache() {
	cachedToken = null;
}

// A 429's retry-after header (seen in practice: multi-hour bans) is attached to the thrown Error as .retryAfterSeconds - callers should honor it, not guess.
function errorFromResponse(res, label) {
	const err = new Error(label + " failed (" + res.status + ")");
	const retryAfter = Number(res.headers.get("x-rate-limit-retry-after-seconds"));
	if (Number.isFinite(retryAfter) && retryAfter > 0) {
		err.retryAfterSeconds = retryAfter;
	}
	return err;
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
		throw errorFromResponse(res, "OpenSky states/all");
	}
	return res.json();
}

async function fetchStatesRegistered(clientId, clientSecret) {
	const token = await getBearerToken(clientId, clientSecret);
	const res = await fetch(STATES_URL, { headers: { authorization: "Bearer " + token } });
	if (!res.ok) {
		throw errorFromResponse(res, "OpenSky states/all");
	}
	return res.json();
}

// credentials: { clientId, clientSecret } or null for anonymous-only. Resolves to { data, mode, fallbackReason } (fallbackReason only set when registered mode failed).
async function fetchStates(credentials) {
	if (credentials && credentials.clientId && credentials.clientSecret) {
		try {
			const data = await fetchStatesRegistered(credentials.clientId, credentials.clientSecret);
			return { data, mode: "registered" };
		} catch (err) {
			resetTokenCache();
			Log.warn("[MMM-Planet3D node_helper] OpenSky registered request failed (" + err.message + ") - falling back to anonymous for this poll");
			const data = await fetchStatesAnonymous();
			return { data, mode: "anonymous", fallbackReason: err.message };
		}
	}
	const data = await fetchStatesAnonymous();
	return { data, mode: "anonymous" };
}

module.exports = { fetchStates, resetTokenCache };
