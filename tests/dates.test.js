/**
 * Date filters. Tasks parses dates with a natural-language library; this understands a
 * fixed, listed vocabulary. What matters is that everything in that vocabulary works and
 * everything outside it is rejected loudly.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { parseTasksQuery, runTasksQuery, resolveQueryDate, shiftDate, hasBooleanOperator, hasLowercaseOperator } =
  require("./helpers/load.js");
const { makeTask } = require("./helpers/fake-vault.js");

const TODAY = "2026-08-12";
const run = (tasks, q) => runTasksQuery(tasks, q, TODAY);
const descs = (r) => r.tasks.map((t) => t.description).sort();
const ok = (q) => assert.deepStrictEqual(parseTasksQuery(q, TODAY).errors, [], q);

test("'due on or before today' is a filter, not a boolean expression", () => {
  // The reported bug: the lowercase "or" inside the comparator was read as an operator,
  // and the user was told to capitalise something they never wrote.
  ok("due on or before today");
  assert.strictEqual(hasBooleanOperator("due on or before today"), false);
  assert.strictEqual(hasLowercaseOperator("due on or before today"), false);
});

test("on or before / on or after are inclusive", () => {
  const tasks = [
    makeTask({ description: "past", due: "2026-08-01" }),
    makeTask({ description: "now", due: TODAY }),
    makeTask({ description: "future", due: "2026-09-01" })
  ];
  assert.deepStrictEqual(descs(run(tasks, "due on or before today")), ["now", "past"]);
  assert.deepStrictEqual(descs(run(tasks, "due on or after today")), ["future", "now"]);
});

test("the comparator is optional: 'due today' means 'due on today'", () => {
  const tasks = [makeTask({ description: "now", due: TODAY }), makeTask({ description: "later", due: "2026-09-01" })];
  assert.deepStrictEqual(descs(run(tasks, "due today")), ["now"]);
  assert.deepStrictEqual(descs(run(tasks, "due 2026-09-01")), ["later"]);
});

test("tomorrow and yesterday resolve relative to today", () => {
  assert.strictEqual(resolveQueryDate("tomorrow", TODAY), "2026-08-13");
  assert.strictEqual(resolveQueryDate("yesterday", TODAY), "2026-08-11");
  const tasks = [makeTask({ description: "t", due: "2026-08-12" })];
  assert.deepStrictEqual(descs(run(tasks, "due before tomorrow")), ["t"]);
});

test("relative offsets are supported", () => {
  assert.strictEqual(resolveQueryDate("in 3 days", TODAY), "2026-08-15");
  assert.strictEqual(resolveQueryDate("2 days ago", TODAY), "2026-08-10");
  assert.strictEqual(resolveQueryDate("next week", TODAY), "2026-08-19");
  assert.strictEqual(resolveQueryDate("last week", TODAY), "2026-08-05");
});

test("shiftDate crosses month and year boundaries", () => {
  assert.strictEqual(shiftDate("2026-08-31", 1), "2026-09-01");
  assert.strictEqual(shiftDate("2026-01-01", -1), "2025-12-31");
  assert.strictEqual(shiftDate("2028-02-28", 1), "2028-02-29", "leap year");
});

test("'not due' means the same as 'no due date'", () => {
  const tasks = [makeTask({ description: "dated", due: TODAY }), makeTask({ description: "undated" })];
  assert.deepStrictEqual(descs(run(tasks, "not due")), ["undated"]);
  assert.deepStrictEqual(descs(run(tasks, "no due date")), ["undated"]);
  assert.deepStrictEqual(descs(run(tasks, "has due date")), ["dated"]);
});

test("start and scheduled take the same comparators and date words", () => {
  for (const q of [
    "starts on or before today", "starts tomorrow", "not start",
    "scheduled on or after today", "scheduled in 2 days", "no scheduled date"
  ]) ok(q);
});

test("an unrecognised date word is still rejected", () => {
  const r = parseTasksQuery("due before someday", TODAY);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /unsupported filter/);
});

test("a capitalised operator without delimiters is still reported", () => {
  // Must not be swallowed as a single filter now that lowercase words are tolerated.
  const r = parseTasksQuery("tags include home OR tags include phone", TODAY);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /wrapped in/);
});

test("lowercase operators inside real boolean lines still get the right message", () => {
  const r = parseTasksQuery("(tags include home) or (tags include phone)", TODAY);
  assert.match(r.errors[0], /must be capitalised/);
});

test("boolean combination of date filters works", () => {
  const tasks = [
    makeTask({ description: "overdue", due: "2026-08-01" }),
    makeTask({ description: "undated" }),
    makeTask({ description: "future", due: "2026-09-01" })
  ];
  assert.deepStrictEqual(
    descs(run(tasks, "(due on or before today) OR (not due)")),
    ["overdue", "undated"]
  );
});
