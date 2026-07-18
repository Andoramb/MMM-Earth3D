import { defineConfig } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";

const stylisticRules = {
	"@stylistic/indent": ["error", "tab"],
	"@stylistic/quotes": ["error", "double", { avoidEscape: true, allowTemplateLiterals: "always" }],
	"@stylistic/semi": ["error", "always"]
};

export default defineConfig([
	{
		// presets/themes-user.js is a gitignored, generated-at-runtime file (see lib/theme-store.js) - not part of the shipped source.
		ignores: ["public/vendor/**", "node_modules/**", ".claude/**", "presets/themes-user.js"]
	},
	{
		// Root/server/preset scripts: loaded either by node_helper.js (Node/commonjs) or
		// via classic <script> tags in getScripts() (browser globals, no import/export).
		files: ["**/*.js"],
		ignores: ["public/control/**/*.js"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
				Log: "readonly",
				Module: "readonly"
			},
			sourceType: "commonjs"
		},
		plugins: { "@stylistic": stylistic },
		rules: {
			...js.configs.recommended.rules,
			...stylisticRules
		}
	},
	{
		// Control panel: loaded via <script type="module"> (public/control/home.html etc.), despite the .js extension.
		files: ["public/control/**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			globals: { ...globals.browser },
			sourceType: "module"
		},
		plugins: { "@stylistic": stylistic },
		rules: {
			...js.configs.recommended.rules,
			...stylisticRules
		}
	},
	{
		files: ["**/*.mjs"],
		languageOptions: {
			ecmaVersion: "latest",
			globals: { ...globals.browser },
			sourceType: "module"
		},
		plugins: { "@stylistic": stylistic },
		rules: {
			...js.configs.recommended.rules,
			...stylisticRules
		}
	}
]);
