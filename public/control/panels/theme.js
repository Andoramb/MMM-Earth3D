/*
 * Theme panel (home.html) - the theme picker plus its Duplicate/Save/Delete
 * management buttons. See node_helper.js's handleThemeAction for what those
 * three actually do server-side.
 */

let themeEl;

export function init (ctx) {
	themeEl = document.getElementById("theme");

	for (const theme of ctx.themes) {
		const option = document.createElement("option");
		option.value = theme.id;
		option.textContent = theme.name + (ctx.defaultThemeIds.has(theme.id) ? " (built-in)" : "");
		themeEl.append(option);
	}

	themeEl.addEventListener("change", () => {
		ctx.send({ theme: themeEl.value }).then(ctx.refetch);
	});

	document.getElementById("themeDuplicateBtn").addEventListener("click", () => {
		const sourceId = themeEl.value;
		if (sourceId === "custom") {
			ctx.setStatus("Pick a theme first - \"Custom\" isn't a stored theme to duplicate", true);
			return;
		}
		const source = ctx.themes.find((entry) => entry.id === sourceId);
		const name = window.prompt("Name for the new theme?", source ? source.name + " copy" : "");
		if (!name) {
			return;
		}
		ctx.postThemeAction({ action: "duplicate", sourceId, name });
	});

	document.getElementById("themeSaveBtn").addEventListener("click", () => {
		const themeId = themeEl.value;
		if (themeId === "custom") {
			ctx.setStatus("Pick a theme first - \"Custom\" isn't a stored theme to save into", true);
			return;
		}
		if (ctx.defaultThemeIds.has(themeId)) {
			ctx.setStatus("Can't save over a built-in theme - Duplicate it first, then save into the copy", true);
			return;
		}
		const theme = ctx.themes.find((entry) => entry.id === themeId);
		if (!window.confirm('Save the current settings into "' + (theme ? theme.name : themeId) + '"? This overwrites whatever it currently has for the fields you\'ve changed.')) {
			return;
		}
		ctx.postThemeAction({ action: "save", themeId, overrides: ctx.getOverrides() });
	});

	document.getElementById("themeDeleteBtn").addEventListener("click", () => {
		const themeId = themeEl.value;
		if (themeId === "custom") {
			ctx.setStatus("\"Custom\" isn't a stored theme - nothing to delete", true);
			return;
		}
		if (ctx.defaultThemeIds.has(themeId)) {
			ctx.setStatus("Can't delete a built-in theme", true);
			return;
		}
		const theme = ctx.themes.find((entry) => entry.id === themeId);
		if (!window.confirm('Delete theme "' + (theme ? theme.name : themeId) + '"? This can\'t be undone.')) {
			return;
		}
		ctx.postThemeAction({ action: "delete", themeId });
	});
}

export function applyConfig (config) {
	themeEl.value = config.theme;
}
