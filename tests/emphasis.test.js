/**
 * Bold key words in questions and answers, and one heading per Organise dimension.
 *
 * The bold word is the one that tells one answer from the next, so a glance down the bold
 * words is enough to choose. It is written into the wording as **double asterisks**.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { richRuns, plainText, appendRich, dimensionQuestion, DEFAULT_SETTINGS, DISPOSE_ACTIONS } = require("./helpers/load.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

function el(tag, opts = {}) {
  const node = {
    tag, cls: opts.cls || "", text: opts.text || "", children: [], attrs: {},
    createEl(t, o = {}) { const c = el(t, o); this.children.push(c); return c; },
    createSpan(o = {}) { return this.createEl("span", o); },
    setAttribute(k, v) { this.attrs[k] = v; }
  };
  return node;
}
const shown = (node) => node.text + node.children.map(shown).join("");
const bold = (node) => (node.tag === "strong" ? [node.text] : []).concat(...node.children.map(bold));

/* ---------------------------------- the markup ---------------------------------- */

test("bold runs are found, and the rest is kept as written", () => {
  assert.deepStrictEqual(richRuns("**Which tasks** do you want to work through?"), [
    { text: "Which tasks", bold: true }, { text: " do you want to work through?", bold: false }
  ]);
  assert.deepStrictEqual(richRuns("Mark as **cancelled**"), [
    { text: "Mark as ", bold: false }, { text: "cancelled", bold: true }
  ]);
  assert.deepStrictEqual(richRuns("no markup"), [{ text: "no markup", bold: false }]);
});

test("an unpaired marker is left as typed", () => {
  assert.strictEqual(plainText("2 ** 3"), "2 ** 3");
  assert.deepStrictEqual(richRuns("a **b"), [{ text: "a **b", bold: false }]);
});

test("plain text drops only the markers", () => {
  assert.strictEqual(plainText("Process the **whole project** again"), "Process the whole project again");
  assert.strictEqual(plainText(""), "");
  assert.strictEqual(plainText(undefined), "");
});

test("rendered, bold words are <strong> and the reading is unchanged", () => {
  const parent = el("div");
  const b = appendRich(parent, "button", "Yes — **under two minutes**, batch it", "gtd-clarify-btn");
  assert.strictEqual(b.tag, "button");
  assert.strictEqual(b.cls, "gtd-clarify-btn");
  assert.deepStrictEqual(bold(b), ["under two minutes"]);
  assert.strictEqual(shown(b), "Yes — under two minutes, batch it");
  // Read aloud from the words themselves, which carry no markers. No aria-label: Obsidian
  // would show it as a hover tooltip repeating the button.
  assert.ok(!("aria-label" in b.attrs), "no tooltip repeating the button's words");
});

test("text with no bold renders exactly as before", () => {
  const parent = el("div");
  const b = appendRich(parent, "button", "Back", "gtd-clarify-btn");
  assert.strictEqual(b.text, "Back");
  assert.strictEqual(b.children.length, 0);
});

/* ------------------------------- every prompt has one ------------------------------- */

test("every question in the workflow has a bold key word", () => {
  const re = /\.(choice|optionalChoice|confirm|text|date)\(\s*(["`])((?:\\.|(?!\2).)*)\2/g;
  const missing = [];
  let m;
  while ((m = re.exec(main))) {
    // The date entry's question is its caller's, checked below.
    if (m[3].startsWith("${question}")) continue;
    if (!m[3].includes("**") && !m[3].includes("${action.label}")) missing.push(m[3]);
  }
  assert.deepStrictEqual(missing, []);
});

test("each question passed to the date entry has a bold key word", () => {
  const given = [...main.matchAll(/askForDate\([^()]*?,\s*"([^"]*)"\)|async function askForDate\([^)]*question = "([^"]*)"/g)]
    .map((m) => m[1] || m[2]);
  assert.ok(given.length >= 2, "the default and the chase date");
  assert.deepStrictEqual(given.filter((q) => !q.includes("**")), []);
});

test("every answer of more than one word has a bold key word", () => {
  const re = /label: (["`])((?:\\.|(?!\1).)*)\1/g;
  const missing = [];
  let m;
  while ((m = re.exec(main))) {
    const t = m[2];
    if (t.includes("**")) continue;
    if (!/\s/.test(t.replace(/\\u2014|\\u2026/g, ""))) continue;
    missing.push(t);
  }
  // Dimension labels are settings values, not answers: the heading is what is shown.
  const dimensionLabels = ["New dimension", ...DEFAULT_SETTINGS.dimensions.map((d) => d.label)];
  assert.deepStrictEqual(missing.filter((t) => !dimensionLabels.includes(t)), []);
});

test("settings show the finishing options without markers", () => {
  assert.match(main, /this\.toggleField\(plainText\(action\.label\)/);
  for (const a of DISPOSE_ACTIONS) assert.match(a.label, /\*\*/, `${a.value} carries its bold word`);
});

/* ------------------------------- dimension headings ------------------------------- */

test("a heading that contains its label says it once, with the label bold", () => {
  assert.strictEqual(dimensionQuestion({ group: "Physical context", label: "Context" }), "Physical **context**");
  assert.strictEqual(dimensionQuestion({ group: "Mental processing mode", label: "Processing mode" }), "Mental **processing mode**");
  assert.strictEqual(dimensionQuestion({ group: "Energy", label: "Energy" }), "**Energy**");
});

test("the old default pair is no longer said twice", () => {
  // Stored settings from earlier versions keep "Mental processing mode › Mental mode".
  assert.strictEqual(dimensionQuestion({ group: "Mental processing mode", label: "Mental mode" }), "**Mental processing mode**");
});

test("a heading written with its own bold is used as written", () => {
  assert.strictEqual(dimensionQuestion({ group: "Mental **processing mode**", label: "Mental mode" }), "Mental **processing mode**");
});

test("a label that adds something is kept, after the heading", () => {
  assert.strictEqual(dimensionQuestion({ group: "Place", label: "Where" }), "Place › **Where**");
});

test("either part missing still gives a heading", () => {
  assert.strictEqual(dimensionQuestion({ group: "", label: "Where" }), "**Where**");
  assert.strictEqual(dimensionQuestion({ group: "Place", label: "" }), "**Place**");
  assert.strictEqual(dimensionQuestion({}), "");
});

test("the default dimensions each get a single heading", () => {
  const headings = DEFAULT_SETTINGS.dimensions.map(dimensionQuestion);
  assert.deepStrictEqual(headings, ["Physical **context**", "Mental **processing mode**", "**Energy**", "**Duration**"]);
});

test("Organise asks with the single heading, and settings name it without markers", () => {
  assert.match(main, /optionalChoice\(\s*dimensionQuestion\(dim\),/);
  assert.match(main, /setName\(plainText\(dimensionQuestion\(dim\)\)/);
  assert.ok(!/\$\{dim\.group\} \\u203A \$\{dim\.label\}/.test(main), "the doubled form is gone");
});

test("a button's words stay in one piece, so its spaces survive a flex layout", () => {
  // Obsidian buttons are flex boxes. Each direct child is a flex item with its edge spaces
  // trimmed, so on a phone "This **note** (Inbox)" read "Thisnote(Inbox)".
  const parent = el("div");
  const b = appendRich(parent, "button", "This **note** (- Inbox -)", "gtd-clarify-btn");
  assert.strictEqual(b.children.length, 1, "a single child holds every run");
  assert.strictEqual(b.children[0].tag, "span");
  assert.strictEqual(shown(b), "This note (- Inbox -)");
  assert.deepStrictEqual(bold(b), ["note"]);
});

test("a span is filled directly, without a wrapper inside it", () => {
  const parent = el("p");
  const s = appendRich(parent, "span", "**Which tasks** do you want to work through?");
  assert.deepStrictEqual(s.children.map((c) => c.tag), ["strong", "span"]);
});

test("bold keeps the theme's own colour", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const rule = css.match(/\.gtd-clarify-question strong \{([^}]*)\}/)[1];
  assert.match(rule, /font-weight/);
  assert.ok(!/color:/.test(rule), "so it looks the way bold looks in your notes");
});

test("the header names the review while its first question is asked", () => {
  assert.match(main, /this\.reviewMode = mode;\s*\n\s*\/\/[^\n]*\n\s*this\.headerEl\.setText\(mode === "process" \? "Process" : "Organise"\);/);
});
