/**
 * "Yes — someone else does it…": a task you hand on becomes a waiting-for.
 *
 * Process had no answer for this, so delegated work was either written up as your own next
 * action or filed out of sight. Now the task is reworded as what you are waiting for,
 * tagged, and given a date to chase it — its start date, as Not yet uses, so it stays out of
 * Process until then. Organise files a waiting-for without asking for labels: context,
 * energy and time are about doing a task, and this one is someone else's to do.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { DefaultFilingStrategy, runOrganise, DEFAULT_SETTINGS, ReviewControl, shiftDate, todayString } = L;
const { runProcess, processProjectChildren } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const START = "\u{1F6EB}";
const plain = (q) => String(q).replace(/\*\*/g, "");
const NEXT_WEEK = shiftDate(todayString(), 7);

function setup(content, answers, { edits = [], settings = {}, quickBatch = [] } = {}) {
  const vault = makeVault({ "P.md": content, "Lists/Waiting.md": "" });
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [], infos = [], guides = [];
  const answer = (raw, opts) => {
    const q = plain(raw);
    asked.push({ q, opts: (opts || []).map((o) => o.value), labels: (opts || []).map((o) => plain(o.label)) });
    const key = Object.keys(queues).find((k) => q.includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    return queues[key].shift();
  };
  const e = [...edits];
  const ctx = {
    app: makeApp(vault), mode: "process", quickBatch, sourceKind: "file",
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      dimensions: [DEFAULT_SETTINGS.dimensions[0]], enablePriorityStep: false, enableCustomTagStep: false,
      curatedMoveTargets: ["Lists/Waiting.md"]
    }, settings),
    tasks: {
      canEditViaApi: () => true,
      editTaskLine: async (l) => (e.length ? e.shift()(l) : l),
      createNewTaskLine: async () => ""
    },
    prompter: {
      choice: async (q, o) => answer(q, o), optionalChoice: async (q, o) => answer(q, o),
      confirm: async (q) => answer(q, []), text: async (q) => answer(q, []),
      info: (m) => infos.push(m), showGuidance: (q, g) => guides.push({ q: plain(q), g }),
      highlightInSource: async () => {}, focusSubtask: () => {}, suggestFile: async () => null
    }
  };
  ctx.filing = new DefaultFilingStrategy();
  return { vault, ctx, asked, infos, guides, read: () => vault.store.get("P.md").split("\n") };
}
const item = (raw, extra = {}) => ({ file: new TFile("P.md"), startLine: 0, endLine: 0, raw, isProject: false, ...extra });
const rename = (text) => (line) => line.replace(/\] .*$/, `] ${text}`);

test("offered beside the other Yes answers, before splitting", async () => {
  const h = setup("- [ ] Boiler quote", { "Actionable this week?": [false], "What should happen": ["someday"] });
  await runProcess(h.ctx, item("- [ ] Boiler quote"), 0).catch(() => {});
  assert.deepStrictEqual(h.asked[0].opts, [true, false, "twomin", "delegate", "split"]);
  assert.strictEqual(h.asked[0].labels[3], "Yes — someone else does it…");
});

test("offered for a project's next action, but not for a project", async () => {
  const h = setup("- [ ] Boiler fixed #project", { "Actionable this week?": [false], "What should happen": ["someday"] });
  await runProcess(h.ctx, item("- [ ] Boiler fixed #project", { isProject: true }), 0).catch(() => {});
  assert.ok(!h.asked[0].opts.includes("delegate"), "the project as a whole");
  const h2 = setup("- [ ] Boiler fixed #project\n    - [ ] Get a quote", { "Actionable this week?": [false], "What should happen": ["someday"] });
  await runProcess(h2.ctx, item("    - [ ] Get a quote", { startLine: 1, endLine: 1 }), 1).catch(() => {});
  assert.ok(h2.asked[0].opts.includes("delegate"), "one of its next actions");
});

test("reworded, tagged and dated to chase: a waiting-for", async () => {
  const h = setup("- [ ] Boiler quote", {
    "Actionable this week?": ["delegate"], "When should you chase it?": [NEXT_WEEK]
  }, { edits: [rename("Sam: quote for the boiler")] });
  const it = item("- [ ] Boiler quote");
  await runProcess(h.ctx, it, 0);
  assert.deepStrictEqual(h.read(), [`- [ ] Sam: quote for the boiler #waitingfor ${START} ${NEXT_WEEK}`]);
  assert.strictEqual(it.delegated, true);
  assert.ok(h.guides.some((g) => g.q === "Who is it waiting on?" && g.g.includes("#waitingfor")), "the dialogue says what's being asked");
  assert.ok(h.infos.some((m) => m.includes(NEXT_WEEK)));
});

test("no chase date leaves the date off", async () => {
  const h = setup("- [ ] Boiler quote", {
    "Actionable this week?": ["delegate"], "When should you chase it?": ["__none__"]
  }, { edits: [rename("Sam: boiler quote")] });
  await runProcess(h.ctx, item("- [ ] Boiler quote"), 0);
  assert.deepStrictEqual(h.read(), ["- [ ] Sam: boiler quote #waitingfor"]);
});

test("the tag is the one in settings, and is never written twice", async () => {
  const h = setup("- [ ] Boiler quote", {
    "Actionable this week?": ["delegate"], "When should you chase it?": ["__none__"]
  }, { edits: [rename("Sam: boiler quote #WF")], settings: { waitingForTag: "#wf" } });
  await runProcess(h.ctx, item("- [ ] Boiler quote"), 0);
  assert.deepStrictEqual(h.read(), ["- [ ] Sam: boiler quote #WF"]);
});

test("not checked as a next action: “Sam: boiler” is a fine waiting-for", async () => {
  // The script has no answer for the vague-wording question, so asking it would fail.
  const h = setup("- [ ] Boiler", {
    "Actionable this week?": ["delegate"], "When should you chase it?": ["__none__"]
  }, { edits: [rename("Sam")], settings: { nudgeVagueActions: true } });
  await runProcess(h.ctx, item("- [ ] Boiler"), 0);
  assert.ok(!h.asked.some((a) => a.q.includes("may not be a next action")));
});

test("cancelling the wording starts the task again, from the first question", async () => {
  const h = setup("- [ ] Boiler quote", { "Actionable this week?": ["delegate"] }, { edits: [() => ""] });
  await assert.rejects(runProcess(h.ctx, item("- [ ] Boiler quote"), 0), (e) => e instanceof ReviewControl && e.kind === "retry");
});

test("another date, in words", async () => {
  const h = setup("- [ ] Boiler quote", {
    "Actionable this week?": ["delegate"], "When should you chase it?": ["__pick__"], "Chase it on": ["in 10 days"]
  }, { edits: [rename("Sam: boiler quote")] });
  await runProcess(h.ctx, item("- [ ] Boiler quote"), 0);
  assert.deepStrictEqual(h.read(), [`- [ ] Sam: boiler quote #waitingfor ${START} ${shiftDate(todayString(), 10)}`]);
});

test("a project's next action can be someone else's: it waits inside the project", async () => {
  const h = setup("- [ ] Boiler fixed #project\n    - [ ] Get a quote", {
    "Actionable this week?": ["delegate"], "When should you chase it?": ["__none__"]
  }, { edits: [rename("Sam: boiler quote")] });
  const project = item("- [ ] Boiler fixed #project", { isProject: true, endLine: 1 });
  await processProjectChildren(h.ctx, project, 0);
  assert.deepStrictEqual(h.read(), ["- [ ] Boiler fixed #project", "    - [ ] Sam: boiler quote #waitingfor"]);
});

test("Organise files a waiting-for without asking for labels", async () => {
  const h = setup("- [ ] Sam: boiler quote #waitingfor", { "Move to": ["Lists/Waiting.md"] });
  h.ctx.mode = "organise";
  await runOrganise(h.ctx, item("- [ ] Sam: boiler quote #waitingfor"), h.ctx.filing);
  assert.ok(!h.asked.some((a) => a.q.includes("context")), `asked: ${h.asked.map((a) => a.q).join(" | ")}`);
  assert.strictEqual(h.vault.store.get("Lists/Waiting.md").trim(), "- [ ] Sam: boiler quote #waitingfor");
});

test("a waiting-for inside a project is passed over when its project is labelled", async () => {
  const h = setup("- [ ] Boiler fixed #project\n    - [ ] Sam: boiler quote #waitingfor\n    - [ ] Clear the cupboard", {
    "Physical context": ["home"], "Move to": ["Lists/Waiting.md"]
  });
  h.ctx.mode = "organise";
  await runOrganise(h.ctx, item("- [ ] Boiler fixed #project", { isProject: true, endLine: 2 }), h.ctx.filing);
  assert.strictEqual(h.asked.filter((a) => a.q.includes("context")).length, 1, "asked for the one you do");
  assert.match(h.vault.store.get("Lists/Waiting.md"), /Clear the cupboard #home/);
});
