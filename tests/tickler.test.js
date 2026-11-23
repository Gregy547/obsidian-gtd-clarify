/**
 * The tickler: deferring committed-but-not-yet work to a date, so it leaves your lists and
 * comes back by itself. Plus the Someday fix that stopped subtrees being thrown away.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  lineStartDate, isTickled, setLineStartDate, addMonths, tickleSubtree, moveSubtreeToNote,
  queryMentionsStartDates, runTasksQuery, ActiveFileTopLevelTaskSource, TasksQueryTaskSource,
  DEFAULT_SETTINGS
} = require("./helpers/load.js");
const { makeVault, makeApp, makeTask, makeTasksPlugin } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const { plain, plainSource } = require("./helpers/plain.js");
// Read for its wording: the **bold** markers in prompt text are left out.
const main = plainSource(fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8"));
const TODAY = "2026-08-12";
const S = "\u{1F6EB}";

/* ------------------------- Tasks' own start-date semantics ------------------------- */

test("a task with no start date matches every start-date comparator", () => {
  // Tasks' documented rule: a start date keeps a task out until then, so an undated task
  // has nothing to wait for. The engine used to drop these, silently emptying any
  // start-date query of all undated work.
  const tasks = [
    makeTask({ description: "undated" }),
    makeTask({ description: "started", start: "2026-08-01" }),
    makeTask({ description: "deferred", start: "2026-09-01" })
  ];
  const names = (q) => runTasksQuery(tasks, q, TODAY).tasks.map((t) => t.description);
  assert.deepStrictEqual(names("starts before tomorrow"), ["undated", "started"],
    "the native way to hide deferred work while keeping everything undated");
  assert.ok(names("starts after today").includes("undated"));
});

test("due, scheduled and done keep the ordinary rule", () => {
  const tasks = [makeTask({ description: "undated" })];
  for (const q of ["due before tomorrow", "scheduled before tomorrow", "done before tomorrow"]) {
    assert.deepStrictEqual(runTasksQuery(tasks, q, TODAY).tasks, [], q);
  }
});

test("only deferred tasks can be isolated with has start date", () => {
  const tasks = [makeTask({ description: "undated" }), makeTask({ description: "deferred", start: "2026-09-01" })];
  assert.deepStrictEqual(
    runTasksQuery(tasks, "(has start date) AND (starts after today)", TODAY).tasks.map((t) => t.description),
    ["deferred"]
  );
});

/* ---------------------------------- dates ---------------------------------- */

test("start dates are read in emoji and Dataview form", () => {
  assert.strictEqual(lineStartDate(`- [ ] a ${S} 2026-09-01`), "2026-09-01");
  assert.strictEqual(lineStartDate(`- [ ] a ${S}\uFE0F 2026-09-01`), "2026-09-01", "with variation selector");
  assert.strictEqual(lineStartDate("- [ ] a [start:: 2026-09-01]"), "2026-09-01");
  assert.strictEqual(lineStartDate("- [ ] a 📅 2026-09-01"), null, "a due date is not a start date");
});

test("isTickled is true only while the start date is still ahead", () => {
  assert.strictEqual(isTickled(`- [ ] a ${S} 2026-09-01`, TODAY), true);
  assert.strictEqual(isTickled(`- [ ] a ${S} ${TODAY}`, TODAY), false, "due today means it is back");
  assert.strictEqual(isTickled(`- [ ] a ${S} 2026-01-01`, TODAY), false);
  assert.strictEqual(isTickled("- [ ] a", TODAY), false);
});

test("setLineStartDate adds, replaces, and respects block references", () => {
  assert.strictEqual(setLineStartDate("- [ ] a", "2026-09-01"), `- [ ] a ${S} 2026-09-01`);
  assert.strictEqual(setLineStartDate(`- [ ] a ${S} 2026-01-01 #x`, "2026-09-01"), `- [ ] a ${S} 2026-09-01 #x`);
  assert.strictEqual(setLineStartDate("- [ ] a [start:: 2026-01-01]", "2026-09-01"), "- [ ] a [start:: 2026-09-01]",
    "keeps the user's chosen format");
  assert.strictEqual(setLineStartDate("- [ ] a ^abc123", "2026-09-01"), `- [ ] a ${S} 2026-09-01 ^abc123`,
    "a block reference must stay last");
});

test("addMonths clamps to the end of shorter months", () => {
  assert.strictEqual(addMonths("2026-01-31", 1), "2026-02-28");
  assert.strictEqual(addMonths("2028-01-31", 1), "2028-02-29", "leap year");
  assert.strictEqual(addMonths("2026-11-15", 3), "2027-02-15", "across a year");
  assert.strictEqual(addMonths("2026-08-12", 1), "2026-09-12");
});

/* ------------------------------- tickleSubtree ------------------------------- */

function file(content) {
  const vault = makeVault({ "P.md": content });
  return { vault, app: makeApp(vault), f: new TFile("P.md"), read: () => vault.store.get("P.md").split("\n") };
}

test("deferring a project defers its open next actions too", () => {
  // A deferred project whose actions still show on your lists has not been deferred.
  const h = file(["- [ ] project #project", "    - [ ] call Sam", "    - [ ] email brief"].join("\n"));
  return tickleSubtree(h.app, h.f, 0, 2, "2026-09-01").then(() => {
    for (const line of h.read()) assert.match(line, /2026-09-01/, line);
  });
});

test("a subtask already deferred further keeps its later date", async () => {
  const h = file(["- [ ] project", `    - [ ] later ${S} 2026-12-01`].join("\n"));
  await tickleSubtree(h.app, h.f, 0, 1, "2026-09-01");
  assert.match(h.read()[1], /2026-12-01/, "never pulled forward");
  assert.match(h.read()[0], /2026-09-01/);
});

test("completed subtasks and non-task lines are left alone", async () => {
  const h = file(["- [ ] project", "    - [x] done already", "    some notes"].join("\n"));
  await tickleSubtree(h.app, h.f, 0, 2, "2026-09-01");
  assert.strictEqual(h.read()[1], "    - [x] done already");
  assert.strictEqual(h.read()[2], "    some notes");
});

/* ------------------------------ sources hide them ------------------------------ */

test("the current-file source leaves deferred tasks out", async () => {
  const lines = ["- [ ] now", `- [ ] later ${S} 2099-01-01`, `- [ ] due back ${S} 2000-01-01`];
  const vault = makeVault({ "F.md": lines.join("\n") });
  const app = makeApp(vault, {
    getFileCache: () => ({ listItems: lines.map((_, i) => ({ task: " ", parent: -1, position: { start: { line: i } } })) })
  });
  const src = new ActiveFileTopLevelTaskSource(app, vault.getAbstractFileByPath("F.md"), "project", true);
  const items = await src.collect();
  assert.deepStrictEqual(items.map((i) => i.startLine), [0, 2], "the future one is hidden; the past one is back");
});

test("the current-file source shows everything when hiding is off", async () => {
  const lines = ["- [ ] now", `- [ ] later ${S} 2099-01-01`];
  const vault = makeVault({ "F.md": lines.join("\n") });
  const app = makeApp(vault, {
    getFileCache: () => ({ listItems: lines.map((_, i) => ({ task: " ", parent: -1, position: { start: { line: i } } })) })
  });
  const items = await new ActiveFileTopLevelTaskSource(app, vault.getAbstractFileByPath("F.md"), "project", false).collect();
  assert.strictEqual(items.length, 2);
});

function querySetup(query, hide = true) {
  const lines = ["- [ ] now", `- [ ] later ${S} 2099-01-01`];
  const vault = makeVault({ "Q.md": lines.join("\n") });
  const app = makeApp(vault);
  const plugin = makeTasksPlugin([
    makeTask({ path: "Q.md", line: 0, description: "now", markdown: lines[0] }),
    makeTask({ path: "Q.md", line: 1, description: "later", start: "2099-01-01", markdown: lines[1] })
  ]);
  const api = { plugin: () => plugin, canQuery: () => true };
  return new TasksQueryTaskSource(app, api, query, "project", hide);
}

test("the query source leaves deferred tasks out", async () => {
  const items = await querySetup("not done").collect();
  assert.deepStrictEqual(items.map((i) => i.startLine), [0]);
});

test("a query that asks about start dates sees deferred tasks", async () => {
  // "starts after today" is how you'd look over what is coming back. Hiding them would
  // contradict the question.
  const items = await querySetup("(has start date) AND (starts after today)").collect();
  assert.deepStrictEqual(items.map((i) => i.startLine), [1]);
});

test("queryMentionsStartDates recognises the start-date filters", () => {
  for (const q of ["starts before tomorrow", "has start date", "no start date", "not start",
                   "(starts after today) OR (tags include x)", "  starts before tomorrow",
                   "not done\nstarts before tomorrow", "[starts after today]"]) {
    assert.strictEqual(queryMentionsStartDates(q), true, q);
  }
  // A tag named "starts" once tripped this; filters only ever begin a line or follow a delimiter.
  for (const q of ["not done", "description includes restart", "tags include starts", "path includes starts"]) {
    assert.strictEqual(queryMentionsStartDates(q), false, q);
  }
});

test("hiding defaults on, and both source call sites pass it through", () => {
  assert.strictEqual(DEFAULT_SETTINGS.hideTickledTasks, true);
  // Including the fallback for Tasks versions without query support, which was missed once.
  assert.strictEqual((main.match(/new ActiveFileTopLevelTaskSource\(this\.app, file, projectTag, hideTickled\)/g) || []).length, 2);
  assert.match(main, /new TasksQueryTaskSource\(this\.app, this\.plugin\.tasksApi, queryText, projectTag, hideTickled\)/);
});

/* --------------------------------- Someday --------------------------------- */

test("sending to Someday moves the whole subtree, not just the first line", async () => {
  // Used to copy the top line and delete everything beneath it.
  const vault = makeVault({
    "Inbox.md": ["- [ ] learn woodworking", "    - [ ] find a class", "    notes: ask Sam", "- [ ] other"].join("\n"),
    "Someday.md": "## Unsorted\n"
  });
  const app = makeApp(vault);
  await moveSubtreeToNote(app, new TFile("Inbox.md"), 0, 2, "Someday.md");
  const someday = vault.store.get("Someday.md");
  assert.match(someday, /learn woodworking/);
  assert.match(someday, /find a class/, "the subtask must survive");
  assert.match(someday, /notes: ask Sam/, "and the notes");
  assert.strictEqual(vault.store.get("Inbox.md"), "- [ ] other", "and it leaves the source");
});

test("a nested task lands at the top level in Someday", async () => {
  const vault = makeVault({ "Inbox.md": ["- [ ] parent", "    - [ ] child", "        - [ ] grandchild"].join("\n"), "Someday.md": "" });
  await moveSubtreeToNote(makeApp(vault), new TFile("Inbox.md"), 1, 2, "Someday.md");
  const lines = vault.store.get("Someday.md").trim().split("\n");
  assert.strictEqual(lines[0], "- [ ] child", "re-based to the top level");
  assert.strictEqual(lines[1], "    - [ ] grandchild", "relative nesting kept");
});

test("Someday entries are appended, so an Unsorted section kept last collects them", async () => {
  const vault = makeVault({ "Inbox.md": "- [ ] new idea", "Someday.md": "## Someday\n- [ ] a\n## Unsorted\n- [ ] b\n" });
  await moveSubtreeToNote(makeApp(vault), new TFile("Inbox.md"), 0, 0, "Someday.md");
  const lines = vault.store.get("Someday.md").trim().split("\n");
  assert.strictEqual(lines[lines.length - 1], "- [ ] new idea");
});

test("a missing Someday note is created rather than failing", async () => {
  const vault = makeVault({ "Inbox.md": "- [ ] idea" });
  await moveSubtreeToNote(makeApp(vault), new TFile("Inbox.md"), 0, 0, "Someday.md");
  assert.match(vault.store.get("Someday.md"), /idea/);
});

/* ------------------------------ wording & flow ------------------------------ */

test("the not-this-week options name the commitment explicitly", () => {
  assert.match(main, /"Not yet \\u2014 bring it back on a date\\u2026"/);
  assert.match(main, /"Someday \\u2014 not committed"/);
  // Strip comments first: the old label is named in an explanation of what it used to do.
  const code = main.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/"Send to Someday"/.test(code), "the old label must be gone");
});

test("deferring returns rather than breaking out of the loop", () => {
  // break falls through into the actionable branch and would ask whether a deferred task
  // is a project. Caught before release; this keeps it caught.
  const at = main.indexOf('if (choice === "tickle") {');
  const branch = main.slice(at, main.indexOf("\n    }", at));
  assert.match(branch, /\n\s*return;/);
  assert.ok(!/\n\s*break;/.test(branch));
});

test("the tickler carries guidance against inventing dates", () => {
  assert.match(main, /GUIDANCE\.tickle/);
  assert.match(main, /tickle:\s*\n\s*"Only defer to a date if there/);
});

test("default queries exclude Someday", () => {
  for (const q of DEFAULT_SETTINGS.savedQueries) {
    assert.match(q.query, /path does not include Someday/, q.name);
  }
});
