/**
 * Renaming a task while marking it as a project.
 *
 * The bug this guards: the title edit and the #project tag must land as ONE write derived
 * from one known-good string. When they were two steps with a vault read between them,
 * the read could return the PRE-edit text (the Tasks command edits the open editor, which
 * reaches disk asynchronously). The tag was then appended to the old title, and the
 * editor's later flush overwrote that with the new title minus the tag.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { editTaskLineTagged, editTaskLineOrRestart, readLineAfterEdit, insertBeforeTasksMetadata, ReviewControl } =
  require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const ORIGINAL = "- [ ] old title";
const RENAMED = "- [ ] new title";

function setup(files) {
  const vault = makeVault(files);
  const app = makeApp(vault);
  const item = { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: files["Inbox.md"].split("\n")[0] };
  return { vault, app, item };
}
const line = (vault) => vault.store.get("Inbox.md").split("\n")[0];

test("API path: rename and tag land together in one write", async () => {
  const { vault, app, item } = setup({ "Inbox.md": ORIGINAL });
  let writes = 0;
  const realProcess = vault.process;
  vault.process = async (f, fn) => { writes++; return realProcess(f, fn); };
  const tasks = {
    canEditViaApi: () => true,
    editTaskLine: async () => RENAMED
  };
  const out = await editTaskLineTagged({ app, tasks }, item.file, item.startLine, ["#project"]);
  assert.match(out, /new title/, "the rename must survive");
  assert.match(out, /#project/, "the tag must survive");
  assert.strictEqual(line(vault), out);
  assert.strictEqual(writes, 1, "one write, so there is no window for a stale read");
});

test("API path: the edited text is what gets tagged, not the pre-edit text", async () => {
  // The precise failure: tag appended to the OLD title.
  const { vault, app, item } = setup({ "Inbox.md": ORIGINAL });
  const tasks = { canEditViaApi: () => true, editTaskLine: async () => RENAMED };
  await editTaskLineTagged({ app, tasks }, item.file, item.startLine, ["#project"]);
  assert.ok(!line(vault).includes("old title"), "the old title must not survive");
});

test("API path: the existing line is handed to the modal pre-filled", async () => {
  const { app, item } = setup({ "Inbox.md": ORIGINAL });
  let seen = null;
  const tasks = { canEditViaApi: () => true, editTaskLine: async (l) => { seen = l; return RENAMED; } };
  await editTaskLineTagged({ app, tasks }, item.file, item.startLine, ["#project"]);
  assert.strictEqual(seen, ORIGINAL);
});

test("API path: cancelling leaves the line untouched", async () => {
  const { vault, app, item } = setup({ "Inbox.md": ORIGINAL });
  const tasks = { canEditViaApi: () => true, editTaskLine: async () => "" };
  assert.strictEqual(await editTaskLineTagged({ app, tasks }, item.file, item.startLine, ["#project"]), null);
  assert.strictEqual(line(vault), ORIGINAL, "no tag, no rename, nothing written");
});

test("fallback path: waits for the editor to flush before tagging", async () => {
  // Reproduces the race: the modal closes, but the rename reaches disk 200ms later.
  const { vault, app, item } = setup({ "Inbox.md": ORIGINAL });
  const tasks = {
    canEditViaApi: () => false,
    editExistingInPlace: async () => {
      setTimeout(() => vault.store.set("Inbox.md", RENAMED), 200);
      return true;
    }
  };
  const out = await editTaskLineTagged({ app, tasks }, item.file, item.startLine, ["#project"]);
  assert.match(out, /new title/, "must not tag the pre-edit text");
  assert.match(out, /#project/);
  assert.strictEqual(line(vault), out);
});

test("fallback path: an unchanged line is still tagged, just after the timeout", async () => {
  const { vault, app, item } = setup({ "Inbox.md": ORIGINAL });
  const tasks = { canEditViaApi: () => false, editExistingInPlace: async () => true };
  const out = await editTaskLineTagged({ app, tasks }, item.file, item.startLine, ["#project"]);
  assert.strictEqual(out, insertBeforeTasksMetadata(ORIGINAL, ["#project"]));
  assert.match(line(vault), /#project/);
});

test("readLineAfterEdit returns as soon as the line changes", async () => {
  const { vault, app, item } = setup({ "Inbox.md": ORIGINAL });
  setTimeout(() => vault.store.set("Inbox.md", RENAMED), 100);
  const started = Date.now();
  const got = await readLineAfterEdit({ app }, item, ORIGINAL, 3000);
  assert.strictEqual(got, RENAMED);
  assert.ok(Date.now() - started < 1500, "must not wait out the full timeout once it sees a change");
});

test("readLineAfterEdit is bounded when nothing ever changes", async () => {
  const { app, item } = setup({ "Inbox.md": ORIGINAL });
  const started = Date.now();
  const got = await readLineAfterEdit({ app }, item, ORIGINAL, 300);
  assert.strictEqual(got, ORIGINAL);
  assert.ok(Date.now() - started < 2000);
});

test("the tag is placed before Tasks metadata, not after it", async () => {
  const { vault, app, item } = setup({ "Inbox.md": "- [ ] old 📅 2026-01-01" });
  const tasks = { canEditViaApi: () => true, editTaskLine: async () => "- [ ] renamed 📅 2026-01-01" };
  const out = await editTaskLineTagged({ app, tasks }, item.file, item.startLine, ["#project"]);
  assert.ok(out.indexOf("#project") < out.indexOf("📅"), `tag must precede the due date: ${out}`);
});

/* ------------------------- flushEditorLine (all callers) ------------------------- */

const { TasksApiAdapter } = (() => {
  // TasksApiAdapter is not exported; drive flushEditorLine through a minimal stand-in
  // built from the shipped source so the logic under test is the real one.
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  const start = src.indexOf("  async flushEditorLine(file, line, editor, timeoutMs = 2e3) {");
  const end = src.indexOf("\n  }", start) + 4;
  const body = src.slice(start, end);
  const { readLine } = { readLine: async (app, file, line) => (await app.vault.read(file)).split("\n")[line] };
  const Klass = new Function("readLine", `return class { constructor(app){this.app=app;} ${body} }`)(readLine);
  return { TasksApiAdapter: Klass };
})();

const fakeEditor = (lines) => ({
  lines,
  lastLine: () => lines.length - 1,
  getLine: (i) => lines[i]
});

test("flushEditorLine returns immediately when nothing was edited", async () => {
  const { vault, app } = setup({ "Inbox.md": ORIGINAL });
  const adapter = new TasksApiAdapter(app);
  const started = Date.now();
  await adapter.flushEditorLine(new TFile("Inbox.md"), 0, fakeEditor([ORIGINAL]), 3000);
  assert.ok(Date.now() - started < 200, "no pending change means no waiting");
  assert.strictEqual(line(vault), ORIGINAL);
});

test("flushEditorLine waits until the vault catches up with the editor", async () => {
  const { vault, app } = setup({ "Inbox.md": ORIGINAL });
  const adapter = new TasksApiAdapter(app);
  setTimeout(() => vault.store.set("Inbox.md", RENAMED), 150);
  await adapter.flushEditorLine(new TFile("Inbox.md"), 0, fakeEditor([RENAMED]), 3000);
  assert.strictEqual(line(vault), RENAMED, "must not return while the vault is stale");
});

test("flushEditorLine is bounded when the flush never arrives", async () => {
  const { app } = setup({ "Inbox.md": ORIGINAL });
  const adapter = new TasksApiAdapter(app);
  const started = Date.now();
  await adapter.flushEditorLine(new TFile("Inbox.md"), 0, fakeEditor([RENAMED]), 300);
  assert.ok(Date.now() - started < 2000, "must not hang the review");
});

test("flushEditorLine tolerates a line index outside the editor", async () => {
  const { app } = setup({ "Inbox.md": ORIGINAL });
  const adapter = new TasksApiAdapter(app);
  await assert.doesNotReject(() => adapter.flushEditorLine(new TFile("Inbox.md"), 99, fakeEditor([ORIGINAL]), 300));
});

/* --------------------- cancelling means restart, everywhere --------------------- */

test("editTaskLineOrRestart raises 'retry' when the modal is cancelled", async () => {
  const { vault, app, item } = setup({ "Inbox.md": ORIGINAL });
  const tasks = { canEditViaApi: () => true, editTaskLine: async () => "" };
  await assert.rejects(
    () => editTaskLineOrRestart({ app, tasks }, item.file, item.startLine, ["#project"]),
    (e) => e instanceof ReviewControl && e.kind === "retry",
    "a cancel must redo the smallest enclosing unit, not carry on"
  );
  assert.strictEqual(line(vault), ORIGINAL, "and must write nothing");
});

test("editTaskLineOrRestart returns the written line when the user saves", async () => {
  const { app, item } = setup({ "Inbox.md": ORIGINAL });
  const tasks = { canEditViaApi: () => true, editTaskLine: async () => RENAMED };
  const out = await editTaskLineOrRestart({ app, tasks }, item.file, item.startLine, ["#project"]);
  assert.match(out, /new title/);
  assert.match(out, /#project/);
});

test("a whitespace-only edit counts as a cancel", async () => {
  const { app, item } = setup({ "Inbox.md": ORIGINAL });
  const tasks = { canEditViaApi: () => true, editTaskLine: async () => "   " };
  await assert.rejects(
    () => editTaskLineOrRestart({ app, tasks }, item.file, item.startLine, []),
    (e) => e instanceof ReviewControl && e.kind === "retry"
  );
});

test("every Tasks-modal cancel in Process routes through the same policy", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  // Each site used to decide for itself, and all chose "carry on", which moved to the
  // next task. The invariant: a cancel never carries on. Each edit either goes through the
  // restart policy, or checks for the cancel itself and goes back to its question.
  const raw = [...main.matchAll(/await editTaskLineTagged\(/g)].map((m) => main.slice(m.index, m.index + 260));
  assert.ok(raw.length > 0);
  for (const call of raw) {
    assert.match(call, /=== null|!== null/, `a direct edit must handle the cancel: ${call.slice(0, 80)}`);
  }
  assert.ok((main.match(/editTaskLineOrRestart\(/g) || []).length >= 4, "the step edits still restart");
  assert.match(main, /if \(!mainRaw\) throw new ReviewControl\("retry"\)/,
    "cancelling project creation must restart too");
  assert.ok(!/Edit cancelled \u2014 left in place/.test(main),
    "the carry-on-anyway message must be gone");
  assert.ok(!/No project task created \u2014 left in place/.test(main));
});

test("restarting is safe because the journal rolls the attempt back first", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  // The loop restores before re-running, so a second attempt starts from the same state.
  const loop = main.slice(main.indexOf('if (e.kind === "back" || e.kind === "retry" || e.kind === "reprocess")'));
  assert.match(loop.slice(0, 900), /await journal\.restore\(\)/);
});
