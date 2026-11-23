/**
 * The two-minute rule: decided during processing, done in a batch at the end.
 *
 * The risks worth testing are the quiet ones: a task restarted or reverted staying in the
 * batch (offered twice, or offered after being undone), a queued task that has since moved
 * or changed being completed by mistake, and completion silently breaking a recurring
 * series by bypassing Tasks.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  completedLines, completeSubtree, queueQuickAction, locateQueuedAction, GUIDANCE, ReviewControl
} = require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const TODAY = "2026-08-12";

/** A stand-in for Tasks' toggle: adds a done date, and returns two lines for a recurring
 * task with the next occurrence above, as Tasks does by default. */
function fakeTasks({ available = true, cycleTo = "x", throws = false } = {}) {
  return {
    toggleTaskDone(line) {
      if (!available) return null;
      if (throws) throw new Error("tasks blew up");
      const done = line.replace(/\[ \]/, `[${cycleTo}]`) + (cycleTo === "x" ? ` \u2705 ${TODAY}` : "");
      if (/\u{1F501}/u.test(line)) return `${line.replace(/2026-08-12/, "2026-08-19")}\n${done}`;
      return done;
    }
  };
}

/* --------------------------- completing through Tasks --------------------------- */

test("completion goes through Tasks and records a done date", () => {
  const out = completedLines(fakeTasks(), "- [ ] Reply to Sam", "P.md");
  assert.deepStrictEqual(out, [`- [x] Reply to Sam \u2705 ${TODAY}`]);
});

test("a recurring task keeps its series going", () => {
  // Writing [x] directly is invisible to Tasks, so the next occurrence is never created.
  const out = completedLines(fakeTasks(), "- [ ] Water plants \u{1F501} every week \u{1F4C5} 2026-08-12", "P.md");
  assert.strictEqual(out.length, 2, "Tasks returns the completed task and the next occurrence");
  assert.ok(out.some((l) => l.startsWith("- [ ]") && l.includes("2026-08-19")), "the next one is open");
  assert.ok(out.some((l) => l.startsWith("- [x]")), "the current one is done");
});

test("without the Tasks API it still completes, by status", () => {
  assert.deepStrictEqual(completedLines(fakeTasks({ available: false }), "- [ ] a", "P.md"), ["- [x] a"]);
  assert.deepStrictEqual(completedLines(undefined, "- [ ] a", "P.md"), ["- [x] a"]);
});

test("a Tasks error falls back rather than losing the line", () => {
  // The adapter swallows the throw and reports unavailability.
  const tasks = { toggleTaskDone: () => null };
  assert.deepStrictEqual(completedLines(tasks, "- [ ] a", "P.md"), ["- [x] a"]);
});

test("a custom status cycle that stops short of done is not accepted as done", () => {
  // Todo -> In Progress is a valid toggle in Tasks, but it is not "Done".
  assert.deepStrictEqual(completedLines(fakeTasks({ cycleTo: "/" }), "- [ ] a", "P.md"), ["- [x] a"]);
});

test("completeSubtree works bottom-up so recurring expansions keep indices valid", async () => {
  const content = [
    "- [ ] project",
    "    - [ ] one-off",
    "    - [ ] weekly \u{1F501} every week \u{1F4C5} 2026-08-12",
    "    - [ ] another"
  ].join("\n");
  const vault = makeVault({ "P.md": content });
  await completeSubtree({ app: makeApp(vault), tasks: fakeTasks() }, new TFile("P.md"), 0, 3);
  const lines = vault.store.get("P.md").split("\n");
  assert.strictEqual(lines.length, 5, "one line gained, for the next occurrence");
  assert.strictEqual(lines.filter((l) => l.includes("- [x]")).length, 4, "every original task is done");
  assert.ok(lines.some((l) => l.includes("- [ ]") && l.includes("2026-08-19")), "the series continues");
});

test("completeSubtree leaves finished tasks and prose alone", async () => {
  const vault = makeVault({ "P.md": ["- [ ] a", "    - [-] cancelled", "    some notes"].join("\n") });
  await completeSubtree({ app: makeApp(vault), tasks: fakeTasks() }, new TFile("P.md"), 0, 2);
  const lines = vault.store.get("P.md").split("\n");
  assert.strictEqual(lines[1], "    - [-] cancelled", "a cancelled task is not resurrected as done");
  assert.strictEqual(lines[2], "    some notes");
});

test("Mark as completed and Organise's mark-complete both go through Tasks now", () => {
  assert.match(main, /else if \(action\.value === "complete"\) \{\s*\n[^\n]*\n\s*await completeSubtree\(ctx/);
  const organise = main.slice(main.indexOf("async function organiseProject"));
  assert.match(organise.slice(0, organise.indexOf("\n}")), /await settleEmptyProject\(ctx, item\.file/);
  const settle = main.slice(main.indexOf("async function settleEmptyProject"));
  assert.match(settle.slice(0, settle.indexOf("\n}")), /await completeSubtree\(ctx, file/);
});

/* ------------------------------------ queueing ------------------------------------ */

test("queueing records the task without touching the file", () => {
  const ctx = { quickBatch: [] };
  const item = { file: new TFile("P.md"), startLine: 3, raw: "- [ ] Reply to Sam" };
  assert.strictEqual(queueQuickAction(ctx, item), true);
  assert.deepStrictEqual(ctx.quickBatch, [{ file: item.file, line: 3, raw: "- [ ] Reply to Sam" }]);
});

test("without a batch to add to, the task is simply left as a next action", () => {
  assert.strictEqual(queueQuickAction({}, { file: new TFile("P.md"), startLine: 0, raw: "- [ ] a" }), false);
});

test("a queued task is found again after earlier lines move", () => {
  const lines = ["- [ ] new line", "- [ ] other", "- [ ] Reply to Sam"];
  assert.strictEqual(locateQueuedAction(lines, { line: 1, raw: "- [ ] Reply to Sam" }), 2);
});

test("a queued task that has gone or changed is not touched", () => {
  // Completing whatever now sits on its old line would be the worst possible failure.
  assert.strictEqual(locateQueuedAction(["- [ ] something else"], { line: 0, raw: "- [ ] Reply to Sam" }), -1);
  assert.strictEqual(locateQueuedAction(["- [ ] Reply to Sam, and also..."], { line: 0, raw: "- [ ] Reply to Sam" }), -1);
});

/* ------------------------- rollback keeps the batch honest ------------------------- */

/** Mirrors the loop's mark-and-truncate bookkeeping for the batch. */
function runLoop(script) {
  const batch = [];
  const markAt = [];
  let prevIndex = -1, step = 0;
  for (let i = 0; i < 3; i++) {
    markAt[i] = batch.length;
    const action = script[step++] || "done";
    if (action === "quick") { batch.push(`T${i}`); prevIndex = i; continue; }
    if (action === "quick-then-back") { batch.push(`T${i}`); batch.length = markAt[i]; i -= 1; continue; }
    if (action === "prev" && prevIndex >= 0) { batch.length = markAt[prevIndex]; const t = prevIndex; prevIndex = -1; i = t - 1; continue; }
    prevIndex = i;
  }
  return batch;
}

test("a task restarted after being queued is queued once, not twice", () => {
  assert.deepStrictEqual(runLoop(["quick-then-back", "quick", "done", "done"]), ["T0"]);
});

test("reverting to a task drops everything queued from it onward", () => {
  // T0 queued, T1 queued, then Revert from T2 back to T1: T1's entry must go, T0's stays.
  const batch = runLoop(["quick", "quick", "prev", "done", "done"]);
  assert.deepStrictEqual(batch, ["T0"], "T1 is redone without its old entry");
});

test("the loop truncates the batch on Restart, Revert and its fallback", () => {
  assert.match(main, /const batchMarkAt = \[\];/);
  assert.match(main, /batchMarkAt\[i\] = ctx\.quickBatch\.length;/);
  assert.strictEqual((main.match(/ctx\.quickBatch\.length = batchMarkAt\[i\];/g) || []).length, 2, "back and the guarded prev fallback");
  assert.match(main, /ctx\.quickBatch\.length = batchMarkAt\[target\];/);
});

test("a sub-item retried inside a walk drops what it had queued", () => {
  // Lives in attemptSubItem, shared by the project walk and the split walk, so both get it.
  const fn = main.slice(main.indexOf("async function attemptSubItem"));
  const body = fn.slice(0, fn.indexOf("\nasync function processProjectChildren"));
  assert.match(body, /const batchMark = Array\.isArray\(ctx\.quickBatch\) \? ctx\.quickBatch\.length : 0;/);
  assert.match(body, /if \(Array\.isArray\(ctx\.quickBatch\)\) ctx\.quickBatch\.length = batchMark;/);
});

test("both walks go through the one shared attempt", () => {
  assert.match(main, /const outcome = await attemptSubItem\(ctx, child, depth \+ 1\);/);
  assert.match(main, /await attemptSubItem\(ctx, piece, depth \+ 1\)/);
});

/* ---------------------------------- the batch run ---------------------------------- */

/** Drive the real runQuickBatch with a scripted pane. */
async function runBatch(files, batch, answers, tasks = fakeTasks()) {
  const src = main.slice(main.indexOf("  async runQuickBatch(ctx, batch) {"));
  const body = src.slice(0, src.indexOf("\n  }\n") + 4);
  const L = require("./helpers/load.js");
  const Klass = new Function("locateQueuedAction", "COMPLETED_STATUSES", "taskStatusOf", "computeSubtreeEnd",
    "completeSubtree", "confirmNextAction", "GUIDANCE", "ReviewControl",
    `return class { ${body} }`)(L.locateQueuedAction, L.COMPLETED_STATUSES, L.taskStatusOf, L.computeSubtreeEnd,
    L.completeSubtree, async () => {}, L.GUIDANCE, L.ReviewControl);
  const vault = makeVault(files);
  const app = makeApp(vault);
  const pane = new Klass();
  const shown = [];
  Object.assign(pane, {
    app, exiting: false, headerEl: { setText() {} },
    highlightInSource: async (it) => { shown.push(it.raw.trim()); },
    choice: async () => { const a = answers.shift(); if (a instanceof Error) throw a; return a; }
  });
  const done = await pane.runQuickBatch({ app, tasks }, batch);
  return { done, shown, vault, pane };
}
const entry = (raw, line = 0, file = "P.md") => ({ file: new TFile(file), line, raw });

test("Done completes the task; Took longer leaves it as a next action", async () => {
  const { done, vault } = await runBatch(
    { "P.md": "- [ ] a\n- [ ] b" },
    [entry("- [ ] a", 0), entry("- [ ] b", 1)],
    ["done", "keep"]
  );
  assert.strictEqual(done, 1);
  const lines = vault.store.get("P.md").split("\n");
  assert.match(lines[0], /^- \[x\] a/);
  assert.strictEqual(lines[1], "- [ ] b");
});

test("Skip moves on and leaves the task untouched", async () => {
  const { done, shown, vault } = await runBatch(
    { "P.md": "- [ ] a\n- [ ] b" },
    [entry("- [ ] a", 0), entry("- [ ] b", 1)],
    [new ReviewControl("skip"), "done"]
  );
  assert.deepStrictEqual(shown, ["- [ ] a", "- [ ] b"]);
  assert.strictEqual(done, 1);
  assert.strictEqual(vault.store.get("P.md").split("\n")[0], "- [ ] a");
});

test("Exit stops the batch and leaves the rest as next actions", async () => {
  const { done, shown, vault, pane } = await runBatch(
    { "P.md": "- [ ] a\n- [ ] b\n- [ ] c" },
    [entry("- [ ] a", 0), entry("- [ ] b", 1), entry("- [ ] c", 2)],
    ["done", new ReviewControl("exit")]
  );
  assert.strictEqual(done, 1);
  assert.deepStrictEqual(shown, ["- [ ] a", "- [ ] b"], "c is never offered");
  assert.strictEqual(pane.exiting, true);
  assert.deepStrictEqual(vault.store.get("P.md").split("\n").slice(1), ["- [ ] b", "- [ ] c"]);
});

test("Restart and Revert mean nothing in the batch and act as Skip", async () => {
  const { shown } = await runBatch(
    { "P.md": "- [ ] a\n- [ ] b" },
    [entry("- [ ] a", 0), entry("- [ ] b", 1)],
    [new ReviewControl("back"), new ReviewControl("prev")]
  );
  assert.deepStrictEqual(shown, ["- [ ] a", "- [ ] b"]);
});

test("a queued task completed some other way is not offered again", async () => {
  const { shown } = await runBatch({ "P.md": "- [x] a" }, [entry("- [ ] a", 0)], []);
  assert.deepStrictEqual(shown, []);
});

test("a queued task in a deleted note is skipped, not fatal", async () => {
  const { shown, done } = await runBatch({}, [entry("- [ ] a", 0, "Gone.md")], []);
  assert.deepStrictEqual(shown, []);
  assert.strictEqual(done, 0);
});

test("the batch runs only for Process, and never after Exit", () => {
  assert.match(main, /if \(mode === "process" && !this\.exiting && ctx\.quickBatch\.length\)/);
});

/* ------------------------------------- wording ------------------------------------- */

test("the option is offered on the first question, after Yes and No", () => {
  // On the first question — a route through "Yes" and then a second question went unused.
  // After Yes and No, which keep the same two places on every item.
  assert.match(main, /const actionableOptions = \[\{ label: "Yes", value: true \}, \{ label: "No", value: false \}\];[\s\S]{0,500}value: "twomin" \}\);/);
  assert.ok(!/No \\u2014 and it takes under two minutes/.test(main), "no longer on the second question");
});

test("no tip still tells you to do it immediately", () => {
  // That was right before the batch existed, and would now contradict it.
  for (const [k, t] of Object.entries(GUIDANCE)) {
    assert.ok(!/do it now instead/i.test(t), `${k} still says to do it immediately`);
  }
  assert.match(GUIDANCE.actionable, /batch at the end/);
});

test("the batch carries the five-minute tripwire", () => {
  assert.match(GUIDANCE.quickBatch, /five minutes/);
});

/* ------------------------------- end to end, real code ------------------------------- */

test("choosing two minutes in the real Process flow queues it and leaves the file alone", async () => {
  const { runProcess } = require("./helpers/load.js").plugin.__testables;
  const L = require("./helpers/load.js");
  const vault = makeVault({ "Inbox.md": "- [ ] Reply to Sam" });
  const answers = ["twomin"];
  const ctx = {
    app: makeApp(vault),
    settings: Object.assign({}, L.DEFAULT_SETTINGS),
    tasks: { canEditViaApi: () => true },
    quickBatch: [],
    prompter: {
      choice: async () => answers.shift(),
      info: () => {}
    }
  };
  const item = { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: "- [ ] Reply to Sam", isProject: false };
  await runProcess(ctx, item);
  assert.strictEqual(ctx.quickBatch.length, 1);
  assert.strictEqual(ctx.quickBatch[0].raw, "- [ ] Reply to Sam");
  assert.strictEqual(vault.store.get("Inbox.md"), "- [ ] Reply to Sam", "nothing written until the batch");
  assert.strictEqual(answers.length, 0, "no further questions — no edit, no project prompts");
});


/* ------------------------- on the first question ------------------------- */

const { runProcess } = require("./helpers/load.js").plugin.__testables;

function firstQuestion(item, extra = {}) {
  const { DEFAULT_SETTINGS: D } = require("./helpers/load.js");
  const vault = makeVault({ "P.md": item.raw });
  let options = null;
  const ctx = Object.assign({
    app: makeApp(vault), settings: Object.assign({}, D), tasks: { canEditViaApi: () => true },
    mode: "process", quickBatch: [],
    prompter: {
      choice: async (q, opts) => { q = String(q).replace(/\*\*/g, ""); if (!options) options = opts.map((o) => o.value); throw new ReviewControl("skip"); },
      info: () => {}
    }
  }, extra);
  return { ctx, options: () => options };
}

test("the first question offers it after Yes and No", async () => {
  const item = { file: new TFile("P.md"), startLine: 0, endLine: 0, raw: "- [ ] Reply to Sam", isProject: false };
  const q = firstQuestion(item);
  await runProcess(q.ctx, item).catch(() => {});
  assert.deepStrictEqual(q.options(), [true, false, "twomin", "delegate", "split"]);
});

test("it isn't offered for a project, in Organise, or with no batch", async () => {
  const task = () => ({ file: new TFile("P.md"), startLine: 0, endLine: 0, raw: "- [ ] Reply to Sam", isProject: false });
  const project = { file: new TFile("P.md"), startLine: 0, endLine: 0, raw: "- [ ] Trip #project", isProject: true };
  for (const [label, item, extra] of [["project", project, {}], ["organise", task(), { mode: "organise" }], ["no batch", task(), { quickBatch: undefined }]]) {
    const q = firstQuestion(item, extra);
    await runProcess(q.ctx, item).catch(() => {});
    assert.ok(!q.options().includes("twomin"), label);
  }
});

test("a project's next action can be batched from the first question", async () => {
  const { DEFAULT_SETTINGS: D } = require("./helpers/load.js");
  const vault = makeVault({ "P.md": "- [ ] Trip #project\n    - [ ] Text Sam the dates" });
  const ctx = { app: makeApp(vault), settings: Object.assign({}, D), tasks: { canEditViaApi: () => true },
    mode: "process", quickBatch: [], prompter: { choice: async () => "twomin", info: () => {} } };
  await runProcess(ctx, { file: new TFile("P.md"), startLine: 1, endLine: 1, raw: "    - [ ] Text Sam the dates", isProject: false }, 1);
  assert.deepStrictEqual(ctx.quickBatch.map((e) => e.raw), ["    - [ ] Text Sam the dates"]);
});
