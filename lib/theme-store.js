const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const Log = require("logger");

const THEMES_FILE = path.join(__dirname, "..", "presets", "themes.js");
const THEMES_ASSIGNMENT = "window.PLANET3D_THEMES = ";

// User-created themes (control.html's Duplicate/Save/Delete buttons) live in a separate gitignored file, never presets/themes.js, so customizations never conflict with an upstream pull.
const PRIMARY_USER_THEMES_FILE = path.join(__dirname, "..", "presets", "themes-user.js");
// Fallback for installs where the module folder itself isn't writable by whichever user runs MagicMirror (e.g. cloned as root, run as a service account) - keyed off the running user's home dir, which is writable in practically every real deployment.
const FALLBACK_USER_THEMES_FILE = path.join(os.homedir(), ".mmm-planet3d", "themes-user.js");
const USER_THEMES_ASSIGNMENT = "window.PLANET3D_USER_THEMES = ";
const USER_THEMES_HEADER = "/* global window */\n\n"
	+ "// User-created MMM-Planet3D themes (control.html's Duplicate/Save/Delete buttons) - never presets/themes.js, gitignored, same format, hand-editable.\n";

// Resolved once per process and cached - if presets/ isn't writable this falls back to FALLBACK_USER_THEMES_FILE instead of failing every save/duplicate.
let resolvedUserThemesFile = null;

function isWritable(file) {
	try {
		fs.accessSync(file, fs.constants.W_OK);
		return true;
	} catch (err) {
		return false;
	}
}

// Retried on every call (not just once at startup) in case a startup-time permission problem has since been fixed, or vice versa.
function ensureUserThemesFile() {
	if (resolvedUserThemesFile && (fs.existsSync(resolvedUserThemesFile) ? isWritable(resolvedUserThemesFile) : isWritable(path.dirname(resolvedUserThemesFile)))) {
		return resolvedUserThemesFile;
	}
	const emptyFileContent = USER_THEMES_HEADER + USER_THEMES_ASSIGNMENT + "[];\n";
	if (fs.existsSync(PRIMARY_USER_THEMES_FILE)) {
		if (isWritable(PRIMARY_USER_THEMES_FILE)) {
			resolvedUserThemesFile = PRIMARY_USER_THEMES_FILE;
			return resolvedUserThemesFile;
		}
	} else if (isWritable(path.dirname(PRIMARY_USER_THEMES_FILE))) {
		fs.writeFileSync(PRIMARY_USER_THEMES_FILE, emptyFileContent);
		resolvedUserThemesFile = PRIMARY_USER_THEMES_FILE;
		return resolvedUserThemesFile;
	}
	Log.warn("[MMM-Planet3D] presets/ isn't writable by this user - storing custom themes in " + FALLBACK_USER_THEMES_FILE + " instead (chown the module's presets/ folder to this user to use presets/themes-user.js again)");
	fs.mkdirSync(path.dirname(FALLBACK_USER_THEMES_FILE), { recursive: true });
	if (!fs.existsSync(FALLBACK_USER_THEMES_FILE)) {
		fs.writeFileSync(FALLBACK_USER_THEMES_FILE, emptyFileContent);
	}
	resolvedUserThemesFile = FALLBACK_USER_THEMES_FILE;
	return resolvedUserThemesFile;
}

// Splits off the header so writeThemesFile() can put it back - evaluated via `vm` (not JSON.parse) since these are real JS files, and both are trusted local files.
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
	const globalName = assignment.slice("window.".length, -3); // "window.PLANET3D_THEMES = " -> "PLANET3D_THEMES"
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

// Scans for the highest existing "Custom N" name (built-in or user) and returns the next free one.
function nextCustomName(themes) {
	let max = 0;
	themes.forEach((entry) => {
		const match = /^Custom (\d+)$/.exec(entry.name || "");
		if (match) {
			max = Math.max(max, Number(match[1]));
		}
	});
	return "Custom " + (max + 1);
}

// Merges a sparse override patch into a theme's asset field (bare preset-id string, literal object, or absent) - mirrors MMM-Planet3D.js's mergeOverride() (null deletes a key).
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

	// Collapse back to a bare preset-id string if that's all this field is, matching how most theme entries reference a preset.
	const keys = Object.keys(base);
	if (keys.length === 1 && keys[0] === "preset" && base.preset && base.preset !== "custom") {
		return base.preset;
	}
	return base;
}

function handleThemeAction(body) {
	// Retried here (not just at startup) in case a startup attempt failed but the cause has since been fixed (or vice versa) - also picks the fallback location if presets/ isn't writable.
	const userThemesFile = ensureUserThemesFile();
	const defaultThemes = readThemesFile(THEMES_FILE, THEMES_ASSIGNMENT).themes;
	const { header, themes: userThemes } = readThemesFile(userThemesFile, USER_THEMES_ASSIGNMENT);
	const allThemes = defaultThemes.concat(userThemes);

	if (body.action === "duplicate") {
		return duplicateTheme(header, allThemes, userThemes, body, userThemesFile);
	}
	if (body.action === "save") {
		return saveThemeOverrides(header, defaultThemes, userThemes, body, userThemesFile);
	}
	if (body.action === "delete") {
		return deleteTheme(header, defaultThemes, userThemes, body, userThemesFile);
	}
	throw new Error('Unknown theme action "' + body.action + '"');
}

// allThemes is only used to find the source and keep the new id unique - the clone itself always goes into userThemesFile (see ensureUserThemesFile()'s fallback location).
function duplicateTheme(header, allThemes, userThemes, body, userThemesFile) {
	if (body.sourceId === "custom") {
		return duplicateCustomConfig(header, allThemes, userThemes, body, userThemesFile);
	}
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
	writeThemesFile(userThemesFile, header, USER_THEMES_ASSIGNMENT, userThemes);
	return { id, message: 'Duplicated "' + source.name + '" as "' + name + '"' };
}

// No stored theme to clone when config.theme is "custom" - builds a fresh theme from the live resolved config instead, auto-named "Custom N".
function duplicateCustomConfig(header, allThemes, userThemes, body, userThemesFile) {
	const config = body.config || {};
	const name = nextCustomName(allThemes);
	const id = uniqueId(allThemes, slugify(name));
	const theme = {
		id,
		name,
		rotationSpeed: config.rotationSpeed,
		quality: config.quality,
		atmosphere: config.atmosphere,
		texture: config.texture,
		background: config.background,
		camera: config.camera,
		dayNight: config.dayNight,
		clouds: config.clouds
	};
	userThemes.push(theme);
	writeThemesFile(userThemesFile, header, USER_THEMES_ASSIGNMENT, userThemes);
	return { id, message: 'Duplicated current settings as "' + name + '"' };
}

// Only ever writes to userThemesFile - saving over a built-in theme isn't supported (duplicate it first).
function saveThemeOverrides(header, defaultThemes, userThemes, body, userThemesFile) {
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
		theme.background = mergeAssetOverride(theme.background, overrides.background, ["starfield"]);
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
	writeThemesFile(userThemesFile, header, USER_THEMES_ASSIGNMENT, userThemes);
	return { message: 'Saved current settings into "' + theme.name + '"' };
}

function deleteTheme(header, defaultThemes, userThemes, body, userThemesFile) {
	const index = userThemes.findIndex((entry) => entry.id === body.themeId);
	if (index === -1) {
		if (defaultThemes.some((entry) => entry.id === body.themeId)) {
			throw new Error("Can't delete a built-in theme");
		}
		throw new Error('No theme with id "' + body.themeId + '"');
	}
	const [removed] = userThemes.splice(index, 1);
	writeThemesFile(userThemesFile, header, USER_THEMES_ASSIGNMENT, userThemes);
	return { message: 'Deleted "' + removed.name + '"' };
}

module.exports = {
	ensureUserThemesFile,
	handleThemeAction
};
