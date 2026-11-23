/**
 * Deferring to a date said in words — "next Wednesday", "3 Nov" — or picked from a calendar.
 *
 * The date read is shown before it is used, so the tests pin both what each phrase means
 * and that nothing unreadable or in the past can be accepted.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { parsePlainDate, formatLongDate, pickTickleDate, askForDate } = L;
const { plain } = require("./helpers/plain.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const TUE = "2026-10-20"; // a Tuesday

/* ---------------------------------- the words ---------------------------------- */

test("a weekday is the next one after today", () => {
  assert.strictEqual(parsePlainDate("wednesday", TUE), "2026-10-21");
  assert.strictEqual(parsePlainDate("Wed", TUE), "2026-10-21");
  assert.strictEqual(parsePlainDate("this wed", TUE), "2026-10-21");
  assert.strictEqual(parsePlainDate("on Wednesday", TUE), "2026-10-21");
  assert.strictEqual(parsePlainDate("weds", TUE), "2026-10-21");
  assert.strictEqual(parsePlainDate("tuesday", TUE), "2026-10-27", "today's weekday means next week's");
});

test("“next Wednesday” is the Wednesday of next week", () => {
  // Said on a Tuesday, that is eight days away, not tomorrow.
  assert.strictEqual(parsePlainDate("next wednesday", TUE), "2026-10-28");
  assert.strictEqual(parsePlainDate("next mon", TUE), "2026-10-26");
  assert.strictEqual(parsePlainDate("next sunday", "2026-10-25"), "2026-11-01", "weeks start on Monday");
  assert.strictEqual(parsePlainDate("next weekend", TUE), "2026-10-31");
  assert.strictEqual(parsePlainDate("weekend", TUE), "2026-10-24");
});

test("a day and month is the next time it comes round", () => {
  assert.strictEqual(parsePlainDate("3 nov", TUE), "2026-11-03");
  assert.strictEqual(parsePlainDate("3rd November", TUE), "2026-11-03");
  assert.strictEqual(parsePlainDate("the 3rd of November", TUE), "2026-11-03");
  assert.strictEqual(parsePlainDate("Nov 3", TUE), "2026-11-03");
  assert.strictEqual(parsePlainDate("sept 4", TUE), "2027-09-04", "already past this year");
  assert.strictEqual(parsePlainDate("20 oct", TUE), "2027-10-20", "today is not the future");
  assert.strictEqual(parsePlainDate("Nov 3rd, 2027", TUE), "2027-11-03");
});

test("spans of time", () => {
  assert.strictEqual(parsePlainDate("in 10 days", TUE), "2026-10-30");
  assert.strictEqual(parsePlainDate("in two weeks", TUE), "2026-11-03");
  assert.strictEqual(parsePlainDate("2 weeks", TUE), "2026-11-03");
  assert.strictEqual(parsePlainDate("fortnight", TUE), "2026-11-03");
  assert.strictEqual(parsePlainDate("a month", TUE), "2026-11-20");
  assert.strictEqual(parsePlainDate("in 3 months", TUE), "2027-01-20");
  assert.strictEqual(parsePlainDate("next month", TUE), "2026-11-20");
  assert.strictEqual(parsePlainDate("tomorrow", TUE), "2026-10-21");
  assert.strictEqual(parsePlainDate("day after tomorrow", TUE), "2026-10-22");
  assert.strictEqual(parsePlainDate("end of month", TUE), "2026-10-31");
  assert.strictEqual(parsePlainDate("end of month", "2026-10-31"), "2026-11-30");
  assert.strictEqual(parsePlainDate("end of month", "2026-12-31"), "2027-01-31");
});

test("the old form still works, and is checked", () => {
  assert.strictEqual(parsePlainDate("2026-11-05", TUE), "2026-11-05");
  assert.strictEqual(parsePlainDate("2026-02-30", TUE), null, "not a real date");
  assert.strictEqual(parsePlainDate("31 feb", TUE), null);
});

test("anything it can't read is reported, never guessed", () => {
  for (const w of ["", "blah", "next blah", "in zero days", "soon", "we", "3 smarch"]) {
    assert.strictEqual(parsePlainDate(w, TUE), null, w);
  }
});

test("the preview reads as a date, with its weekday", () => {
  assert.strictEqual(formatLongDate("2026-10-28"), "Wednesday 28 October 2026");
  assert.strictEqual(formatLongDate("2027-01-01"), "Friday 1 January 2027");
});

/* --------------------------------- asking for one --------------------------------- */

function prompter(script) {
  const asked = [];
  return {
    asked,
    choice: async (q, opts) => { asked.push(plain(q)); return script.choice.shift(); },
    date: script.date ? async (q, opts) => { asked.push(plain(q)); return script.date.shift()(opts); } : undefined,
    text: async (q) => { asked.push(plain(q)); return script.text.shift(); },
    info: (m) => asked.push(`info: ${m}`)
  };
}

test("a listed date is used straight away", async () => {
  const p = prompter({ choice: ["2026-10-27"] });
  assert.strictEqual(await pickTickleDate({ prompter: p }), "2026-10-27");
  assert.deepStrictEqual(p.asked, ["When should this come back?"]);
});

test("“Another date…” asks in words, and the date read is the date used", async () => {
  const p = prompter({ choice: ["__pick__"], date: [(opts) => opts.parse("next wednesday")] });
  const when = await pickTickleDate({ prompter: p });
  assert.strictEqual(when, parsePlainDate("next wednesday", L.todayString ? L.todayString() : when));
  assert.deepStrictEqual(p.asked, ["When should this come back?", "Bring it back on…"]);
});

test("Back from the date goes back to the list of dates, not further", async () => {
  const p = prompter({ choice: ["__pick__", "2026-10-27"], date: [() => null] });
  assert.strictEqual(await pickTickleDate({ prompter: p }), "2026-10-27");
  assert.deepStrictEqual(p.asked, ["When should this come back?", "Bring it back on…", "When should this come back?"]);
});

test("the picker is told what today is, so the past can't be chosen", async () => {
  let seen = null;
  const p = prompter({ choice: [], date: [(opts) => { seen = opts; return null; }] });
  await askForDate({ prompter: p }, TUE);
  assert.strictEqual(seen.after, TUE);
  assert.strictEqual(seen.parse("wednesday"), "2026-10-21");
  assert.match(seen.placeholder, /next Wednesday/);
});

test("without a picker, the same words are typed, and the past is refused", async () => {
  const p = prompter({ text: ["yesterday", "next wednesday"] });
  assert.strictEqual(await askForDate({ prompter: p }, TUE), "2026-10-28");
  assert.ok(p.asked.some((a) => /isn’t in the future/.test(a)));
});

test("the review pane has the picker, with a preview and a calendar", () => {
  const at = main.indexOf("  date(question, opts = {}) {");
  assert.ok(at > -1);
  const body = main.slice(at, main.indexOf("\n  }\n", at));
  assert.match(body, /type: "date"/, "the browser's own calendar");
  assert.match(body, /formatLongDate\(iso\)/, "the date read is shown");
  assert.match(body, /if \(after && iso <= after\)/, "nothing in the past");
  assert.match(body, /if \(!chosen\) return;/, "nothing unread can be used");
  assert.match(body, /resolve\(null\)/, "Back");
});

/* ------------------------------ the picker itself ------------------------------ */

function el(tag, opts = {}) {
  const node = {
    tag, cls: opts.cls || "", text: opts.text || "", type: opts.type, children: [], attrs: {}, handlers: {},
    value: "", disabled: false, classes: new Set(), selectionStart: 1, selectionEnd: 1,
    createEl(t, o = {}) { const c = el(t, o); this.children.push(c); return c; },
    createSpan(o = {}) { return this.createEl("span", o); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(e, f) { this.handlers[e] = f; },
    setText(t) { this.text = t; },
    toggleClass(c, on) { on ? this.classes.add(c) : this.classes.delete(c); },
    get classList() { return { toggle() {} }; },
    setSelectionRange() {},
    empty() { this.children = []; },
    focus() {}
  };
  return node;
}
const all = (n) => [n, ...n.children.flatMap(all)];

function picker() {
  const at = main.indexOf("  date(question, opts = {}) {");
  const body = main.slice(at, main.indexOf("\n  }\n", at) + 4);
  const Klass = new Function("shiftDate", "formatLongDate", `return class { ${body} }`)(L.shiftDate || ((d, n) => {
    const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
  }), formatLongDate);
  const p = new Klass();
  p.bodyEl = el("div");
  p.revealSelf = () => {};
  p.renderQuestion = () => {};
  p.settlePrompt = () => {};
  window.requestAnimationFrame = (f) => f();
  const answer = p.date("Bring it back **on**…", { after: TUE, parse: (t) => parsePlainDate(t, TUE) });
  const nodes = all(p.bodyEl);
  const words = nodes.find((n) => n.tag === "input" && n.type === "text");
  const calendar = nodes.find((n) => n.tag === "input" && n.type === "date");
  const preview = nodes.find((n) => n.cls === "gtd-clarify-datepreview");
  const [ok, back] = nodes.filter((n) => n.tag === "button");
  const type = (t) => { words.value = t; words.handlers.input(); };
  return { answer, words, calendar, preview, ok, back, type };
}

test("typing shows the date it reads, and only then can it be used", async () => {
  const d = picker();
  assert.strictEqual(d.ok.disabled, true, "nothing typed yet");
  d.type("next wed");
  assert.strictEqual(d.preview.text, "→ Wednesday 28 October 2026");
  assert.strictEqual(d.ok.disabled, false);
  assert.strictEqual(d.calendar.value, "2026-10-28", "the calendar follows");
  d.ok.handlers.click();
  assert.strictEqual(await d.answer, "2026-10-28");
});

test("unreadable or past dates say why, and can't be used", () => {
  const d = picker();
  d.type("blah");
  assert.match(d.preview.text, /Not a date I can read/);
  assert.ok(d.preview.classes.has("is-problem"));
  assert.strictEqual(d.ok.disabled, true);
  d.type("yesterday");
  assert.match(d.preview.text, /isn’t in the future/);
  assert.strictEqual(d.ok.disabled, true);
  d.words.handlers.keydown({ key: "Enter", preventDefault() {} });
});

test("Enter uses the date; the calendar can be used instead; Back is null", async () => {
  const a = picker();
  a.type("3 nov");
  a.words.handlers.keydown({ key: "Enter", preventDefault() {} });
  assert.strictEqual(await a.answer, "2026-11-03");

  const b = picker();
  assert.strictEqual(b.calendar.min, "2026-10-21", "the calendar starts tomorrow");
  b.calendar.value = "2026-12-24";
  b.calendar.handlers.change();
  assert.strictEqual(b.preview.text, "→ Thursday 24 December 2026");
  b.ok.handlers.click();
  assert.strictEqual(await b.answer, "2026-12-24");

  const c = picker();
  c.back.handlers.click();
  assert.strictEqual(await c.answer, null);
});
