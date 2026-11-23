/**
 * GTD tips across the whole Process and Organise workflow.
 *
 * The main test here is a coverage check: every prompt the user answers must either carry
 * a tip or be listed below as exempt, with the reason. A new prompt added without a
 * decision either way fails, so coverage cannot silently erode as the workflow grows.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { GUIDANCE, dimensionGuidance, DEFAULT_SETTINGS } = require("./helpers/load.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

/* Prompts where a tip would add nothing, and why. */
const EXEMPT = {
  "this task (and its subtasks)?": "confirms a choice already explained by the previous prompt",
  "${question} (e.g. next Wednesday": "date entry, asked as its caller words it (\u201CBring it back on\u2026\u201D, \u201CChase it on\u2026\u201D); the tip sits on the choice that leads here",
  "Which query?": "tool configuration, not a GTD decision",
  "Query (one filter per line)": "tool configuration, not a GTD decision",
  "New note name": "naming a file, not a GTD decision",
  "Which project is it a step in?": "the previous prompt explains the decision; this only picks a target",
  "Which heading?": "the Move to… prompt explains filing; this only picks a target"
};

/** Every prompt call in the source, with its first argument and whether it passes a tip.
 *
 * The question is taken as the whole first argument, not just a leading string literal: a
 * computed question such as `batched ? "Added…" : "Next action saved."` was once invisible
 * to this check, which is exactly how coverage erodes without anyone noticing. */
function prompts() {
  const out = [];
  const re = /(?:prompter|this)\.(choice|optionalChoice|text|confirm)\(/g;
  let m;
  while ((m = re.exec(main)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0, i = open, firstArgEnd = -1, quote = null;
    for (; i < main.length; i++) {
      const c = main[i];
      if (quote) {
        if (c === "\\") { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
      if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") { depth--; if (depth === 0) break; }
      else if (c === "," && depth === 1 && firstArgEnd < 0) firstArgEnd = i;
    }
    const call = main.slice(m.index, i + 1);
    // Read without the **emphasis** markers: the wording is what is being checked.
    const question = main.slice(open + 1, firstArgEnd > 0 ? firstArgEnd : i).trim().replace(/\*\*/g, "");
    // Skip the prompter's own method definitions and its internal delegation.
    if (/^question$|^question,/.test(question)) continue;
    const guided = /GUIDANCE\.|dimensionGuidance\(|verdict\.reason/.test(call);
    out.push({ kind: m[1], question, guided, line: main.slice(0, m.index).split("\n").length });
  }
  return out;
}
const isExempt = (q) => Object.keys(EXEMPT).some((k) => q.includes(k));

test("every prompt in the workflow either has a tip or a stated reason not to", () => {
  const missing = prompts().filter((p) => !p.guided && !isExempt(p.question));
  assert.deepStrictEqual(
    missing.map((p) => `line ${p.line}: ${p.kind}("${p.question}")`),
    [],
    "add a GUIDANCE tip, or list the prompt in EXEMPT with the reason"
  );
});

test("no exemption is stale", () => {
  // An exemption whose prompt no longer exists would hide a real gap if it came back.
  const questions = prompts().map((p) => p.question);
  for (const key of Object.keys(EXEMPT)) {
    assert.ok(questions.some((q) => q.includes(key)), `exemption "${key}" matches no prompt`);
  }
});

test("the core Clarify question carries a tip", () => {
  const p = prompts().find((x) => x.question.includes("Actionable this week?"));
  assert.ok(p && p.guided);
});

test("the actionable tip includes the two-minute rule", () => {
  assert.match(GUIDANCE.actionable, /two minutes/);
});

/* -------------------------- the four criteria in Organise -------------------------- */

test("the default dimensions each get their GTD meaning", () => {
  const byId = Object.fromEntries(DEFAULT_SETTINGS.dimensions.map((d) => [d.id, d]));
  assert.strictEqual(dimensionGuidance(byId.context), GUIDANCE.context);
  assert.strictEqual(dimensionGuidance(byId.energy), GUIDANCE.energy);
  assert.strictEqual(dimensionGuidance(byId.duration), GUIDANCE.time);
  assert.strictEqual(dimensionGuidance(byId.mode), GUIDANCE.mode);
});

test("a renamed dimension is still recognised by its id", () => {
  assert.strictEqual(dimensionGuidance({ id: "context", label: "Where", group: "Place" }), GUIDANCE.context);
  assert.strictEqual(dimensionGuidance({ id: "x", label: "Time needed", group: "" }), GUIDANCE.time);
});

test("an unrecognised dimension gets a general tip, never a wrong one", () => {
  assert.strictEqual(dimensionGuidance({ id: "colour", label: "Colour", group: "Mood" }), GUIDANCE.dimensionGeneric);
  assert.strictEqual(dimensionGuidance({}), GUIDANCE.dimensionGeneric);
  assert.strictEqual(dimensionGuidance(undefined), GUIDANCE.dimensionGeneric);
});

test("the priority tip teaches GTD's order: context, time, energy, then priority", () => {
  const t = GUIDANCE.priority;
  const at = (w) => t.indexOf(w);
  assert.ok(at("context") < at("time") && at("time") < at("energy") && at("energy") < at("priority"),
    "priority comes last in GTD's four criteria");
});

/* ------------------------------ the review as a whole ------------------------------ */

test("the opening prompt names the GTD stage for each mode", () => {
  assert.match(GUIDANCE.reviewProcess, /Clarify/);
  assert.match(GUIDANCE.reviewOrganise, /Organize/);
  assert.match(main, /mode === "organise" \? GUIDANCE\.reviewOrganise : GUIDANCE\.reviewProcess/);
});

test("the Process tip says the point is deciding, not doing", () => {
  assert.match(GUIDANCE.reviewProcess, /deciding, not doing/);
});

/* --------------------------------- the tips themselves --------------------------------- */

test("every tip is short enough to read in a glance", () => {
  for (const [key, text] of Object.entries(GUIDANCE)) {
    assert.ok(text.length > 20, `${key} is too thin to be useful`);
    assert.ok(text.length <= 340, `${key} is ${text.length} chars — too long for a tip`);
  }
});

test("tips speak GTD, not the plugin's internals", () => {
  for (const [key, text] of Object.entries(GUIDANCE)) {
    assert.ok(!/\bsubtask/i.test(text), `${key} says "subtask"; the GTD term is next action`);
  }
});

test("confirm and text prompts can carry a tip", () => {
  assert.match(main, /confirm\(question, guidance\)/);
  assert.match(main, /this\.renderQuestion\(question, opts == null \? void 0 : opts\.guidance\)/,
    "text() must render its question through the same tip-aware path");
});

test("tips never bypass the display setting", () => {
  // Every question goes through renderQuestion, which honours always / on demand / off.
  assert.ok(!/this\.bodyEl\.createEl\("p", \{ text: question, cls: "gtd-clarify-question" \}\)/.test(main),
    "a question rendered directly would show its tip regardless of the setting");
});
