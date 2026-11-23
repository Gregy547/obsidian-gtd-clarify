/**
 * Filters are a re-implementation of a SUBSET of the Tasks query language — the Tasks API
 * exposes no way to run a real search. These tests pin the behaviour of that subset, and
 * in particular that an unsupported filter is REPORTED rather than ignored: a silently
 * dropped filter would widen the result set without telling anyone.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { parseTasksQuery, runTasksQuery, isTaskBlocked, isTaskDone, normaliseTag, resolveQueryDate } =
  require("./helpers/load.js");
const { makeTask } = require("./helpers/fake-vault.js");

const TODAY = "2026-08-12";
const run = (tasks, q) => runTasksQuery(tasks, q, TODAY);
const descs = (r) => r.tasks.map((t) => t.description);

test("blank lines and # comments are ignored", () => {
  const p = parseTasksQuery("\n# a comment\n\nnot done\n", TODAY);
  assert.strictEqual(p.errors.length, 0);
  assert.strictEqual(p.filters.length, 1);
});

test("an unsupported filter is reported, not silently dropped", () => {
  const p = parseTasksQuery("not done\nsort by due\nfilter by function task.urgency > 5", TODAY);
  assert.strictEqual(p.errors.length, 2, "both unsupported lines must be reported");
  assert.ok(p.errors[0].includes("Line 2"), "errors must name the line");
});

test("a query with any error yields no filters silently applied", () => {
  const r = run([makeTask({ description: "x" })], "group by filename");
  assert.strictEqual(r.errors.length, 1);
});

test("not done / done filter on status symbol", () => {
  const tasks = [makeTask({ description: "open" }), makeTask({ description: "shut", status: "x" })];
  assert.deepStrictEqual(descs(run(tasks, "not done")), ["open"]);
  assert.deepStrictEqual(descs(run(tasks, "done")), ["shut"]);
});

test("cancelled tasks count as done", () => {
  assert.strictEqual(isTaskDone(makeTask({ status: "-" })), true);
  assert.strictEqual(isTaskDone(makeTask({ status: " " })), false);
});

test("tags include / do not include, tolerating a missing #", () => {
  const tasks = [
    makeTask({ description: "home task", tags: ["#home"] }),
    makeTask({ description: "work task", tags: ["#work"] })
  ];
  assert.deepStrictEqual(descs(run(tasks, "tags include home")), ["home task"]);
  assert.deepStrictEqual(descs(run(tasks, "tags include #home")), ["home task"]);
  assert.deepStrictEqual(descs(run(tasks, "tags do not include home")), ["work task"]);
});

test("normaliseTag is case-insensitive and adds the hash", () => {
  assert.strictEqual(normaliseTag("Home"), "#home");
  assert.strictEqual(normaliseTag("#Home"), "#home");
});

test("is blocked / is not blocked follows unfinished dependencies", () => {
  const dep = makeTask({ description: "dep", id: "abc", status: " " });
  const blocked = makeTask({ description: "blocked", dependsOn: ["abc"] });
  const free = makeTask({ description: "free" });
  assert.deepStrictEqual(descs(run([dep, blocked, free], "is not blocked")).sort(), ["dep", "free"]);
  assert.deepStrictEqual(descs(run([dep, blocked, free], "is blocked")), ["blocked"]);
});

test("a completed dependency does not block", () => {
  const dep = makeTask({ description: "dep", id: "abc", status: "x" });
  const t = makeTask({ description: "t", dependsOn: ["abc"] });
  assert.strictEqual(isTaskBlocked(t, new Map([["abc", [dep]]])), false);
});

test("an unknown dependency id does not block", () => {
  // A deleted dependency should not strand a task forever.
  const t = makeTask({ description: "t", dependsOn: ["missing"] });
  assert.strictEqual(isTaskBlocked(t, new Map()), false);
});

test("path / description / heading includes", () => {
  const tasks = [
    makeTask({ description: "alpha", path: "Work/Plans.md", heading: "Q3" }),
    makeTask({ description: "beta", path: "Home/List.md", heading: "Chores" })
  ];
  assert.deepStrictEqual(descs(run(tasks, "path includes Work")), ["alpha"]);
  assert.deepStrictEqual(descs(run(tasks, "path does not include Work")), ["beta"]);
  assert.deepStrictEqual(descs(run(tasks, "description includes bet")), ["beta"]);
  assert.deepStrictEqual(descs(run(tasks, "heading includes Chores")), ["beta"]);
});

test("has / no due date", () => {
  const tasks = [
    makeTask({ description: "dated", due: "2026-08-01" }),
    makeTask({ description: "undated" })
  ];
  assert.deepStrictEqual(descs(run(tasks, "has due date")), ["dated"]);
  assert.deepStrictEqual(descs(run(tasks, "no due date")), ["undated"]);
});

test("due before / after / on, with today resolved once", () => {
  const tasks = [
    makeTask({ description: "past", due: "2026-08-01" }),
    makeTask({ description: "now", due: TODAY }),
    makeTask({ description: "future", due: "2026-09-01" })
  ];
  assert.deepStrictEqual(descs(run(tasks, "due before today")), ["past"]);
  assert.deepStrictEqual(descs(run(tasks, "due after today")), ["future"]);
  assert.deepStrictEqual(descs(run(tasks, "due on today")), ["now"]);
  assert.deepStrictEqual(descs(run(tasks, "due before 2026-09-01")), ["past", "now"]);
});

test("a moment-like date object is accepted as well as a string", () => {
  const m = { format: () => "2026-08-01" };
  assert.deepStrictEqual(descs(run([makeTask({ description: "m", due: m })], "due before today")), ["m"]);
});

test("an unparseable date is an error, not a silent no-match", () => {
  assert.strictEqual(parseTasksQuery("due before someday", TODAY).errors.length, 1);
  assert.strictEqual(resolveQueryDate("nonsense", TODAY), null);
});

test("priority is / above / below, respecting Tasks' inverted scale", () => {
  // Tasks orders highest=0 .. lowest=5, so "above medium" means a SMALLER number.
  const tasks = [
    makeTask({ description: "hi", priority: 1 }),
    makeTask({ description: "mid", priority: 2 }),
    makeTask({ description: "lo", priority: 4 })
  ];
  assert.deepStrictEqual(descs(run(tasks, "priority is high")), ["hi"]);
  assert.deepStrictEqual(descs(run(tasks, "priority is above medium")), ["hi"]);
  assert.deepStrictEqual(descs(run(tasks, "priority is below medium")), ["lo"]);
});

test("filters combine with AND, like a Tasks query block", () => {
  const tasks = [
    makeTask({ description: "match", tags: ["#home"], path: "A.md" }),
    makeTask({ description: "wrong tag", tags: ["#work"], path: "A.md" }),
    makeTask({ description: "wrong path", tags: ["#home"], path: "B.md" })
  ];
  assert.deepStrictEqual(descs(run(tasks, "not done\ntags include home\npath includes A.md")), ["match"]);
});

test("limit caps the result set", () => {
  const tasks = [1, 2, 3, 4, 5].map((n) => makeTask({ description: `t${n}`, line: n }));
  assert.strictEqual(run(tasks, "not done\nlimit 2").tasks.length, 2);
  assert.strictEqual(run(tasks, "not done\nlimit to 3 tasks").tasks.length, 3);
});

test("exclude subitems drops nested tasks", () => {
  const top = makeTask({ description: "top" });
  const child = makeTask({ description: "child", parent: top });
  assert.deepStrictEqual(descs(run([top, child], "not done\nexclude subitems")), ["top"]);
});

test("results are ordered by path then line", () => {
  const tasks = [
    makeTask({ description: "b2", path: "B.md", line: 2 }),
    makeTask({ description: "a5", path: "A.md", line: 5 }),
    makeTask({ description: "a1", path: "A.md", line: 1 })
  ];
  assert.deepStrictEqual(descs(run(tasks, "not done")), ["a1", "a5", "b2"]);
});

test("an empty query matches everything", () => {
  const tasks = [makeTask({ description: "x" }), makeTask({ description: "y", status: "x" })];
  assert.strictEqual(run(tasks, "").tasks.length, 2);
});
