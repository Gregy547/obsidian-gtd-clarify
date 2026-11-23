// The same rules Obsidian's automated review applies (eslint-plugin-obsidianmd), run with
// `npm run lint`. Only the plugin's source is linted: main.js is built from it, and the
// tests are Node scripts, not plugin code.
import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["main.js", "node_modules/", "tests/", "examples/", "version-bump.mjs"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: { allowDefaultProject: ["eslint.config.*"] } },
    },
    rules: {
      // GTD is an acronym, and Templater and Templates are the names of other plugins. The
      // checker also flags "Process" and "Organise" where they name this plugin's two reviews;
      // those warnings are expected and left as they are.
      "obsidianmd/ui/sentence-case": ["warn", {
        enforceCamelCaseLower: true,
        acronyms: ["GTD", "OK"],
        brands: ["GTD Clarify", "Templater", "Templates", "Esc"],
      }],
    },
  },
  // Obsidian's automated review also type-checks JavaScript, with typescript-eslint's
  // type-checked rules (no-unsafe-*, no-floating-promises and the rest). Its own config only
  // applies them to .ts files, so they are added here for the source, which is typed with JSDoc.
  // The review checks with strict null checks on, so the source is linted that way too, through
  // tsconfig.lint.json; tsconfig.json itself stays as `tsc` checks the annotations.
  {
    files: ["src/**/*.js"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: { projectService: false, project: ["./tsconfig.lint.json"], tsconfigRootDir: import.meta.dirname },
    },
  },
]);
