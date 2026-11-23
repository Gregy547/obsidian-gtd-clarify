/**
 * "One step in a bigger project" reaches projects in other notes, kept apart from this
 * note's.
 *
 * It used to list only projects in the note being processed — but projects usually live in
 * their own notes, so the answer was rarely there. "Which project" now lists this note's
 * projects under their own heading, and a search under "In other notes" finds the rest,
 * each shown with its note. A step filed in another note is labelled there and then:
 * Organise on this note will no longer see it.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const {
  findProjectsElsewhere, moveSubtreeToProjectIn, ProjectSuggestModal, DefaultFilingStrategy, DEFAULT_SETTINGS,
  VaultJournal, journalledApp, organiseAfterProcess, ReviewControl
} = L;
const { runProcess } = L.plugin.__testables;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const plain = (q) => String(q).replace(/\*\*/g, "");
const INBOX = "- Inbox -.md", KITCHEN = "Projects/Kitchen.md", TRIP = "Projects/Berlin.md";

/** Obsidian's tag index for the fake vault: where each #tag sits. */
function tagIndex(vault) {
  return (file) => {
    const text = vault.store.get(file.path);
    if (text == null) return null;
    const tags = [];
    text.split("\n").forEach((l, line) => {
      for (const m of l.matchAll(/(^|\s)(#[^\s#]+)/g)) tags.push({ tag: m[2], position: { start: { line } } });
    });
    return { tags };
  };
}

function setup(files, answers, { pick = [], sourceKind = "file", cache = true, settings = {} } = {}) {
  const vault = makeVault(files);
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [], infos = [], shown = [];
  const answer = (raw, opts) => {
    const q = plain(raw);
    asked.push({ q, opts: (opts || []).map((o) => ({ value: o.value, label: plain(o.label), group: o.group })) });
    const key = Object.keys(queues).find((k) => q.includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    return queues[key].shift();
  };
  const picks = [...pick];
  const offered = [];
  const ctx = {
    app: makeApp(vault, cache ? { getFileCache: tagIndex(vault) } : {}),
    mode: "process", quickBatch: [], sourceKind,
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      dimensions: [DEFAULT_SETTINGS.dimensions[0]], enablePriorityStep: false, enableCustomTagStep: false,
      clarifyNextAction: false
    }, settings),
    tasks: { canEditViaApi: () => true, editTaskLine: async (l) => l },
    prompter: {
      choice: async (q, o) => answer(q, o), optionalChoice: async (q, o) => answer(q, o),
      confirm: async (q) => answer(q, []), text: async (q) => answer(q, []), info: (m) => infos.push(m),
      highlightInSource: async (it) => shown.push({ file: it.file.path, raw: it.raw.trim(), parent: it.parentRaw, label: it.sourceLabel }),
      focusSubtask: () => {},
      suggestProject: async (projects) => {
        offered.push(projects.map((p) => `${p.file.path}:${p.line}`));
        const next = picks.shift();
        return typeof next === "function" ? next(projects) : next == null ? null : projects.find((p) => p.label === next) || null;
      }
    }
  };
  ctx.filing = new DefaultFilingStrategy();
  return { vault, ctx, asked, infos, shown, offered, read: (p) => vault.store.get(p) };
}
const inboxItem = (raw, extra = {}) => ({ file: new TFile(INBOX), startLine: 0, endLine: 0, raw, isProject: false, ...extra });
const STEP = { "Actionable this week?": [true], "Does this need more than one step?": ["step"] };

/* -------------------------------- the question -------------------------------- */

test("this note's projects and other notes' are under their own headings, search second", async () => {
  const h = setup({
    [INBOX]: "- [ ] Measure the sink\n- [ ] Garden tidy #project",
    [KITCHEN]: "- [ ] Kitchen refit #project"
  }, { ...STEP, "Which project": ["__new__"] });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink")).catch(() => {});
  const q = h.asked.find((a) => a.q.startsWith("Which project"));
  assert.deepStrictEqual(q.opts.map((o) => [o.label, o.group]), [
    ["Create a new project…", undefined],
    ["Search projects…", "In other notes"],
    ["Garden tidy #project", "In this note"]
  ]);
});

test("from a query, “this note” is named, since a query has no one note", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink\n- [ ] Garden tidy #project" }, { ...STEP, "Which project": ["__new__"] },
    { sourceKind: "query" });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink")).catch(() => {});
  const q = h.asked.find((a) => a.q.startsWith("Which project"));
  assert.strictEqual(q.opts[2].group, "In - Inbox -");
});

/* ------------------------------ finding the projects ------------------------------ */

test("open projects in other notes are found, with their notes; this note's are not", async () => {
  const h = setup({
    [INBOX]: "- [ ] Garden tidy #project",
    [KITCHEN]: "# Kitchen #project\n- [ ] Kitchen refit #project\n- [x] Old plan #project\n- Notes about #project tags\n- [ ] Buy tiles",
    [TRIP]: "Intro\n- [ ] Berlin trip booked #project\n    - [ ] Email the hotel"
  }, {});
  const found = await findProjectsElsewhere(h.ctx.app, "project", INBOX);
  assert.deepStrictEqual(found.map((p) => [p.file.path, p.line, p.label]), [
    [KITCHEN, 1, "Kitchen refit #project"],
    [TRIP, 1, "Berlin trip booked #project"]
  ]);
});

test("only notes with the tag are read, when Obsidian's index has them", async () => {
  const h = setup({ [INBOX]: "- [ ] a", [KITCHEN]: "- [ ] Kitchen refit #project", "Big.md": "- [ ] nothing here" }, {});
  const read = [];
  const real = h.vault.cachedRead;
  h.vault.cachedRead = async (f) => { read.push(f.path); return real(f); };
  await findProjectsElsewhere(h.ctx.app, "project", INBOX);
  assert.deepStrictEqual(read, [KITCHEN]);
});

test("a note the index hasn't reached is read instead", async () => {
  const h = setup({ [INBOX]: "- [ ] a", [KITCHEN]: "- [ ] Kitchen refit #project" }, {}, { cache: false });
  const found = await findProjectsElsewhere(h.ctx.app, "project", INBOX);
  assert.deepStrictEqual(found.map((p) => p.label), ["Kitchen refit #project"]);
});

/* --------------------------------- filing there --------------------------------- */

test("filed as the project's last step in its own note, with what was under it", async () => {
  const h = setup({
    [INBOX]: "- [ ] Measure the sink\n    - under the window\n- [ ] Call Sam",
    [KITCHEN]: "# Kitchen\n- [ ] Kitchen refit #project\n    - [ ] Choose tiles\n\n## Notes"
  }, { ...STEP, "Which project": ["__elsewhere__"], "Physical context": ["home"] }, { pick: ["Kitchen refit #project"] });
  const it = inboxItem("- [ ] Measure the sink", { endLine: 1 });
  await runProcess(h.ctx, it);
  assert.strictEqual(h.read(INBOX), "- [ ] Call Sam");
  assert.strictEqual(h.read(KITCHEN), [
    "# Kitchen", "- [ ] Kitchen refit #project", "    - [ ] Choose tiles",
    "    - [ ] Measure the sink #home", "        - under the window", "", "## Notes"
  ].join("\n"));
  assert.strictEqual(it.disposed, true, "it has left this review");
  assert.ok(h.infos.some((m) => m === "Filed under “Kitchen refit #project” in Kitchen."));
});

test("labelled there and then, shown under its project in its note", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink", [KITCHEN]: "- [ ] Kitchen refit #project" },
    { ...STEP, "Which project": ["__elsewhere__"], "Physical context": ["home"] }, { pick: ["Kitchen refit #project"] });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink"));
  const last = h.shown[h.shown.length - 1];
  assert.deepStrictEqual(last, { file: KITCHEN, raw: "- [ ] Measure the sink", parent: "- [ ] Kitchen refit #project", label: "Kitchen" });
  assert.ok(h.asked.some((a) => a.q.includes("context")));
});

test("checked as a next action first, as a step filed in this note is", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink", [KITCHEN]: "- [ ] Kitchen refit #project" },
    { ...STEP, "Which project": ["__elsewhere__"], "Is this a clear next action?": ["keep"], "Physical context": [null] },
    { pick: ["Kitchen refit #project"], settings: { clarifyNextAction: true } });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink"));
  const order = h.asked.map((a) => a.q);
  assert.ok(order.indexOf("Is this a clear next action?") < order.findIndex((q) => q.includes("context")));
});

test("batched as it is filed, the batch still finds it once it is labelled", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink", [KITCHEN]: "- [ ] Kitchen refit #project" },
    { ...STEP, "Which project": ["__elsewhere__"], "Is this a clear next action?": ["batch"], "Physical context": ["home"] },
    { pick: ["Kitchen refit #project"], settings: { clarifyNextAction: true } });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink"));
  assert.strictEqual(h.ctx.quickBatch.length, 1);
  const entry = h.ctx.quickBatch[0];
  const lines = h.read(KITCHEN).split("\n");
  assert.strictEqual(L.locateQueuedAction(lines, entry), 1, `the batch looks for “${entry.raw}”`);
  assert.strictEqual(lines[1], "    - [ ] Measure the sink #home");
});

test("Organise afterwards leaves it alone: it was organised when it was filed", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink", [KITCHEN]: "- [ ] Kitchen refit #project" },
    { ...STEP, "Which project": ["__elsewhere__"], "Physical context": ["home"] }, { pick: ["Kitchen refit #project"] });
  const it = inboxItem("- [ ] Measure the sink");
  await runProcess(h.ctx, it);
  const before = h.asked.length;
  await organiseAfterProcess(h.ctx, it, h.ctx.filing, true, null);
  assert.strictEqual(h.asked.length, before);
});

test("dismissing the search comes back to the question", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink", [KITCHEN]: "- [ ] Kitchen refit #project" },
    { ...STEP, "Which project": ["__elsewhere__", "__elsewhere__"], "Physical context": [null] },
    { pick: [null, "Kitchen refit #project"] });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink"));
  assert.strictEqual(h.asked.filter((a) => a.q.startsWith("Which project")).length, 2);
  assert.match(h.read(KITCHEN), /Measure the sink/);
});

test("with no projects anywhere else, it says so and asks again", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink" }, { ...STEP, "Which project": ["__elsewhere__", "__new__"] });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink")).catch(() => {});
  assert.ok(h.infos.includes("No open projects in other notes."));
  assert.deepStrictEqual(h.offered, [], "no empty picker");
});

test("a project that changed after it was listed is not written to", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink", [KITCHEN]: "- [ ] Kitchen refit #project" },
    { ...STEP, "Which project": ["__elsewhere__", "__elsewhere__"], "Physical context": [null] },
    {
      pick: [
        (projects) => { h.vault.store.set(KITCHEN, "- [ ] Kitchen refitted #project"); return projects[0]; },
        (projects) => projects[0]
      ]
    });
  await runProcess(h.ctx, inboxItem("- [ ] Measure the sink"));
  assert.ok(h.infos.some((m) => m.includes("has changed")));
  assert.strictEqual(h.read(KITCHEN), "- [ ] Kitchen refitted #project\n    - [ ] Measure the sink");
});

test("Back undoes both notes", async () => {
  const h = setup({ [INBOX]: "- [ ] Measure the sink\n- [ ] Call Sam", [KITCHEN]: "- [ ] Kitchen refit #project" },
    { ...STEP, "Which project": ["__elsewhere__"], "Physical context": [new ReviewControl("back")] }, { pick: ["Kitchen refit #project"] });
  const journal = new VaultJournal(h.ctx.app);
  await journal.capture(new TFile(INBOX));
  const taskCtx = Object.assign({}, h.ctx, { app: journalledApp(h.ctx.app, journal) });
  taskCtx.prompter.optionalChoice = async (q) => { if (plain(q).includes("context")) throw new ReviewControl("back"); return null; };
  await assert.rejects(runProcess(taskCtx, inboxItem("- [ ] Measure the sink")), (e) => e.kind === "back");
  assert.match(h.read(KITCHEN), /Measure the sink/, "written before Back");
  await journal.restore();
  assert.strictEqual(h.read(INBOX), "- [ ] Measure the sink\n- [ ] Call Sam");
  assert.strictEqual(h.read(KITCHEN), "- [ ] Kitchen refit #project");
});

test("re-based to one indent under the project, wherever it sat", async () => {
  const vault = makeVault({
    "A.md": "- [ ] Parent\n    - [ ] Nested step\n        - deeper",
    [KITCHEN]: "    - [ ] Kitchen refit #project"
  });
  const app = makeApp(vault);
  const at = await moveSubtreeToProjectIn(app, new TFile("A.md"), 1, 2, { file: new TFile(KITCHEN), line: 0, raw: "    - [ ] Kitchen refit #project" }, "    ");
  assert.strictEqual(at, 1);
  assert.strictEqual(vault.store.get(KITCHEN), "    - [ ] Kitchen refit #project\n        - [ ] Nested step\n            - deeper");
  assert.strictEqual(vault.store.get("A.md"), "- [ ] Parent");
});

/* --------------------------------- the picker --------------------------------- */

test("the picker finds a project by its words or by its note, and shows both", () => {
  const app = makeApp(makeVault());
  const projects = [
    { file: new TFile(KITCHEN), line: 1, raw: "- [ ] Kitchen refit #project", label: "Kitchen refit #project" },
    { file: new TFile(TRIP), line: 0, raw: "- [ ] Trip booked #project", label: "Trip booked #project" },
    { file: new TFile("Work/Hiring.md"), line: 0, raw: "- [ ] Hire a designer/dev #project", label: "Hire a designer/dev #project" }
  ];
  const modal = new ProjectSuggestModal(app, projects, () => {});
  assert.strictEqual(modal.getSuggestions("trip")[0].item, projects[1], "by its words");
  assert.strictEqual(modal.getSuggestions("berlin")[0].item, projects[1], "by its note");
  assert.strictEqual(modal.getSuggestions("designer/dev")[0].item, projects[2], "a slash in its words is still its words");
  const parts = [];
  const node = () => ({
    addClass() {}, appendText(t) { parts.push(t); },
    createDiv() { return node(); }, createSpan({ text }) { parts.push(text); return node(); }
  });
  modal.renderSuggestion(modal.getSuggestions("")[0], node());
  assert.ok(parts.join("|").includes("Projects/"), `shows its note: ${parts.join("|")}`);
});
