/**
 * Answers in the order they are chosen, and wording clarified only where you'll meet it again.
 *
 * Positions matter as much as the order: the same answer in the same place on every item is
 * what lets a hand learn where to go, so the tests pin whole option lists, not just the top.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { runProcess, settleNotActionable, ReviewControl, DefaultFilingStrategy, DEFAULT_SETTINGS, MAX_SUBTASK_RETRIES } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");
const { plain } = require("./helpers/plain.js");

function setup(content, answers, settings = {}, extra = {}) {
  const vault = makeVault({ "P.md": content, "Someday/Someday.md": "", "Areas/Home.md": "" });
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [];
  let edits = 0;
  const answer = (raw, opts) => {
    const q = plain(raw);
    asked.push({ q, opts: (opts || []).map((o) => o.value) });
    const key = Object.keys(queues).find((k) => q.includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    const a = queues[key].shift();
    if (a instanceof Error) throw a;
    return a;
  };
  const ctx = Object.assign({
    app: makeApp(vault), mode: "process", quickBatch: [], sourceKind: "file",
    settings: Object.assign({}, DEFAULT_SETTINGS, settings),
    tasks: {
      canEditViaApi: () => true,
      editTaskLine: async (l) => { edits++; const next = extra.edit ? extra.edit.shift() : l; return next; },
      prioritySignifier: () => ""
    },
    prompter: {
      choice: async (q, o) => answer(q, o), optionalChoice: async (q, o) => answer(q, o),
      confirm: async (q) => answer(q, []), text: async (q) => answer(q, []), info: () => {},
      highlightInSource: async () => {}, focusSubtask: () => {}, showGuidance: () => {},
      suggestFile: async () => (extra.files ? extra.files.shift() : null)
    }
  }, extra.ctx || {});
  ctx.filing = new DefaultFilingStrategy();
  const lines = content.split("\n");
  const item = { file: new TFile("P.md"), startLine: 0, endLine: L.computeSubtreeEnd(lines, 0), raw: lines[0], isProject: L.lineHasTag(lines[0], "project") };
  return { vault, ctx, item, asked, edits: () => edits, read: (p = "P.md") => vault.store.get(p) };
}
const SETTLE = "What should happen to it?";

/* ------------------------------ Actionable this week? ------------------------------ */

test("Yes and No come first, in the same places on every item", async () => {
  const h = setup("- [ ] Call Sam", { "Actionable this week?": [new ReviewControl("skip")] });
  await runProcess(h.ctx, h.item).catch(() => {});
  assert.deepStrictEqual(h.asked[0].opts, [true, false, "twomin", "delegate", "split"]);
  const p = setup("- [ ] Trip #project", { "Actionable this week?": [new ReviewControl("skip")] });
  await runProcess(p.ctx, p.item).catch(() => {});
  assert.deepStrictEqual(p.asked[0].opts, [true, false], "a project has only those two, in the same places");
});

/* ---------------------------- not actionable: what next ---------------------------- */

test("not actionable: trash, incubate, done, defer, reference, move, then delete", async () => {
  const h = setup("- [ ] Old idea", { [SETTLE]: ["cancel"] });
  await settleNotActionable(h.ctx, h.item);
  assert.deepStrictEqual(h.asked[0].opts, ["cancel", "someday", "complete", "tickle", "reference", "move", "delete"]);
});

test("with cancelling switched off, delete takes its place at the top", async () => {
  const h = setup("- [ ] Old idea", { [SETTLE]: ["delete"] }, { enableCancelOption: false });
  await settleNotActionable(h.ctx, h.item);
  assert.deepStrictEqual(h.asked[0].opts, ["delete", "someday", "complete", "tickle", "reference", "move"]);
  assert.strictEqual(h.read(), "");
});

test("endings that are switched off aren't offered", async () => {
  const h = setup("- [ ] Old idea", { [SETTLE]: ["someday"] },
    { enableCancelOption: false, enableDeleteOption: false, enableCompleteOption: false });
  await settleNotActionable(h.ctx, h.item);
  assert.deepStrictEqual(h.asked[0].opts, ["someday", "tickle", "reference", "move"]);
});

test("cancelling, completing or deleting asks for no rewording", async () => {
  for (const [ending, status] of [["cancel", "-"], ["complete", "x"], ["delete", null]]) {
    const h = setup("- [ ] Old idea\n- [ ] other", { [SETTLE]: [ending] });
    await settleNotActionable(h.ctx, h.item);
    assert.strictEqual(h.edits(), 0, `${ending}: no Tasks dialogue on the way out`);
    assert.strictEqual(h.item.disposed, true);
    if (status) assert.strictEqual(L.taskStatusOf(h.read().split("\n")[0]), status);
    else assert.strictEqual(h.read(), "- [ ] other");
  }
});

test("through the whole of Process, No then Cancel opens no dialogue", async () => {
  const h = setup("- [ ] Old idea", { "Actionable this week?": [false], [SETTLE]: ["cancel"] });
  await runProcess(h.ctx, h.item);
  assert.strictEqual(h.edits(), 0);
  assert.strictEqual(L.taskStatusOf(h.read()), "-");
});

test("what you'll meet again is clarified first, then filed with its new wording", async () => {
  const h = setup("- [ ] passport", { [SETTLE]: ["someday"] }, {}, { edit: ["- [ ] Renew passport before May"] });
  await settleNotActionable(h.ctx, h.item);
  assert.strictEqual(h.edits(), 1);
  assert.strictEqual(h.read("Someday/Someday.md").trim(), "- [ ] Renew passport before May");
});

test("cancelling the rewording goes back to the question, and asks again only if needed", async () => {
  // Cancelled once: back to the question. Then Move, whose picker is dismissed: back again,
  // without reopening the editor for wording already clarified.
  const h = setup("- [ ] passport", { [SETTLE]: ["someday", "move", "move"] }, {},
    { edit: ["", "- [ ] Renew passport before May"], files: [null, { path: "Areas/Home.md" }] });
  await settleNotActionable(h.ctx, h.item);
  assert.strictEqual(h.asked.filter((a) => a.q === SETTLE).length, 3);
  assert.strictEqual(h.edits(), 2, "once cancelled, once done — not a third time");
  assert.strictEqual(h.read("Areas/Home.md").trim(), "- [ ] Renew passport before May");
});

test("a deferral is clarified, then dated", async () => {
  const h = setup("- [ ] passport", {
    [SETTLE]: ["tickle"], "When should this come back?": ["2026-11-03"], "Where should it wait?": ["__stay__"]
  }, {}, { edit: ["- [ ] Renew passport before May"] });
  await settleNotActionable(h.ctx, h.item);
  assert.match(h.read(), /^- \[ \] Renew passport before May .*2026-11-03/u);
  const order = h.asked.map((a) => a.q);
  assert.ok(order.indexOf("When should this come back?") > 0);
});

test("asked again and again with nothing settled, the task starts again", async () => {
  const h = setup("- [ ] passport", { [SETTLE]: Array(MAX_SUBTASK_RETRIES + 2).fill("someday") }, {},
    { edit: Array(MAX_SUBTASK_RETRIES + 2).fill("") });
  await assert.rejects(() => settleNotActionable(h.ctx, h.item), (e) => e instanceof ReviewControl && e.kind === "retry");
});

/* ----------------------------------- Move to… ----------------------------------- */

test("Move to: your own destinations, then search, new note, heading, template", async () => {
  const h = setup("- [ ] Call Sam\n## Calls", { "Move to": [new ReviewControl("skip")] },
    { curatedMoveTargets: ["Lists/Calls.md"] }, { ctx: { mode: "organise" } });
  await h.ctx.filing.fileTask(h.ctx, h.item).catch(() => {});
  assert.deepStrictEqual(h.asked[0].opts, ["Lists/Calls.md", "__search__", "__new__", "__heading__", "__template__"]);
});

/* ----------------------------- Is this a clear next action? ----------------------------- */

test("Rewrite comes first whether or not the wording looks vague", async () => {
  for (const line of ["- [ ] Call Sam re: dates", "- [ ] Sort out trip"]) {
    const h = setup(line, { "Is this a clear next action?": ["keep"] });
    await L.clarifyFiledAction(h.ctx, h.item.file, 0);
    assert.deepStrictEqual(h.asked[0].opts, ["rewrite", "keep", "batch"], line);
  }
});
