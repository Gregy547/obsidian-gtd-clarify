/**
 * Cancelling goes back one question, never forward — and "Fix one of these…".
 *
 * The rule: dismissing a picker or a Tasks dialogue returns to the question that opened it.
 * The only exception is a project created moments earlier, which would otherwise be left
 * with no next action; that still restarts the task. The fiddly part is removing a next
 * action from a "must wait" chain, which has to re-link the chain so "is not blocked" lists
 * still show the right action.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { addSubtasks, taskIdOf, dependsOnOf, setDependsOn, ensureTaskId, confirmNextAction,
  clarifyFiledAction, DefaultFilingStrategy, runOrganise, ReviewControl, DEFAULT_SETTINGS, MAX_SUBTASK_RETRIES } = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const ID = "\u{1F194}", WAIT = "⛔";
const F = (p = "P.md") => new TFile(p);

function scripted(answers) {
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [];
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
    asked, left: () => Object.entries(queues).filter(([, q]) => q.length).map(([k]) => k),
    prompter: {
      choice: async (q, o) => answer(q, o), optionalChoice: async (q, o) => answer(q, o),
      confirm: async (q) => answer(q, []), text: async (q) => answer(q, []),
      info: () => {}, highlightInSource: async () => {}, focusSubtask: () => {},
      suggestFile: async () => null, suggestTemplate: async () => null, suggestFolder: async () => null
    }
  };
}
/** `creates` is the sequence of answers from the Tasks "create" dialogue ("" = cancel). */
function setup(files, answers, { creates = [], edits = [], mode = "process", ids = ["id1", "id2", "id3", "id4"] } = {}) {
  const vault = makeVault(files);
  const s = scripted(answers);
  const c = [...creates], e = [...edits], idq = [...ids];
  const ctx = {
    app: makeApp(vault), mode, quickBatch: [], sourceKind: "file",
    settings: Object.assign({}, DEFAULT_SETTINGS, { dimensions: [DEFAULT_SETTINGS.dimensions[0]],
      enablePriorityStep: false, enableCustomTagStep: false, curatedMoveTargets: ["Lists/Next.md"] }),
    tasks: {
      canEditViaApi: () => true,
      createNewTaskLine: async () => (c.length ? c.shift() : ""),
      editTaskLine: async (l) => (e.length ? e.shift() : l),
      newDependencyId: () => idq.shift(),
      idSignifier: (id) => `${ID} ${id}`,
      blockedBySignifier: (id) => `${WAIT} ${id}`
    },
    prompter: s.prompter
  };
  ctx.filing = new DefaultFilingStrategy();
  return { vault, s, ctx, read: (p = "P.md") => vault.store.get(p).split("\n") };
}

/* ================================ Organise filing ================================ */

const ORG = (extra = {}) => Object.assign({ "Physical context": ["home"] }, extra);
const task = (raw = "- [ ] Call Sam") => ({ file: F(), startLine: 0, endLine: 0, raw, isProject: false });

test("dismissing the note search goes back to Move to…", async () => {
  const h = setup({ "P.md": "- [ ] Call Sam", "Lists/Next.md": "" }, ORG({ "Move to": ["__search__", "Lists/Next.md"] }), { mode: "organise" });
  await runOrganise(h.ctx, task(), h.ctx.filing);
  assert.strictEqual(h.s.asked.filter((a) => a.q.startsWith("Move to")).length, 2, "asked again, not moved on");
  assert.strictEqual(h.vault.store.get("Lists/Next.md").trim(), "- [ ] Call Sam #home");
});

test("dismissing the template picker goes back to Move to…", async () => {
  const h = setup({ "P.md": "- [ ] Call Sam", "Lists/Next.md": "" }, ORG({ "Move to": ["__template__", "Lists/Next.md"] }), { mode: "organise" });
  await runOrganise(h.ctx, task(), h.ctx.filing);
  assert.strictEqual(h.vault.store.get("Lists/Next.md").trim(), "- [ ] Call Sam #home");
});

test("dismissing the template's folder picker goes back, and creates nothing", async () => {
  // It used to carry on with the default folder: create the note, move the task.
  const h = setup({ "P.md": "- [ ] Call Sam", "Lists/Next.md": "" },
    ORG({ "Move to": ["__template__", "Lists/Next.md"], "New note name": ["Calls"] }), { mode: "organise" });
  h.ctx.prompter.suggestTemplate = async () => new TFile("Templates/Note.md");
  const before = [...h.vault.store.keys()].sort();
  await runOrganise(h.ctx, task(), h.ctx.filing);
  assert.deepStrictEqual([...h.vault.store.keys()].sort(), before, "no note was created");
  assert.strictEqual(h.vault.store.get("Lists/Next.md").trim(), "- [ ] Call Sam #home");
});

test("Back from the heading list goes back to Move to…", async () => {
  const h = setup({ "P.md": "- [ ] Call Sam\n## Calls", "Lists/Next.md": "" },
    ORG({ "Move to": ["__heading__", "Lists/Next.md"], "Which heading?": ["__back__"] }), { mode: "organise" });
  await runOrganise(h.ctx, task(), h.ctx.filing);
  assert.strictEqual(h.vault.store.get("Lists/Next.md").trim(), "- [ ] Call Sam #home");
});

test("a heading that has gone since the list was shown asks again", async () => {
  const h = setup({ "P.md": "- [ ] Call Sam\n## Calls\n## Later" }, ORG({ "Move to": ["__heading__", "__heading__"], "Which heading?": ["1", "2"] }), { mode: "organise" });
  let first = true;
  const real = h.ctx.prompter.choice;
  h.ctx.prompter.choice = async (q, o) => {
    const a = await real(q, o);
    if (String(q).replace(/\*\*/g, "") === "Which heading?" && first) { first = false; h.vault.store.set("P.md", "- [ ] Call Sam #home\nCalls, now prose\n## Later"); }
    return a;
  };
  await runOrganise(h.ctx, task(), h.ctx.filing);
  assert.deepStrictEqual(h.read(), ["Calls, now prose", "## Later", "- [ ] Call Sam #home"]);
});

/* ============================== adding next actions ============================== */

test("cancelling Add another goes back to Next action saved, keeping what was made", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [false],
    "Next action saved.": ["another", "another", "done"]
  }, { creates: ["- [ ] Book flights", "- [ ] Book hotel", ""] });
  const n = await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.strictEqual(n, 2);
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Book flights", "    - [ ] Book hotel"]);
  assert.strictEqual(h.s.asked.filter((a) => a.q === "Next action saved.").length, 3, "back to it after the cancel");
});

test("a brand-new project still restarts if its first next action is cancelled", async () => {
  // Otherwise it would be left with no next action at all.
  const h = setup({ "P.md": "- [ ] Trip" }, {
    "Actionable this week?": [true], "Does this need more than one step?": ["yes"]
  }, { creates: [""], edits: ["- [ ] Trip booked"] });
  await assert.rejects(() => runProcess(h.ctx, task("- [ ] Trip")), (e) => e.kind === "retry");
});

test("an existing project goes back to Add another… if the first one is cancelled", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project\n    - [ ] Book flights" }, {
    "Actionable this week?": [true, true],
    "Does this need more than one step?": ["no"],
    "Add another next action to this project?": ["yes", "no"]
  });
  await runProcess(h.ctx, { file: F(), startLine: 0, endLine: 1, raw: "- [ ] Trip #project", isProject: true });
  assert.strictEqual(h.s.asked.filter((a) => a.q.startsWith("Add another next action")).length, 2);
  assert.deepStrictEqual(h.s.left(), []);
});

test("a project made from a step goes back to Add another… too", async () => {
  const h = setup({ "P.md": "- [ ] Sort out venue" }, {
    "Actionable this week?": [true], "Does this need more than one step?": ["step"],
    "Which project is it a step in?": ["__new__"], "Is this a clear next action?": ["keep"],
    "Add another next action to this project?": ["yes", "no"]
  }, { creates: ["- [ ] Venue booked", ""] });
  await runProcess(h.ctx, task("- [ ] Sort out venue"));
  assert.strictEqual(h.s.asked.filter((a) => a.q.startsWith("Add another next action")).length, 2);
});

test("Organise goes back to 'no next action' if adding one is cancelled", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project", "Lists/Next.md": "" }, {
    "This project has no next action.": ["add", "leave"], "Move to": ["Lists/Next.md"]
  }, { mode: "organise", creates: [""] });
  await runOrganise(h.ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Trip #project", isProject: true }, h.ctx.filing);
  assert.strictEqual(h.s.asked.filter((a) => a.q === "This project has no next action.").length, 2);
});

/* ================================ Fix one of these… ================================ */

test("Fix one of these is offered with every saved next action", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project" }, { "Next action saved.": ["done"] }, { creates: ["- [ ] Book flights"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.ok(h.s.asked[0].opts.includes("fix"));
});

test("with one next action, Fix goes straight to it", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Next action saved.": ["fix", "done"], "Fix “Book flights”": ["reword"]
  }, { creates: ["- [ ] Book flights"], edits: ["    - [ ] Book flights to Berlin"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.ok(!h.s.asked.some((a) => a.q === "Which one?"));
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Book flights to Berlin"]);
});

test("rewording an earlier one leaves the others alone and keeps it nested", async () => {
  // The reported case: a mistake one next action ago.
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [false],
    "Next action saved.": ["another", "fix", "done"],
    "Which one?": ["1"], "Fix “Book flights”": ["reword"]
  }, { creates: ["- [ ] Book flights", "- [ ] Book hotel"], edits: ["- [ ] Book flights to Berlin"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Book flights to Berlin", "    - [ ] Book hotel"]);
});

test("Which one? lists the most recent first", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [false], "Next action saved.": ["another", "fix", "done"], "Which one?": ["__back__"]
  }, { creates: ["- [ ] Book flights", "- [ ] Book hotel"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.deepStrictEqual(h.s.asked.find((a) => a.q === "Which one?").opts, ["2", "1", "__back__"]);
});

test("cancelling the reword goes back to Fix, and Back goes back to Which one?", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [false],
    "Next action saved.": ["another", "fix", "done"],
    "Which one?": ["1", "__back__"],
    "Fix “Book flights”": ["reword", "__back__"]
  }, { creates: ["- [ ] Book flights", "- [ ] Book hotel"], edits: [""] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  const qs = h.s.asked.map((a) => a.q);
  assert.deepStrictEqual(qs.slice(qs.indexOf("Which one?")),
    ["Which one?", "Fix “Book flights”", "Fix “Book flights”", "Which one?", "Next action saved."]);
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Book flights", "    - [ ] Book hotel"], "unchanged");
});

test("removing one keeps the rest, and the next goes after the new last", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project\n- [ ] After" }, {
    "Must this wait": [false, false, false],
    "Next action saved.": ["another", "another", "fix", "another", "done"],
    "Which one?": ["2"], "Fix “Call Bea”": ["remove"]
  }, { creates: ["- [ ] Call Ann", "- [ ] Call Bea", "- [ ] Call Cal", "- [ ] Call Dee"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Call Ann", "    - [ ] Call Cal", "    - [ ] Call Dee", "- [ ] After"]);
});

test("removing a link in a waiting chain re-links it", async () => {
  // A <- B <- C. Remove B: C now waits on A, so only A shows as not blocked.
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [true, true],
    "Next action saved.": ["another", "another", "fix", "done"],
    "Which one?": ["2"], "Fix “Call Bea”": ["remove"]
  }, { creates: ["- [ ] Call Ann", "- [ ] Call Bea", "- [ ] Call Cal"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  const [, a, c] = h.read();
  assert.strictEqual(taskIdOf(a), "id1");
  assert.deepStrictEqual(dependsOnOf(c), ["id1"], "C waits on A now");
  assert.strictEqual(h.read().length, 3);
});

test("removing one that waited on nothing frees what waited on it", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [false, true],
    "Next action saved.": ["another", "another", "fix", "done"],
    "Which one?": ["2"], "Fix “Call Bea”": ["remove"]
  }, { creates: ["- [ ] Call Ann", "- [ ] Call Bea", "- [ ] Call Cal"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Call Ann", "    - [ ] Call Cal"], "no dangling marker");
});

test("removing the last, then adding another that waits, reuses the existing id", async () => {
  // A <- B, remove B, add C that waits: A already has an id, and may carry only one.
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [true, true],
    "Next action saved.": ["another", "fix", "another", "done"],
    "Which one?": ["2"], "Fix “Call Bea”": ["remove"]
  }, { creates: ["- [ ] Call Ann", "- [ ] Call Bea", "- [ ] Call Cal"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  const [, a, c] = h.read();
  assert.strictEqual((a.match(new RegExp(ID, "gu")) || []).length, 1, "one id on A");
  assert.deepStrictEqual(dependsOnOf(c), [taskIdOf(a)]);
});

test("removing every one goes back to adding the first", async () => {
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Next action saved.": ["fix", "done"], "Fix “Call Ann”": ["remove"]
  }, { creates: ["- [ ] Call Ann", "- [ ] Right one"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Right one"]);
});

test("a batched one that is reworded or removed is updated in the batch", async () => {
  // Batch both, reword the first, then remove it.
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [false],
    "Next action saved.": ["batch", "batch"],
    "Added to the two-minute batch.": ["another", "fix", "fix", "done"],
    "Which one?": ["1", "1"],
    "Fix \u201CText Sam\u201D": ["reword"],
    "Fix \u201CText Sam the dates\u201D": ["remove"]
  }, { creates: ["- [ ] Text Sam", "- [ ] Email Priya"], edits: ["- [ ] Text Sam the dates"] });
  await addSubtasks(h.ctx, F(), 0, null, false, true, 0);
  const [a, b] = h.ctx.quickBatch;
  assert.strictEqual(a.raw.trim(), "- [ ] Text Sam the dates", "rewording reached the batch");
  assert.strictEqual(a.removed, true, "removing reached the batch");
  assert.strictEqual(b.line, 1, "and the one after it moved up a line there too");
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Email Priya"]);
  assert.deepStrictEqual(h.s.left(), []);
});

/* ============================== the rewrite prompts ============================== */

test("cancelling a vague-wording rewrite goes back to its question", async () => {
  const h = setup({ "P.md": "- [ ] Sort out hotel" }, { "may not be a next action": ["rewrite", "keep"] }, { edits: [""] });
  assert.strictEqual(await confirmNextAction(h.ctx, F(), 0), null);
  assert.strictEqual(h.s.asked.length, 2);
});

test("…which no longer throws away a project's next actions", async () => {
  // Reached while adding next actions, a cancel here used to restart the whole task.
  const h = setup({ "P.md": "- [ ] Trip #project" }, {
    "Must this wait": [false],
    "Next action saved.": ["another", "done"],
    "may not be a next action": ["rewrite", "keep"]
  }, { creates: ["- [ ] Book flights", "- [ ] Sort out hotel"], edits: [""] });
  assert.strictEqual(await addSubtasks(h.ctx, F(), 0, null, false, true, 0), 2);
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Book flights", "    - [ ] Sort out hotel"]);
});

test("cancelling the rewrite of a filed step goes back to its question", async () => {
  const h = setup({ "P.md": "- [ ] Call Sam" }, { "Is this a clear next action?": ["rewrite", "keep"] }, { edits: [""] });
  assert.strictEqual(await clarifyFiledAction(h.ctx, F(), 0), null);
  assert.strictEqual(h.s.asked.length, 2);
});

test("a prompter that always cancels can't loop forever", async () => {
  const h = setup({ "P.md": "- [ ] Sort out hotel" }, {}, {});
  h.ctx.prompter.choice = async () => "rewrite";
  h.ctx.tasks.editTaskLine = async () => "";
  assert.strictEqual(await confirmNextAction(h.ctx, F(), 0), null);
  const f = setup({ "P.md": "- [ ] Call Sam" }, {}, {});
  f.ctx.prompter.choice = async () => "__search__";
  assert.strictEqual(await new DefaultFilingStrategy().fileTask(f.ctx, task()), "cancelled");
});

test("Took longer in the batch no longer crashes on a cancelled rewrite", async () => {
  // confirmNextAction ran outside the batch's error handling, so its old restart signal
  // escaped the review entirely.
  const fs = require("node:fs");
  const main = fs.readFileSync(require("node:path").join(__dirname, "..", "src", "main.js"), "utf8");
  const src = main.slice(main.indexOf("  async runQuickBatch(ctx, batch) {"));
  const body = src.slice(0, src.indexOf("\n  }\n") + 4);
  const Klass = new Function("locateQueuedAction", "COMPLETED_STATUSES", "taskStatusOf", "computeSubtreeEnd",
    "completeSubtree", "confirmNextAction", "GUIDANCE", "ReviewControl", `return class { ${body} }`)(
    L.locateQueuedAction, L.COMPLETED_STATUSES, L.taskStatusOf, L.computeSubtreeEnd, L.completeSubtree,
    L.confirmNextAction, L.GUIDANCE, L.ReviewControl);
  const h = setup({ "P.md": "- [ ] Sort out hotel" }, {
    "Two-minute batch": ["keep"], "may not be a next action": ["rewrite", "keep"]
  }, { edits: [""] });
  const pane = Object.assign(new Klass(), { app: h.ctx.app, exiting: false, headerEl: { setText() {} },
    highlightInSource: async () => {}, choice: h.ctx.prompter.choice });
  await assert.doesNotReject(() => pane.runQuickBatch(h.ctx, [{ file: F(), line: 0, raw: "- [ ] Sort out hotel" }]));
});

test("removed batch entries are skipped by the batch", async () => {
  // Even when an identical line still exists, so finding it by text alone would succeed.
  const fs = require("node:fs");
  const main = fs.readFileSync(require("node:path").join(__dirname, "..", "src", "main.js"), "utf8");
  const src = main.slice(main.indexOf("  async runQuickBatch(ctx, batch) {"));
  const body = src.slice(0, src.indexOf("\n  }\n") + 4);
  const Klass = new Function("locateQueuedAction", "COMPLETED_STATUSES", "taskStatusOf", "computeSubtreeEnd",
    "completeSubtree", "confirmNextAction", "GUIDANCE", "ReviewControl", "projectAbove", "settleProjectLeft", `return class { ${body} }`)(
    L.locateQueuedAction, L.COMPLETED_STATUSES, L.taskStatusOf, L.computeSubtreeEnd, L.completeSubtree,
    L.confirmNextAction, L.GUIDANCE, L.ReviewControl, L.projectAbove, L.settleProjectLeft);
  const h = setup({ "P.md": "- [ ] Text Sam\n- [ ] Email Priya" }, { "Two-minute batch": ["done"] });
  const shown = [];
  const pane = Object.assign(new Klass(), { app: h.ctx.app, exiting: false, headerEl: { setText() {} },
    highlightInSource: async (t) => shown.push(t.raw.trim()), choice: h.ctx.prompter.choice });
  await pane.runQuickBatch(h.ctx, [
    { file: F(), line: 0, raw: "- [ ] Text Sam", removed: true },
    { file: F(), line: 1, raw: "- [ ] Email Priya" }
  ]);
  assert.deepStrictEqual(shown, ["- [ ] Email Priya"]);
});

/* ============================== dependency markers ============================== */

test("markers are read with or without a variation selector, and spaced lists", () => {
  assert.strictEqual(taskIdOf(`- [ ] a ${ID}️ abc123`), "abc123");
  assert.deepStrictEqual(dependsOnOf(`- [ ] a ${WAIT} x1, y2 ,z3`), ["x1", "y2", "z3"]);
  assert.deepStrictEqual(dependsOnOf("- [ ] a"), []);
});

test("setDependsOn replaces, adds, and removes the marker", () => {
  assert.strictEqual(setDependsOn(`- [ ] a ${WAIT} x1 #tag`, ["y2", "z3"]), `- [ ] a ${WAIT} y2,z3 #tag`);
  assert.strictEqual(setDependsOn("- [ ] a", ["y2"]), `- [ ] a ${WAIT} y2`);
  assert.strictEqual(setDependsOn(`- [ ] a ${WAIT} x1 #tag`, []), "- [ ] a #tag");
});

test("ensureTaskId reuses an id that is already there", async () => {
  const h = setup({ "P.md": `- [ ] a ${ID} keep1` }, {});
  assert.strictEqual(await ensureTaskId(h.ctx, F(), 0), "keep1");
  assert.strictEqual(h.read()[0], `- [ ] a ${ID} keep1`);
});
