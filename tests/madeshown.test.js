/**
 * Adding a project's next actions: the action just made is what's on screen.
 *
 * Reported: at "Next action saved." the pane showed the project alone, never the action
 * that had just been saved. Each new action is now saved first and shown under its project
 * (greyed above it) for every question about it — "Must this wait…?", the vague-wording
 * check, "Next action saved." — and Fix shows the one being fixed.
 *
 * The guard is what the pane shows at the moment each question is asked.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { addSubtasks, DefaultFilingStrategy, runOrganise, DEFAULT_SETTINGS } = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const ID = "\u{1F194}", WAIT = "⛔";
const F = (p = "P.md") => new TFile(p);
const plain = (q) => String(q).replace(/\*\*/g, "");

function setup(content, answers, { creates = [], mode = "process" } = {}) {
  const vault = makeVault({ "P.md": content, "Lists/Next.md": "" });
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [];
  let shown = null;
  const answer = (raw, opts) => {
    const q = plain(raw);
    asked.push({ q, shown, opts: (opts || []).map((o) => o.value) });
    const key = Object.keys(queues).find((k) => q.includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    return queues[key].shift();
  };
  const c = [...creates], ids = ["id1", "id2", "id3"];
  const ctx = {
    app: makeApp(vault), mode, quickBatch: [], sourceKind: "file",
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      dimensions: [DEFAULT_SETTINGS.dimensions[0]], enablePriorityStep: false, enableCustomTagStep: false,
      curatedMoveTargets: ["Lists/Next.md"]
    }),
    tasks: {
      canEditViaApi: () => true,
      createNewTaskLine: async () => (c.length ? c.shift() : ""),
      editTaskLine: async (l) => l,
      newDependencyId: () => ids.shift(),
      idSignifier: (id) => `${ID} ${id}`,
      blockedBySignifier: (id) => `${WAIT} ${id}`
    },
    prompter: {
      choice: async (q, o) => answer(q, o), optionalChoice: async (q, o) => answer(q, o),
      confirm: async (q) => answer(q, []), text: async (q) => answer(q, []), info: () => {},
      highlightInSource: async (it) => { shown = { parent: it.parentRaw == null ? null : it.parentRaw.trim(), action: it.raw.trim() }; },
      focusSubtask: (parent, line, raw) => {
        shown = { parent: parent.raw == null ? null : parent.raw.trim(), action: raw.trim(), line };
      },
      suggestFile: async () => null
    }
  };
  ctx.filing = new DefaultFilingStrategy();
  return { vault, ctx, asked, read: () => vault.store.get("P.md").split("\n") };
}
const at = (h, q, nth = 0) => h.asked.filter((a) => a.q.startsWith(q))[nth];

test("making a project: “Next action saved.” shows the action just made, under the project", async () => {
  const h = setup("- [ ] Berlin trip", {
    "Actionable this week?": [true],
    "Does this need more than one step?": ["yes"],
    "Next action saved.": ["done"]
  }, { creates: ["- [ ] Email the hotel about rates"] });
  const item = { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Berlin trip", isProject: false };
  await runProcess(h.ctx, item);
  assert.deepStrictEqual(at(h, "Next action saved.").shown, {
    parent: "- [ ] Berlin trip #project", action: "- [ ] Email the hotel about rates", line: 1
  });
});

test("each new action is shown as it is made, not the first one again", async () => {
  const h = setup("- [ ] Berlin trip #project", {
    "Must this wait": [true],
    "Next action saved.": ["another", "done"]
  }, { creates: ["- [ ] Email the hotel about rates", "- [ ] Book the cheapest room"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.strictEqual(at(h, "Next action saved.", 0).shown.action, "- [ ] Email the hotel about rates");
  assert.strictEqual(at(h, "Must this wait").shown.action, "- [ ] Book the cheapest room", "the one the question is about");
  assert.match(at(h, "Next action saved.", 1).shown.action, /^- \[ \] Book the cheapest room/);
});

test("saving before asking changes nothing about the result: the chain is the same", async () => {
  const h = setup("- [ ] Berlin trip #project", {
    "Must this wait": [true],
    "Next action saved.": ["another", "done"]
  }, { creates: ["- [ ] Email the hotel about rates", "- [ ] Book the cheapest room"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.deepStrictEqual(h.read(), [
    "- [ ] Berlin trip #project",
    `    - [ ] Email the hotel about rates ${ID} id1`,
    `    - [ ] Book the cheapest room ${WAIT} id1`
  ]);
  assert.match(at(h, "Next action saved.", 1).shown.action, new RegExp(`${WAIT} id1$`), "shown with its marker");
});

test("Fix shows the action being fixed", async () => {
  const h = setup("- [ ] Berlin trip #project", {
    "Must this wait": [false],
    "Next action saved.": ["another", "fix", "done"],
    "Which one": ["1", "__back__"],
    "Fix “": ["__back__"]
  }, { creates: ["- [ ] Email the hotel about rates", "- [ ] Book the cheapest room"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.strictEqual(at(h, "Fix “").shown.action, "- [ ] Email the hotel about rates");
  assert.strictEqual(at(h, "Next action saved.", 2).shown.action, "- [ ] Book the cheapest room", "back to the latest");
});

test("after removing the latest, the one before it is shown", async () => {
  const h = setup("- [ ] Berlin trip #project", {
    "Must this wait": [false],
    "Next action saved.": ["another", "fix", "done"],
    "Which one": ["2"],
    "Fix “": ["remove"]
  }, { creates: ["- [ ] Email the hotel about rates", "- [ ] Book the cheapest room"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.strictEqual(at(h, "Next action saved.", 2).shown.action, "- [ ] Email the hotel about rates");
});

test("in Organise, adding a missing next action shows it too", async () => {
  const h = setup("- [ ] Berlin trip #project", {
    "This project has no next action.": ["add"],
    "Next action saved.": ["done"],
    "Physical context": ["home"],
    "Move to": ["Lists/Next.md"]
  }, { creates: ["- [ ] Email the hotel about rates"], mode: "organise" });
  await runOrganise(h.ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Berlin trip #project", isProject: true }, h.ctx.filing);
  assert.deepStrictEqual(at(h, "Next action saved.").shown, {
    parent: "- [ ] Berlin trip #project", action: "- [ ] Email the hotel about rates", line: 1
  });
});

test("an existing project's extra actions are shown under it", async () => {
  const h = setup("- [ ] Berlin trip #project\n    - [ ] Email the hotel about rates", {
    "Actionable this week?": [true, true],
    "Does this need more than one step?": ["no"],
    "Add another next action to this project?": ["yes"],
    "Must this wait": [false],
    "Next action saved.": ["done"]
  }, { creates: ["- [ ] Book the cheapest room"] });
  const lines = h.read();
  await runProcess(h.ctx, { file: F(), startLine: 0, endLine: 1, raw: lines[0], isProject: true });
  assert.deepStrictEqual(at(h, "Next action saved.").shown, {
    parent: "- [ ] Berlin trip #project", action: "- [ ] Book the cheapest room", line: 2
  });
});

/* ------------------ a step filed under a project: "Is this a clear next action?" ------------------
 * Reported: after "one step in a bigger project" → "Create a new project…", the clarity
 * question showed the step on its own, without the project just made for it. It now shows
 * the step under its project, whichever way it got there. */
test("a step made into a new project's first action is shown under that project", async () => {
  const h = setup("- [ ] Measure the sink", {
    "Actionable this week?": [true], "Does this need more than one step?": ["step"],
    "Which project": ["__new__"], "Is this a clear next action?": ["keep"],
    "Add another next action to this project?": ["no"]
  }, { creates: ["- [ ] Kitchen refitted"] });
  h.ctx.settings.clarifyNextAction = true;
  await runProcess(h.ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Measure the sink", isProject: false });
  assert.deepStrictEqual(at(h, "Is this a clear next action?").shown, {
    parent: "- [ ] Kitchen refitted #project", action: "- [ ] Measure the sink"
  });
});

test("a step filed under a project already in the note is shown under it", async () => {
  const h = setup("- [ ] Measure the sink\n- [ ] Kitchen refit #project", {
    "Actionable this week?": [true], "Does this need more than one step?": ["step"],
    "Which project": ["1"], "Is this a clear next action?": ["keep"]
  });
  h.ctx.settings.clarifyNextAction = true;
  await runProcess(h.ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Measure the sink", isProject: false });
  assert.deepStrictEqual(at(h, "Is this a clear next action?").shown, {
    parent: "- [ ] Kitchen refit #project", action: "- [ ] Measure the sink"
  });
});
