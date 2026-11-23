/**
 * Disposing of a non-actionable task: delete it, or mark it completed/cancelled.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { setTaskStatus, cancelSubtree, DISPOSE_ACTIONS, disposeOptions, disposeActionFor, DEFAULT_SETTINGS } =
  require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

test("setTaskStatus rewrites only the checkbox character", () => {
  assert.strictEqual(setTaskStatus("- [ ] buy milk", "x"), "- [x] buy milk");
  assert.strictEqual(setTaskStatus("- [ ] buy milk", "-"), "- [-] buy milk");
  assert.strictEqual(setTaskStatus("- [/] partly done", "x"), "- [x] partly done");
});

test("setTaskStatus preserves indentation, markers and metadata", () => {
  assert.strictEqual(setTaskStatus("    - [ ] nested 📅 2026-01-01 #tag", "x"),
    "    - [x] nested 📅 2026-01-01 #tag");
  assert.strictEqual(setTaskStatus("* [ ] star marker", "x"), "* [x] star marker");
  assert.strictEqual(setTaskStatus("1. [ ] numbered", "x"), "1. [x] numbered");
  assert.strictEqual(setTaskStatus("\t- [ ] tabbed", "x"), "\t- [x] tabbed");
});

test("setTaskStatus returns null for a non-task line", () => {
  assert.strictEqual(setTaskStatus("- just a bullet", "x"), null);
  assert.strictEqual(setTaskStatus("# A heading", "x"), null);
  assert.strictEqual(setTaskStatus("", "x"), null);
});

// Cancelling with Tasks' cancelled date switched off, so these are about the status alone.
const undated = (vault) => ({ app: makeApp(vault), tasks: { taskDateSettings: async () => ({ doneDate: false, cancelledDate: false, dataview: false, globalFilter: "" }) } });

test("cancelling marks the task and all its open children", async () => {
  const vault = makeVault({ "F.md": "- [ ] project\n    - [ ] child\n        - [ ] grandchild\n- [ ] sibling" });
  await cancelSubtree(undated(vault), new TFile("F.md"), 0, 2);
  const lines = vault.store.get("F.md").split("\n");
  assert.deepStrictEqual(lines.slice(0, 3), ["- [-] project", "    - [-] child", "        - [-] grandchild"]);
  assert.strictEqual(lines[3], "- [ ] sibling", "the sibling must be untouched");
});

test("cancelling leaves non-task lines inside the subtree alone", async () => {
  const vault = makeVault({ "F.md": "- [ ] project\n    some note text\n    - [ ] child" });
  await cancelSubtree(undated(vault), new TFile("F.md"), 0, 2);
  assert.deepStrictEqual(vault.store.get("F.md").split("\n"),
    ["- [-] project", "    some note text", "    - [-] child"]);
});

test("cancelling does not run off the end of the file", async () => {
  const vault = makeVault({ "F.md": "- [ ] only" });
  await assert.doesNotReject(() => cancelSubtree(undated(vault), new TFile("F.md"), 0, 99));
  assert.strictEqual(vault.store.get("F.md"), "- [-] only");
});

test("all three endings are offered by default", () => {
  for (const key of ["enableCompleteOption", "enableCancelOption", "enableDeleteOption"]) {
    assert.strictEqual(DEFAULT_SETTINGS[key], true, `${key} should default on`);
  }
  assert.deepStrictEqual(disposeOptions(DEFAULT_SETTINGS).map((a) => a.value),
    ["complete", "cancel", "delete"]);
});

test("each ending is switchable on its own", () => {
  assert.deepStrictEqual(
    disposeOptions({ enableDeleteOption: false }).map((a) => a.value),
    ["complete", "cancel"], "delete off, the other two unaffected");
  assert.deepStrictEqual(
    disposeOptions({ enableCompleteOption: false, enableCancelOption: false }).map((a) => a.value),
    ["delete"]);
});

test("switching all three off leaves the other endings intact", () => {
  const none = { enableCompleteOption: false, enableCancelOption: false, enableDeleteOption: false };
  assert.deepStrictEqual(disposeOptions(none), [], "no disposal options");
  // Reference / Someday / Move are not part of this set and remain available.
});

test("an absent setting counts as on, so upgrading loses nothing", () => {
  assert.deepStrictEqual(disposeOptions({}).map((a) => a.value), ["complete", "cancel", "delete"]);
  assert.deepStrictEqual(disposeOptions(undefined).map((a) => a.value), ["complete", "cancel", "delete"]);
});

test("each action maps to its own distinct outcome", () => {
  assert.strictEqual(disposeActionFor("complete").symbol, "x");
  assert.strictEqual(disposeActionFor("cancel").symbol, "-");
  assert.strictEqual(disposeActionFor("delete").symbol, null, "null means remove the lines");
});

test("completed and cancelled are genuinely different, not aliases", () => {
  assert.notStrictEqual(disposeActionFor("complete").symbol, disposeActionFor("cancel").symbol);
  assert.notStrictEqual(disposeActionFor("complete").setting, disposeActionFor("cancel").setting);
  assert.notStrictEqual(disposeActionFor("complete").label, disposeActionFor("cancel").label);
});

test("an unknown choice is not treated as a disposal", () => {
  // The Process branch keys off disposeActionFor, so this must not swallow "someday".
  for (const v of ["reference", "someday", "move", "", null, undefined]) {
    assert.strictEqual(disposeActionFor(v), null, `${v} must not be a disposal`);
  }
});

test("every action has a label, a setting key and a description", () => {
  for (const a of DISPOSE_ACTIONS) {
    assert.ok(a.label && a.setting && a.description, `${a.value} is incompletely defined`);
    assert.match(a.setting, /^enable\w+Option$/);
  }
});

test("completed and cancelled use statuses the query engine reads as done", () => {
  const { COMPLETED_STATUSES } = require("./helpers/load.js");
  assert.ok(COMPLETED_STATUSES.has(disposeActionFor("complete").symbol));
  assert.ok(COMPLETED_STATUSES.has(disposeActionFor("cancel").symbol));
});
