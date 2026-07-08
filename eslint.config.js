import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";

// Single flat config for the whole monorepo: TypeScript across every package, Node globals for
// source/config/tests, and Vue SFC support for the dashboard app.
export default tseslint.config(
	{
		ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "**/*.d.ts", "**/persona-corpus.ts"],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	...pluginVue.configs["flat/recommended"],
	{
		files: ["**/*.{ts,mts,cts,js,mjs,cjs,vue}"],
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: { ...globals.node },
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
		},
	},
	{
		// Vue SFCs: parse <script lang="ts"> with the TypeScript parser.
		files: ["**/*.vue"],
		languageOptions: {
			parserOptions: { parser: tseslint.parser },
		},
		rules: {
			// App views are conventionally single-word (Overview, App); allow it.
			"vue/multi-word-component-names": "off",
		},
	},
);
