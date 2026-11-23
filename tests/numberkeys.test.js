/**
 * Number keys pick answers: 1–9 for the answer with that number, 0 to skip an optional step.
 *
 * The risks are the quiet ones: a digit typed into a note being taken as an answer, a key
 * answering a question that has already gone, and the numbers showing where there are no
 * keys. Driven against the real renderChoice and key handling with a minimal DOM.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { keyAnswer, isTypingTarget, numberKeysEnabled, MAX_NUMBER_KEYS, DEFAULT_SETTINGS, obsidian } = L;

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

function el(tag, opts = {}) {
  const node = {
    tag, cls: opts.cls || "", text: opts.text || "", children: [], attrs: {}, handlers: {}, style: {},
    createEl(t, o = {}) { const c = el(t, o); this.children.push(c); return c; },
    createSpan(o = {}) { return this.createEl("span", o); },
    createDiv(o = {}) { return this.createEl("div", o); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(e, f) { this.handlers[e] = f; },
    get classList() { return { toggle() {}, contains: () => false }; },
    empty() { this.children = []; },
    focus() { node.focused = true; }
  };
  return node;
}
const all = (n) => [n, ...n.children.flatMap(all)];
const textOf = (n) => n.text + n.children.map(textOf).join("");

/** The real prompt methods, on a pane with a fake DOM. */
function pane(settings = {}) {
  const pick = (name) => {
    const at = main.indexOf(`  ${name}(`);
    const body = main.slice(at);
    return body.slice(0, body.indexOf("\n  }\n") + 4);
  };
  const methods = ["renderChoice", "renderQuestion", "settlePrompt", "rejectPending", "onAnswerKey", "choice", "optionalChoice"].map(pick).join("\n");
  const deps = { guidanceMode: L.guidanceMode, appendRich: L.appendRich, plainText: L.plainText, numberKeysEnabled,
    isTypingTarget, keyAnswer, MAX_NUMBER_KEYS };
  const Klass = new Function(...Object.keys(deps), `return class { ${methods} }`)(...Object.values(deps));
  const p = new Klass();
  p.bodyEl = el("div");
  p.saved = 0;
  p.plugin = { settings: Object.assign({}, DEFAULT_SETTINGS, settings), saveSettings: async () => { p.saved++; } };
  p.revealSelf = () => {};
  return p;
}
const buttons = (p) => all(p.bodyEl).filter((n) => n.tag === "button");
const key = (k, extra = {}) => Object.assign({ key: k, target: { tagName: "DIV" }, preventDefault() {}, stopPropagation() {} }, extra);

/* ------------------------------- what a key answers ------------------------------- */

test("a digit answers with that answer, and 0 skips", () => {
  const pending = { picks: [() => "a", () => "b"], skip: () => "skip" };
  assert.strictEqual(keyAnswer(key("1"), pending)(), "a");
  assert.strictEqual(keyAnswer(key("2"), pending)(), "b");
  assert.strictEqual(keyAnswer(key("0"), pending)(), "skip");
});

test("a key with no answer behind it does nothing", () => {
  const pending = { picks: [() => "a"], skip: null };
  assert.strictEqual(keyAnswer(key("2"), pending), null, "no second answer");
  assert.strictEqual(keyAnswer(key("0"), pending), null, "nothing to skip");
  assert.strictEqual(keyAnswer(key("a"), pending), null);
  assert.strictEqual(keyAnswer(key("1"), null), null, "nothing waiting");
});

test("never while typing — in a note, a field, or a dialogue", () => {
  const pending = { picks: [() => "a"] };
  assert.strictEqual(keyAnswer(key("1", { target: { tagName: "INPUT" } }), pending), null);
  assert.strictEqual(keyAnswer(key("1", { target: { tagName: "TEXTAREA" } }), pending), null);
  assert.strictEqual(keyAnswer(key("1", { target: { tagName: "DIV", isContentEditable: true } }), pending), null);
  const inEditor = { tagName: "SPAN", closest: (sel) => (sel.includes(".cm-editor") ? {} : null) };
  assert.strictEqual(keyAnswer(key("1", { target: inEditor }), pending), null, "a digit typed into the note stays there");
  const doc = { querySelector: (sel) => (sel === ".modal-container" ? {} : null) };
  assert.strictEqual(keyAnswer(key("1"), pending, doc), null, "a Tasks dialogue or picker is open");
});

test("shortcuts and held keys are left alone", () => {
  const pending = { picks: [() => "a"] };
  for (const mod of ["ctrlKey", "metaKey", "altKey", "repeat"]) {
    assert.strictEqual(keyAnswer(key("1", { [mod]: true }), pending), null, mod);
  }
});

test("typing targets are recognised", () => {
  assert.strictEqual(isTypingTarget(null), false);
  assert.strictEqual(isTypingTarget({ tagName: "BUTTON" }), false);
  assert.strictEqual(isTypingTarget({ tagName: "select" }), true);
});

/* ---------------------------------- on screen ---------------------------------- */

/** What a screen reader names the button: its words, minus anything hidden from it. */
const spoken = (n) => (n.attrs["aria-hidden"] === "true" ? "" : n.text + n.children.map(spoken).join(""));

test("each answer shows its number, with no tooltip repeating it", () => {
  const p = pane();
  p.choice("**Actionable** this week?", [{ label: "Yes", value: true }, { label: "No", value: false }]);
  const [yes, no] = buttons(p);
  assert.strictEqual(textOf(yes), "1Yes");
  assert.strictEqual(no.attrs["aria-keyshortcuts"], "2");
  // Obsidian shows an aria-label as a hover tooltip, and a title as a second one.
  assert.ok(!("aria-label" in yes.attrs) && !("title" in yes.attrs), "no tooltip saying what the button says");
  assert.strictEqual(spoken(yes), "Yes", "read aloud without the number");
});

test("only the first nine are numbered", () => {
  const p = pane();
  const opts = Array.from({ length: 11 }, (_, i) => ({ label: `Note ${i + 1}`, value: i }));
  p.choice("**Which heading**?", opts);
  const b = buttons(p);
  assert.strictEqual(b.filter((x) => x.attrs["aria-keyshortcuts"]).length, MAX_NUMBER_KEYS);
  assert.strictEqual(textOf(b[10]), "Note 11");
  assert.ok(b.every((x) => !("aria-label" in x.attrs) && !("title" in x.attrs)), "no tooltips on any answer");
});

test("pressing a number answers, once", async () => {
  const p = pane();
  const answered = p.choice("**Actionable** this week?", [{ label: "Yes", value: true }, { label: "No", value: false }]);
  p.onAnswerKey(key("2"));
  assert.strictEqual(await answered, false);
  assert.strictEqual(p.pendingKeys, null, "settled: a second press has nothing to answer");
  p.onAnswerKey(key("1"));
});

test("0 skips an optional step, from a quiet button of its own", async () => {
  const p = pane();
  const answered = p.optionalChoice("Physical **context**", [{ label: "Home", value: "home" }]);
  const skip = buttons(p)[0];
  assert.ok(skip.cls.includes("gtd-clarify-skip"));
  assert.strictEqual(textOf(skip), "0Skip step");
  assert.strictEqual(textOf(buttons(p)[1]), "1Home", "the answers are numbered from 1 after it");
  p.onAnswerKey(key("0"));
  assert.strictEqual(await answered, null);
});

test("Restart, Skip task and Exit also end what a key could answer", () => {
  const p = pane();
  p.choice("**Actionable** this week?", [{ label: "Yes", value: true }]).catch(() => {});
  p.rejectPending(new Error("restart"));
  assert.strictEqual(p.pendingKeys, null);
});

test("the pane takes focus, so the key reaches it rather than the note", () => {
  const p = pane();
  p.choice("**Actionable** this week?", [{ label: "Yes", value: true }]);
  assert.strictEqual(p.bodyEl.focused, true);
  assert.match(main, /this\.bodyEl\.setAttribute\("tabindex", "-1"\)/);
  assert.match(main, /this\.registerDomEvent\(document, "keydown", \(e\) => this\.onAnswerKey\(e\)\)/);
});

/* ------------------------------ the setting and hint ------------------------------ */

test("switched off: no numbers, no focus, no keys", async () => {
  const p = pane({ numberKeys: false });
  const answered = p.choice("**Actionable** this week?", [{ label: "Yes", value: true }, { label: "No", value: false }]);
  assert.strictEqual(textOf(buttons(p)[0]), "Yes");
  assert.ok(!buttons(p)[0].attrs["aria-keyshortcuts"]);
  assert.ok(!p.bodyEl.focused);
  p.onAnswerKey(key("1"));
  assert.strictEqual(p.pendingKeys, null);
  buttons(p)[1].handlers.click();
  assert.strictEqual(await answered, false, "clicking still answers");
});

test("never on a phone", () => {
  const before = obsidian.Platform;
  try {
    obsidian.Platform = { isPhone: true };
    assert.strictEqual(numberKeysEnabled({ numberKeys: true }), false);
    obsidian.Platform = { isPhone: false, isTablet: true };
    assert.strictEqual(numberKeysEnabled({ numberKeys: true }), true, "a tablet may have a keyboard");
  } finally {
    obsidian.Platform = before;
  }
  assert.strictEqual(numberKeysEnabled({}), true, "on unless switched off");
  assert.strictEqual(numberKeysEnabled({ numberKeys: false }), false);
});

test("a one-line hint on the first question, until a key has been used", async () => {
  const p = pane();
  p.firstQuestionOfReview = true;
  const first = p.choice("**Which tasks** do you want to work through?", [{ label: "This **note**", value: "f" }]);
  assert.ok(all(p.bodyEl).some((n) => n.cls === "gtd-clarify-note" && /press 1–9/.test(n.text)));
  p.choice("**Actionable** this week?", [{ label: "Yes", value: true }]);
  assert.ok(!all(p.bodyEl).some((n) => n.cls === "gtd-clarify-note"), "only on the first");

  p.firstQuestionOfReview = true;
  p.choice("**Which tasks** do you want to work through?", [{ label: "This **note**", value: "f" }]);
  p.onAnswerKey(key("1"));
  assert.strictEqual(p.plugin.settings.numberKeysUsed, true);
  assert.strictEqual(p.saved, 1, "remembered");
  p.firstQuestionOfReview = true;
  p.choice("**Which tasks** do you want to work through?", [{ label: "This **note**", value: "f" }]);
  assert.ok(!all(p.bodyEl).some((n) => n.cls === "gtd-clarify-note"), "not once you know");
  void first;
});

test("a question's own note wins over the hint", () => {
  const p = pane();
  p.firstQuestionOfReview = true;
  p.choice("“Sort out trip” **may not be a next action** yet.", [{ label: "**Rewrite** it", value: "r" }], undefined, "‘sort out’ names an area, not an action");
  const note = all(p.bodyEl).find((n) => n.cls === "gtd-clarify-note");
  assert.match(note.text, /sort out/);
});

test("on by default, with a setting that says what it does", () => {
  assert.strictEqual(DEFAULT_SETTINGS.numberKeys, true);
  assert.strictEqual(DEFAULT_SETTINGS.numberKeysUsed, false);
  assert.match(main, /"Number keys pick answers",\s*\n\s*"On a keyboard, press 1\\u20139 to choose an answer/);
  assert.match(main, /this\.firstQuestionOfReview = true;/, "each review starts with the hint available");
});

test("Skip step is clicked as well as pressed, with or without number keys", async () => {
  for (const numberKeys of [true, false]) {
    const p = pane({ numberKeys });
    const answered = p.optionalChoice("**Priority**", [{ label: "High", value: "high" }]);
    const skip = buttons(p).find((b) => b.cls.includes("gtd-clarify-skip"));
    assert.ok(skip, "offered");
    assert.strictEqual(spoken(skip), "Skip step", "read aloud as shown, without the 0");
    assert.ok(!("aria-label" in skip.attrs) && !("title" in skip.attrs), "no tooltip repeating it");
    skip.handlers.click();
    assert.strictEqual(await answered, null, `numberKeys ${numberKeys}`);
  }
});

test("a numbered answer's label sits in the middle of the button, not at its top", () => {
  // Obsidian fixes a button's height; aligning to the baseline put the label at the top of
  // that box, and on a dark theme the number's border vanished into the button.
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  const rule = css.match(/\.gtd-clarify-btn\.gtd-clarify-numbered \{([^}]*)\}/);
  assert.ok(rule, "styled");
  assert.match(rule[1], /align-items: center/);
  assert.match(rule[1], /height: auto/, "and a long label can wrap");
  assert.ok(!/align-items: baseline/.test(rule[1]));
  const key = css.match(/^\.gtd-clarify-key \{([^}]*)\}/m)[1];
  assert.match(key, /background: var\(--background-modifier-hover\)/, "visible on any button colour");
  assert.match(css, /\.gtd-clarify-btn \{[^}]*justify-content: flex-start/, "answers start at the left");
});
