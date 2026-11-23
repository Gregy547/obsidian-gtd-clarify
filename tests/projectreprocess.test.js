/**
 * Re-processing a whole project from Organise.
 *
 * Organise shows a project as its next actions, one at a time, so Re-process always landed
 * on the action on screen; the project itself could only be re-processed after every action
 * had been labelled. "Process the whole project again" starts where Process does — is the
 * project actionable this week? — and undoes anything organised for the project first.
 *
 * Driven through the real runOrganise with a scripted prompter, as in reprocess.test.js.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { runOrganise, withReprocess, reprocessWholeProject, ReviewControl, DefaultFilingStrategy,
  DEFAULT_SETTINGS, GUIDANCE } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const CTX_Q = "Physical context";
const REPROCESS = () => new ReviewControl("reprocess");

function scripted(answers) {
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [], focused = [];
  const answer = (q, opts, tip) => {
    q = String(q).replace(/\*\*/g, "");
    asked.push({ q, opts: (opts || []).map((o) => o.value), tip });
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
      choice: async (q, o, g) => answer(q, o, g),
      optionalChoice: async (q, o) => answer(q, o),
      confirm: async (q) => answer(q, []),
      text: async (q) => answer(q, []),
      info: () => {},
      highlightInSource: async () => {},
      focusSubtask: (parent, line, raw) => focused.push(raw.trim())
    }
  };
}
function setup(files, answers, tasks = {}) {
  const vault = makeVault(Object.assign({ "Lists/Next.md": "", "Lists/Projects.md": "", "Someday/Someday.md": "" }, files));
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
function itemAt(content, line) {
  const lines = content.split("\n");
  return {
    file: new TFile("Inbox.md"), startLine: line, endLine: L.computeSubtreeEnd(lines, line),
    raw: lines[line], isProject: L.lineHasTag(lines[line], "project")
  };
}
const questions = (h) => h.s.asked.map((a) => a.q);

const PROJECT = ["- [ ] Berlin trip #project", "    - [ ] Email hotel for rates", "    - [ ] Book flights to Berlin"].join("\n");

/* ========================= starting where Process does ========================= */

test("from a next action, the whole project can be processed again — project first", async () => {
  const content = PROJECT + "\n- [ ] Unrelated";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS()],
    "Re-process this next action": ["project"],
    "Actionable this week?": [false],
    "What should happen to it?": ["cancel"]
  });
  const item = itemAt(content, 0);
  await runOrganise(h.ctx, item, h.ctx.filing);
  const q = questions(h);
  const at = q.indexOf("Re-process this next action");
  assert.strictEqual(q[at + 1], "Actionable this week?", "the project is asked about before any next action");
  const actionable = h.s.asked.find((a) => a.q === "Actionable this week?");
  assert.ok(!actionable.opts.includes("split") && !actionable.opts.includes("twomin"),
    "asked about the project, which is never split or batched");
  const lines = h.read("Inbox.md").split("\n");
  assert.deepStrictEqual(lines.slice(0, 3).map(L.taskStatusOf), ["-", "-", "-"], "cancelled, next actions and all");
  assert.strictEqual(lines[3], "- [ ] Unrelated");
  assert.strictEqual(item.disposed, true, "and counted as gone");
  assert.ok(!q.some((x) => x.startsWith("Move to")), "nothing left to file");
  assert.deepStrictEqual(h.s.left(), []);
});

test("the answer isn't asked for twice", async () => {
  const content = PROJECT;
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS()],
    "Re-process this next action": ["project"],
    "Actionable this week?": [false],
    "What should happen to it?": ["delete"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.ok(!questions(h).includes("Re-process this project"), "choosing it from the next action was the answer");
  assert.strictEqual(h.read("Inbox.md").trim(), "");
});

test("the whole project can go to Someday, next actions and all, unlabelled", async () => {
  const content = PROJECT + "\n- [ ] Unrelated";
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: ["home", REPROCESS()],
    "Re-process this next action": ["project"],
    "Actionable this week?": [false],
    "What should happen to it?": ["someday"]
  });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  const someday = h.read("Someday/Someday.md");
  for (const raw of PROJECT.split("\n")) assert.ok(someday.includes(raw), `${raw.trim()} moved whole`);
  assert.ok(!someday.includes("#home"), "the label given before Re-process was undone");
  assert.strictEqual(h.read("Inbox.md").trim(), "- [ ] Unrelated");
});

test("labels given to earlier next actions are undone, then the project is organised afresh", async () => {
  const h = setup({ "Inbox.md": PROJECT }, {
    [CTX_Q]: ["home", REPROCESS(), "office", "errands"],
    "Re-process this next action": ["project"],
    "Actionable this week?": [true, true, true],
    "Does this need more than one step?": ["no", "no"],
    "Add another next action to this project?": ["no"],
    "Move to": ["Lists/Projects.md"]
  });
  await runOrganise(h.ctx, itemAt(PROJECT, 0), h.ctx.filing);
  assert.deepStrictEqual(h.read("Lists/Projects.md").trim().split("\n"), [
    "- [ ] Berlin trip #project",
    "    - [ ] Email hotel for rates #office",
    "    - [ ] Book flights to Berlin #errands"
  ]);
  const q = questions(h);
  assert.ok(q.indexOf("Actionable this week?") < q.lastIndexOf("Add another next action to this project?"),
    "and its next actions are walked through Process, as in Process");
});

/* ================================ what's offered ================================ */

test("it's offered on a next action, and not on a task that has none", async () => {
  const p = setup({ "Inbox.md": PROJECT }, {
    [CTX_Q]: [REPROCESS(), "home", "office"],
    "Re-process this next action": ["organise"],
    "Move to": ["Lists/Projects.md"]
  });
  await runOrganise(p.ctx, itemAt(PROJECT, 0), p.ctx.filing);
  const onAction = p.s.asked.find((a) => a.q === "Re-process this next action");
  assert.deepStrictEqual(onAction.opts, ["wording", "process", "project", "organise"]);
  assert.strictEqual(onAction.tip, GUIDANCE.reprocessInProject, "with the tip that tells the two apart");

  const t = setup({ "Inbox.md": "- [ ] Call Sam" }, {
    [CTX_Q]: [REPROCESS(), "home"],
    "Re-process this task": ["organise"],
    "Move to": ["Lists/Next.md"]
  });
  await runOrganise(t.ctx, itemAt("- [ ] Call Sam", 0), t.ctx.filing);
  const onTask = t.s.asked.find((a) => a.q === "Re-process this task");
  assert.ok(!onTask.opts.includes("project"));
  assert.strictEqual(onTask.tip, GUIDANCE.reprocess);
});

test("pressed at a project's filing step, the question names the project", async () => {
  const h = setup({ "Inbox.md": PROJECT }, {
    [CTX_Q]: ["home", "office", "home", "office"],
    "Move to": [REPROCESS(), "Lists/Projects.md"],
    "Re-process this project": ["organise"]
  });
  await runOrganise(h.ctx, itemAt(PROJECT, 0), h.ctx.filing);
  const q = h.s.asked.find((a) => a.q === "Re-process this project");
  assert.ok(q, "asked as a project");
  assert.ok(!q.opts.includes("project"), "it already is the whole project");
  assert.ok(!questions(h).includes("Re-process this task"));
});

test("the tip says what each scope does", () => {
  assert.match(GUIDANCE.reprocessInProject, /next action on screen/);
  assert.match(GUIDANCE.reprocessInProject, /actionable this week/);
  assert.match(GUIDANCE.reprocessInProject, /undone/);
});

/* ================================= the signal ================================= */

test("a whole-project re-process passes the next action's handler and reaches the project's", async () => {
  const vault = makeVault({ "Inbox.md": PROJECT });
  const ctx = { app: makeApp(vault) };
  const project = { file: new TFile("Inbox.md"), startLine: 0, endLine: 2, raw: "p", isProject: true };
  const action = { file: new TFile("Inbox.md"), startLine: 1, endLine: 1, raw: "a", isProject: false };
  let actionAgain = 0, projectHow = null;
  await withReprocess(ctx, project,
    (c) => withReprocess(c, action,
      async (cc) => {
        await cc.app.vault.process(action.file, (d) => d + "\nwritten");
        throw reprocessWholeProject(project);
      },
      async () => { actionAgain++; }),
    async (c, how) => { projectHow = how; });
  assert.strictEqual(actionAgain, 0, "the next action's handler let it through");
  assert.strictEqual(projectHow, "process", "with the answer already given");
  assert.strictEqual(vault.store.get("Inbox.md"), PROJECT, "rolled back to before the project was touched");
});

test("an ordinary Re-process is still caught by the nearest handler", async () => {
  const vault = makeVault({ "Inbox.md": PROJECT });
  const ctx = { app: makeApp(vault) };
  const project = { file: new TFile("Inbox.md"), startLine: 0, endLine: 2, raw: "p" };
  const action = { file: new TFile("Inbox.md"), startLine: 1, endLine: 1, raw: "a" };
  let actionAgain = 0, projectAgain = 0;
  await withReprocess(ctx, project,
    (c) => withReprocess(c, action, async () => { throw new ReviewControl("reprocess"); }, async () => { actionAgain++; }),
    async () => { projectAgain++; });
  assert.deepStrictEqual([actionAgain, projectAgain], [1, 0]);
});

test("Restart, Skip, Exit and a cancelled dialogue still reach the review loop from inside it", async () => {
  for (const kind of ["back", "skip", "exit", "prev", "retry"]) {
    const h = setup({ "Inbox.md": PROJECT }, {
      [CTX_Q]: [REPROCESS()],
      "Re-process this next action": ["project"],
      "Actionable this week?": [new ReviewControl(kind)]
    });
    await assert.rejects(() => runOrganise(h.ctx, itemAt(PROJECT, 0), h.ctx.filing),
      (e) => e instanceof ReviewControl && e.kind === kind, kind);
  }
});

/* ============================ projects made on the way ============================ */

test("a project that came out of a split can be processed again whole", async () => {
  // It has no handler from runOrganise — that one is for the capture it was split from —
  // so without one of its own the signal would escape the review.
  const content = "- [ ] Call Sam, launch party";
  let created = 0;
  const h = setup({ "Inbox.md": content }, {
    [CTX_Q]: [REPROCESS(), "home", REPROCESS()],
    "Re-process this task": ["process"],
    "Actionable this week?": ["split", true, true, false],
    "Split it": ["Call Sam"],
    "Next item": ["Launch party held", ""],
    "Does this need more than one step?": ["no", "yes"],
    "Next action saved.": ["done"],
    "Re-process this next action": ["project"],
    "What should happen to it?": ["delete"],
    "Move to": ["Lists/Next.md"]
  }, { createNewTaskLine: async () => (++created === 1 ? "- [ ] Email Priya the guest list" : "") });
  await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
  assert.strictEqual(h.read("Lists/Next.md").trim(), "- [ ] Call Sam #home", "the other piece is untouched");
  assert.strictEqual(h.read("Inbox.md").trim(), "", "the project piece, deleted whole");
  const last = h.s.asked.filter((a) => a.q === "Actionable this week?").pop();
  assert.ok(!last.opts.includes("split"), "asked about the project piece, not the capture");
  assert.deepStrictEqual(h.s.left(), []);
});

test("re-processing a project twice works as it does for a task", async () => {
  // The project's handler is not stacked a second time inside runOrganise's: a second
  // Re-process undoes the first one's changes too, exactly as for a single task.
  const run = async (content, title, reworded) => {
    const h = setup({ "Inbox.md": content }, {
      [CTX_Q]: Array(6).fill("home"),
      "Move to": [REPROCESS(), REPROCESS(), content.includes("#project") ? "Lists/Projects.md" : "Lists/Next.md"],
      [title]: ["wording", "organise"]
    }, { editTaskLine: async () => reworded });
    await runOrganise(h.ctx, itemAt(content, 0), h.ctx.filing);
    return h.read(content.includes("#project") ? "Lists/Projects.md" : "Lists/Next.md").split("\n")[0];
  };
  const task = await run("- [ ] Call Sam", "Re-process this task", "- [ ] Call Sam re: dates");
  const project = await run(PROJECT, "Re-process this project", "- [ ] Berlin trip booked #project");
  assert.strictEqual(task, "- [ ] Call Sam #home");
  assert.strictEqual(project, "- [ ] Berlin trip #project");
});
