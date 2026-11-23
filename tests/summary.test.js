/**
 * A summary at the end of each review: what became of the tasks.
 *
 * Counted from what was decided for each task the review worked through — a split capture
 * as each of its pieces — so it says what you did, not how many screens you saw. Anything
 * undone with Back or Previous is not counted.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { sessionSummary, outcomesOf, DEFAULT_SETTINGS, ReviewControl, settleNotActionable, DefaultFilingStrategy } = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

test("counted in the order the answers are offered, in words", () => {
  assert.deepStrictEqual(
    sessionSummary(["someday", "next", "cancel", "next", "waiting", "project", "skipped"], 2),
    ["2 next actions", "1 project", "1 waiting on someone else", "1 to Someday", "1 cancelled", "1 skipped", "2 done in the two-minute batch"]
  );
  assert.deepStrictEqual(sessionSummary(["step", "step", "moved"]), ["2 steps filed in projects", "1 moved to another note"]);
  assert.deepStrictEqual(sessionSummary([]), [], "nothing to say, nothing said");
});

test("a task saved for the batch is counted by the batch, not twice", () => {
  assert.deepStrictEqual(sessionSummary(["twomin", "twomin", "next"], 1), ["1 next action", "1 done in the two-minute batch"]);
});

test("a split capture counts as its pieces", () => {
  const item = { outcome: "split", splitPieces: [{ outcome: "next" }, { outcome: "someday" }, { outcome: "next" }] };
  assert.deepStrictEqual(outcomesOf(item, "process"), ["next", "someday", "next"]);
});

test("in Organise, a task is organised — unless re-processing took it out", () => {
  assert.deepStrictEqual(outcomesOf({}, "organise"), ["organised"]);
  assert.deepStrictEqual(outcomesOf({ outcome: "next" }, "organise"), ["organised"]);
  assert.deepStrictEqual(outcomesOf({ outcome: "someday" }, "organise"), ["someday"]);
  assert.deepStrictEqual(outcomesOf({ outcome: "complete" }, "organise"), ["complete"]);
});

/* ------------------------- recorded where it is decided ------------------------- */

function setup(content, answers, extra = {}) {
  const vault = makeVault({ "P.md": content, "Someday/Someday.md": "" });
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const answer = (raw) => {
    const q = String(raw).replace(/\*\*/g, "");
    const key = Object.keys(queues).find((k) => q.includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    return queues[key].shift();
  };
  const ctx = {
    app: makeApp(vault), mode: "process", quickBatch: [], sourceKind: "file",
    settings: Object.assign({}, DEFAULT_SETTINGS, { clarifyNextAction: false, nudgeVagueActions: false }, extra),
    tasks: { canEditViaApi: () => true, editTaskLine: async (l) => l, createNewTaskLine: async () => "- [ ] Email Sam", newDependencyId: () => "a1",
      idSignifier: (id) => `🆔 ${id}`, blockedBySignifier: (id) => `⛔ ${id}`, toggleTaskDone: () => null },
    prompter: {
      choice: async (q) => answer(q), optionalChoice: async (q) => answer(q), confirm: async (q) => answer(q),
      text: async (q) => answer(q), info: () => {}, showGuidance: () => {}, highlightInSource: async () => {}, focusSubtask: () => {}
    }
  };
  ctx.filing = new DefaultFilingStrategy();
  return { ctx, item: { file: new TFile("P.md"), startLine: 0, endLine: 0, raw: content.split("\n")[0], isProject: /#project/.test(content.split("\n")[0]) } };
}

for (const [label, answers, expected] of [
  ["a single next action", { "Actionable this week?": [true], "more than one step": ["no"] }, "next"],
  ["a new project", { "Actionable this week?": [true], "more than one step": ["yes"], "Next action saved.": ["done"], "Must this wait": [false] }, "project"],
  ["the two-minute batch", { "Actionable this week?": ["twomin"] }, "twomin"],
  ["someone else's", { "Actionable this week?": ["delegate"], "chase": ["__none__"] }, "waiting"],
  ["Someday", { "Actionable this week?": [false], "What should happen": ["someday"] }, "someday"],
  ["cancelled", { "Actionable this week?": [false], "What should happen": ["cancel"] }, "cancel"],
  ["deferred", { "Actionable this week?": [false], "What should happen": ["tickle"], "come back": ["2099-01-01"], "Where": ["__stay__"] }, "deferred"]
]) {
  test(`recorded: ${label}`, async () => {
    const h = setup("- [ ] Boiler", answers);
    await runProcess(h.ctx, h.item).catch((e) => { if (!(e instanceof ReviewControl)) throw e; });
    assert.strictEqual(h.item.outcome, expected);
  });
}

/* --------------------------------- in the loop --------------------------------- */

function review(process, mode = "process") {
  const at = main.indexOf("  async start(mode, file");
  const body = main.slice(at, main.indexOf("\n  }\n", at) + 4);
  const deps = Object.assign({}, L, { runProcess: process, runOrganise: process, obsidian: L.obsidian });
  const names = Object.keys(deps).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  const Klass = new Function(...names, `return class { ${body} }`)(...names.map((k) => deps[k]));
  const vault = makeVault({ "Inbox.md": "- [ ] Call Sam\n- [ ] Reply to Priya\n- [ ] Plan the party" });
  const pane = new Klass();
  const done = [];
  pane.app = makeApp(vault);
  pane.plugin = { settings: Object.assign({}, DEFAULT_SETTINGS), tasksApi: { isAvailable: () => true } };
  pane.headerEl = { setText() {} };
  pane.bodyEl = { empty() {}, createEl() { return {}; } };
  pane.chooseSource = async () => ({
    collect: async () => vault.store.get("Inbox.md").split("\n").map((raw, i) => ({ file: new TFile("Inbox.md"), startLine: i, endLine: i, raw, isProject: false }))
  });
  pane.renderProgress = () => {};
  pane.highlightInSource = async () => {};
  pane.renderDone = (message, summary) => done.push({ message, summary });
  pane.runQuickBatch = async () => 0;
  return { done, run: () => pane.start(mode, new TFile("Inbox.md")) };
}

test("what was undone with Back or Previous is not counted", async () => {
  let n = 0;
  const r = review(async (ctx, item) => {
    n++;
    if (n === 1) { item.outcome = "someday"; return; }           // Call: Someday…
    if (n === 2) throw new ReviewControl("prev");                 // Reply: back to Call
    if (n === 3) { item.outcome = "next"; return; }               // Call again: a next action
    if (n === 4) { item.outcome = "cancel"; throw new ReviewControl("back"); } // Reply: cancelled, then Back
    item.outcome = item.raw.includes("Reply") ? "waiting" : "next";
  });
  await r.run();
  assert.deepStrictEqual(r.done[0].summary, ["2 next actions", "1 waiting on someone else"]);
  assert.strictEqual(r.done[0].message, "All tasks reviewed.");
});

test("a skipped task is counted as skipped; after Exit, what was done so far", async () => {
  let n = 0;
  const r = review(async (ctx, item) => {
    n++;
    if (n === 1) throw new ReviewControl("skip");
    if (n === 2) { item.outcome = "next"; return; }
    throw new ReviewControl("exit");
  });
  await r.run();
  assert.deepStrictEqual(r.done[0].summary, ["1 next action", "1 skipped"]);
  assert.match(r.done[0].message, /^Exited/);
});

test("Organise counts what it organised", async () => {
  const r = review(async () => {}, "organise");
  await r.run();
  assert.deepStrictEqual(r.done[0].summary, ["3 organised"]);
});
