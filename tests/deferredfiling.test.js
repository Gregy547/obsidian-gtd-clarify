/**
 * Deferred tasks getting organised.
 *
 * Two fixes, tested separately because either alone leaves a hole. Organise must see
 * deferred tasks, or anything deferred during Process is never organised and comes back on
 * its date to wherever it was captured. And deferring can file the task at once — which
 * only works if the start date travels WITH it, and the date lands on the right task.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { DefaultFilingStrategy, ActiveFileTopLevelTaskSource, TasksQueryTaskSource, GUIDANCE,
  DEFAULT_SETTINGS, lineStartDate } = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const FUTURE = "2099-01-01";

/* ------------------------- Organise sees deferred tasks ------------------------- */

/** The real chooseSource, lifted out of the pane with its collaborators supplied. */
function chooseSourceFor(mode, { canQuery = false, setting, pick = "__file__" } = {}) {
  const src = main.slice(main.indexOf("  async chooseSource(file, projectTag, mode) {"));
  const body = src.slice(0, src.indexOf("\n  }\n") + 4);
  const Klass = new Function("ActiveFileTopLevelTaskSource", "TasksQueryTaskSource", "GUIDANCE",
    `return class { ${body} }`)(ActiveFileTopLevelTaskSource, TasksQueryTaskSource, GUIDANCE);
  const pane = new Klass();
  pane.app = {};
  pane.plugin = {
    settings: Object.assign({}, DEFAULT_SETTINGS, setting === undefined ? {} : { hideTickledTasks: setting }),
    tasksApi: { canQuery: () => canQuery }
  };
  // First the source question, then — on the query path — which saved query.
  const answers = [pick, "saved:0"];
  pane.choice = async () => answers.shift();
  pane.text = async () => "not done";
  return pane.chooseSource({ basename: "Inbox" }, "project", mode);
}

test("Organise does not hide deferred tasks", async () => {
  // The reported bug: deferred in Process, so never organised.
  assert.strictEqual((await chooseSourceFor("organise")).hideTickled, false);
});

test("Process still hides deferred tasks", async () => {
  assert.strictEqual((await chooseSourceFor("process")).hideTickled, true);
});

test("the setting still turns hiding off in Process", async () => {
  assert.strictEqual((await chooseSourceFor("process", { setting: false })).hideTickled, false);
});

test("the rule holds on every path to a source", async () => {
  // Older Tasks without query support, the current-note choice, and a query.
  for (const opts of [{ canQuery: false }, { canQuery: true, pick: "__file__" }, { canQuery: true, pick: "__query__" }]) {
    assert.strictEqual((await chooseSourceFor("organise", opts)).hideTickled, false, JSON.stringify(opts));
    assert.strictEqual((await chooseSourceFor("process", opts)).hideTickled, true, JSON.stringify(opts));
  }
});

test("a deferred task is actually collected for Organise", async () => {
  const lines = ["- [ ] now", `- [ ] later \u{1F6EB} ${FUTURE}`];
  const vault = makeVault({ "Inbox.md": lines.join("\n") });
  const app = makeApp(vault, {
    getFileCache: () => ({ listItems: lines.map((_, i) => ({ task: " ", parent: -1, position: { start: { line: i } } })) })
  });
  const source = await chooseSourceFor("organise");
  const real = new ActiveFileTopLevelTaskSource(app, vault.getAbstractFileByPath("Inbox.md"), "project", source.hideTickled);
  assert.strictEqual((await real.collect()).length, 2, "the deferred task is there to organise");
});

/* ------------------------------ fileTask can stay put ------------------------------ */

function filingCtx(files, answers, extra = {}) {
  const vault = makeVault(files);
  const asked = [];
  return {
    vault, asked,
    ctx: Object.assign({
      app: makeApp(vault),
      settings: Object.assign({}, DEFAULT_SETTINGS, { curatedMoveTargets: ["Projects/Berlin.md"] }),
      prompter: {
        choice: async (q, opts) => { q = String(q).replace(/\*\*/g, ""); asked.push({ q, opts: opts.map((o) => o.value) }); return answers.shift(); },
        info: () => {}
      }
    }, extra)
  };
}

test("with allowStay, staying put is the first answer and moves nothing", async () => {
  const h = filingCtx({ "Inbox.md": "- [ ] a" }, ["__stay__"]);
  const out = await new DefaultFilingStrategy().fileTask(h.ctx,
    { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: "- [ ] a" }, { allowStay: true });
  assert.strictEqual(out, "stayed");
  assert.strictEqual(h.asked[0].opts[0], "__stay__");
  assert.strictEqual(h.vault.store.get("Inbox.md"), "- [ ] a");
});

test("Organise's filing has no stay option — filing is the point of that step", async () => {
  const h = filingCtx({ "Inbox.md": "- [ ] a", "Projects/Berlin.md": "" }, ["Projects/Berlin.md"]);
  await new DefaultFilingStrategy().fileTask(h.ctx, { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: "- [ ] a" });
  assert.ok(!h.asked[0].opts.includes("__stay__"));
  assert.strictEqual(h.asked[0].q, "Move to\u2026", "and keeps its own question");
});

test("fileTask reports what happened", async () => {
  const moved = filingCtx({ "Inbox.md": "- [ ] a", "Projects/Berlin.md": "" }, ["Projects/Berlin.md"]);
  assert.strictEqual(await new DefaultFilingStrategy().fileTask(moved.ctx,
    { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: "- [ ] a" }), "moved");
  // A dismissed picker asks again; only an answer that leads nowhere reports "cancelled".
  const back = filingCtx({ "Inbox.md": "- [ ] a", "Projects/Berlin.md": "" }, ["__search__", "Projects/Berlin.md"]);
  back.ctx.prompter.suggestFile = async () => null;
  assert.strictEqual(await new DefaultFilingStrategy().fileTask(back.ctx,
    { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: "- [ ] a" }), "moved");
  assert.strictEqual(back.asked.length, 2);
});

/* ------------------------- deferring and filing, end to end ------------------------- */

function deferRun(answers, files = { "Inbox.md": "- [ ] Renew passport\n- [ ] Call Sam", "Projects/Travel.md": "" }) {
  const vault = makeVault(files);
  const asked = [];
  const queue = [...answers];
  const ctx = {
    app: makeApp(vault),
    settings: Object.assign({}, DEFAULT_SETTINGS, { curatedMoveTargets: ["Projects/Travel.md"] }),
    tasks: { canEditViaApi: () => true, editTaskLine: async (l) => l },
    mode: "process",
    quickBatch: [],
    filing: new DefaultFilingStrategy(),
    prompter: {
      choice: async (q, opts) => { q = String(q).replace(/\*\*/g, ""); asked.push({ q, opts: (opts || []).map((o) => o.value) }); return queue.shift(); },
      text: async () => queue.shift(),
      info: () => {}
    }
  };
  const item = { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: "- [ ] Renew passport", isProject: false };
  return { vault, asked, ctx, item, run: () => runProcess(ctx, item) };
}
const NEXT_WEEK = () => L.shiftDate(L.todayString(), 7);

test("a deferred task can be filed at once, and its start date travels with it", async () => {
  const h = deferRun([false, "tickle", NEXT_WEEK(), "Projects/Travel.md"]);
  await h.run();
  const travel = h.vault.store.get("Projects/Travel.md");
  assert.match(travel, /Renew passport/, "it moved");
  assert.strictEqual(lineStartDate(travel.trim().split("\n")[0]), NEXT_WEEK(), "with its date");
  assert.ok(!/Renew passport/.test(h.vault.store.get("Inbox.md")), "and left the inbox");
});

test("deferring dates the right task even when it moves", async () => {
  // Moving before dating would leave the old line holding the NEXT task — and date that.
  const h = deferRun([false, "tickle", NEXT_WEEK(), "Projects/Travel.md"]);
  await h.run();
  assert.strictEqual(h.vault.store.get("Inbox.md").trim(), "- [ ] Call Sam", "Call Sam must not be deferred");
});

test("leaving it in place keeps the date where it is", async () => {
  const h = deferRun([false, "tickle", NEXT_WEEK(), "__stay__"]);
  await h.run();
  const inbox = h.vault.store.get("Inbox.md").split("\n");
  assert.strictEqual(lineStartDate(inbox[0]), NEXT_WEEK());
  assert.strictEqual(inbox[1], "- [ ] Call Sam");
  assert.strictEqual(h.vault.store.get("Projects/Travel.md"), "");
});

test("the filing question names the date and offers staying first", async () => {
  const h = deferRun([false, "tickle", NEXT_WEEK(), "__stay__"]);
  await h.run();
  const q = h.asked.find((x) => x.q.startsWith("Deferred until"));
  assert.ok(q, "asked where it should wait");
  assert.ok(q.q.includes(NEXT_WEEK()));
  assert.strictEqual(q.opts[0], "__stay__");
});

test("a dismissed picker goes back to where it should wait", async () => {
  const h = deferRun([false, "tickle", NEXT_WEEK(), "__search__", "__stay__"]);
  h.ctx.prompter.suggestFile = async () => null;
  await h.run();
  assert.strictEqual(h.asked.filter((x) => x.q.startsWith("Deferred until")).length, 2, "asked again");
  assert.strictEqual(lineStartDate(h.vault.store.get("Inbox.md").split("\n")[0]), NEXT_WEEK());
});

test("a deferred project moves whole, every next action dated", async () => {
  const h = deferRun([false, "tickle", NEXT_WEEK(), "Projects/Travel.md"], {
    "Inbox.md": "- [ ] Berlin trip #project\n    - [ ] Text Sam\n    - [ ] Book hotel\n- [ ] Call Sam",
    "Projects/Travel.md": ""
  });
  h.item.endLine = 2;
  h.item.raw = "- [ ] Berlin trip #project";
  await h.run();
  const moved = h.vault.store.get("Projects/Travel.md").trim().split("\n");
  assert.strictEqual(moved.length, 3);
  for (const line of moved) assert.strictEqual(lineStartDate(line), NEXT_WEEK(), line);
  assert.strictEqual(h.vault.store.get("Inbox.md").trim(), "- [ ] Call Sam");
});

/* ------------------------------------- wording ------------------------------------- */

test("the setting says deferral hides work from Process, not from Organise", () => {
  assert.match(main, /out of Process until that date\. Organise still includes them/);
});

test("the deferred-home tip explains why filing now matters", () => {
  assert.match(GUIDANCE.deferredHome, /comes back to the right list/);
  assert.match(GUIDANCE.deferredHome, /Organise still includes deferred tasks/);
});
