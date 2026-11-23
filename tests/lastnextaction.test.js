/**
 * A project's last next action: the project is never left silently with nothing to do.
 *
 * Reported: processing a Tasks query, a project's only next action was sent to Someday and
 * the project stayed behind, with nothing left in it. Now:
 * - Someday for a project's last open task asks first: the whole project (with the task
 *   still in it), or just this step — then add the project's next action, or leave it.
 * - Any other way the last one goes — done, cancelled, deleted, moved out — asks what
 *   becomes of the project: add a next action, Someday, finished, cancel, or leave it.
 * - In Organise, a step found inside a project is labelled where it is, not filed out of it.
 * "Open" counts anything not done or cancelled: a deferred step or a waiting-for means the
 * project is deferred or waiting, not empty.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const {
  projectAbove, openTasksUnder, settleProjectLeft, DefaultFilingStrategy, DEFAULT_SETTINGS, ReviewControl,
  VaultJournal, journalledApp, runOrganise, shiftDate, todayString
} = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const plain = (q) => String(q).replace(/\*\*/g, "");
const SOMEDAY = "Someday/Someday.md";
const LAST = "That’s the project’s last next action.";
const EMPTY = "This project has no next action.";
const START = "\u{1F6EB}";

function setup(files, answers, { creates = [], mode = "process", sourceKind = "query", settings = {} } = {}) {
  const vault = makeVault(Object.assign({ [SOMEDAY]: "" }, files));
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [];
  const answer = (raw, opts) => {
    const q = plain(raw);
    asked.push({ q, opts: (opts || []).map((o) => ({ value: o.value, suggested: !!o.suggested })) });
    const key = Object.keys(queues).find((k) => q.startsWith(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    const a = queues[key].shift();
    if (a instanceof Error) throw a;
    return a;
  };
  const c = [...creates];
  const ctx = {
    app: makeApp(vault), mode, quickBatch: [], sourceKind,
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      dimensions: [DEFAULT_SETTINGS.dimensions[0]], enablePriorityStep: false, enableCustomTagStep: false,
      clarifyNextAction: false, nudgeVagueActions: false
    }, settings),
    tasks: {
      canEditViaApi: () => true, editTaskLine: async (l) => l, createNewTaskLine: async () => (c.length ? c.shift() : ""),
      newDependencyId: () => "a1", idSignifier: (id) => `🆔 ${id}`, blockedBySignifier: (id) => `⛔ ${id}`,
      toggleTaskDone: () => null, taskDateSettings: async () => ({ doneDate: false, cancelledDate: false, dataview: false, globalFilter: "" })
    },
    prompter: {
      choice: async (q, o) => answer(q, o), optionalChoice: async (q, o) => answer(q, o), confirm: async () => true,
      text: async (q) => answer(q, []), info: () => {}, showGuidance: () => {},
      highlightInSource: async () => {}, focusSubtask: () => {}, suggestFile: async () => null
    }
  };
  ctx.filing = new DefaultFilingStrategy();
  return { vault, ctx, asked, read: (p = "P.md") => vault.store.get(p), q: (text) => asked.filter((a) => a.q.startsWith(text)) };
}
/** An item as a Tasks query finds it: the task itself, wherever it sits. */
function found(h, line, file = "P.md") {
  const lines = h.read(file).split("\n");
  return { file: new TFile(file), startLine: line, endLine: L.computeSubtreeEnd(lines, line), raw: lines[line], isProject: L.lineHasTag(lines[line], "project") };
}
const KITCHEN = "- [ ] Call Sam\n- [ ] Kitchen refit #project\n    - notes: quotes in the drawer\n    - [ ] Measure the sink\n- [ ] Email Priya";
const NOT_ACTIONABLE = { "Actionable this week?": [false] };

/* --------------------------------- the pieces --------------------------------- */

test("the project a task sits in is the nearest tagged one above it", () => {
  const lines = ["- [ ] House #project", "    - [ ] Kitchen #project", "        - [ ] Plain parent", "            - [ ] Step"];
  assert.deepStrictEqual(projectAbove(lines, 3, "project"), { line: 1, raw: lines[1] });
  assert.strictEqual(projectAbove(["- [ ] Parent", "    - [ ] Step"], 1, "project"), null, "a plain parent is not a project");
});

test("open means not done or cancelled, at any depth — deferred and waiting-for count", () => {
  const lines = [
    "- [ ] P #project", "    - [x] done", "    - [-] cancelled", "    - text", `    - [ ] deferred ${START} 2099-01-01`,
    "    - [ ] Sam: quote #waitingfor", "        - [ ] deeper"
  ];
  assert.strictEqual(openTasksUnder(lines, 0, 6), 3);
  assert.strictEqual(openTasksUnder(lines, 0, 6, 4, 6), 0, "leaving out a range");
});

/* ------------------------- Someday for the last one ------------------------- */

test("the whole project goes to Someday, with the step still inside it", async () => {
  const h = setup({ "P.md": KITCHEN }, { ...NOT_ACTIONABLE, "What should happen": ["someday"], [LAST]: ["someday"] });
  const it = found(h, 3);
  await runProcess(h.ctx, it);
  assert.strictEqual(h.read(SOMEDAY), "- [ ] Kitchen refit #project\n    - notes: quotes in the drawer\n    - [ ] Measure the sink\n");
  assert.strictEqual(h.read(), "- [ ] Call Sam\n- [ ] Email Priya");
  assert.strictEqual(it.disposed, true);
  assert.strictEqual(it.outcome, "someday");
});

test("just this step, then the project's next action", async () => {
  const h = setup({ "P.md": KITCHEN }, {
    ...NOT_ACTIONABLE, "What should happen": ["someday"], [LAST]: ["add"], "Must this wait": [false], "Next action saved.": ["done"]
  }, { creates: ["- [ ] Choose the tiles"] });
  await runProcess(h.ctx, found(h, 3));
  assert.strictEqual(h.read(SOMEDAY), "- [ ] Measure the sink\n");
  assert.strictEqual(h.read(), "- [ ] Call Sam\n- [ ] Kitchen refit #project\n    - notes: quotes in the drawer\n    - [ ] Choose the tiles\n- [ ] Email Priya");
});

test("just this step, leaving the project as it is", async () => {
  const h = setup({ "P.md": KITCHEN }, { ...NOT_ACTIONABLE, "What should happen": ["someday"], [LAST]: ["leave"] });
  const it = found(h, 3);
  await runProcess(h.ctx, it);
  assert.strictEqual(h.read(SOMEDAY), "- [ ] Measure the sink\n");
  assert.match(h.read(), /Kitchen refit #project/);
  assert.strictEqual(it.projectHandled, true, "not asked about again once the step is done with");
});

test("not asked while the project has other open tasks — deferred or waiting ones included", async () => {
  for (const other of ["    - [ ] Choose the tiles", `    - [ ] Book the plumber ${START} ${shiftDate(todayString(), 9)}`, "    - [ ] Sam: quote #waitingfor"]) {
    const h = setup({ "P.md": `${KITCHEN}\n${other}`.replace("\n- [ ] Email Priya", "") + "\n- [ ] Email Priya" }, { ...NOT_ACTIONABLE, "What should happen": ["someday"] });
    await runProcess(h.ctx, found(h, 3));
    assert.strictEqual(h.q(LAST).length, 0, other);
    assert.strictEqual(h.read(SOMEDAY), "- [ ] Measure the sink\n");
  }
});

test("finished steps don't count: the last open one asks", async () => {
  const h = setup({ "P.md": "- [ ] Kitchen refit #project\n    - [x] Get quotes\n    - [ ] Measure the sink" },
    { ...NOT_ACTIONABLE, "What should happen": ["someday"], [LAST]: ["someday"] });
  await runProcess(h.ctx, found(h, 2));
  assert.strictEqual(h.read(SOMEDAY), "- [ ] Kitchen refit #project\n    - [x] Get quotes\n    - [ ] Measure the sink\n");
});

test("a task under a plain parent, not a project, is left to itself", async () => {
  const h = setup({ "P.md": "- [ ] Shopping\n    - [ ] Milk" }, { ...NOT_ACTIONABLE, "What should happen": ["someday"] });
  await runProcess(h.ctx, found(h, 1));
  assert.strictEqual(h.q(LAST).length, 0);
});

/* ------------------------- any other way it goes ------------------------- */

test("cancelled, done, deleted or moved out: what becomes of the project is asked", async () => {
  for (const [outcome, answer, expected, suggested] of [
    ["cancel", "cancel", (h) => assert.match(h.read(), /- \[-\] Kitchen refit/), "add"],
    ["complete", "done", (h) => assert.match(h.read(), /- \[x\] Kitchen refit/), "done"],
    ["delete", "someday", (h) => assert.match(h.read(SOMEDAY), /Kitchen refit/), "add"],
    ["moved", "leave", (h) => assert.match(h.read(), /- \[ \] Kitchen refit/), "add"]
  ]) {
    const h = setup({ "P.md": "- [ ] Kitchen refit #project\n    - [-] Measure the sink" }, { [EMPTY]: [answer] });
    await settleProjectLeft(h.ctx, { file: new TFile("P.md"), outcome }, { line: 0, raw: "- [ ] Kitchen refit #project" });
    assert.strictEqual(h.q(EMPTY).length, 1, outcome);
    assert.deepStrictEqual(h.q(EMPTY)[0].opts.filter((o) => o.suggested).map((o) => o.value), [suggested], `${outcome}: the likely answer is marked`);
    assert.deepStrictEqual(h.q(EMPTY)[0].opts.map((o) => o.value), ["add", "someday", "done", "cancel", "leave"], "every answer in its place");
    expected(h);
  }
});

test("a project that still has something to do is not asked about", async () => {
  const h = setup({ "P.md": "- [ ] Kitchen refit #project\n    - [-] Measure the sink\n    - [ ] Choose the tiles" }, {});
  assert.strictEqual(await settleProjectLeft(h.ctx, { file: new TFile("P.md"), outcome: "cancel" }, { line: 0, raw: "- [ ] Kitchen refit #project" }), null);
  assert.strictEqual(h.asked.length, 0);
});

test("adding a next action, then cancelling it, comes back to the question", async () => {
  const h = setup({ "P.md": "- [ ] Kitchen refit #project\n    - [x] Measure the sink" }, { [EMPTY]: ["add", "leave"] }, { creates: [""] });
  await settleProjectLeft(h.ctx, { file: new TFile("P.md"), outcome: "complete" }, { line: 0, raw: "- [ ] Kitchen refit #project" });
  assert.strictEqual(h.q(EMPTY).length, 2);
});

/* ------------------------- in the review, from a query ------------------------- */

function review(files, process) {
  const at = main.indexOf("  async start(mode, file");
  const body = main.slice(at, main.indexOf("\n  }\n", at) + 4);
  const deps = Object.assign({}, L, { runProcess: process, obsidian: L.obsidian });
  const names = Object.keys(deps).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  const Klass = new Function(...names, `return class { ${body} }`)(...names.map((k) => deps[k]));
  const vault = makeVault(Object.assign({ [SOMEDAY]: "" }, files));
  const pane = new Klass();
  const asked = [];
  pane.app = makeApp(vault);
  pane.plugin = { settings: Object.assign({}, DEFAULT_SETTINGS), tasksApi: { isAvailable: () => true } };
  pane.headerEl = { setText() {} };
  pane.bodyEl = { empty() {}, createEl() { return {}; } };
  pane.chooseSource = async () => ({
    collect: async () => {
      const lines = vault.store.get("P.md").split("\n");
      return [3].map((i) => ({ file: new TFile("P.md"), startLine: i, endLine: i, raw: lines[i], isProject: false }));
    }
  });
  pane.renderProgress = () => {};
  pane.highlightInSource = async () => {};
  pane.renderDone = () => {};
  pane.runQuickBatch = async () => 0;
  pane.info = () => {};
  pane.choice = async (q) => { asked.push(plain(q)); return "someday"; };
  return { vault, asked, run: () => pane.start("process", new TFile("P.md")) };
}

test("a query-found step cancelled in Process: the review asks about its project", async () => {
  const r = review({ "P.md": KITCHEN }, async (ctx, item) => {
    await ctx.app.vault.process(item.file, (d) => d.replace("- [ ] Measure the sink", "- [-] Measure the sink"));
    item.outcome = "cancel";
  });
  await r.run();
  assert.deepStrictEqual(r.asked, [EMPTY]);
  assert.match(r.vault.store.get(SOMEDAY), /Kitchen refit #project\n    - notes: quotes in the drawer\n    - \[-\] Measure the sink/);
  assert.strictEqual(r.vault.store.get("P.md"), "- [ ] Call Sam\n- [ ] Email Priya");
});

test("after Restart, the project is checked afresh — an answer from the undone try doesn't carry over", async () => {
  let attempt = 0;
  const r = review({ "P.md": KITCHEN }, async (ctx, item) => {
    attempt++;
    if (attempt === 1) {
      // Asked about the project on the way to Someday, then Restart.
      item.projectHandled = true;
      throw new ReviewControl("back");
    }
    await ctx.app.vault.process(item.file, (d) => d.replace("- [ ] Measure the sink", "- [-] Measure the sink"));
    item.outcome = "cancel";
  });
  await r.run();
  assert.deepStrictEqual(r.asked, [EMPTY]);
});

test("a query-found step kept as a next action: nothing more is asked", async () => {
  const r = review({ "P.md": KITCHEN }, async (ctx, item) => { item.outcome = "next"; });
  await r.run();
  assert.deepStrictEqual(r.asked, []);
});

test("Restart after the whole project went to Someday puts both notes back", async () => {
  const h = setup({ "P.md": KITCHEN }, { ...NOT_ACTIONABLE, "What should happen": ["someday"], [LAST]: ["someday"] });
  const journal = new VaultJournal(h.ctx.app);
  await journal.capture(new TFile("P.md"));
  await runProcess(Object.assign({}, h.ctx, { app: journalledApp(h.ctx.app, journal) }), found(h, 3));
  assert.match(h.read(SOMEDAY), /Kitchen refit/);
  await journal.restore();
  assert.strictEqual(h.read(), KITCHEN);
  assert.strictEqual(h.read(SOMEDAY), "");
});

/* ------------------------- processing a project as a whole ------------------------- */

const project = (h) => ({ file: new TFile("P.md"), startLine: 1, endLine: 3, raw: "- [ ] Kitchen refit #project", isProject: true });

test("its only step to Someday, whole project: it goes after its walk, with the step inside", async () => {
  const h = setup({ "P.md": KITCHEN }, { "Actionable this week?": [true, false], "What should happen": ["someday"], [LAST]: ["someday"] },
    { sourceKind: "file" });
  const it = project(h);
  await runProcess(h.ctx, it);
  assert.strictEqual(h.read(SOMEDAY), "- [ ] Kitchen refit #project\n    - notes: quotes in the drawer\n    - [ ] Measure the sink\n");
  assert.strictEqual(h.q("Add another next action").length, 0);
  assert.strictEqual(it.disposed, true);
  assert.strictEqual(it.outcome, "someday");
});

test("its only step cancelled during its walk: asked what becomes of it, not “Add another…”", async () => {
  const h = setup({ "P.md": KITCHEN }, { "Actionable this week?": [true, false], "What should happen": ["cancel"], [EMPTY]: ["leave"] },
    { sourceKind: "file" });
  await runProcess(h.ctx, project(h));
  assert.strictEqual(h.q(EMPTY).length, 1);
  assert.strictEqual(h.q("Add another next action").length, 0);
});

test("with a step still open after its walk, “Add another…” is asked as before", async () => {
  const h = setup({ "P.md": KITCHEN.replace("- [ ] Measure the sink", "- [ ] Measure the sink\n    - [ ] Choose the tiles") }, {
    "Actionable this week?": [true, false, true], "What should happen": ["someday"], "Does this need more than one step?": ["no"],
    "Add another next action": ["no"]
  }, { sourceKind: "file" });
  await runProcess(h.ctx, { ...project(h), endLine: 4 });
  assert.strictEqual(h.q(LAST).length, 0);
  assert.strictEqual(h.q("Add another next action").length, 1);
});

/* --------------------------------- Organise --------------------------------- */

test("Organise labels a step found inside a project, and leaves it there", async () => {
  const h = setup({ "P.md": KITCHEN }, { "Physical context": ["home"] }, { mode: "organise" });
  await runOrganise(h.ctx, found(h, 3), h.ctx.filing);
  assert.strictEqual(h.q("Move to").length, 0);
  assert.match(h.read(), /- \[ \] Kitchen refit #project\n    - notes: quotes in the drawer\n    - \[ \] Measure the sink #home/);
});

test("Organise's “no next action” can now send the project to Someday, or cancel it", async () => {
  for (const [answer, check] of [
    ["someday", (h, it) => { assert.match(h.read(SOMEDAY), /Kitchen refit/); assert.strictEqual(it.disposed, true); }],
    ["cancel", (h, it) => { assert.match(h.read(), /- \[-\] Kitchen refit/); assert.strictEqual(it.outcome, "cancel"); }]
  ]) {
    const h = setup({ "P.md": "- [ ] Kitchen refit #project" }, { [EMPTY]: [answer] }, { mode: "organise", sourceKind: "file" });
    const it = { file: new TFile("P.md"), startLine: 0, endLine: 0, raw: "- [ ] Kitchen refit #project", isProject: true };
    await runOrganise(h.ctx, it, h.ctx.filing);
    check(h, it);
    assert.strictEqual(h.q("Move to").length, 0, "nothing left to file");
  }
});

/* ------------------------------ the two-minute batch ------------------------------ */

test("the batch: doing a project's last next action asks about the project", async () => {
  const src = main.slice(main.indexOf("  async runQuickBatch(ctx, batch) {"));
  const body = src.slice(0, src.indexOf("\n  }\n") + 4);
  const deps = Object.assign({}, L);
  const names = Object.keys(deps).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  const Klass = new Function(...names, `return class { ${body} }`)(...names.map((k) => deps[k]));
  const h = setup({ "P.md": "- [ ] Kitchen refit #project\n    - [ ] Text Sam the dates" }, { "Two-minute batch": ["done"], [EMPTY]: ["done"] });
  const pane = Object.assign(new Klass(), { app: h.ctx.app, exiting: false, headerEl: { setText() {} }, highlightInSource: async () => {}, choice: h.ctx.prompter.choice });
  await pane.runQuickBatch(h.ctx, [{ file: new TFile("P.md"), line: 1, raw: "    - [ ] Text Sam the dates" }]);
  assert.deepStrictEqual(h.q(EMPTY)[0].opts.filter((o) => o.suggested).map((o) => o.value), ["done"]);
  assert.strictEqual(h.read(), "- [x] Kitchen refit #project\n    - [x] Text Sam the dates");
});
