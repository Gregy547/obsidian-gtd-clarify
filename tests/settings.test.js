/**
 * Optional Organise steps.
 *
 * The load-bearing property for a toggle like this is that it defaults ON: an existing
 * vault's data.json has no key for it, so a default of false would silently remove a step
 * people rely on when they upgrade.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS } = require("./helpers/load.js");

const { plain, plainSource } = require("./helpers/plain.js");
// Read for its wording: the **bold** markers in prompt text are left out.
const main = plainSource(fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8"));

test("the custom tag step defaults to on", () => {
  assert.strictEqual(DEFAULT_SETTINGS.enableCustomTagStep, true,
    "upgrading must not silently drop a step people already use");
});

test("settings merge leaves an unset key at its default", () => {
  // Mirrors loadSettings: Object.assign({}, DEFAULT_SETTINGS, await this.loadData()).
  const stored = { projectTag: "project" };
  const merged = Object.assign({}, DEFAULT_SETTINGS, stored);
  assert.strictEqual(merged.enableCustomTagStep, true);
});

test("an explicit false is preserved through the merge", () => {
  const merged = Object.assign({}, DEFAULT_SETTINGS, { enableCustomTagStep: false });
  assert.strictEqual(merged.enableCustomTagStep, false);
});

test("the step is skipped only on an explicit false", () => {
  // Guards against `if (!settings.enableCustomTagStep)`, which would also skip when the
  // key is missing — the upgrade case.
  assert.match(main, /settings\.enableCustomTagStep === false/);
  assert.ok(
    !/if \(!settings\.enableCustomTagStep\)/.test(main),
    "a falsy check would skip the step for anyone who has not opened settings"
  );
});

test("the skip happens before the prompt, not after", () => {
  const guard = main.indexOf("settings.enableCustomTagStep === false");
  const prompt = main.indexOf('prompter.text("Custom tag (optional)"');
  assert.ok(guard > -1 && prompt > -1);
  assert.ok(guard < prompt, "the prompt must never be shown when the step is off");
});

test("the toggle is exposed in the settings tab", () => {
  assert.match(main, /this\.toggleField\(\s*"Custom tag step"/);
  assert.match(main, /"enableCustomTagStep"/);
});

test("it sits with the other optional-step toggle", () => {
  const priority = main.indexOf('"enablePriorityStep");');
  const custom = main.indexOf('"enableCustomTagStep"\n    );');
  assert.ok(custom > priority, "grouped with Priority step, not scattered");
});

test("every toggle in DEFAULT_SETTINGS is a real boolean", () => {
  for (const key of ["enablePriorityStep", "enableCustomTagStep", "confirmBeforeDelete", "highlightSourceLine"]) {
    assert.strictEqual(typeof DEFAULT_SETTINGS[key], "boolean", `${key} should be a boolean`);
  }
});
