/**
 * GTD coaching: making outcomes and next actions effective as you go.
 *
 * The research this is built on is consistent on one point — captured wording is usually
 * the first thing that came to mind, not the next physical step, and clarifying it is the
 * part of GTD people most often skip. So the plugin prompts for it. These tests pin both
 * halves: that it prompts when it should, and that it stays quiet when it should not,
 * because a prompt that nags on good input teaches people to dismiss it.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  assessNextAction, actionText, VAGUE_OPENERS, GUIDANCE, confirmNextAction,
  clarifyFiledAction, DEFAULT_SETTINGS, ReviewControl
} = require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const { plain, plainSource } = require("./helpers/plain.js");
// Read for its wording: the **bold** markers in prompt text are left out.
const main = plainSource(fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8"));

/* ------------------------------- the detector ------------------------------- */

test("the examples GTD writing uses for bad next actions are flagged", () => {
  for (const line of [
    "- [ ] Sort out the website",
    "- [ ] Plan the offsite",
    "- [ ] Look into new laptops",
    "- [ ] Deal with the car",
    "- [ ] Think about holidays",
    "- [ ] Taxes",
    "- [ ] Research CRMs"
  ]) {
    assert.strictEqual(assessNextAction(line).vague, true, line);
  }
});

test("the examples GTD writing uses for good next actions pass", () => {
  for (const line of [
    "- [ ] Call Sam re: dates",
    "- [ ] Email designer the brief",
    "- [ ] Download the W-2 from the portal",
    "- [ ] Book a venue",
    "- [ ] Measure the brown patch beside the fence",
    "- [ ] Draft the opening paragraph"
  ]) {
    assert.strictEqual(assessNextAction(line).vague, false, line);
  }
});

test("a vague opener is only matched as a whole word", () => {
  // "planet" and "handlebar" contain vague openers but are not them.
  assert.strictEqual(assessNextAction("- [ ] Planet photos for Sam").vague, false);
  assert.strictEqual(assessNextAction("- [ ] Handlebar tape from the shop").vague, false);
});

test("tags, links and Tasks metadata do not affect the verdict", () => {
  assert.strictEqual(actionText("- [ ] Call Sam #phone 📅 2026-09-01"), "Call Sam");
  assert.strictEqual(actionText("- [ ] Email [[Sam]] the brief"), "Email the brief");
  assert.strictEqual(assessNextAction("- [ ] Call Sam #phone 📅 2026-09-01").vague, false,
    "a context tag must not turn a good action into a single word");
});

test("an empty line is not flagged", () => {
  assert.strictEqual(assessNextAction("").vague, false);
  assert.strictEqual(assessNextAction("- [ ] ").vague, false);
});

test("every verdict that flags gives a reason", () => {
  for (const opener of VAGUE_OPENERS) {
    const r = assessNextAction(`- [ ] ${opener} something`);
    assert.ok(r.vague && r.reason.length > 0, opener);
  }
});

/* ----------------------------- prompting behaviour ----------------------------- */

function harness(line, answers, settings = {}) {
  const vault = makeVault({ "P.md": line });
  const asked = [];
  let edited = 0;
  const ctx = {
    app: makeApp(vault),
    settings: Object.assign({}, DEFAULT_SETTINGS, settings),
    tasks: {
      canEditViaApi: () => true,
      editTaskLine: async () => { edited++; return "- [ ] Call Sam re: dates"; }
    },
    prompter: {
      choice: async (q, opts, guidance, note) => {
        asked.push({ q: plain(q), opts: opts.map((o) => plain(o.label)), guidance, note });
        return answers.shift();
      }
    }
  };
  return { ctx, asked, vault, file: new TFile("P.md"), edits: () => edited };
}

test("a clear action is not questioned by the nudge", async () => {
  const h = harness("- [ ] Call Sam re: dates", []);
  await confirmNextAction(h.ctx, h.file, 0);
  assert.strictEqual(h.asked.length, 0, "silent on good input");
});

test("a vague action is questioned once, with the reason shown alongside the question", async () => {
  const h = harness("- [ ] Sort out trip", ["keep"]);
  await confirmNextAction(h.ctx, h.file, 0);
  assert.strictEqual(h.asked.length, 1);
  assert.match(h.asked[0].note, /sort out/, "the reason is a note, always visible");
  assert.match(h.asked[0].guidance, /physical, visible/, "the general advice stays a tip");
  assert.doesNotMatch(h.asked[0].guidance, /sort out/, "and the reason is not buried in it");
});

test("choosing rewrite opens the editor", async () => {
  const h = harness("- [ ] Sort out trip", ["rewrite"]);
  await confirmNextAction(h.ctx, h.file, 0);
  assert.strictEqual(h.edits(), 1);
  assert.strictEqual(h.vault.store.get("P.md"), "- [ ] Call Sam re: dates");
});

test("the nudge can be switched off", async () => {
  const h = harness("- [ ] Sort out trip", [], { nudgeVagueActions: false });
  await confirmNextAction(h.ctx, h.file, 0);
  assert.strictEqual(h.asked.length, 0);
});

test("filing under a project always asks whether it is a clear next action", async () => {
  const h = harness("- [ ] Call Sam re: dates", ["keep"]);
  await clarifyFiledAction(h.ctx, h.file, 0);
  assert.strictEqual(h.asked.length, 1);
  assert.strictEqual(h.asked[0].q, "Is this a clear next action?");
  assert.strictEqual(h.edits(), 0, "keeping it opens nothing");
});

test("rewriting is offered first whatever the wording, so the answers never swap places", async () => {
  // Most captures need rewording; an order that flipped with the vague check moved both.
  const clear = harness("- [ ] Call Sam re: dates", ["keep"]);
  await clarifyFiledAction(clear.ctx, clear.file, 0);
  const vague = harness("- [ ] Sort out trip", ["keep"]);
  await clarifyFiledAction(vague.ctx, vague.file, 0);
  assert.deepStrictEqual(clear.asked[0].opts.slice(0, 2), ["Rewrite it\u2026", "It\u2019s already clear"]);
  assert.deepStrictEqual(vague.asked[0].opts.slice(0, 2), clear.asked[0].opts.slice(0, 2));
  assert.ok(vague.asked[0].note, "the vague one still says why");
});

test("switching clarify off still catches obviously vague wording", async () => {
  // Someone who clarifies at capture time can drop the routine prompt, but an unusable
  // action is never filed in silence.
  const fine = harness("- [ ] Call Sam re: dates", [], { clarifyNextAction: false });
  await clarifyFiledAction(fine.ctx, fine.file, 0);
  assert.strictEqual(fine.asked.length, 0, "no routine prompt");

  const vague = harness("- [ ] Sort out trip", ["keep"], { clarifyNextAction: false });
  await clarifyFiledAction(vague.ctx, vague.file, 0);
  assert.strictEqual(vague.asked.length, 1, "but the vague one is still caught");
});

test("both coaching settings default on and are real booleans", () => {
  assert.strictEqual(DEFAULT_SETTINGS.clarifyNextAction, true);
  assert.strictEqual(DEFAULT_SETTINGS.nudgeVagueActions, true);
});

/* ------------------------------ wording & structure ------------------------------ */

test("the project question is asked in GTD's own terms", () => {
  assert.match(main, /"Does this need more than one step\?"/);
  assert.match(main, /this is the project\\u2019s outcome/);
  assert.match(main, /one step in a bigger project/);
});

test("implementation vocabulary is gone from the prompts", () => {
  // "Subtask" is how the file stores it; "next action" is what it is.
  assert.ok(!/"Subtask saved\."/.test(main));
  assert.ok(!/Does this subtask depend on the previous one\?/.test(main));
  assert.ok(!/Add more subtasks to this project\?/.test(main));
});

test("guidance appears wherever an outcome or next action is written", () => {
  assert.ok((main.match(/guide\(ctx, [^,]+, GUIDANCE\.outcome\)/g) || []).length >= 3,
    "new project, project-as-outcome, and reviewing an existing project");
  assert.ok((main.match(/GUIDANCE\.nextAction/g) || []).length >= 4);
});

test("every guidance string is written in terms of the decision, with an example", () => {
  for (const key of ["nextAction", "outcome"]) {
    assert.match(GUIDANCE[key], /\u2018.+\u2019/, `${key} should show a concrete example`);
  }
});

test("prompts can carry guidance without disturbing existing callers", () => {
  assert.match(main, /choice\(question, options, guidance, note\)/);
  assert.match(main, /renderChoice\(question, options, optional, guidance, note\)/);
  // Both render sites go through one method, so the display setting applies everywhere.
  // text() passes its guidance from opts; renderChoice passes guidance and the note.
  // The note slot also carries the one-off number-key hint.
  assert.strictEqual((main.match(/this\.renderQuestion\(question, guidance, note \|\| hint\)/g) || []).length, 1);
  assert.match(main, /this\.renderQuestion\(question, opts == null \? void 0 : opts\.guidance\)/);
  assert.ok(!/if \(guidance\) this\.bodyEl\.createEl\("div"/.test(main),
    "no site may render guidance directly and bypass the setting");
});

test("Organise catches a project with no next action", () => {
  // organiseProject holds a project's organising; organiseTask gives it a Re-process handler.
  const fn = main.slice(main.indexOf("async function organiseProject"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  assert.match(body, /await askEmptyProject\(ctx\)/);
  const ask = main.slice(main.indexOf("async function askEmptyProject"));
  assert.match(ask.slice(0, ask.indexOf("\n}")), /This project has no next action\./);
  const answers = main.slice(main.indexOf("var EMPTY_PROJECT_ANSWERS"), main.indexOf("];", main.indexOf("var EMPTY_PROJECT_ANSWERS")));
  assert.match(answers, /mark it complete/, "a project with nothing left may simply be finished");
  assert.match(answers, /Leave it for now/, "and it must be possible to decline");
});

/* ------------------------------- reachability ------------------------------- */

/** Which class a method is defined in, by walking the shipped source. */
function classOwning(method) {
  let cls = null;
  for (const line of main.split("\n")) {
    const c = line.match(/^var ([A-Za-z]+) = class/);
    if (c) cls = c[1];
    if (new RegExp(`^  (async )?${method}\\(`).test(line)) return cls;
  }
  return null;
}

test("showGuidance is on the pane, where guide() can reach it", () => {
  // guide() calls ctx.prompter.showGuidance, and ctx.prompter is the ReviewView. An earlier
  // version put showGuidance on TasksApiAdapter: present in the file, unreachable at run
  // time, every message silently dropped, every presence-check test still green.
  assert.match(main, /prompter: this/, "the prompter is the pane itself");
  assert.strictEqual(classOwning("showGuidance"), "ReviewView");
});

test("every method the pipelines call through ctx.prompter lives on the pane", () => {
  const called = new Set();
  for (const m of main.matchAll(/(?:ctx\.prompter|prompter|p)\.([a-zA-Z]+)\(/g)) called.add(m[1]);
  // Restrict to methods the pane is meant to provide.
  const paneApi = ["choice", "optionalChoice", "text", "confirm", "info", "showGuidance",
    "withControls", "highlightInSource", "focusSubtask", "suggestFile", "suggestFolder",
    "suggestTemplate"];
  for (const method of paneApi.filter((m) => called.has(m))) {
    assert.strictEqual(classOwning(method), "ReviewView", `${method} must be on ReviewView`);
  }
});

test("guide() renders through the real pane", () => {
  const { guide } = require("./helpers/load.js");
  const rendered = [];
  const pane = { showGuidance: (q, g) => rendered.push({ q, g }) };
  guide({ prompter: pane }, "Name the outcome", GUIDANCE.outcome);
  assert.deepStrictEqual(rendered, [{ q: "Name the outcome", g: GUIDANCE.outcome }]);
});
