/**
 * Organise does not add a label the task already has.
 *
 * Reported: re-organising a task wrote its labels a second time ("Call Sam #home #home"),
 * and a task captured as "#phone" got "#home" next to it. Now a dimension whose label is
 * already on the line is not asked about, nor is priority when one is set, and a tag is
 * never written twice.
 *
 * Uses the dimensions from examples/data.json — two tag dimensions (context, mode) and two
 * plain-text ones (energy "hi"/"lo", duration "long"/"short") — because plain-text labels
 * are the hard case: "long" can be a duration or just a word in the task.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const {
  organiseLine, insertBeforeTasksMetadata, hasExactTag, trailingLabels, textLabelWords,
  dimensionAlreadySet, dimensionQuestion, DEFAULT_SETTINGS
} = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "data.json"), "utf8"));
const DIMS = EXAMPLE.dimensions;
const plain = (q) => String(q).replace(/\*\*/g, "");
const Q = Object.fromEntries(DIMS.map((d) => [d.id, plain(dimensionQuestion(d))]));
const HIGH = "⏫", MED = "\u{1F53C}", DUE = "\u{1F4C5}";

/** Organise one line with scripted answers; returns what was asked and the line written. */
async function organise(raw, answers = {}, extra = {}) {
  const vault = makeVault({ "T.md": raw });
  const asked = [];
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const answer = (q) => {
    const p = plain(q);
    asked.push(p);
    const key = Object.keys(queues).find((k) => p.startsWith(k));
    return key && queues[key].length ? queues[key].shift() : null;
  };
  const ctx = {
    app: makeApp(vault),
    settings: Object.assign({}, DEFAULT_SETTINGS, { dimensions: DIMS, enablePriorityStep: true, enableCustomTagStep: false }, extra),
    tasks: { prioritySignifier: (l) => ({ high: HIGH, medium: MED })[l] || "" },
    prompter: {
      optionalChoice: async (q) => answer(q),
      text: async (q) => answer(q) || ""
    }
  };
  await organiseLine(ctx, new TFile("T.md"), 0, raw);
  return { asked, line: vault.store.get("T.md") };
}

test("a task already tagged #home is not asked its context, and #home is not written twice", async () => {
  const r = await organise("- [ ] Call Sam #home", {
    [Q.mode]: ["val_npmdw9"], [Q.energy]: ["hi"], [Q.duration]: ["val_1zja9b"], "Priority": [null]
  });
  assert.ok(!r.asked.includes(Q.context), `asked: ${r.asked.join(" | ")}`);
  assert.strictEqual(r.line, "- [ ] Call Sam #home #admin hi short");
});

test("a task captured as #phone does not get a second context next to it", async () => {
  const r = await organise("- [ ] Call Sam about the boiler #phone", {
    [Q.context]: ["home"], [Q.mode]: ["val_npmdw9"]
  });
  assert.ok(!r.asked.includes(Q.context));
  assert.doesNotMatch(r.line, /#home/);
});

test("a fully labelled task is asked nothing but what it lacks", async () => {
  const r = await organise(`- [ ] Call Sam #phone #admin lo short ${DUE} 2026-11-10`, { "Priority": ["high"] });
  assert.deepStrictEqual(r.asked, ["Priority"]);
  assert.strictEqual(r.line, `- [ ] Call Sam #phone #admin lo short ${HIGH} ${DUE} 2026-11-10`);
});

test("a priority already set is not asked about again", async () => {
  const r = await organise(`- [ ] Call Sam #phone #admin lo short ${MED}`, {});
  assert.deepStrictEqual(r.asked, []);
  assert.strictEqual(r.line, `- [ ] Call Sam #phone #admin lo short ${MED}`);
});

test("a plain-text label in the wording is not mistaken for one: “a long letter” is still asked its duration", async () => {
  const r = await organise("- [ ] Write a long letter to Sam", {
    [Q.context]: ["home"], [Q.mode]: ["creative"], [Q.energy]: ["hi"], [Q.duration]: ["long"]
  });
  assert.ok(r.asked.includes(Q.duration));
  assert.ok(r.asked.includes(Q.energy), "“hi” is not in it, but the check is the same");
  assert.strictEqual(r.line, "- [ ] Write a long letter to Sam #home #creative hi long");
});

test("the task's first word is never taken for a label", () => {
  const run = trailingLabels("- [ ] long", textLabelWords(DIMS));
  assert.strictEqual(run.size, 0);
});

test("tags match as Obsidian matches them: any case, whole tag only", () => {
  assert.ok(hasExactTag("- [ ] Call Sam #Home", "home"));
  assert.ok(hasExactTag("- [ ] Call Sam #home, then tea", "#home"));
  assert.ok(!hasExactTag("- [ ] Revise #homework", "home"));
  assert.ok(!hasExactTag("- [ ] Tidy #home/kitchen", "home"));
  assert.ok(!hasExactTag("- [ ] Email home@example.com", "home"));
});

test("a context tag anywhere in the line counts — Tasks filters see it there too", () => {
  const ctxDim = DIMS.find((d) => d.id === "context");
  assert.ok(dimensionAlreadySet(ctxDim, "- [ ] Ask about #agenda items for Monday", new Set()));
});

test("a tag is never written twice, whoever asks for it", () => {
  assert.strictEqual(insertBeforeTasksMetadata("- [ ] Plan the move #project", ["#project"]), "- [ ] Plan the move #project");
  assert.strictEqual(insertBeforeTasksMetadata("- [ ] Plan the move #Project", ["#project", "#home"]), "- [ ] Plan the move #Project #home");
});

test("labels go before a block id, so links to the task keep working", () => {
  assert.strictEqual(insertBeforeTasksMetadata("- [ ] Call Sam ^call-sam", ["#phone"]), "- [ ] Call Sam #phone ^call-sam");
  assert.strictEqual(
    insertBeforeTasksMetadata(`- [ ] Call Sam ${DUE} 2026-11-10 ^c1`, ["#phone"]),
    `- [ ] Call Sam #phone ${DUE} 2026-11-10 ^c1`
  );
});

test("labels before a block id are found as labels", async () => {
  const r = await organise("- [ ] Call Sam #phone #admin lo short ^c1", { "Priority": [null] });
  assert.deepStrictEqual(r.asked, ["Priority"]);
});

test("a custom tag the task already has is not added again", async () => {
  const r = await organise("- [ ] Call Sam #phone #admin lo short #boiler", { "Priority": [null], "Custom tag": ["boiler"] },
    { enableCustomTagStep: true });
  assert.strictEqual(r.line, "- [ ] Call Sam #phone #admin lo short #boiler");
});
