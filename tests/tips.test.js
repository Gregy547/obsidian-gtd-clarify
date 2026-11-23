/**
 * How GTD tips are displayed: always, on demand behind an info button, or not at all.
 *
 * Driven against the real renderQuestion with a minimal DOM, because the behaviour that
 * matters — what is visible, and what a tap does — lives in element state, not in strings.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { guidanceMode, GUIDANCE_MODES, DEFAULT_SETTINGS, appendRich } = require("./helpers/load.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

/** A small element tree that supports exactly what renderQuestion uses. */
function el(tag, cls) {
  const node = {
    tag, cls: cls || "", text: "", children: [], style: { display: "" },
    attrs: {}, handlers: {}, classes: new Set((cls || "").split(" ").filter(Boolean)),
    createEl(t, opts = {}) { const c = el(t, opts.cls); if (opts.text) c.text = opts.text; this.children.push(c); return c; },
    createSpan(opts = {}) { return this.createEl("span", opts); },
    createDiv(opts = {}) { return this.createEl("div", opts); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(e, f) { this.handlers[e] = f; },
    get classList() { const s = this.classes; return { toggle: (c, on) => (on ? s.add(c) : s.delete(c)), contains: (c) => s.has(c) }; },
    empty() { this.children = []; }
  };
  return node;
}

function render(mode, guidance = "A good answer looks like this.") {
  const src = main.slice(main.indexOf("  renderQuestion(question, guidance, note) {"));
  const body = src.slice(0, src.indexOf("\n  }") + 4);
  const Klass = new Function("guidanceMode", "appendRich", `return class { ${body} }`)(guidanceMode, appendRich);
  const pane = new Klass();
  pane.bodyEl = el("div");
  pane.plugin = { settings: mode === undefined ? {} : { guidanceDisplay: mode } };
  const q = pane.renderQuestion("Is this a clear next action?", guidance);
  const tip = pane.bodyEl.children.find((c) => c.cls === "gtd-clarify-guidance");
  const info = q.children.find((c) => c.cls === "gtd-clarify-info");
  return { q, tip, info, body: pane.bodyEl };
}
// Collapsed by a class, not an inline style, so a theme can restyle it.
const visible = (node) => !!node && !node.classes.has("gtd-clarify-collapsed");
const click = (node) => node.handlers.click({ preventDefault() {}, stopPropagation() {} });

test("on demand: the tip is hidden behind an info button", () => {
  const { tip, info } = render("onDemand");
  assert.ok(info, "an info button must be offered");
  assert.ok(tip, "the tip is present, just not shown");
  assert.strictEqual(visible(tip), false);
  assert.strictEqual(info.attrs["aria-expanded"], "false");
});

test("on demand: tapping the button reveals the tip, tapping again hides it", () => {
  const { tip, info } = render("onDemand");
  click(info);
  assert.strictEqual(visible(tip), true);
  assert.strictEqual(info.attrs["aria-expanded"], "true");
  assert.strictEqual(info.attrs["aria-label"], "Hide tip");
  click(info);
  assert.strictEqual(visible(tip), false);
  assert.strictEqual(info.attrs["aria-label"], "Show tip");
});

test("on demand: a tap does not reach anything behind the button", () => {
  const { info } = render("onDemand");
  let prevented = false, stopped = false;
  info.handlers.click({ preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
  assert.ok(prevented && stopped);
});

test("on demand: the button sits on the question line, not on its own row", () => {
  const { q, info } = render("onDemand");
  assert.ok(q.children.includes(info), "it must be a child of the question");
});

test("always: the tip is shown in full and there is no button", () => {
  const { tip, info } = render("always");
  assert.strictEqual(visible(tip), true);
  assert.strictEqual(info, undefined);
});

test("off: no tip and no button, but the question remains", () => {
  const { q, tip, info } = render("off");
  assert.strictEqual(tip, undefined);
  assert.strictEqual(info, undefined);
  assert.strictEqual(q.children[0].text, "Is this a clear next action?",
    "the question is what is being asked, not commentary — it always shows");
});

test("a question with no tip shows no button in any mode", () => {
  for (const mode of GUIDANCE_MODES) {
    const { info, tip } = render(mode, "");
    assert.strictEqual(info, undefined, mode);
    assert.strictEqual(tip, undefined, mode);
  }
});

test("each question starts collapsed, even after the previous one was opened", () => {
  // A reminder you reach for, not a panel that stays open and quietly becomes "always".
  const first = render("onDemand");
  click(first.info);
  const second = render("onDemand");
  assert.strictEqual(visible(second.tip), false);
});

test("on demand is the default, including for settings written before this existed", () => {
  assert.strictEqual(DEFAULT_SETTINGS.guidanceDisplay, "onDemand");
  assert.strictEqual(guidanceMode({}), "onDemand");
  assert.strictEqual(guidanceMode(undefined), "onDemand");
  assert.strictEqual(guidanceMode({ guidanceDisplay: "nonsense" }), "onDemand");
});

test("every mode is offered in settings", () => {
  for (const mode of GUIDANCE_MODES) {
    assert.match(main, new RegExp(`addOption\\("${mode}"`), mode);
  }
});

test("the info button has a usable tap target on mobile", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /body\.is-mobile \.gtd-clarify-question \.gtd-clarify-info \{[^}]*padding/s);
});

/* ------------------------- notes: always shown, unlike tips ------------------------- */

function renderNote(mode, note, guidance = "General advice.") {
  const src = main.slice(main.indexOf("  renderQuestion(question, guidance, note) {"));
  const body = src.slice(0, src.indexOf("\n  }") + 4);
  const Klass = new Function("guidanceMode", "appendRich", `return class { ${body} }`)(guidanceMode, appendRich);
  const pane = new Klass();
  pane.bodyEl = el("div");
  pane.plugin = { settings: { guidanceDisplay: mode } };
  pane.renderQuestion("“Sort out trip” may not be a next action yet.", guidance, note);
  return pane.bodyEl.children;
}

test("why the wording was flagged is shown in every tips mode", () => {
  for (const mode of GUIDANCE_MODES) {
    const shown = renderNote(mode, "“sort out” describes a project or an intention.");
    const note = shown.find((c) => c.cls === "gtd-clarify-note");
    assert.ok(note, mode);
    assert.ok(visible(note), `${mode}: never hidden — it is about this item, not general advice`);
  }
});

test("the note comes straight after the question, before any tip", () => {
  const shown = renderNote("always", "Because.");
  assert.deepStrictEqual(shown.map((c) => c.cls), ["gtd-clarify-question", "gtd-clarify-note", "gtd-clarify-guidance"]);
});

test("no note, no note element", () => {
  assert.ok(!renderNote("always", undefined).some((c) => c.cls === "gtd-clarify-note"));
});

/* ------------------------------- hover tooltips -------------------------------
 * Obsidian shows any aria-label as a hover tooltip, and a title as a second, browser one.
 * A tooltip that says what is already on screen is noise, so neither is set where it would. */

test("the info button has one tooltip, and it follows the tip open and shut", () => {
  const { info } = render("onDemand");
  assert.ok(!("title" in info.attrs), "a title would stack a second tooltip, stuck on 'Show tip'");
  click(info);
  assert.strictEqual(info.attrs["aria-label"], "Hide tip");
});

test("each question's words carry an id of their own, for a field to name as its label", () => {
  const src = main.slice(main.indexOf("  renderQuestion(question, guidance, note) {"));
  const body = src.slice(0, src.indexOf("\n  }") + 4);
  const Klass = new Function("guidanceMode", "appendRich", `return class { ${body} }`)(guidanceMode, appendRich);
  const pane = new Klass();
  pane.bodyEl = el("div");
  pane.plugin = { settings: {} };
  const first = pane.renderQuestion("What's on your mind?");
  const firstId = pane.questionId;
  const second = pane.renderQuestion("What about **work**?");
  assert.strictEqual(first.children[0].attrs.id, firstId);
  assert.strictEqual(second.children[0].attrs.id, pane.questionId);
  assert.notStrictEqual(firstId, pane.questionId, "ids are not reused within a pane");
  const other = new Klass();
  other.bodyEl = el("div");
  other.plugin = { settings: {} };
  other.renderQuestion("What's on your mind?");
  assert.notStrictEqual(other.questionId, firstId, "two panes open at once don't share ids");
});

test("the Sweep field is labelled by the question above it, not a tooltip repeating it", () => {
  const at = main.indexOf('input.setAttribute("enterkeyhint", "enter");');
  const near = main.slice(at, at + 600);
  assert.match(near, /input\.setAttribute\("aria-labelledby", this\.questionId\)/);
  assert.doesNotMatch(near, /input\.setAttribute\("aria-label"/);
});

test("no answer button sets a title or an aria-label", () => {
  const src = main.slice(main.indexOf("  renderChoice("));
  const body = src.slice(0, src.indexOf("\n  }\n"));
  assert.doesNotMatch(body, /setAttribute\("(title|aria-label)"/);
  assert.doesNotMatch(body, /\.title = /);
});
