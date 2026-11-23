/**
 * Re-processing a task from inside Organise.
 *
 * Driven through the real runOrganise with a scripted prompter. The risks are the quiet
 * ones: a rollback that leaves half-applied labels behind (so a second pass duplicates
 * them), fixing the wording of the wrong line (the project's, when a next action was on
 * screen), filing a project using a range that re-processing has since changed, labelling
 * something twice, and a re-processed task that vanishes from Organise instead of carrying on.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { runOrganise, refreshUnit, withReprocess, ReviewControl, DefaultFilingStrategy, DEFAULT_SETTINGS,
  MAX_SUBTASK_RETRIES } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const CTX_Q = "Physical context";
const REPROCESS = () => new ReviewControl("reprocess");

/** Answers by question text; each question consumes its own queue. Records everything. */
function scripted(answers) {
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [], focused = [];
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
    asked, focused,
    left: () => Object.entries(queues).filter(([, q]) => q.length).map(([k]) => k),
    prompter: {
      choice: async (q, o) => answer(q, o),
      optionalChoice: async (q, o) => answer(q, o),
      confirm: async (q) => answer(q, []),
      text: async (q) => answer(q, []),
      info: () => {},
      highlightInSource: async () => {},
      focusSubtask: (parent, line, raw) => focused.push(raw.trim())
    }
  };
}
/** One dimension, no priority or custom tag, two quick destinations: short scripts. */
function setup(files, answers, tasks = {}) {
  const vault = makeVault(Object.assign({ "Lists/Next.md": "", "Lists/Projects.md": "" }, files));
  const s = scripted(answers);
  const ctx = {
    app: makeApp(vault),
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      dimensions: [DEFAULT_SETTINGS.dimensions[0]],
      enablePriorityStep: false,
      enableCustomTagStep: false,
      curatedMoveTargets: ["Lists/Next.md", "Lists/Projects.md"]
    }),
    tasks: Object.assign({ canEditViaApi: () => true, editTaskLine: async (l) => l }, tasks),
    mode: "organise",
    quickBatch: [],
    prompter: s.prompter
  };
  ctx.filing = new DefaultFilingStrategy();
  return { vault, s, ctx, read: (p) => vault.store.get(p) };
}
function itemAt(content, line, extra = {}) {
  const lines = content.split("\n");
  return Object.assign({
    file: new TFile("Inbox.md"), startLine: line, endLine: L.computeSubtreeEnd(lines, line),
    raw: lines[line], isProject: L.lineHasTag(lines[line], "project")
  }, extra);
}
const count = (text, needle) => text.split(needle).length - 1;

/* ================================ a single task ================================ */

test("fixing the wording rewords the task, then organises it", async () => {
  const content = "- [ ] Sort out trip";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home"],
    "Re-process this task": ["wording"],
    "Move to": ["Lists/Next.md"]
  }, { editTaskLine: async () => "- [ ] Call Sam re: dates" });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.read("Lists/Next.md").trim(), "- [ ] Call Sam re: dates #home");
  assert.strictEqual(h.read("Inbox.md").trim(), "");
  assert.deepStrictEqual(h.s.left(), []);
});

test("labels applied before Re-process are undone, so nothing is applied twice", async () => {
  // Two dimensions: answer the first, press Re-process at the second.
  const content = "- [ ] Call Sam";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: ["home", "office"],
    "Mental processing mode": [REPROCESS(), "admin"],
    "Re-process this task": ["organise"],
    "Move to": ["Lists/Next.md"]
  });
  h.ctx.settings.dimensions = DEFAULT_SETTINGS.dimensions.slice(0, 2);
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  const filed = h.read("Lists/Next.md").trim();
  assert.strictEqual(filed, "- [ ] Call Sam #office #admin");
  assert.strictEqual(count(filed, "#home"), 0, "the first pass's label was rolled back");
});

test("Re-process pressed at the filing step rolls back the labels too", async () => {
  const content = "- [ ] Call Sam";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: ["home", "office"],
    "Move to": [REPROCESS(), "Lists/Next.md"],
    "Re-process this task": ["organise"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.read("Lists/Next.md").trim(), "- [ ] Call Sam #office");
});

test("processing it again can delete it, and Organise then stops", async () => {
  const content = "- [ ] Old idea\n- [ ] other";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS()],
    "Re-process this task": ["process"],
    "Actionable this week?": [false],
    "What should happen to it?": ["delete"]
  });
  const item = itemAt(content, 0);
  await runOrganise(h.ctx, item, h.ctx.filing);
  assert.strictEqual(h.read("Inbox.md"), "- [ ] other");
  assert.strictEqual(item.disposed, true, "counted as gone for the progress total");
  assert.deepStrictEqual(h.s.left(), [], "no Move-to question for a deleted task");
});

test("a task that has become a project is organised as one", async () => {
  const content = "- [ ] Berlin trip";
  let created = 0;
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "office"],
    "Re-process this task": ["process"],
    "Actionable this week?": [true],
    "Does this need more than one step?": ["yes"],
    "Next action saved.": ["done"],
    "Move to": ["Lists/Projects.md"]
  }, {
    editTaskLine: async () => "- [ ] Berlin trip booked",
    createNewTaskLine: async () => (++created === 1 ? "- [ ] Text Sam the dates" : "")
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  const filed = h.read("Lists/Projects.md").trim().split("\n");
  assert.match(filed[0], /^- \[ \] Berlin trip booked #project$/, "the outcome is filed whole");
  assert.match(filed[1], /^\s+- \[ \] Text Sam the dates #office$/, "its new next action is labelled");
  assert.strictEqual(filed.length, 2);
});

test("a task split while re-processing has each surviving piece organised", async () => {
  const content = "- [ ] Call Sam, drop old idea";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home"],
    "Re-process this task": ["process"],
    "Actionable this week?": ["split", true, false],
    "Split it": ["Call Sam"],
    "Next item": ["Old idea", ""],
    "Does this need more than one step?": ["no"],
    "What should happen to it?": ["delete"],
    "Move to": ["Lists/Next.md"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.read("Lists/Next.md").trim(), "- [ ] Call Sam #home");
  assert.strictEqual(h.read("Inbox.md").trim(), "", "the deleted piece is not organised");
});

test("the two-minute batch isn't offered when re-processing in Organise", async () => {
  // The batch only runs at the end of Process; offering it here would queue into nothing.
  const content = "- [ ] Reply to Sam";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS()],
    "Re-process this task": ["process"],
    "Actionable this week?": [false],
    "What should happen to it?": ["delete"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  const q = h.s.asked.find((a) => a.q === "Actionable this week?");
  assert.ok(!q.opts.includes("twomin"));
  assert.ok(q.opts.includes("split"), "splitting still is");
});

test("a task filed under a project while re-processing is labelled, not filed again", async () => {
  // Moving it to a list would pull it back out of the project it was just put in.
  const content = "- [ ] Berlin trip #project\n    - [ ] Book hotel\n- [ ] Text Sam";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home"],
    "Re-process this task": ["process"],
    "Actionable this week?": [true],
    "Does this need more than one step?": ["step"],
    "Which project is it a step in?": ["0"],
    "Is this a clear next action?": ["keep"]
  });
  await runOrganise(h.ctx, itemAt(content, 2), h.ctx.filing);
  assert.deepStrictEqual(h.read("Inbox.md").split("\n"),
    ["- [ ] Berlin trip #project", "    - [ ] Book hotel", "    - [ ] Text Sam #home"]);
  assert.strictEqual(h.read("Lists/Next.md"), "", "never filed out of its project");
});

/* ============================ a project's next action ============================ */

const PROJECT = ["- [ ] Berlin trip #project", "    - [ ] Sort out hotel", "    - [ ] Book flights"].join("\n");

test("fixing a next action's wording edits that action, not the project", async () => {
  const edited = [];
  const h = setup({ "Inbox.md": PROJECT }, {
    [CTX_Q]: [REPROCESS(), "home", "office"],
    "Re-process this next action": ["wording"],
    "Move to": ["Lists/Projects.md"]
  }, { editTaskLine: async (l) => { edited.push(l.trim()); return "    - [ ] Email hotel for rates"; } });
  await runOrganise(h.ctx, itemAt(PROJECT, 0), h.ctx.filing);
  assert.deepStrictEqual(edited, ["- [ ] Sort out hotel"], "the action on screen, not the project");
  assert.deepStrictEqual(h.read("Lists/Projects.md").trim().split("\n"), [
    "- [ ] Berlin trip #project",
    "    - [ ] Email hotel for rates #home",
    "    - [ ] Book flights #office"
  ]);
});

test("a next action deleted while re-processing leaves the project filed correctly", async () => {
  // The project shrank; filing its old range would take a line that isn't part of it.
  const content = PROJECT + "\n- [ ] Unrelated";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "office"],
    "Re-process this next action": ["process"],
    "Actionable this week?": [false],
    "What should happen to it?": ["delete"],
    "Move to": ["Lists/Projects.md"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.deepStrictEqual(h.read("Lists/Projects.md").trim().split("\n"),
    ["- [ ] Berlin trip #project", "    - [ ] Book flights #office"]);
  assert.strictEqual(h.read("Inbox.md").trim(), "- [ ] Unrelated", "and nothing else moved with it");
});

test("a next action that grows into a project is labelled once, not twice", async () => {
  // It already had a step beneath it; re-processing labels that step, and the walk must
  // not come back to it.
  const content = ["- [ ] Launch #project", "    - [ ] Sort out venue", "        - [ ] Ask Sam for options", "    - [ ] Book caterer"].join("\n");
  let created = 0;
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "office", "home", "errands"],
    "Re-process this next action": ["process"],
    "Actionable this week?": [true],
    "Does this need more than one step?": ["yes"],
    "Next action saved.": ["done"],
    "Move to": ["Lists/Projects.md"]
  }, {
    editTaskLine: async () => "    - [ ] Venue booked",
    createNewTaskLine: async () => (++created === 1 ? "- [ ] Shortlist three venues" : "")
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  const out = h.read("Lists/Projects.md");
  assert.strictEqual(count(out, "Ask Sam for options #office"), 1);
  assert.doesNotMatch(out, /Ask Sam for options #office #/, "no second label on the same line");
  assert.match(out, /Shortlist three venues #home/);
  assert.match(out, /Book caterer #errands/, "and the walk carries on to the next sibling");
  assert.match(out, /Venue booked #project/);
});

test("cancelling a next action's rewrite redoes that action only", async () => {
  // Not the whole project: the other action is labelled once, and nothing escapes.
  let calls = 0;
  const h = setup({ "Inbox.md": PROJECT }, {
    [CTX_Q]: [REPROCESS(), "home", "office"],
    "Re-process this next action": ["wording", "organise"],
    "Move to": ["Lists/Projects.md"]
  }, { editTaskLine: async (l) => (++calls === 1 ? "" : l) });
  await runOrganise(h.ctx, itemAt(PROJECT, 0), h.ctx.filing);
  assert.strictEqual(h.s.asked.filter((a) => a.q === "Re-process this next action").length, 2,
    "asked again after the cancel");
  assert.deepStrictEqual(h.read("Lists/Projects.md").trim().split("\n"), [
    "- [ ] Berlin trip #project", "    - [ ] Sort out hotel #home", "    - [ ] Book flights #office"
  ]);
});

/* ================================ control flow ================================ */

test("Re-process pressed again during the choice simply asks again", async () => {
  const content = "- [ ] Call Sam";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home"],
    "Re-process this task": [REPROCESS(), "organise"],
    "Move to": ["Lists/Next.md"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.read("Lists/Next.md").trim(), "- [ ] Call Sam #home");
});

test("endless Re-process is bounded, escalating to a restart", async () => {
  const content = "- [ ] Call Sam";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS()],
    "Re-process this task": Array(MAX_SUBTASK_RETRIES + 5).fill(0).map(REPROCESS)
  });
  await assert.rejects(() => runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing),
    (e) => e instanceof ReviewControl && e.kind === "back");
});

test("Restart, Skip and Exit still reach the review loop", async () => {
  for (const kind of ["back", "skip", "exit", "prev"]) {
    const content = "- [ ] Call Sam";
    const h = setup({ "Inbox.md": content }, { [CTX_Q]: [new ReviewControl(kind)] });
    await assert.rejects(() => runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing),
      (e) => e instanceof ReviewControl && e.kind === kind, kind);
  }
});

test("cancelling the reword of a whole task goes back to the re-process question", async () => {
  const content = "- [ ] Call Sam";
  let n = 0;
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home"],
    "Re-process this task": ["wording", "wording"],
    "Move to": ["Lists/Next.md"]
  }, { editTaskLine: async () => (++n === 1 ? "" : "- [ ] Call Sam re: dates") });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.s.asked.filter((a) => a.q === "Re-process this task").length, 2);
  assert.strictEqual(h.read("Lists/Next.md").trim(), "- [ ] Call Sam re: dates #home");
});

test("withReprocess restores the unit's position and text with the file", async () => {
  const vault = makeVault({ "Inbox.md": "- [ ] a\n- [ ] b" });
  const ctx = { app: makeApp(vault) };
  const unit = { file: new TFile("Inbox.md"), startLine: 1, endLine: 1, raw: "- [ ] b", isProject: false };
  let second = null;
  await withReprocess(ctx, unit,
    async (c) => {
      await c.app.vault.process(unit.file, (d) => "- [ ] new\n" + d);
      unit.startLine = 2; unit.endLine = 5; unit.disposed = true;
      throw new ReviewControl("reprocess");
    },
    async () => { second = { ...unit, file: undefined }; });
  assert.strictEqual(vault.store.get("Inbox.md"), "- [ ] a\n- [ ] b");
  assert.strictEqual(second.startLine, 1);
  assert.strictEqual(second.endLine, 1);
  assert.strictEqual(second.disposed, undefined);
});

test("refreshUnit finds a moved task by its text, and a reworded one where it was", async () => {
  const vault = makeVault({ "Inbox.md": "- [ ] new\n- [ ] a\n- [ ] Call Sam re: dates" });
  const ctx = { app: makeApp(vault), settings: DEFAULT_SETTINGS };
  const moved = { file: new TFile("Inbox.md"), startLine: 0, raw: "- [ ] a" };
  assert.strictEqual(await refreshUnit(ctx, moved), true);
  assert.strictEqual(moved.startLine, 1);
  const reworded = { file: new TFile("Inbox.md"), startLine: 2, raw: "- [ ] Sort out trip" };
  assert.strictEqual(await refreshUnit(ctx, reworded), true);
  assert.strictEqual(reworded.raw, "- [ ] Call Sam re: dates");
});

test("refreshUnit reports a finished or missing task as gone", async () => {
  const vault = makeVault({ "Inbox.md": "- [x] done\nprose" });
  const ctx = { app: makeApp(vault), settings: DEFAULT_SETTINGS };
  assert.strictEqual(await refreshUnit(ctx, { file: new TFile("Inbox.md"), startLine: 0, raw: "- [x] done" }), false);
  assert.strictEqual(await refreshUnit(ctx, { file: new TFile("Inbox.md"), startLine: 1, raw: "- [ ] x" }), false);
  assert.strictEqual(await refreshUnit(ctx, { file: new TFile("Gone.md"), startLine: 0, raw: "- [ ] x" }), false);
});

/* ==================================== the nav ==================================== */

function navFor(mode, canGoBack = true) {
  const src = main.slice(main.indexOf("  renderNav() {"));
  const body = src.slice(0, src.indexOf("\n  }\n") + 4);
  const Klass = new Function("ReviewControl", `return class { ${body} }`)(ReviewControl);
  const pane = new Klass();
  const buttons = [];
  pane.navEl = {
    empty() {},
    createEl(tag, o) {
      const b = { text: o.text, cls: o.cls, handlers: {}, attrs: {}, disabled: false,
        setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(e, f) { this.handlers[e] = f; }, addClass() {} };
      buttons.push(b);
      return b;
    }
  };
  pane.canGoBack = canGoBack;
  pane.canGoPrev = false;
  pane.reviewMode = mode;
  pane.rejected = [];
  pane.rejectPending = (e) => pane.rejected.push(e.kind);
  pane.renderNav();
  return { pane, buttons };
}

test("Re-process is in the Organise nav, and only there", () => {
  assert.ok(navFor("organise").buttons.some((b) => b.text === "Re-process"));
  assert.ok(!navFor("process").buttons.some((b) => b.text === "Re-process"), "Process already is that place");
  assert.ok(!navFor("organise", false).buttons.some((b) => b.text === "Re-process"), "not between tasks");
});

test("pressing it sends the re-process signal", () => {
  const { pane, buttons } = navFor("organise");
  buttons.find((b) => b.text === "Re-process").handlers.click();
  assert.deepStrictEqual(pane.rejected, ["reprocess"]);
});

test("the review records which mode it is in, for the nav", () => {
  assert.match(main, /this\.reviewMode = mode;/);
});

test("the nav wraps rather than overflowing with five buttons", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
  assert.match(css, /\.gtd-clarify-nav \{[^}]*flex-wrap: wrap/s);
});

/* ---------------------- cases where only the guards tell apart ---------------------- */

test("every surviving piece of a split is organised, not just the first", async () => {
  const content = "- [ ] Call Sam, email Priya";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home", "office"],
    "Re-process this task": ["process"],
    "Actionable this week?": ["split", true, true],
    "Split it": ["Call Sam"],
    "Next item": ["Email Priya", ""],
    "Does this need more than one step?": ["no", "no"],
    "Move to": ["Lists/Next.md", "Lists/Next.md"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.deepStrictEqual(h.read("Lists/Next.md").trim().split("\n"), ["- [ ] Call Sam #home", "- [ ] Email Priya #office"]);
  assert.strictEqual(h.read("Inbox.md").trim(), "");
});

test("a piece skipped while re-processing is left alone, not organised", async () => {
  const content = "- [ ] Call Sam, email Priya";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home"],
    "Re-process this task": ["process"],
    "Actionable this week?": ["split", true, new ReviewControl("skip")],
    "Split it": ["Call Sam"],
    "Next item": ["Email Priya", ""],
    "Does this need more than one step?": ["no"],
    "Move to": ["Lists/Next.md"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.read("Lists/Next.md").trim(), "- [ ] Call Sam #home");
  assert.strictEqual(h.read("Inbox.md").trim(), "- [ ] Email Priya", "unlabelled and unmoved");
});

test("a step you skipped labelling isn't asked about a second time", async () => {
  // Its text is unchanged, so without remembering it the walk would come back to it.
  const content = ["- [ ] Launch #project", "    - [ ] Sort out venue", "        - [ ] Ask Sam for options", "    - [ ] Book caterer"].join("\n");
  let created = 0;
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), null, "home", "errands"],
    "Re-process this next action": ["process"],
    "Actionable this week?": [true],
    "Does this need more than one step?": ["yes"],
    "Next action saved.": ["done"],
    "Move to": ["Lists/Projects.md"]
  }, {
    editTaskLine: async () => "    - [ ] Venue booked",
    createNewTaskLine: async () => (++created === 1 ? "- [ ] Shortlist three venues" : "")
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.s.focused.filter((r) => r === "- [ ] Ask Sam for options").length, 1);
  assert.match(h.read("Lists/Projects.md"), /Book caterer #errands/);
});

test("next actions are found by text after one moves below them", async () => {
  // Filing a next action under a project further down shifts the lines between without
  // changing the count, so its old position now holds a different line.
  const content = ["- [ ] Trip #project", "    - [ ] Sort out hotel", "    - [ ] Book flights",
                   "- [ ] Admin #project", "    - [ ] File receipts"].join("\n");
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home", "office"],
    "Re-process this next action": ["process"],
    "Actionable this week?": [true],
    "Does this need more than one step?": ["step"],
    "Which project is it a step in?": ["3"],
    "Is this a clear next action?": ["keep"],
    "Move to": ["Lists/Projects.md"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.deepStrictEqual(h.read("Lists/Projects.md").trim().split("\n"), ["- [ ] Trip #project", "    - [ ] Book flights #office"]);
  assert.deepStrictEqual(h.read("Inbox.md").split("\n"),
    ["- [ ] Admin #project", "    - [ ] File receipts", "    - [ ] Sort out hotel #home"],
    "the moved action is labelled where it now lives, and Admin's line is untouched");
});
