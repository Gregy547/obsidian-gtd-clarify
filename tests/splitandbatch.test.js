/**
 * Splitting a compound capture, and batching two-minute actions found while building a
 * project. Driven through the real runProcess wherever behaviour depends on how the pieces
 * fit together, because the risks are in the joins: a piece skipped because an earlier one
 * moved, a split falling through into the single-action path, a batch offered where it
 * would never run.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const {
  canBatch, askAfterAction, clarifyFiledAction, cleanPieceText, replaceWithPieces,
  processSplitPieces, ReviewControl, DEFAULT_SETTINGS, MAX_SPLIT_PIECES
} = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const { plain, plainSource } = require("./helpers/plain.js");
// Read for its wording: the **bold** markers in prompt text are left out.
const main = plainSource(fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8"));

/** A prompter answering by question text, each question consuming its own queue of
 * answers. Records every question asked, with its options, so flow can be asserted. */
function scripted(answers) {
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [];
  const answer = (q, opts) => {
    q = String(q).replace(/\*\*/g, "");
    asked.push({ q, opts: (opts || []).map((o) => o.value) });
    const key = Object.keys(queues).find((k) => String(q).replace(/\*\*/g, "").includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    const a = queues[key].shift();
    if (a instanceof Error) throw a;
    return a;
  };
  return {
    asked,
    remaining: () => Object.values(queues).reduce((n, q) => n + q.length, 0),
    prompter: {
      choice: async (q, opts) => answer(q, opts),
      optionalChoice: async (q, opts) => answer(q, opts),
      confirm: async (q) => answer(q, []),
      text: async (q) => answer(q, []),
      info: () => {},
      highlightInSource: async () => {}
    }
  };
}
function ctxFor(vault, script, extra = {}) {
  return Object.assign({
    app: makeApp(vault),
    settings: Object.assign({}, DEFAULT_SETTINGS),
    tasks: { canEditViaApi: () => true },
    mode: "process",
    quickBatch: [],
    prompter: script.prompter
  }, extra);
}
const F = () => new TFile("P.md");
const read = (vault) => vault.store.get("P.md").split("\n");

/* ===================================== batching ===================================== */

test("batching is offered in Process, never in Organise", () => {
  assert.strictEqual(canBatch({ quickBatch: [], mode: "process" }), true);
  assert.strictEqual(canBatch({ quickBatch: [], mode: "organise" }), false,
    "the batch only runs after Process, so it would queue into nothing");
  assert.strictEqual(canBatch({ mode: "process" }), false, "no batch to add to");
});

test("after a new action, batching queues it and returns to the same question", async () => {
  const vault = makeVault({ "P.md": "- [ ] project\n    - [ ] Reply to Sam" });
  const s = scripted({ "Next action saved.": ["batch"], "Added to the two-minute batch.": ["another"] });
  const ctx = ctxFor(vault, s);
  assert.strictEqual(await askAfterAction(ctx, F(), { made: [{ line: 1, entry: null }] }), "another", "still decides whether to add more");
  assert.deepStrictEqual(ctx.quickBatch.map((e) => e.raw), ["    - [ ] Reply to Sam"]);
  assert.strictEqual(ctx.quickBatch[0].line, 1);
});

test("an action can't be batched twice from the same prompt", async () => {
  const vault = makeVault({ "P.md": "- [ ] a" });
  const s = scripted({ "Next action saved.": ["batch"], "Added to the two-minute batch.": ["done"] });
  await askAfterAction(ctxFor(vault, s), F(), { made: [{ line: 0, entry: null }] });
  assert.ok(!s.asked[1].opts.includes("batch"), "the second showing must not offer batch again");
});

test("not batching costs nothing extra", async () => {
  const vault = makeVault({ "P.md": "- [ ] a" });
  const s = scripted({ "Next action saved.": ["done"] });
  const ctx = ctxFor(vault, s);
  assert.strictEqual(await askAfterAction(ctx, F(), { made: [{ line: 0, entry: null }] }), "done");
  assert.strictEqual(s.asked.length, 1, "one question, as before");
  assert.strictEqual(ctx.quickBatch.length, 0);
});

test("in Organise the add-more prompt has no batch option", async () => {
  const vault = makeVault({ "P.md": "- [ ] a" });
  const s = scripted({ "Next action saved.": ["done"] });
  await askAfterAction(ctxFor(vault, s, { mode: "organise" }), F(), { made: [{ line: 0, entry: null }] });
  assert.deepStrictEqual(s.asked[0].opts, ["another", "done", "fix"]);
});

test("a filed step can be batched, and batching skips the rewrite", async () => {
  const vault = makeVault({ "P.md": "- [ ] Reply to Sam" });
  const s = scripted({ "Is this a clear next action?": ["batch"] });
  const ctx = ctxFor(vault, s);
  await clarifyFiledAction(ctx, F(), 0);
  assert.strictEqual(ctx.quickBatch.length, 1);
  assert.strictEqual(s.remaining(), 0, "no rewrite dialogue follows");
});

test("a filed step in Organise is not offered the batch", async () => {
  const vault = makeVault({ "P.md": "- [ ] Reply to Sam" });
  const s = scripted({ "Is this a clear next action?": ["keep"] });
  await clarifyFiledAction(ctxFor(vault, s, { mode: "organise" }), F(), 0);
  assert.ok(!s.asked[0].opts.includes("batch"));
});

test("building a new project, a quick action can be batched end to end", async () => {
  // Yes — this is the project's outcome; first action is quick.
  const vault = makeVault({ "P.md": "- [ ] Berlin trip" });
  const s = scripted({
    "Actionable this week?": [true],
    "Does this need more than one step?": ["yes"],
    "Must this wait": [false],
    "Next action saved.": ["batch"],
    "Added to the two-minute batch.": ["done"]
  });
  let created = 0;
  const ctx = ctxFor(vault, s, {
    tasks: {
      canEditViaApi: () => true,
      editTaskLine: async () => "- [ ] Berlin trip booked",
      createNewTaskLine: async () => (++created === 1 ? "- [ ] Text Sam the dates" : ""),
      newDependencyId: () => "x"
    }
  });
  await runProcess(ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Berlin trip", isProject: false });
  assert.match(read(vault)[0], /Berlin trip booked.*#project/);
  assert.deepStrictEqual(ctx.quickBatch.map((e) => e.raw.trim()), ["- [ ] Text Sam the dates"]);
});

/* ====================================== splitting ====================================== */

test("cleanPieceText strips a typed marker or checkbox, and nothing else", () => {
  assert.strictEqual(cleanPieceText("Call Sam"), "Call Sam");
  assert.strictEqual(cleanPieceText("- [ ] Call Sam"), "Call Sam");
  assert.strictEqual(cleanPieceText("* Call Sam"), "Call Sam");
  assert.strictEqual(cleanPieceText("1. Call Sam"), "Call Sam");
  assert.strictEqual(cleanPieceText("  [ ] Call Sam  "), "Call Sam");
  assert.strictEqual(cleanPieceText("+1 the report"), "+1 the report", "a marker needs a space to count");
  assert.strictEqual(cleanPieceText(""), "");
  assert.strictEqual(cleanPieceText(null), "");
});

test("the first piece takes the capture's place; the rest follow as siblings", async () => {
  const vault = makeVault({ "P.md": "- [ ] Call Sam, buy milk\n- [ ] other" });
  const raws = await replaceWithPieces(makeApp(vault), { file: F(), startLine: 0, endLine: 0 }, ["Call Sam", "Buy milk"]);
  assert.deepStrictEqual(read(vault), ["- [ ] Call Sam", "- [ ] Buy milk", "- [ ] other"]);
  assert.deepStrictEqual(raws, ["- [ ] Call Sam", "- [ ] Buy milk"]);
});

test("notes beneath a capture stay with the first piece", async () => {
  const vault = makeVault({ "P.md": "- [ ] Sam and milk\n    notes about Sam\n- [ ] other" });
  await replaceWithPieces(makeApp(vault), { file: F(), startLine: 0, endLine: 1 }, ["Call Sam", "Buy milk"]);
  assert.deepStrictEqual(read(vault), ["- [ ] Call Sam", "    notes about Sam", "- [ ] Buy milk", "- [ ] other"]);
});

test("pieces keep the capture's indentation and marker", async () => {
  const vault = makeVault({ "P.md": "- [ ] parent\n    * [ ] a and b" });
  await replaceWithPieces(makeApp(vault), { file: F(), startLine: 1, endLine: 1 }, ["a", "b"]);
  assert.deepStrictEqual(read(vault).slice(1), ["    * [ ] a", "    * [ ] b"]);
});

test("split is offered at the top level only, and never for a project", async () => {
  const run = async (depth, isProject) => {
    const vault = makeVault({ "P.md": "- [ ] a" });
    const s = scripted({ "Actionable this week?": [new ReviewControl("skip")] });
    try { await runProcess(ctxFor(vault, s), { file: F(), startLine: 0, endLine: 0, raw: "- [ ] a", isProject }, depth); } catch (e) {}
    return s.asked[0].opts.includes("split");
  };
  assert.strictEqual(await run(0, false), true);
  assert.strictEqual(await run(1, false), false, "a piece is not split again");
  assert.strictEqual(await run(0, true), false, "a project is already one outcome");
});

test("a compound capture is split and every piece goes through Process", async () => {
  const vault = makeVault({ "P.md": "- [ ] Call Sam, buy milk, book venue\n- [ ] untouched" });
  const s = scripted({
    "Actionable this week?": ["split", "twomin", "twomin", "twomin"],
    "Split it": ["Call Sam"],
    "Next item": ["Buy milk", "Book venue", ""]
  });
  const ctx = ctxFor(vault, s);
  await runProcess(ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Call Sam, buy milk, book venue", isProject: false });
  assert.deepStrictEqual(read(vault), ["- [ ] Call Sam", "- [ ] Buy milk", "- [ ] Book venue", "- [ ] untouched"]);
  assert.deepStrictEqual(ctx.quickBatch.map((e) => e.raw), ["- [ ] Call Sam", "- [ ] Buy milk", "- [ ] Book venue"],
    "each piece was decided on its own");
  assert.strictEqual(s.remaining(), 0);
});

test("choosing split never falls through into the single-action path", async () => {
  // "split" is truthy; without the explicit check it would be read as "actionable".
  const vault = makeVault({ "P.md": "- [ ] a and b" });
  const s = scripted({
    "Actionable this week?": ["split", "twomin", "twomin"],
    "Split it": ["a"],
    "Next item": ["b", ""]
  });
  await runProcess(ctxFor(vault, s), { file: F(), startLine: 0, endLine: 0, raw: "- [ ] a and b", isProject: false });
  // Falling through would send the compound itself on to the project question, which has
  // no scripted answer here and would throw.
  assert.strictEqual(s.asked.filter((x) => x.q.includes("more than one step")).length, 0);
  assert.strictEqual(s.asked.filter((x) => x.q.includes("Actionable this week?")).length, 3,
    "once for the compound, once per piece");
});

test("a capture that hides a project needs no special handling", async () => {
  // One piece becomes a project with a next action; the other is a quick task.
  const vault = makeVault({ "P.md": "- [ ] Berlin trip, renew passport" });
  const s = scripted({
    "Actionable this week?": ["split", true, "twomin"],
    "Split it": ["Berlin trip"],
    "Next item": ["Renew passport", ""],
    "Does this need more than one step?": ["yes"],
    "Must this wait": [false],
    "Next action saved.": ["done"]
  });
  let created = 0;
  const ctx = ctxFor(vault, s, {
    tasks: {
      canEditViaApi: () => true,
      editTaskLine: async () => "- [ ] Berlin trip booked",
      createNewTaskLine: async () => (++created === 1 ? "- [ ] Text Sam the dates" : ""),
      newDependencyId: () => "x"
    }
  });
  await runProcess(ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Berlin trip, renew passport", isProject: false });
  const lines = read(vault);
  assert.match(lines[0], /Berlin trip booked.*#project/);
  assert.match(lines[1], /^\s+- \[ \] Text Sam the dates/);
  assert.strictEqual(lines[2], "- [ ] Renew passport", "found again after the project grew above it");
  assert.deepStrictEqual(ctx.quickBatch.map((e) => e.raw), ["- [ ] Renew passport"]);
});

test("a piece moved out of the note doesn't cause the next to be skipped", async () => {
  const vault = makeVault({ "P.md": "- [ ] a\n- [ ] b\n- [ ] c" });
  const seen = [];
  const s = scripted({ "Actionable this week?": [false, "twomin", "twomin"] });
  s.prompter.highlightInSource = async (p) => seen.push(p.raw);
  // The first piece goes to Someday, removing it from this note.
  const ctx = ctxFor(vault, s, {
    tasks: { canEditViaApi: () => true, editTaskLine: async (l) => l }
  });
  s.prompter.choice = (orig => async (q, opts) => {
    if (plain(q).includes("What should happen to it?")) return "someday";
    return orig(q, opts);
  })(s.prompter.choice);
  await processSplitPieces(ctx, F(), ["- [ ] a", "- [ ] b", "- [ ] c"], 0, 0);
  assert.deepStrictEqual(seen, ["- [ ] a", "- [ ] b", "- [ ] c"], "b and c still reached after a left");
  assert.ok(!read(vault).includes("- [ ] a"));
});

test("a piece whose text has changed since is not processed", async () => {
  const vault = makeVault({ "P.md": "- [ ] a\n- [ ] edited elsewhere" });
  const seen = [];
  const s = scripted({ "Actionable this week?": ["twomin"] });
  s.prompter.highlightInSource = async (p) => seen.push(p.raw);
  await processSplitPieces(ctxFor(vault, s), F(), ["- [ ] a", "- [ ] b"], 0, 0);
  assert.deepStrictEqual(seen, ["- [ ] a"], "b no longer exists as written, so it is passed over");
});

test("cancelling inside a piece redoes only that piece", async () => {
  const vault = makeVault({ "P.md": "- [ ] a\n- [ ] b" });
  const seen = [];
  const s = scripted({
    "Actionable this week?": ["twomin", new ReviewControl("retry"), "twomin"]
  });
  s.prompter.highlightInSource = async (p) => seen.push(p.raw);
  const ctx = ctxFor(vault, s);
  await processSplitPieces(ctx, F(), ["- [ ] a", "- [ ] b"], 0, 0);
  assert.deepStrictEqual(seen, ["- [ ] a", "- [ ] b", "- [ ] b"], "a is not redone; b is offered again");
  assert.deepStrictEqual(ctx.quickBatch.map((e) => e.raw), ["- [ ] a", "- [ ] b"], "and queued once each");
});

test("Restart from inside a piece escalates to the whole task", async () => {
  // The review loop then restores the journal, bringing back the original capture.
  const vault = makeVault({ "P.md": "- [ ] a\n- [ ] b" });
  const s = scripted({ "Actionable this week?": [new ReviewControl("back")] });
  await assert.rejects(
    () => processSplitPieces(ctxFor(vault, s), F(), ["- [ ] a", "- [ ] b"], 0, 0),
    (e) => e instanceof ReviewControl && e.kind === "back"
  );
});

test("Skip inside a piece moves to the next piece", async () => {
  const vault = makeVault({ "P.md": "- [ ] a\n- [ ] b" });
  const seen = [];
  const s = scripted({ "Actionable this week?": [new ReviewControl("skip"), "twomin"] });
  s.prompter.highlightInSource = async (p) => seen.push(p.raw);
  await processSplitPieces(ctxFor(vault, s), F(), ["- [ ] a", "- [ ] b"], 0, 0);
  assert.deepStrictEqual(seen, ["- [ ] a", "- [ ] b"]);
});

test("entering nothing restarts the task rather than leaving a broken split", async () => {
  const vault = makeVault({ "P.md": "- [ ] a and b" });
  const s = scripted({ "Actionable this week?": ["split"], "Split it": Array(MAX_SPLIT_PIECES).fill("   ") });
  await assert.rejects(
    () => runProcess(ctxFor(vault, s), { file: F(), startLine: 0, endLine: 0, raw: "- [ ] a and b", isProject: false }),
    (e) => e instanceof ReviewControl && e.kind === "retry"
  );
  assert.deepStrictEqual(read(vault), ["- [ ] a and b"], "and the capture is untouched");
});

test("one piece is just a rewrite, and still works", async () => {
  const vault = makeVault({ "P.md": "- [ ] Sort out Sam" });
  const s = scripted({
    "Actionable this week?": ["split", "twomin"],
    "Split it": ["Call Sam about dates"],
    "Next item": [""]
  });
  await runProcess(ctxFor(vault, s), { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Sort out Sam", isProject: false });
  assert.deepStrictEqual(read(vault), ["- [ ] Call Sam about dates"]);
});

test("the split walk shares the project walk's retry and rollback rules", () => {
  assert.match(main, /await attemptSubItem\(ctx, piece, depth \+ 1\)/);
});

test("the split tip points to the project path for steps towards one outcome", () => {
  assert.match(L.GUIDANCE.split, /project/);
});

test("an unusable first entry asks for the first item again, not the next", async () => {
  // Found by the test above: a whitespace-only or marker-only first entry used to move on
  // to "Next item (leave blank to finish)" with no first item recorded.
  const vault = makeVault({ "P.md": "- [ ] a and b" });
  const s = scripted({
    "Actionable this week?": ["split", "twomin", "twomin"],
    "Split it": ["- [ ]", "   ", "a"],
    "Next item": ["b", ""]
  });
  await runProcess(ctxFor(vault, s), { file: F(), startLine: 0, endLine: 0, raw: "- [ ] a and b", isProject: false });
  const firsts = s.asked.filter((x) => x.q.includes("Split it")).length;
  assert.strictEqual(firsts, 3, "asked for the first item until one was usable");
  assert.deepStrictEqual(read(vault), ["- [ ] a", "- [ ] b"]);
});

test("a piece filed under a project further down doesn't cause the next to be skipped", async () => {
  // The case re-anchoring exists for. Filing piece "a" under a project BELOW it reorders the
  // note without changing its length, so the next piece moves up while position alone says
  // it's still one line further on — where the project now sits.
  const vault = makeVault({ "P.md": ["- [ ] a", "- [ ] b", "- [ ] Proj #project"].join("\n") });
  const seen = [];
  const s = scripted({
    "Actionable this week?": [true, "twomin"],
    "Does this need more than one step?": ["step"],
    "Which project is it a step in?": ["2"],
    "Is this a clear next action?": ["keep"]
  });
  s.prompter.highlightInSource = async (p) => seen.push(p.raw);
  const ctx = ctxFor(vault, s);
  await processSplitPieces(ctx, F(), ["- [ ] a", "- [ ] b"], 0, 0);
  // Each piece is reached in turn — and "a", once filed, is shown under its project for
  // "Is this a clear next action?".
  assert.deepStrictEqual(seen.filter((r) => !/^\s/.test(r)), ["- [ ] a", "- [ ] b"], "b is still reached after a moved below it");
  assert.deepStrictEqual(seen, ["- [ ] a", "    - [ ] a", "- [ ] b"]);
  assert.deepStrictEqual(read(vault), ["- [ ] b", "- [ ] Proj #project", "    - [ ] a"]);
  assert.deepStrictEqual(ctx.quickBatch.map((e) => e.raw), ["- [ ] b"]);
});
