const path = require("path");
const NodeHelper = require("node_helper");
const express = require("express");
const Log = require("logger");
const { createFlightTracker } = require("./lib/flightTracker");
const themeStore = require("./lib/theme-store");
const { geocode } = require("./lib/geocoder");

const CONTROL_PANEL_DIR = path.join(__dirname, "public", "control");

// OpenSky OAuth2 client credentials - plain JSON (not the vm-evaluated presets/*.js convention), gitignored, never served to any client. Optional - anonymous access needs no file.
const FLIGHT_CREDENTIALS_FILE = path.join(__dirname, "presets", "flight-credentials.json");

// How long to wait for the module's front-end to answer an PLANET3D_REQUEST_CONFIG round-trip before a GET /MMM-Planet3D/config request gives up.
const CONFIG_REQUEST_TIMEOUT_MS = 3000;

// node_helper for MMM-Planet3D: lets control.html (or curl, or any LAN client) drive the running globe, manage themes, and run the Flight layer's OpenSky polling loop - without needing MMM-Remote-Control installed.
module.exports = NodeHelper.create({
	start: function () {
		// Best-effort - the theme HTTP route below has its own try/catch, so a failure here doesn't take down every other route. ensureUserThemesFile() itself falls back to a writable location outside the module folder if presets/ isn't writable, so this only throws if that fallback fails too.
		try {
			themeStore.ensureUserThemesFile();
		} catch (err) {
			Log.error("[MMM-Planet3D node_helper] could not set up a location for custom themes (" + err.message + ") - theme save/duplicate will fail until this is fixed");
		}
		this.pendingConfigRequests = [];

		this.flightTracker = createFlightTracker({
			sendSocketNotification: (notification, payload) => this.sendSocketNotification(notification, payload),
			credentialsFile: FLIGHT_CREDENTIALS_FILE
		});

		// Short-URL alias for the control panel, on the shared Express app rather than namespaced under /MMM-Planet3D/....
		this.expressApp.use("/planet3d", express.static(CONTROL_PANEL_DIR));
		this.expressApp.get("/planet3d.html", (req, res) => res.redirect("/planet3d/home.html"));

		this.expressApp.post("/MMM-Planet3D/set-config", express.json(), (req, res) => {
			// Unconditional (not gated by config.debug, a client-side setting this server code can't see) - the key line for telling "never reached the server" apart from "browser dropped it".
			Log.info("[MMM-Planet3D node_helper] set-config: " + JSON.stringify(req.body || {}));
			this.sendSocketNotification("PLANET3D_SET_CONFIG", req.body || {});
			res.json({ success: true });
		});

		this.expressApp.get("/MMM-Planet3D/config", (req, res) => {
			const timer = setTimeout(() => {
				this.pendingConfigRequests = this.pendingConfigRequests.filter((entry) => entry.res !== res);
				res.status(504).json({ error: "Timed out waiting for MMM-Planet3D to report its config - is MagicMirror running with the module loaded?" });
			}, CONFIG_REQUEST_TIMEOUT_MS);
			this.pendingConfigRequests.push({ res, timer });
			this.sendSocketNotification("PLANET3D_REQUEST_CONFIG");
		});

		this.expressApp.post("/MMM-Planet3D/theme", express.json(), (req, res) => {
			try {
				const result = themeStore.handleThemeAction(req.body || {});
				Log.info("[MMM-Planet3D node_helper] theme " + (req.body || {}).action + ": " + result.message);
				res.json(Object.assign({ success: true }, result));
			} catch (err) {
				Log.error("[MMM-Planet3D node_helper] theme action failed: " + err.message);
				res.status(400).json({ error: err.message });
			}
		});

		this.expressApp.get("/MMM-Planet3D/flights/status", (req, res) => {
			res.json(this.flightTracker.getStatus());
		});

		this.expressApp.get("/MMM-Planet3D/flights/credentials", (req, res) => {
			res.json({ configured: this.flightTracker.getCredentialsConfigured() });
		});

		this.expressApp.post("/MMM-Planet3D/flights/credentials", express.json(), (req, res) => {
			try {
				this.flightTracker.setCredentials(req.body || {});
				Log.info("[MMM-Planet3D node_helper] flight credentials " + ((req.body || {}).clear ? "cleared" : "updated"));
				res.json({ success: true, configured: this.flightTracker.getCredentialsConfigured() });
			} catch (err) {
				res.status(400).json({ error: err.message });
			}
		});
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "PLANET3D_REQUEST_SERVER_TIME") {
			this.sendSocketNotification("PLANET3D_SERVER_TIME", { now: Date.now() });
			return;
		}

		if (notification === "PLANET3D_FLIGHTS_STATE") {
			this.flightTracker.configure(payload);
			return;
		}

		// config.js's flightCredentials reuses the same setCredentials() the control panel's POST /MMM-Planet3D/flights/credentials calls - sent once per module start(), not on every config change.
		if (notification === "PLANET3D_FLIGHT_CREDENTIALS") {
			try {
				this.flightTracker.setCredentials(payload);
				Log.info("[MMM-Planet3D node_helper] flight credentials set from config.js");
			} catch (err) {
				Log.error("[MMM-Planet3D node_helper] config.js flightCredentials rejected: " + err.message);
			}
			return;
		}

		if (notification === "PLANET3D_CONFIG_STATE") {
			const pending = this.pendingConfigRequests;
			this.pendingConfigRequests = [];
			pending.forEach((entry) => {
				clearTimeout(entry.timer);
				entry.res.json(payload);
			});
			return;
		}

		// Resolve city/POI names via live Nominatim geocoding, one at a time (see lib/geocoder.js's own rate-limit gate), replying as each resolves.
		if (notification === "PLANET3D_GEOCODE_REQUEST") {
			this.handleGeocodeRequest(payload && payload.names);
		}
	},

	handleGeocodeRequest: async function (names) {
		for (const name of names || []) {
			const match = await geocode(name);
			this.sendSocketNotification("PLANET3D_GEOCODE_RESULT", {
				name,
				lat: match ? match.lat : null,
				lng: match ? match.lng : null,
				matchedName: match ? match.matchedName : null
			});
		}
	}
});
