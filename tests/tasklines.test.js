const { test } = require("node:test");
const assert = require("node:assert");
const {
  COMPLETED_STATUSES, deTaskLine, lineHasTag, indentOf, computeSubtreeEnd,
  sanitizeName, escapeRegExp, insertBeforeTasksMetadata
} = require("./helpers/load.js");

test("completed statuses cover x, X and -", () => {
  for (const s of ["x", "X", "-"]) assert.ok(COMPLETED_STATUSES.has(s));
  assert.ok(!COMPLETED_STATUSES.has(" "));
});

test("deTaskLine strips the checkbox and leading bullet", () => {
  const out = deTaskLine("- [ ] Buy milk");
  assert.ok(!out.includes("[ ]"));
  assert.ok(out.includes("Buy milk"));
});

test("lineHasTag matches a whole tag only", () => {
  assert.strictEqual(lineHasTag("- [ ] plan #project", "project"), true);
  assert.strictEqual(lineHasTag("- [ ] plan #projects", "project"), false, "must not match a prefix");
  assert.strictEqual(lineHasTag("- [ ] plan", "project"), false);
});

test("indentOf returns the width of the leading whitespace", () => {
  assert.strictEqual(indentOf("- [ ] top"), 0);
  assert.strictEqual(indentOf("    - [ ] nested"), 4);
  assert.ok(indentOf("\t- [ ] tabbed") > 0, "a tab counts as indentation");
});

test("indentOf orders nesting depth correctly", () => {
  // computeSubtreeEnd relies on this being a numeric comparison.
  assert.ok(indentOf("        - [ ] deep") > indentOf("    - [ ] shallow"));
});

test("computeSubtreeEnd includes deeper-indented children only", () => {
  const lines = [
    "- [ ] parent",
    "    - [ ] child one",
    "        - [ ] grandchild",
    "- [ ] sibling"
  ];
  assert.strictEqual(computeSubtreeEnd(lines, 0), 2, "stops before the sibling");
});

test("computeSubtreeEnd returns the line itself when there are no children", () => {
  assert.strictEqual(computeSubtreeEnd(["- [ ] alone", "- [ ] next"], 0), 0);
});

test("sanitizeName removes characters that are illegal in filenames", () => {
  const out = sanitizeName('a/b\\c:d*e?f"g<h>i|j');
  for (const ch of ['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
    assert.ok(!out.includes(ch), `expected ${ch} to be removed`);
  }
  assert.ok(out.length > 0);
});

test("escapeRegExp neutralises regex metacharacters", () => {
  const re = new RegExp(escapeRegExp("a.b*c"));
  assert.ok(re.test("a.b*c"));
  assert.ok(!re.test("axbxc"));
});

test("insertBeforeTasksMetadata returns the line unchanged for no tokens", () => {
  assert.strictEqual(insertBeforeTasksMetadata("- [ ] task", []), "- [ ] task");
});

test("insertBeforeTasksMetadata appends tokens to a plain line", () => {
  const out = insertBeforeTasksMetadata("- [ ] task", ["#home"]);
  assert.ok(out.includes("#home"));
  assert.ok(out.startsWith("- [ ] task"));
});

test("insertBeforeTasksMetadata keeps tokens ahead of Tasks metadata", () => {
  const out = insertBeforeTasksMetadata("- [ ] task 📅 2026-01-01", ["#home"]);
  assert.ok(
    out.indexOf("#home") < out.indexOf("📅"),
    `tag must precede the due date, got: ${out}`
  );
});

/* ------------------------------ ancestor chain ------------------------------ */

const { computeAncestorLines } = require("./helpers/load.js");

test("a top-level task has no ancestors", () => {
  const lines = ["- [ ] top", "    - [ ] child"];
  assert.deepStrictEqual(computeAncestorLines(lines, 0), []);
});

test("a subtask reports its parent", () => {
  const lines = ["- [ ] project #project", "    - [ ] call them back"];
  assert.deepStrictEqual(computeAncestorLines(lines, 1), [0]);
});

test("a deeply nested task reports the whole chain, outermost first", () => {
  const lines = [
    "- [ ] project",
    "    - [ ] phase one",
    "        - [ ] the actual task",
    "- [ ] unrelated"
  ];
  assert.deepStrictEqual(computeAncestorLines(lines, 2), [0, 1]);
});

test("siblings are not mistaken for ancestors", () => {
  const lines = [
    "- [ ] project",
    "    - [ ] sibling",
    "    - [ ] target"
  ];
  assert.deepStrictEqual(computeAncestorLines(lines, 2), [0], "only the parent, not the sibling");
});

test("a sibling's children are skipped", () => {
  const lines = [
    "- [ ] project",
    "    - [ ] sibling",
    "        - [ ] sibling child",
    "    - [ ] target"
  ];
  assert.deepStrictEqual(computeAncestorLines(lines, 3), [0]);
});

test("blank lines inside the tree are ignored", () => {
  const lines = ["- [ ] project", "", "    - [ ] target"];
  assert.deepStrictEqual(computeAncestorLines(lines, 2), [0]);
});

test("a non-task ancestor still counts as context", () => {
  // Tasks nested under a plain bullet still live somewhere worth showing.
  const lines = ["- context heading", "    - [ ] target"];
  assert.deepStrictEqual(computeAncestorLines(lines, 1), [0]);
});

test("the walk stops at the outermost level", () => {
  const lines = ["- [ ] a", "- [ ] b", "    - [ ] target"];
  assert.deepStrictEqual(computeAncestorLines(lines, 2), [1], "not the earlier top-level task");
});

test("an out-of-range line yields no ancestors rather than throwing", () => {
  assert.doesNotThrow(() => computeAncestorLines(["- [ ] a"], 99));
  assert.deepStrictEqual(computeAncestorLines(["- [ ] a"], 99), []);
});

test("tab and space indentation are comparable", () => {
  const lines = ["- [ ] project", "\t- [ ] target"];
  assert.deepStrictEqual(computeAncestorLines(lines, 1), [0]);
});
