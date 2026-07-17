const fs = require("fs");
const path = require("path");
const vm = require("vm");
const NodeHelper = require("node_helper");
const express = require("express");
const Log = require("logger");

const THEMES_FILE = path.join(__dirname, "presets", "themes.js");
const THEMES_ASSIGNMENT = "window.EARTH3D_THEMES = ";

// Themes created/edited via control.html's Duplicate/Save/Delete buttons live
// in a separate, gitignored file - never in the shipped presets/themes.js -
// so your own customizations never show up as a dirty diff on that file, and
// a `git pull` of upstream default-theme changes never conflicts with them.
const USER_THEMES_FILE = path.join(__dirname, "presets", "themes-user.js");
const USER_THEMES_ASSIGNMENT = "window.EARTH3D_USER_THEMES = ";
const USER_THEMES_HEADER = "/* global window */\n\n"
	+ "/*\n"
	+ " * User-created MMM-Earth3D themes - anything made via control.html's\n"
	+ " * Duplicate/Save/Delete theme buttons lives here, never in\n"
	+ " * presets/themes.js (the shipped defaults). Gitignored on purpose - see\n"
	+ " * that file for the built-in themes this extends. Same format, and\n"
	+ " * nothing stops you hand-editing this one too.\n"
	+ " */\n";

const CONTROL_PANEL_DIR = path.join(__dirname, "public", "control");

// How long to wait for the module's front-end to answer an
// EARTH3D_REQUEST_CONFIG round-trip before giving up on a GET
// /MMM-Earth3D/config request - generous, since it's just socket.io
// same-host latency, but bounded so a caller (e.g. control.html) never hangs
// forever if the module isn't loaded/running.
const CONFIG_REQUEST_TIMEOUT_MS = 3000;

/*
 * node_helper for MMM-Earth3D
 *
 * Four jobs, all existing to let control.html (or curl, or any other client
 * on the LAN) drive the running globe without needing MMM-Remote-Control
 * installed:
 *
 * - /earth3d/* serves the control panel itself (public/control/) at a short,
 *   memorable URL - mirroring how MMM-Remote-Control serves its own UI at
 *   /remote.html rather than under /modules/MMM-Remote-Control/. It's a
 *   second mount point for the exact same directory MM core already serves
 *   at /modules/MMM-Earth3D/public/control/ (not a copy), so both URLs stay
 *   in sync automatically. /earth3d.html redirects to /earth3d/home.html for
 *   anyone who types the single-file pattern /remote.html suggests.
 * - POST /MMM-Earth3D/set-config relays its body to the module over MM's
 *   normal node_helper<->module socket channel; MMM-Earth3D.js's
 *   socketNotificationReceived() does the actual work via applyLiveConfig().
 * - GET /MMM-Earth3D/config asks the module (over that same socket channel)
 *   for its current resolved config + active overrides, and answers the HTTP
 *   request with whatever it replies - this is how control.html finds out
 *   what a theme switch (or anything else) actually resolved to, since that
 *   resolution logic lives client-side in the browser tab running the actual
 *   module, not here.
 * - POST /MMM-Earth3D/theme reads presets/themes.js (built-in themes,
 *   read-only from here) and reads/rewrites presets/themes-user.js
 *   (everything control.html's Duplicate/Save/Delete theme buttons create) -
 *   see USER_THEMES_FILE below for why they're split. Editing that file
 *   doesn't affect an already-running module instance (same as hand-editing
 *   any other presets/*.js file - needs a reload/restart to pick up), only
 *   what a *future* load of the page sees.
 *
 * express.json() is applied only to routes that need it (not app-wide) since
 * MM core doesn't register a body parser on the shared Express app itself,
 * and other modules' routes shouldn't be affected by a parser they didn't
 * ask for.
 *
 * Also relays server time on request: EARTH3D_REQUEST_SERVER_TIME ->
 * EARTH3D_SERVER_TIME with this process's Date.now() - so realtime dayNight
 * uses the clock of the machine actually running MagicMirror, not whichever
 * device's browser happens to be viewing the page (which could be a laptop
 * on a different timezone/clock opening the server remotely).
 */
module.exports = NodeHelper.create({
	start: function () {
		// Best-effort - if this fails (e.g. a permissions issue on this
		// particular host/environment), the theme HTTP route below still has
		// its own try/catch and will report a clear error when actually used,
		// rather than an unhandled throw here taking down every OTHER route
		// this node_helper registers (set-config, config, server time...).
		try {
			ensureUserThemesFile();
		} catch (err) {
			Log.error("[MMM-Earth3D node_helper] could not create presets/themes-user.js (" + err.message + ") - theme save/duplicate will fail until this is fixed");
		}
		this.pendingConfigRequests = [];

		// Short-URL alias for the control panel - see the header comment above.
		// Registered on the shared Express app, not namespaced under
		// /MMM-Earth3D/..., so it's reachable at a memorable top-level path.
		this.expressApp.use("/earth3d", express.static(CONTROL_PANEL_DIR));
		this.expressApp.get("/earth3d.html", (req, res) => res.redirect("/earth3d/home.html"));

		this.expressApp.post("/MMM-Earth3D/set-config", express.json(), (req, res) => {
			// Unconditional (not gated by config.debug - that's a client-side
			// setting this server-side code has no visibility into anyway):
			// low-frequency, and the single most useful line for telling "the
			// request never reached the server" apart from "it arrived but the
			// browser dropped it" when a live-tune silently does nothing.
			Log.info("[MMM-Earth3D node_helper] set-config: " + JSON.stringify(req.body || {}));
			this.sendSocketNotification("EARTH3D_SET_CONFIG", req.body || {});
			res.json({ success: true });
		});

		this.expressApp.get("/MMM-Earth3D/config", (req, res) => {
			const timer = setTimeout(() => {
				this.pendingConfigRequests = this.pendingConfigRequests.filter((entry) => entry.res !== res);
				res.status(504).json({ error: "Timed out waiting for MMM-Earth3D to report its config - is MagicMirror running with the module loaded?" });
			}, CONFIG_REQUEST_TIMEOUT_MS);
			this.pendingConfigRequests.push({ res, timer });
			this.sendSocketNotification("EARTH3D_REQUEST_CONFIG");
		});

		this.expressApp.post("/MMM-Earth3D/theme", express.json(), (req, res) => {
			try {
				const result = this.handleThemeAction(req.body || {});
				Log.info("[MMM-Earth3D node_helper] theme " + (req.body || {}).action + ": " + result.message);
				res.json(Object.assign({ success: true }, result));
			} catch (err) {
				Log.error("[MMM-Earth3D node_helper] theme action failed: " + err.message);
				res.status(400).json({ error: err.message });
			}
		});
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "EARTH3D_REQUEST_SERVER_TIME") {
			this.sendSocketNotification("EARTH3D_SERVER_TIME", { now: Date.now() });
			return;
		}

		if (notification === "EARTH3D_CONFIG_STATE") {
			const pending = this.pendingConfigRequests;
			this.pendingConfigRequests = [];
			pending.forEach((entry) => {
				clearTimeout(entry.timer);
				entry.res.json(payload);
			});
		}
	},

	// --- Theme file management (presets/themes.js + presets/themes-user.js) -

	handleThemeAction: function (body) {
		// Retried here (not just at startup) in case start()'s attempt failed
		// but whatever caused that has since been fixed.
		ensureUserThemesFile();
		const defaultThemes = readThemesFile(THEMES_FILE, THEMES_ASSIGNMENT).themes;
		const { header, themes: userThemes } = readThemesFile(USER_THEMES_FILE, USER_THEMES_ASSIGNMENT);
		const allThemes = defaultThemes.concat(userThemes);

		if (body.action === "duplicate") {
			return this.duplicateTheme(header, allThemes, userThemes, body);
		}
		if (body.action === "save") {
			return this.saveThemeOverrides(header, defaultThemes, userThemes, body);
		}
		if (body.action === "delete") {
			return this.deleteTheme(header, defaultThemes, userThemes, body);
		}
		throw new Error('Unknown theme action "' + body.action + '"');
	},

	// allThemes (default + user) is only used to find the source and to keep
	// the new id unique across both - the clone itself always goes into
	// userThemes/themes-user.js, regardless of which list the source came
	// from.
	duplicateTheme: function (header, allThemes, userThemes, body) {
		const source = allThemes.find((entry) => entry.id === body.sourceId);
		if (!source) {
			throw new Error('No theme with id "' + body.sourceId + '"');
		}
		const name = (body.name || (source.name + " copy")).trim();
		if (!name) {
			throw new Error("New theme name can't be empty");
		}
		const id = uniqueId(allThemes, slugify(name));
		const clone = JSON.parse(JSON.stringify(source));
		clone.id = id;
		clone.name = name;
		userThemes.push(clone);
		writeThemesFile(USER_THEMES_FILE, header, USER_THEMES_ASSIGNMENT, userThemes);
		return { id, message: 'Duplicated "' + source.name + '" as "' + name + '"' };
	},

	// Only ever writes to userThemes/themes-user.js - saving over a built-in
	// theme isn't supported (duplicate it first), since presets/themes.js is
	// meant to stay exactly what the module ships with.
	saveThemeOverrides: function (header, defaultThemes, userThemes, body) {
		const index = userThemes.findIndex((entry) => entry.id === body.themeId);
		if (index === -1) {
			if (defaultThemes.some((entry) => entry.id === body.themeId)) {
				throw new Error("Can't save over a built-in theme - duplicate it first, then save into the copy");
			}
			throw new Error('No theme with id "' + body.themeId + '"');
		}
		const overrides = body.overrides || {};
		const theme = Object.assign({}, userThemes[index]);

		if (overrides.rotationSpeed !== undefined) {
			theme.rotationSpeed = overrides.rotationSpeed;
		}
		if (overrides.quality !== undefined) {
			theme.quality = overrides.quality;
		}
		if (overrides.atmosphere) {
			theme.atmosphere = mergeAssetOverride(theme.atmosphere, overrides.atmosphere, []);
		}
		if (overrides.texture) {
			theme.texture = mergeAssetOverride(theme.texture, overrides.texture, []);
		}
		if (overrides.background) {
			theme.background = mergeAssetOverride(theme.background, overrides.background, []);
		}
		if (overrides.camera) {
			theme.camera = mergeAssetOverride(theme.camera, overrides.camera, ["rotate", "position"]);
		}
		if (overrides.dayNight) {
			theme.dayNight = Object.assign({}, theme.dayNight, overrides.dayNight);
		}
		if (overrides.clouds) {
			theme.clouds = Object.assign({}, theme.clouds, overrides.clouds);
		}

		userThemes[index] = theme;
		writeThemesFile(USER_THEMES_FILE, header, USER_THEMES_ASSIGNMENT, userThemes);
		return { message: 'Saved current settings into "' + theme.name + '"' };
	},

	deleteTheme: function (header, defaultThemes, userThemes, body) {
		const index = userThemes.findIndex((entry) => entry.id === body.themeId);
		if (index === -1) {
			if (defaultThemes.some((entry) => entry.id === body.themeId)) {
				throw new Error("Can't delete a built-in theme");
			}
			throw new Error('No theme with id "' + body.themeId + '"');
		}
		const [removed] = userThemes.splice(index, 1);
		writeThemesFile(USER_THEMES_FILE, header, USER_THEMES_ASSIGNMENT, userThemes);
		return { message: 'Deleted "' + removed.name + '"' };
	}
});

function ensureUserThemesFile() {
	if (fs.existsSync(USER_THEMES_FILE)) {
		return;
	}
	fs.writeFileSync(USER_THEMES_FILE, USER_THEMES_HEADER + USER_THEMES_ASSIGNMENT + "[];\n");
}

// Splits off everything before the assignment (the file's hand-written
// doc-comment header) so writeThemesFile() can put it back afterward - a
// machine-rewritten file still reads like it was written by a person.
// Evaluated via `vm` rather than JSON.parse since these are real JS files
// (unquoted keys, [x,y,z] array shorthand, comments) - both are our own
// trusted local files, not user input, so running them is fine.
function readThemesFile(file, assignment) {
	const source = fs.readFileSync(file, "utf8");
	const index = source.indexOf(assignment);
	if (index === -1) {
		throw new Error(path.basename(file) + ' doesn\'t contain the expected "' + assignment + '" assignment');
	}
	const header = source.slice(0, index);
	const sandbox = { window: {} };
	vm.createContext(sandbox);
	vm.runInContext(source, sandbox, { filename: file });
	const globalName = assignment.slice("window.".length, -3); // "window.EARTH3D_THEMES = " -> "EARTH3D_THEMES"
	const themes = Array.isArray(sandbox.window[globalName]) ? sandbox.window[globalName] : [];
	return { header, themes };
}

function writeThemesFile(file, header, assignment, themes) {
	fs.writeFileSync(file, header + assignment + JSON.stringify(themes, null, "\t") + ";\n");
}

function slugify(name) {
	return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-+|-+$)/g, "") || "theme";
}

function uniqueId(themes, base) {
	let id = base;
	let suffix = 2;
	while (themes.some((entry) => entry.id === id)) {
		id = base + "-" + suffix;
		suffix++;
	}
	return id;
}

// Merges a sparse override patch into a theme's existing asset field, which
// may currently be a bare preset-id string (e.g. "close-up"), a literal
// object, or absent - mirrors MMM-Earth3D.js's own mergeOverride() semantics
// (null deletes a key) closely enough for the save-to-theme use case.
function mergeAssetOverride(themeValue, override, deepKeys) {
	const base = typeof themeValue === "string" ? { preset: themeValue }
		: (themeValue && typeof themeValue === "object") ? Object.assign({}, themeValue)
			: {};

	Object.keys(override).forEach((key) => {
		if (deepKeys.indexOf(key) !== -1) {
			return;
		}
		if (override[key] === null) {
			delete base[key];
		} else {
			base[key] = override[key];
		}
	});
	deepKeys.forEach((key) => {
		if (!override[key]) {
			return;
		}
		base[key] = Object.assign({}, base[key], override[key]);
	});

	// Collapse back down to a bare preset-id string if that's all this
	// field ends up being - matches how most existing theme entries
	// reference a preset rather than spelling out its fields inline.
	const keys = Object.keys(base);
	if (keys.length === 1 && keys[0] === "preset" && base.preset && base.preset !== "custom") {
		return base.preset;
	}
	return base;
}
