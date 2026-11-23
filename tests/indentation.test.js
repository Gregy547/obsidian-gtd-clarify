/**
 * Keeping nested tasks nested.
 *
 * Three places assumed a task sat at the top level of its note: editing a task, adding next
 * actions to a project, and creating a new project above a task. For top-level tasks they
 * were right, which is why nothing caught them. For a project's next actions — walked in
 * Process since 1.8.0, and re-processed in Organise now — they pulled tasks out of their
 * projects, because indentation is the only thing that nests them.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { editTaskLineTagged, addSubtasks, DEFAULT_SETTINGS, ReviewControl } = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const F = () => new TFile("P.md");
function scripted(answers) {
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const answer = (q) => {
    q = String(q).replace(/\*\*/g, "");
    const key = Object.keys(queues).find((k) => String(q).replace(/\*\*/g, "").includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    const a = queues[key].shift();
    if (a instanceof Error) throw a;
    return a;
  };
  return {
    left: () => Object.entries(queues).filter(([, q]) => q.length).map(([k]) => k),
    prompter: {
      choice: async (q) => answer(q), optionalChoice: async (q) => answer(q),
      confirm: async (q) => answer(q), text: async (q) => answer(q),
      info: () => {}, highlightInSource: async () => {}, focusSubtask: () => {}
    }
  };
}
function ctxFor(content, answers, tasks = {}, extra = {}) {
  const vault = makeVault({ "P.md": content });
  const s = scripted(answers);
  return {
    vault, s, read: () => vault.store.get("P.md").split("\n"),
    ctx: Object.assign({
      app: makeApp(vault),
      settings: Object.assign({}, DEFAULT_SETTINGS),
      tasks: Object.assign({ canEditViaApi: () => true, editTaskLine: async (l) => l, newDependencyId: () => "x" }, tasks),
      mode: "process", quickBatch: [], prompter: s.prompter
    }, extra)
  };
}

/* --------------------------------- editing --------------------------------- */

test("rewording a nested task keeps it nested (Tasks API path)", async () => {
  // Tasks returns the line with its indentation; it was trimmed and never put back.
  for (const returned of ["    - [ ] Email hotel for rates", "- [ ] Email hotel for rates"]) {
    const h = ctxFor("- [ ] Trip #project\n    - [ ] Sort out hotel\n    - [ ] Book flights", {},
      { editTaskLine: async () => returned });
    const out = await editTaskLineTagged(h.ctx, F(), 1, []);
    assert.strictEqual(out, "    - [ ] Email hotel for rates", JSON.stringify(returned));
    assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Email hotel for rates", "    - [ ] Book flights"]);
  }
});

test("rewording a nested task keeps it nested (editor fallback path)", async () => {
  const h = ctxFor("- [ ] Trip #project\n\t- [ ] Sort out hotel", {}, {
    canEditViaApi: () => false,
    editExistingInPlace: async (file, line) => {
      const lines = h.vault.store.get("P.md").split("\n");
      lines[line] = "\t- [ ] Email hotel";
      h.vault.store.set("P.md", lines.join("\n"));
    }
  });
  await editTaskLineTagged(h.ctx, F(), 1, ["#x"]);
  assert.strictEqual(h.read()[1], "\t- [ ] Email hotel #x", "tabs are kept as tabs");
});

test("a top-level task is unaffected", async () => {
  const h = ctxFor("- [ ] Sort out hotel", {}, { editTaskLine: async () => "- [ ] Email hotel" });
  assert.strictEqual(await editTaskLineTagged(h.ctx, F(), 0, ["#project"]), "- [ ] Email hotel #project");
});

test("Process's walk of a project keeps a reworded next action inside it", async () => {
  // The reported scenario end to end: an existing project, a next action answered
  // "No — it's a single next action", reworded.
  const h = ctxFor("- [ ] Trip #project\n    - [ ] Sort out hotel\n    - [ ] Book flights", {
    // The project itself, then each of its next actions.
    "Actionable this week?": [true, true, true],
    "Does this need more than one step?": ["no", "no"],
    "Add another next action to this project?": ["no"]
  }, {
    editTaskLine: async (l) => (l.includes("Sort out hotel") ? "    - [ ] Email hotel for rates" : l)
  });
  await runProcess(h.ctx, { file: F(), startLine: 0, endLine: 2, raw: "- [ ] Trip #project", isProject: true });
  assert.deepStrictEqual(h.read(), ["- [ ] Trip #project", "    - [ ] Email hotel for rates", "    - [ ] Book flights"]);
  assert.deepStrictEqual(h.s.left(), [], "and both actions were reached");
});

/* ---------------------------- adding next actions ---------------------------- */

test("new next actions go one level below their project, at any depth", async () => {
  const h = ctxFor("- [ ] Launch #project\n    - [ ] Venue booked #project\n    - [ ] Book caterer",
    { "Next action saved.": ["done"] },
    { createNewTaskLine: (() => { let n = 0; return async () => (++n === 1 ? "- [ ] Shortlist venues" : ""); })() });
  await addSubtasks(h.ctx, F(), 1, null, false, false, 1);
  assert.deepStrictEqual(h.read(), [
    "- [ ] Launch #project", "    - [ ] Venue booked #project", "        - [ ] Shortlist venues", "    - [ ] Book caterer"
  ]);
});

test("without a parent line, next actions keep the old single indent", async () => {
  const h = ctxFor("- [ ] Launch #project", { "Next action saved.": ["done"] },
    { createNewTaskLine: (() => { let n = 0; return async () => (++n === 1 ? "- [ ] Book venue" : ""); })() });
  await addSubtasks(h.ctx, F(), 0, null, false, false);
  assert.deepStrictEqual(h.read(), ["- [ ] Launch #project", "    - [ ] Book venue"]);
});

test("a next action turned into a project gets its own next actions as children", async () => {
  const h = ctxFor("- [ ] Launch #project\n    - [ ] Sort out venue\n    - [ ] Book caterer", {
    "Actionable this week?": [true],
    "Does this need more than one step?": ["yes"],
    "Next action saved.": ["done"]
  }, {
    editTaskLine: async () => "    - [ ] Venue booked",
    createNewTaskLine: (() => { let n = 0; return async () => (++n === 1 ? "- [ ] Shortlist venues" : ""); })()
  });
  await runProcess(h.ctx, { file: F(), startLine: 1, endLine: 1, raw: "    - [ ] Sort out venue", isProject: false }, 1);
  assert.deepStrictEqual(h.read(), [
    "- [ ] Launch #project", "    - [ ] Venue booked #project", "        - [ ] Shortlist venues", "    - [ ] Book caterer"
  ]);
});

/* ------------------------- a new project above a task ------------------------- */

test("a nested task filed under a new project stays at its depth", async () => {
  const h = ctxFor("- [ ] Launch #project\n    - [ ] Sort out venue\n    - [ ] Book caterer", {
    "Actionable this week?": [true],
    "Does this need more than one step?": ["step"],
    "Which project is it a step in?": ["__new__"],
    "Is this a clear next action?": ["keep"],
    "Add another next action to this project?": ["no"]
  }, { createNewTaskLine: async () => "- [ ] Venue booked" });
  await runProcess(h.ctx, { file: F(), startLine: 1, endLine: 1, raw: "    - [ ] Sort out venue", isProject: false }, 1);
  assert.deepStrictEqual(h.read(), [
    "- [ ] Launch #project", "    - [ ] Venue booked #project", "        - [ ] Sort out venue", "    - [ ] Book caterer"
  ]);
});

test("a top-level task filed under a new project is unaffected", async () => {
  const h = ctxFor("- [ ] Sort out venue", {
    "Actionable this week?": [true],
    "Does this need more than one step?": ["step"],
    "Which project is it a step in?": ["__new__"],
    "Is this a clear next action?": ["keep"],
    "Add another next action to this project?": ["no"]
  }, { createNewTaskLine: async () => "- [ ] Venue booked" });
  await runProcess(h.ctx, { file: F(), startLine: 0, endLine: 0, raw: "- [ ] Sort out venue", isProject: false });
  assert.deepStrictEqual(h.read(), ["- [ ] Venue booked #project", "    - [ ] Sort out venue"]);
});

test("Organise adds a nested project's first next action one level below it", async () => {
  // A query can surface a project that sits inside another; its first next action must go
  // beneath it, not beside it.
  const { runOrganise, DefaultFilingStrategy } = L;
  const h = ctxFor("- [ ] Launch #project\n    - [ ] Venue booked #project\n    - [ ] Book caterer #home", {
    "This project has no next action.": ["add"],
    "Next action saved.": ["done"],
    "Physical context": ["office"],
    "Move to": [new ReviewControl("skip")]
  }, {
    createNewTaskLine: (() => { let n = 0; return async () => (++n === 1 ? "- [ ] Shortlist venues" : ""); })()
  }, { mode: "organise" });
  h.ctx.settings.dimensions = [DEFAULT_SETTINGS.dimensions[0]];
  h.ctx.settings.enablePriorityStep = false;
  h.ctx.settings.enableCustomTagStep = false;
  await assert.rejects(() => runOrganise(h.ctx,
    { file: F(), startLine: 1, endLine: 1, raw: "    - [ ] Venue booked #project", isProject: true },
    new DefaultFilingStrategy()), (e) => e.kind === "skip");
  assert.deepStrictEqual(h.read(), [
    "- [ ] Launch #project", "    - [ ] Venue booked #project", "        - [ ] Shortlist venues #office", "    - [ ] Book caterer #home"
  ]);
});

test("adding another next action to a nested existing project nests it", async () => {
  const h = ctxFor("- [ ] Launch #project\n    - [ ] Venue booked #project\n        - [ ] Shortlist venues\n    - [ ] Book caterer", {
    "Actionable this week?": [true, true],
    "Does this need more than one step?": ["no"],
    "Add another next action to this project?": ["yes"],
    "Next action saved.": ["done"]
  }, {
    createNewTaskLine: (() => { let n = 0; return async () => (++n === 1 ? "- [ ] Visit top two" : ""); })()
  });
  await runProcess(h.ctx, { file: F(), startLine: 1, endLine: 2, raw: "    - [ ] Venue booked #project", isProject: true }, 1);
  assert.deepStrictEqual(h.read(), [
    "- [ ] Launch #project", "    - [ ] Venue booked #project", "        - [ ] Shortlist venues",
    "        - [ ] Visit top two", "    - [ ] Book caterer"
  ]);
});

test("adding another next action to a new project made from a nested task nests it", async () => {
  const h = ctxFor("- [ ] Launch #project\n    - [ ] Sort out venue\n    - [ ] Book caterer", {
    "Actionable this week?": [true],
    "Does this need more than one step?": ["step"],
    "Which project is it a step in?": ["__new__"],
    "Is this a clear next action?": ["keep"],
    "Add another next action to this project?": ["yes"],
    "Must this wait": [false],
    "Next action saved.": ["done"]
  }, {
    createNewTaskLine: (() => { let n = 0; return async () => (["- [ ] Venue booked", "- [ ] Visit top two"][n++] || ""); })()
  });
  await runProcess(h.ctx, { file: F(), startLine: 1, endLine: 1, raw: "    - [ ] Sort out venue", isProject: false }, 1);
  assert.deepStrictEqual(h.read(), [
    "- [ ] Launch #project", "    - [ ] Venue booked #project", "        - [ ] Sort out venue",
    "        - [ ] Visit top two", "    - [ ] Book caterer"
  ]);
});
