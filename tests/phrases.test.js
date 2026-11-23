/**
 * The vague-action check: editable phrase lists, and filler skipped before checking.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { assessNextAction, VAGUE_OPENERS, VAGUE_OPENERS_OPTIONAL, FILLER_PREFIXES, parsePhraseList,
  defaultVagueText, defaultFillerText, vaguePhrases, fillerPhrases, stripFiller, normaliseForMatch,
  DEFAULT_SETTINGS } = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const vague = (text, settings = DEFAULT_SETTINGS) => assessNextAction(`- [ ] ${text}`, settings).vague;

/* ------------------------------ filler ------------------------------ */

test("filler before the verb no longer hides a vague action", () => {
  for (const t of ["Need to sort out the trip", "Maybe look into CRMs", "TODO: deal with car",
                   "Remember to follow up with Sam", "Urgent: sort out invoice", "Have to plan the offsite"]) {
    assert.strictEqual(vague(t), true, t);
  }
});

test("filler before a clear action is not flagged", () => {
  // Flagging "need to" itself would be the false alarm that teaches people to tap past.
  for (const t of ["Need to call Sam", "Remember to email the brief", "TODO: book venue", "Maybe buy milk"]) {
    assert.strictEqual(vague(t), false, t);
  }
});

test("several fillers in a row are all skipped", () => {
  assert.strictEqual(stripFiller("todo: maybe look into crms", fillerPhrases(DEFAULT_SETTINGS)), "look into crms");
});

test("a filler only counts as a whole word", () => {
  assert.strictEqual(stripFiller("musty smell in fridge", fillerPhrases(DEFAULT_SETTINGS)), "musty smell in fridge");
  assert.strictEqual(stripFiller("shoulder physio booking", fillerPhrases(DEFAULT_SETTINGS)), "shoulder physio booking");
});

test("curly apostrophes match straight ones", () => {
  assert.strictEqual(vague("Don’t forget to sort out the trip"), true);
  assert.strictEqual(vague("Don’t forget to call Sam"), false);
});

test("a reminder word on its own is flagged, with its own reason", () => {
  const r = assessNextAction("- [ ] Remember to", DEFAULT_SETTINGS);
  assert.strictEqual(r.vague, true);
  assert.match(r.reason, /reminder word/);
});

/* ------------------------- the built-in phrases ------------------------- */

test("work jargon and Allen's project verbs are flagged", () => {
  for (const t of ["Follow up with Sam", "Sync with Priya on Q4", "Touch base with finance", "Circle back on pricing",
                   "Improve onboarding", "Implement SSO", "Keep an eye on the budget", "Action the feedback",
                   "Progress the RFP", "Get buy-in from legal", "Deep dive into churn"]) {
    assert.strictEqual(vague(t), true, t);
  }
});

test("look-alikes that are concrete or nouns are not", () => {
  // Why some phrases carry their next word, and why two moved to the opt-in list.
  for (const t of ["Action items: email Sam", "Progress report to Sam", "Sync phone to laptop",
                   "Monitor stand for desk", "Work out at the gym", "Review Q3 deck", "Email Sam the brief"]) {
    assert.strictEqual(vague(t), false, t);
  }
});

test("the opt-in phrases are off until switched on", () => {
  assert.strictEqual(vague("Fix the login bug"), false);
  const on = defaultVagueText().replace("\n# fix\n", "\nfix\n");
  assert.notStrictEqual(on, defaultVagueText(), "the commented line is there to uncomment");
  assert.strictEqual(vague("Fix the login bug", Object.assign({}, DEFAULT_SETTINGS, { vagueOpeners: on })), true);
});

test("the lists don't overlap or repeat", () => {
  const a = VAGUE_OPENERS.map(normaliseForMatch), o = VAGUE_OPENERS_OPTIONAL.map(normaliseForMatch);
  assert.strictEqual(new Set(a).size, a.length, "no duplicates in the built-in list");
  assert.strictEqual(new Set(o).size, o.length);
  assert.deepStrictEqual(a.filter((p) => o.includes(p)), [], "nothing both on and opt-in");
});

/* ------------------------------ settings ------------------------------ */

test("both lists default to null, meaning the built-in list", () => {
  assert.strictEqual(DEFAULT_SETTINGS.vagueOpeners, null);
  assert.strictEqual(DEFAULT_SETTINGS.fillerPrefixes, null);
  assert.deepStrictEqual(vaguePhrases({}), VAGUE_OPENERS.map(normaliseForMatch));
  assert.deepStrictEqual(fillerPhrases({}), FILLER_PREFIXES.map(normaliseForMatch));
});

test("the text shown in an unedited box behaves exactly like the built-in list", () => {
  assert.deepStrictEqual(parsePhraseList(defaultVagueText()), VAGUE_OPENERS.map(normaliseForMatch));
  assert.deepStrictEqual(parsePhraseList(defaultFillerText()), FILLER_PREFIXES.map(normaliseForMatch));
});

test("parsePhraseList ignores comments and blanks, and tidies what's left", () => {
  assert.deepStrictEqual(parsePhraseList("# note\n\n  Sort Out  \nsort out\nDon’t  forget\r\n#off"), ["sort out", "don't forget"]);
  assert.deepStrictEqual(parsePhraseList(""), []);
  assert.deepStrictEqual(parsePhraseList(null), []);
});

test("an edited list replaces the built-in one", () => {
  const s = Object.assign({}, DEFAULT_SETTINGS, { vagueOpeners: "reach out" });
  assert.strictEqual(vague("Reach out to Sam", s), true);
  assert.strictEqual(vague("Sort out the trip", s), false, "built-ins no longer apply");
});

test("an emptied list still catches single words and bare reminders", () => {
  const s = Object.assign({}, DEFAULT_SETTINGS, { vagueOpeners: "", fillerPrefixes: "remember to" });
  assert.strictEqual(vague("Sort out the trip", s), false);
  assert.strictEqual(vague("Taxes", s), true);
  assert.strictEqual(vague("Remember to", s), true);
});

/** The real phraseListField, against a stand-in for Obsidian's Setting. */
function field(stored) {
  const src = main.slice(main.indexOf("  phraseListField(name, desc, key, defaultText) {"));
  const body = src.slice(0, src.indexOf("\n  }\n") + 4);
  let area, button;
  class Setting {
    setName() { return this; }
    setDesc() { return this; }
    addTextArea(cb) {
      area = { value: null, inputEl: { rows: 0, addClass() {} },
        setValue(v) { this.value = v; return this; }, onChange(f) { this.change = f; return this; } };
      cb(area); return this;
    }
    addExtraButton(cb) {
      button = { setIcon() { return this; }, setTooltip() { return this; }, onClick(f) { this.click = f; return this; } };
      cb(button); return this;
    }
  }
  const Klass = new Function("obsidian", `return class { ${body} }`)({ Setting });
  const tab = new Klass();
  tab.containerEl = {};
  tab.plugin = { settings: { vagueOpeners: stored } };
  tab.save = async () => {};
  tab.display = () => { tab.redrawn = true; };
  tab.phraseListField("Vague-action phrases", "", "vagueOpeners", defaultVagueText);
  return { tab, area, button };
}

test("an unedited box shows the built-in list and stays null", async () => {
  const { tab, area } = field(null);
  assert.strictEqual(area.value, defaultVagueText());
  await area.change(defaultVagueText());
  assert.strictEqual(tab.plugin.settings.vagueOpeners, null, "so later improvements still reach you");
});

test("editing stores your list; restoring returns to the built-in one", async () => {
  const { tab, area, button } = field(null);
  await area.change("reach out");
  assert.strictEqual(tab.plugin.settings.vagueOpeners, "reach out");
  await button.click();
  assert.strictEqual(tab.plugin.settings.vagueOpeners, null);
  assert.ok(tab.redrawn, "and the box shows it");
});

test("a saved list is shown as saved", () => {
  assert.strictEqual(field("reach out\n# off").area.value, "reach out\n# off");
});

/* ------------------------------ in the flow ------------------------------ */

test("the task's text stays current after a vague-wording rewrite", async () => {
  // A stale copy can't be found again by its text later in the review.
  const vault = makeVault({ "P.md": "- [ ] Trip stuff" });
  const answers = { "Actionable this week?": [true], "Does this need more than one step?": ["no"], "may not be a next action": ["rewrite"] };
  let edits = 0;
  const ctx = {
    app: makeApp(vault), settings: Object.assign({}, DEFAULT_SETTINGS), mode: "process", quickBatch: [],
    tasks: { canEditViaApi: () => true, editTaskLine: async () => (++edits === 1 ? "- [ ] Sort out trip" : "- [ ] Call Sam re: dates") },
    prompter: {
      choice: async (q) => answers[Object.keys(answers).find((k) => String(q).replace(/\*\*/g, "").includes(k))].shift(),
      info: () => {}
    }
  };
  const item = { file: new TFile("P.md"), startLine: 0, endLine: 0, raw: "- [ ] Trip stuff", isProject: false };
  await runProcess(ctx, item);
  assert.strictEqual(item.raw, "- [ ] Call Sam re: dates");
});
