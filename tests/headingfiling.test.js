/**
 * Filing a task under a heading in the same note, during an Organise of "this note".
 *
 * The risks: landing under the wrong heading (beneath a subheading, when the end of the
 * parent's whole section is used), reading a "#" that isn't a heading as one, misplacing the
 * task when the heading sits below it (removing the block shifts the heading up), and
 * losing the next queued task after a move reorders the note.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { noteHeadings, headingAbove, moveSubtreeUnderHeading, DefaultFilingStrategy, DEFAULT_SETTINGS,
  reanchorLine, VaultJournal, journalledApp, runOrganise } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile, Notice } = require("./helpers/obsidian.js");

const F = () => new TFile("Inbox.md");
const note = (lines) => {
  const vault = makeVault({ "Inbox.md": lines.join("\n") });
  return { vault, app: makeApp(vault), read: () => vault.store.get("Inbox.md").split("\n") };
};

/* ------------------------------ what counts as a heading ------------------------------ */

test("headings are found with their level and their path", () => {
  const hs = noteHeadings(["# Inbox", "- [ ] a", "## Work", "### Calls", "## Home", "### Calls"]);
  assert.deepStrictEqual(hs.map((h) => [h.line, h.level, h.path]), [
    [0, 1, "Inbox"], [2, 2, "Inbox › Work"], [3, 3, "Inbox › Work › Calls"],
    [4, 2, "Inbox › Home"], [5, 3, "Inbox › Home › Calls"]
  ], "two headings called Calls are told apart by where they sit");
});

test("a tag, front-matter and code are not headings", () => {
  const hs = noteHeadings([
    "---", "# a yaml comment", "tags: x", "---",
    "#tag at the start of a line",
    "```", "## inside code", "```",
    "~~~", "## inside tildes", "```", "## still inside", "~~~",
    "    ## indented four: code",
    "## Real"
  ]);
  assert.deepStrictEqual(hs.map((h) => h.text), ["Real"]);
});

test("closing hashes are dropped, but a word ending in # is kept", () => {
  assert.deepStrictEqual(noteHeadings(["## Work ##", "## C#", "##", "##   "]).map((h) => h.text), ["Work", "C#"]);
});

test("headingAbove finds the heading a line sits under", () => {
  const hs = noteHeadings(["- [ ] above", "## Work", "- [ ] w", "## Home", "- [ ] h"]);
  assert.strictEqual(headingAbove(hs, 0), null);
  assert.strictEqual(headingAbove(hs, 2).text, "Work");
  assert.strictEqual(headingAbove(hs, 4).text, "Home");
});

/* --------------------------------- where it lands --------------------------------- */

test("a task moves to the end of a heading below it", async () => {
  const n = note(["- [ ] Call Sam", "## Work", "- [ ] existing", "", "## Home", "- [ ] h"]);
  const at = await moveSubtreeUnderHeading(n.app, F(), 0, 0, 1);
  assert.deepStrictEqual(n.read(), ["## Work", "- [ ] existing", "- [ ] Call Sam", "", "## Home", "- [ ] h"]);
  assert.strictEqual(at, 2);
});

test("a task moves to the end of a heading above it", async () => {
  const n = note(["## Work", "- [ ] existing", "", "## Inbox", "- [ ] Call Sam", "- [ ] other"]);
  await moveSubtreeUnderHeading(n.app, F(), 4, 4, 0);
  assert.deepStrictEqual(n.read(), ["## Work", "- [ ] existing", "- [ ] Call Sam", "", "## Inbox", "- [ ] other"]);
});

test("filing under a heading never lands it beneath that heading's subheading", () => {
  const n = note(["- [ ] Call Sam", "## Work", "- [ ] w", "### Calls", "- [ ] c", "## Home"]);
  return moveSubtreeUnderHeading(n.app, F(), 0, 0, 1).then(() => {
    assert.deepStrictEqual(n.read(), ["## Work", "- [ ] w", "- [ ] Call Sam", "### Calls", "- [ ] c", "## Home"]);
  });
});

test("an empty section gets the task straight after its heading", async () => {
  const n = note(["- [ ] Call Sam", "## Work", "", "## Home"]);
  await moveSubtreeUnderHeading(n.app, F(), 0, 0, 1);
  assert.deepStrictEqual(n.read(), ["## Work", "- [ ] Call Sam", "", "## Home"]);
});

test("the last heading's section runs to the end, before any trailing newline", async () => {
  const n = note(["- [ ] Call Sam", "## Later", "- [ ] l", "", ""]);
  await moveSubtreeUnderHeading(n.app, F(), 0, 0, 1);
  assert.deepStrictEqual(n.read(), ["## Later", "- [ ] l", "- [ ] Call Sam", "", ""]);
});

test("a '#' inside a code block in the section is not mistaken for its end", async () => {
  const n = note(["- [ ] Call Sam", "## Work", "```", "# not a heading", "```", "- [ ] w", "## Home"]);
  await moveSubtreeUnderHeading(n.app, F(), 0, 0, 1);
  assert.deepStrictEqual(n.read(), ["## Work", "```", "# not a heading", "```", "- [ ] w", "- [ ] Call Sam", "## Home"]);
});

test("a task's subtasks move with it, keeping their nesting", async () => {
  const n = note(["- [ ] Trip #project", "    - [ ] Book flights", "        - [ ] Compare", "## Projects", "- [ ] p"]);
  await moveSubtreeUnderHeading(n.app, F(), 0, 2, 3);
  assert.deepStrictEqual(n.read(), ["## Projects", "- [ ] p", "- [ ] Trip #project", "    - [ ] Book flights", "        - [ ] Compare"]);
});

test("a nested task is brought to the left margin under its new heading", async () => {
  const n = note(["## Inbox", "- [ ] parent", "    - [ ] Call Sam", "## Calls"]);
  await moveSubtreeUnderHeading(n.app, F(), 2, 2, 3);
  assert.deepStrictEqual(n.read(), ["## Inbox", "- [ ] parent", "## Calls", "- [ ] Call Sam"]);
});

test("if the heading is no longer there, nothing is written", async () => {
  const n = note(["- [ ] Call Sam", "Work, renamed to prose", "## Home"]);
  assert.strictEqual(await moveSubtreeUnderHeading(n.app, F(), 0, 0, 1), -1);
  assert.deepStrictEqual(n.read(), ["- [ ] Call Sam", "Work, renamed to prose", "## Home"]);
});

test("the next queued task is still found after a move reorders the note", async () => {
  // The review predicts the next task's line from the line count, which a move within the
  // note doesn't change; it then looks for the task by its text.
  const n = note(["- [ ] Call Sam", "- [ ] Email Priya", "## Calls"]);
  await moveSubtreeUnderHeading(n.app, F(), 0, 0, 2);
  assert.strictEqual(reanchorLine(n.read(), 1, "- [ ] Email Priya"), 0);
});

test("Restart undoes a move under a heading", async () => {
  const n = note(["- [ ] Call Sam", "## Calls", "- [ ] c"]);
  const journal = new VaultJournal(n.app);
  await journal.capture(F());
  await moveSubtreeUnderHeading(journalledApp(n.app, journal), F(), 0, 0, 1);
  await journal.restore();
  assert.deepStrictEqual(n.read(), ["- [ ] Call Sam", "## Calls", "- [ ] c"]);
});

/* -------------------------------- when it's offered -------------------------------- */

function filing(lines, sourceKind, answers) {
  const n = note(lines);
  const asked = [];
  const queue = [...answers];
  const ctx = {
    app: n.app, sourceKind,
    settings: Object.assign({}, DEFAULT_SETTINGS, { curatedMoveTargets: [] }),
    prompter: {
      choice: async (q, opts) => { q = String(q).replace(/\*\*/g, ""); asked.push({ q, opts: opts.map((o) => [o.value, o.label]) }); return queue.shift(); },
      info: () => {}
    }
  };
  const item = { file: F(), startLine: 0, endLine: 0, raw: lines[0] };
  return { n, ctx, item, asked, run: (opts) => new DefaultFilingStrategy().fileTask(ctx, item, opts) };
}

test("working through this note, a heading is offered after searching and a new note", async () => {
  // Most tasks go to another note, found by searching; a heading in this note comes next.
  const h = filing(["- [ ] Call Sam", "## Calls"], "file", []);
  h.ctx.prompter.choice = async (q, opts) => { h.asked.push(opts.map((o) => o.value)); throw new Error("seen"); };
  await h.run().catch(() => {});
  assert.deepStrictEqual(h.asked[0], ["__search__", "__new__", "__heading__", "__template__"]);
});

test("it isn't offered for a query, which spans many notes", async () => {
  const h = filing(["- [ ] Call Sam", "## Calls"], "query", []);
  h.ctx.prompter.choice = async (q, opts) => { h.asked.push(opts.map((o) => o.value)); throw new Error("seen"); };
  await h.run().catch(() => {});
  assert.ok(!h.asked[0].includes("__heading__"));
});

test("it isn't offered when the only heading is the one the task is under", async () => {
  const h = filing(["## Inbox", "- [ ] Call Sam"], "file", []);
  h.item.startLine = 1; h.item.endLine = 1; h.item.raw = "- [ ] Call Sam";
  h.ctx.prompter.choice = async (q, opts) => { h.asked.push(opts.map((o) => o.value)); throw new Error("seen"); };
  await h.run().catch(() => {});
  assert.ok(!h.asked[0].includes("__heading__"));
});

test("the heading list shows paths and leaves out the current heading", async () => {
  const lines = ["## Inbox", "- [ ] Call Sam", "## Work", "### Calls"];
  const h = filing(lines, "file", ["__heading__", "3"]);
  h.item.startLine = 1; h.item.endLine = 1; h.item.raw = lines[1];
  const before = Notice.log.length;
  assert.strictEqual(await h.run(), "moved");
  assert.deepStrictEqual(h.asked[1].opts, [["2", "Work"], ["3", "Work › Calls"], ["__back__", "Back"]]);
  assert.deepStrictEqual(h.n.read(), ["## Inbox", "## Work", "### Calls", "- [ ] Call Sam"]);
  assert.match(Notice.log[before], /Moved under Work › Calls/);
});

test("deferring in Process on this note can wait under a heading too", async () => {
  // fileTask is shared, so a deferred task can be filed under, say, "## Later".
  const h = filing(["- [ ] Renew passport", "## Later"], "file", ["__heading__", "1"]);
  const out = await h.run({ allowStay: true, question: "Deferred until 2026-11-01. Where should it wait?" });
  assert.strictEqual(out, "moved");
  assert.deepStrictEqual(h.asked[0].opts.map((o) => o[0]), ["__stay__", "__search__", "__new__", "__heading__", "__template__"], "staying is still first");
  assert.deepStrictEqual(h.n.read(), ["## Later", "- [ ] Renew passport"]);
});

test("Organise of this note labels a task, then files it under a heading", async () => {
  const lines = ["# Inbox", "- [ ] Call Sam", "## Calls", "- [ ] Call dentist"];
  const vault = makeVault({ "Inbox.md": lines.join("\n") });
  const answers = { "Physical context": ["office"], "Move to": ["__heading__"], "Which heading?": ["2"] };
  const ctx = {
    app: makeApp(vault), sourceKind: "file", mode: "organise", quickBatch: [],
    settings: Object.assign({}, DEFAULT_SETTINGS, { dimensions: [DEFAULT_SETTINGS.dimensions[0]],
      enablePriorityStep: false, enableCustomTagStep: false, curatedMoveTargets: [] }),
    tasks: {},
    prompter: {
      choice: async (q) => answers[Object.keys(answers).find((k) => String(q).replace(/\*\*/g, "").includes(k))].shift(),
      optionalChoice: async (q) => answers[Object.keys(answers).find((k) => String(q).replace(/\*\*/g, "").includes(k))].shift(),
      info: () => {}, focusSubtask: () => {}, highlightInSource: async () => {}
    }
  };
  await runOrganise(ctx, { file: F(), startLine: 1, endLine: 1, raw: lines[1], isProject: false }, new DefaultFilingStrategy());
  assert.deepStrictEqual(vault.store.get("Inbox.md").split("\n"),
    ["# Inbox", "## Calls", "- [ ] Call dentist", "- [ ] Call Sam #office"]);
});

test("the review records whether it is working through this note", () => {
  // Structural: driving ReviewView.start needs a live workspace. It checks the flag comes
  // from the source actually chosen, and is set after that choice is made.
  const fs = require("node:fs");
  const main = fs.readFileSync(require("node:path").join(__dirname, "..", "src", "main.js"), "utf8");
  const start = main.slice(main.indexOf("  async start(mode, file"));
  const body = start.slice(0, start.indexOf("\n  }\n"));
  const chosen = body.indexOf("await this.chooseSource(");
  const flag = body.indexOf('sourceKind: source instanceof ActiveFileTopLevelTaskSource ? "file" : "query"');
  assert.ok(chosen > -1 && flag > chosen);
});
