/**
 * Done and cancelled dates, as Tasks writes them.
 *
 * Reported: Process didn't record the date a task was completed or cancelled, which Tasks
 * does by default ("Set done date on every completed task", "Set cancelled date on every
 * cancelled task"). Cancelling only rewrote the checkbox, and completing fell back to a bare
 * [x] whenever Tasks' own toggle wasn't available or didn't reach done. Both now write the
 * date Tasks would — ✅ / ❌, or [completion:: ] / [cancelled:: ] in Dataview format —
 * following Tasks' own settings.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const {
  completedLines, completeSubtree, cancelSubtree, setFinishedDate, hasFinishedDate, TasksApiAdapter,
  settleNotActionable, DefaultFilingStrategy, DEFAULT_SETTINGS
} = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const TODAY = "2026-11-06";
const DONE = "✅", CANCELLED = "❌", REPEAT = "\u{1F501}", DUE = "\u{1F4C5}";
const ON = { doneDate: true, cancelledDate: true, dataview: false, globalFilter: "" };
const OFF = { doneDate: false, cancelledDate: false, dataview: false, globalFilter: "" };
const DATAVIEW = { ...ON, dataview: true };

/** Tasks' toggle, as configured: dates or not, and where a status cycle goes. */
function toggle({ dates = true, cycleTo = "x", available = true } = {}) {
  return {
    toggleTaskDone(line) {
      if (!available) return null;
      const done = line.replace(/\[ \]/, `[${cycleTo}]`) + (cycleTo === "x" && dates ? ` ${DONE} ${TODAY}` : "");
      if (line.includes(REPEAT)) return `${line.replace("2026-11-06", "2026-11-13")}\n${done}`;
      return done;
    }
  };
}

/* --------------------------------- completing --------------------------------- */

test("without Tasks' toggle, a completed task gets the done date Tasks would add", () => {
  assert.deepStrictEqual(completedLines(toggle({ available: false }), "- [ ] Call Sam", "P.md", ON, TODAY), [`- [x] Call Sam ${DONE} ${TODAY}`]);
});

test("a status cycle that doesn't reach done still ends done, and dated", () => {
  // Todo → In Progress in Tasks' settings: its toggle gives [/], which is not done.
  assert.deepStrictEqual(completedLines(toggle({ cycleTo: "/" }), "- [ ] Call Sam", "P.md", ON, TODAY), [`- [x] Call Sam ${DONE} ${TODAY}`]);
});

test("when Tasks completes it, Tasks' date is kept as written", () => {
  assert.deepStrictEqual(completedLines(toggle(), "- [ ] Call Sam", "P.md", ON, "2099-01-01"), [`- [x] Call Sam ${DONE} ${TODAY}`]);
});

test("one Tasks completed but left undated is dated", () => {
  assert.deepStrictEqual(completedLines(toggle({ dates: false }), "- [ ] Call Sam", "P.md", ON, TODAY), [`- [x] Call Sam ${DONE} ${TODAY}`]);
});

test("a recurring task: the finished one is dated, the next one is not", () => {
  const out = completedLines(toggle({ dates: false }), `- [ ] Water plants ${REPEAT} every week ${DUE} 2026-11-06`, "P.md", ON, TODAY);
  assert.deepStrictEqual(out, [
    `- [ ] Water plants ${REPEAT} every week ${DUE} 2026-11-13`,
    `- [x] Water plants ${REPEAT} every week ${DUE} 2026-11-06 ${DONE} ${TODAY}`
  ]);
});

test("no date when Tasks is set not to add one", () => {
  assert.deepStrictEqual(completedLines(toggle({ available: false }), "- [ ] Call Sam", "P.md", OFF, TODAY), ["- [x] Call Sam"]);
});

test("a date left from an earlier completion is replaced with today's", () => {
  assert.deepStrictEqual(completedLines(toggle({ available: false }), `- [ ] Call Sam ${DONE} 2025-01-01`, "P.md", ON, TODAY), [`- [x] Call Sam ${DONE} ${TODAY}`]);
});

test("in Dataview format, the date is a completion field", () => {
  assert.deepStrictEqual(completedLines(toggle({ available: false }), "- [ ] Call Sam", "P.md", DATAVIEW, TODAY), [`- [x] Call Sam  [completion:: ${TODAY}]`]);
});

test("with a global filter, only lines Tasks counts as tasks are dated", () => {
  const filtered = { ...ON, globalFilter: "#task" };
  assert.deepStrictEqual(completedLines(toggle({ available: false }), "- [ ] Call Sam #task", "P.md", filtered, TODAY), [`- [x] Call Sam #task ${DONE} ${TODAY}`]);
  assert.deepStrictEqual(completedLines(toggle({ available: false }), "- [ ] Call Sam", "P.md", filtered, TODAY), ["- [x] Call Sam"]);
});

test("the date goes before a block id, so links to the task keep working", () => {
  assert.strictEqual(setFinishedDate("- [x] Call Sam ^call", "done", TODAY, false), `- [x] Call Sam ${DONE} ${TODAY} ^call`);
  assert.strictEqual(setFinishedDate("- [x] Call Sam ^call", "done", TODAY, true), `- [x] Call Sam  [completion:: ${TODAY}] ^call`);
});

test("completing a subtree reads Tasks' settings and dates each task it completes", async () => {
  const vault = makeVault({ "P.md": "- [ ] Move house #project\n    - [ ] Book the van\n    - [x] Get quotes ✅ 2026-10-01" });
  const tasks = Object.assign(toggle({ available: false }), { taskDateSettings: async () => ON });
  await completeSubtree({ app: makeApp(vault), tasks }, new TFile("P.md"), 0, 2);
  const today = L.todayString();
  assert.deepStrictEqual(vault.store.get("P.md").split("\n"), [
    `- [x] Move house #project ${DONE} ${today}`,
    `    - [x] Book the van ${DONE} ${today}`,
    "    - [x] Get quotes ✅ 2026-10-01"
  ], "a subtask already done keeps its own date");
});

/* --------------------------------- cancelling --------------------------------- */

test("cancelling adds the cancelled date, to the task and its open subtasks", async () => {
  const vault = makeVault({ "P.md": "- [ ] Old plan #project\n    - [ ] Ring the venue\n    some notes\n    - [x] Got quotes ✅ 2026-10-01" });
  await cancelSubtree({ app: makeApp(vault), tasks: { taskDateSettings: async () => ON } }, new TFile("P.md"), 0, 3);
  const today = L.todayString();
  assert.deepStrictEqual(vault.store.get("P.md").split("\n"), [
    `- [-] Old plan #project ${CANCELLED} ${today}`,
    `    - [-] Ring the venue ${CANCELLED} ${today}`,
    "    some notes",
    "    - [x] Got quotes ✅ 2026-10-01"
  ], "done work stays done — it used to be marked cancelled too");
});

test("cancelling follows Tasks' settings: no date, or a Dataview field", async () => {
  const run = async (dates) => {
    const vault = makeVault({ "P.md": "- [ ] Old idea" });
    await cancelSubtree({ app: makeApp(vault), tasks: { taskDateSettings: async () => dates } }, new TFile("P.md"), 0, 0);
    return vault.store.get("P.md");
  };
  assert.strictEqual(await run(OFF), "- [-] Old idea");
  assert.strictEqual(await run(DATAVIEW), `- [-] Old idea  [cancelled:: ${L.todayString()}]`);
});

test("Process: “Mark as cancelled” and “Mark as completed” write the dates", async () => {
  for (const [choice, expected] of [["cancel", `- [-] Old idea ${CANCELLED} `], ["complete", `- [x] Old idea ${DONE} `]]) {
    const vault = makeVault({ "P.md": "- [ ] Old idea" });
    const ctx = {
      app: makeApp(vault), settings: Object.assign({}, DEFAULT_SETTINGS),
      tasks: Object.assign(toggle({ available: false }), { taskDateSettings: async () => ON }),
      prompter: { choice: async () => choice, confirm: async () => true, info: () => {} }
    };
    ctx.filing = new DefaultFilingStrategy();
    await settleNotActionable(ctx, { file: new TFile("P.md"), startLine: 0, endLine: 0, raw: "- [ ] Old idea" });
    assert.strictEqual(vault.store.get("P.md"), expected + L.todayString());
  }
});

/* ------------------------------- Tasks' settings ------------------------------- */

function adapterWith(data, { throws = false, plugin = true } = {}) {
  const app = { plugins: { plugins: plugin ? { "obsidian-tasks-plugin": { loadData: async () => { if (throws) throw new Error("x"); return data; } } } : {} } };
  return new TasksApiAdapter(app);
}

test("Tasks' settings are read from what Tasks saved", async () => {
  assert.deepStrictEqual(
    await adapterWith({ setDoneDate: false, setCancelledDate: true, taskFormat: "dataview", globalFilter: " #task " }).taskDateSettings(),
    { doneDate: false, cancelledDate: true, dataview: true, globalFilter: "#task" }
  );
});

test("where Tasks hasn't saved them, its defaults: both dates, emoji format", async () => {
  const defaults = { doneDate: true, cancelledDate: true, dataview: false, globalFilter: "" };
  assert.deepStrictEqual(await adapterWith({}).taskDateSettings(), defaults);
  assert.deepStrictEqual(await adapterWith(null).taskDateSettings(), defaults);
  assert.deepStrictEqual(await adapterWith({}, { throws: true }).taskDateSettings(), defaults);
  assert.deepStrictEqual(await adapterWith({}, { plugin: false }).taskDateSettings(), defaults);
});

test("a date of the other kind is not mistaken for this one", () => {
  assert.ok(hasFinishedDate(`- [x] a ${DONE} 2026-01-01`, "done"));
  assert.ok(!hasFinishedDate(`- [x] a ${CANCELLED} 2026-01-01`, "done"));
  assert.ok(hasFinishedDate("- [-] a [cancelled:: 2026-01-01]", "cancelled"));
  assert.ok(!hasFinishedDate("- [-] a [completion:: 2026-01-01]", "cancelled"));
});
