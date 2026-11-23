/**
 * A suggested context, from the verb a next action starts with.
 *
 * "Call Sam" is done at a phone; "Buy milk" when you are out. The context the verb points
 * to is marked "suggested" on its button — not chosen for you, and not moved, so every
 * answer keeps its number. It is matched against the names of your own contexts, so it
 * only ever suggests one you have.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { suggestContext, organiseLine, DEFAULT_SETTINGS, numberKeysEnabled, isTypingTarget, keyAnswer, MAX_NUMBER_KEYS } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "data.json"), "utf8"));
const MINE = EXAMPLE.dimensions.find((d) => d.id === "context"); // Home, Outings, Phone, Agenda
const DEFAULTS = DEFAULT_SETTINGS.dimensions.find((d) => d.id === "context"); // Home, Office, Errands
const S = DEFAULT_SETTINGS;

for (const [task, dim, expected] of [
  ["- [ ] Call Sam about the boiler", MINE, "val_q9w2ls"],
  ["- [ ] Need to ring the garage", MINE, "val_q9w2ls"],
  ["- [ ] Buy milk", MINE, "errands"],
  ["- [ ] Pick up the parcel from the depot", MINE, "errands"],
  ["- [ ] Ask Sam about the deposit", MINE, "val_vqrhib"],
  ["- [ ] Tidy the spare room", MINE, "home"],
  ["- [ ] Print the tickets", DEFAULTS, "office"],
  ["- [ ] Return the library books", DEFAULTS, "errands"]
]) {
  test(`“${task.slice(6)}” suggests ${dim.values.find((v) => v.id === expected).label}`, () => {
    assert.strictEqual(suggestContext(dim, task, S), expected);
  });
}

test("no suggestion without a context of that kind, or a verb that says one", () => {
  assert.strictEqual(suggestContext(MINE, "- [ ] Email Priya the draft", S), null, "no computer context here");
  assert.strictEqual(suggestContext(MINE, "- [ ] Plan the party", S), null, "planning happens anywhere");
  assert.strictEqual(suggestContext(MINE, "- [ ] Pick a date for the party", S), null, "“pick” alone is not “pick up”");
  assert.strictEqual(suggestContext(MINE, "- [ ] Recall the boiler model", S), null, "the verb, not part of a word");
});

/* ------------------------------ in Organise ------------------------------ */

async function asked(raw, dims) {
  const vault = makeVault({ "T.md": raw });
  const seen = [];
  const ctx = {
    app: makeApp(vault),
    settings: Object.assign({}, DEFAULT_SETTINGS, { dimensions: dims, enablePriorityStep: false, enableCustomTagStep: false }),
    tasks: {},
    prompter: { optionalChoice: async (q, opts) => { seen.push({ q, opts }); return null; }, text: async () => "" }
  };
  await organiseLine(ctx, new TFile("T.md"), 0, raw);
  return seen;
}

test("marked on its button, with every answer where it always is", async () => {
  const [contextQ] = await asked("- [ ] Call Sam", [MINE]);
  assert.deepStrictEqual(contextQ.opts.map((o) => o.value), MINE.values.map((v) => v.id), "same order");
  assert.deepStrictEqual(contextQ.opts.filter((o) => o.suggested).map((o) => o.label), ["Phone"]);
});

test("only for the context: other dimensions are asked as they were", async () => {
  const seen = await asked("- [ ] Call Sam", EXAMPLE.dimensions);
  assert.ok(seen.slice(1).every((s) => s.opts.every((o) => !("suggested" in o))));
});

/* ------------------------------ on the button ------------------------------ */

function el(tag, opts = {}) {
  const node = {
    tag, cls: opts.cls || "", text: opts.text || "", children: [], attrs: {}, handlers: {},
    createEl(t, o = {}) { const c = el(t, o); this.children.push(c); return c; },
    createSpan(o = {}) { return this.createEl("span", o); },
    createDiv(o = {}) { return this.createEl("div", o); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(e, f) { this.handlers[e] = f; },
    get classList() { return { toggle() {}, contains: () => false }; },
    empty() { this.children = []; },
    focus() {}
  };
  return node;
}
const all = (n) => [n, ...n.children.flatMap(all)];

for (const keys of [true, false]) {
  test(`shown as “suggested” on the button, and read out with it (number keys ${keys ? "on" : "off"})`, () => {
    const pick = (name) => {
      const body = main.slice(main.indexOf(`  ${name}(`));
      return body.slice(0, body.indexOf("\n  }\n") + 4);
    };
    const methods = ["renderChoice", "renderQuestion", "settlePrompt", "optionalChoice"].map(pick).join("\n");
    const deps = { guidanceMode: L.guidanceMode, appendRich: L.appendRich, plainText: L.plainText, numberKeysEnabled, isTypingTarget, keyAnswer, MAX_NUMBER_KEYS };
    const Klass = new Function(...Object.keys(deps), `return class { ${methods} }`)(...Object.values(deps));
    const p = new Klass();
    p.bodyEl = el("div");
    p.plugin = { settings: Object.assign({}, DEFAULT_SETTINGS, { numberKeys: keys, numberKeysUsed: true }) };
    p.revealSelf = () => {};
    p.optionalChoice("**Context**", [{ label: "Home", value: "home" }, { label: "Phone", value: "phone", suggested: true }]);
    const buttons = all(p.bodyEl).filter((n) => n.tag === "button" && !String(n.cls).includes("skip"));
    const tags = buttons.map((b) => all(b).filter((n) => n.cls === "gtd-clarify-suggested").map((n) => n.text));
    assert.deepStrictEqual(tags, [[], ["suggested"]]);
    // Read out with it because the word is on the button, not through an aria-label (a tooltip).
    assert.ok(!("aria-label" in buttons[1].attrs), "no tooltip repeating the button");
  });
}
