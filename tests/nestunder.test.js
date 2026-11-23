/**
 * Filing a task as a subtask of an existing project, within the same file.
 *
 * The hazard is ordering: removing the block shifts everything below it, so an insertion
 * point computed against the original numbering lands wrong whenever the project sits
 * below the task. The move is therefore one read-modify-write over a single array.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { findProjectLines, projectPickerLabel, moveSubtreeUnderProject, reanchorLine } =
  require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const F = new TFile("P.md");
const setup = (lines) => {
  const vault = makeVault({ "P.md": lines.join("\n") });
  return { vault, app: makeApp(vault), read: () => vault.store.get("P.md").split("\n") };
};

/* ------------------------------- candidates ------------------------------- */

test("only project-tagged, incomplete tasks are offered", async () => {
  const { app } = setup([
    "- [ ] alpha #project",
    "- [ ] plain task",
    "- [x] done project #project",
    "- [-] cancelled project #project",
    "- not a task #project",
    "- [ ] beta #project"
  ]);
  const found = await findProjectLines(app, F, "project", 99, 99);
  assert.deepStrictEqual(found.map((p) => p.line), [0, 5]);
});

test("the task itself and its own subtree are excluded", async () => {
  // A task cannot become a child of its own descendant.
  const { app } = setup([
    "- [ ] target #project",
    "- [ ] me #project",
    "    - [ ] my child #project"
  ]);
  const found = await findProjectLines(app, F, "project", 1, 2);
  assert.deepStrictEqual(found.map((p) => p.line), [0]);
});

test("a file with no projects offers nothing", async () => {
  const { app } = setup(["- [ ] a", "- [ ] b"]);
  assert.deepStrictEqual(await findProjectLines(app, F, "project", 99, 99), []);
});

test("picker labels strip the checkbox and are bounded", () => {
  assert.strictEqual(projectPickerLabel("- [ ] Redesign onboarding #project").includes("[ ]"), false);
  assert.ok(projectPickerLabel("- [ ] " + "x".repeat(200)).length <= 60);
  assert.match(projectPickerLabel("- [ ]   spaced    out  "), /spaced out/);
});

/* --------------------------------- the move -------------------------------- */

test("a task moves under a project that sits ABOVE it", async () => {
  const { app, read } = setup([
    "- [ ] project #project",
    "    - [ ] existing child",
    "- [ ] loose task"
  ]);
  const at = await moveSubtreeUnderProject(app, F, 2, 2, 0, "    ");
  assert.deepStrictEqual(read(), [
    "- [ ] project #project",
    "    - [ ] existing child",
    "    - [ ] loose task"
  ]);
  assert.strictEqual(at, 2, "returns the moved block's new start");
});

test("a task moves under a project that sits BELOW it", async () => {
  // The ordering case: removing the block first shifts the project up by one.
  const { app, read } = setup([
    "- [ ] loose task",
    "- [ ] project #project",
    "    - [ ] existing child"
  ]);
  const at = await moveSubtreeUnderProject(app, F, 0, 0, 1, "    ");
  assert.deepStrictEqual(read(), [
    "- [ ] project #project",
    "    - [ ] existing child",
    "    - [ ] loose task"
  ]);
  assert.strictEqual(at, 2);
});

test("the whole subtree travels and keeps its relative nesting", async () => {
  const { app, read } = setup([
    "- [ ] project #project",
    "- [ ] parent",
    "    - [ ] child",
    "        - [ ] grandchild"
  ]);
  await moveSubtreeUnderProject(app, F, 1, 3, 0, "    ");
  assert.deepStrictEqual(read(), [
    "- [ ] project #project",
    "    - [ ] parent",
    "        - [ ] child",
    "            - [ ] grandchild"
  ]);
});

test("it lands after the project's existing children, not before them", async () => {
  const { app, read } = setup([
    "- [ ] project #project",
    "    - [ ] first",
    "    - [ ] second",
    "- [ ] newcomer"
  ]);
  await moveSubtreeUnderProject(app, F, 3, 3, 0, "    ");
  assert.strictEqual(read()[3], "    - [ ] newcomer");
});

test("moving under a nested project indents relative to that project", async () => {
  const { app, read } = setup([
    "- [ ] outer #project",
    "    - [ ] inner #project",
    "- [ ] loose"
  ]);
  await moveSubtreeUnderProject(app, F, 2, 2, 1, "    ");
  assert.deepStrictEqual(read(), [
    "- [ ] outer #project",
    "    - [ ] inner #project",
    "        - [ ] loose"
  ]);
});

test("tab indentation is honoured", async () => {
  const { app, read } = setup(["- [ ] project #project", "- [ ] loose"]);
  await moveSubtreeUnderProject(app, F, 1, 1, 0, "\t");
  assert.strictEqual(read()[1], "\t- [ ] loose");
});

test("unrelated lines keep their order and content", async () => {
  const { app, read } = setup([
    "# Heading",
    "- [ ] project #project",
    "- [ ] loose",
    "- [ ] other",
    "some prose"
  ]);
  await moveSubtreeUnderProject(app, F, 2, 2, 1, "    ");
  const out = read();
  assert.strictEqual(out[0], "# Heading");
  assert.strictEqual(out.filter((l) => l === "- [ ] other").length, 1);
  assert.strictEqual(out[out.length - 1], "some prose");
  assert.strictEqual(out.length, 5, "no lines gained or lost");
});

/* ------------------------------ re-anchoring ------------------------------ */

test("reanchorLine returns the prediction when it already matches", () => {
  const lines = ["- [ ] a", "- [ ] b", "- [ ] c"];
  assert.strictEqual(reanchorLine(lines, 1, "- [ ] b"), 1);
});

test("reanchorLine finds a task that moved", () => {
  // A move reorders without changing the file's length, so the offset stays zero.
  const lines = ["- [ ] project", "    - [ ] moved", "- [ ] other"];
  assert.strictEqual(reanchorLine(lines, 2, "- [ ] moved"), 1, "ignores indentation");
});

test("reanchorLine prefers the occurrence nearest the prediction", () => {
  const lines = ["- [ ] dup", "- [ ] x", "- [ ] dup", "- [ ] y", "- [ ] dup"];
  assert.strictEqual(reanchorLine(lines, 3, "- [ ] dup"), 2);
  assert.strictEqual(reanchorLine(lines, 0, "- [ ] dup"), 0);
});

test("reanchorLine falls back to the prediction when the text is gone", () => {
  const lines = ["- [ ] a", "- [ ] b"];
  assert.strictEqual(reanchorLine(lines, 1, "- [ ] deleted"), 1);
});

test("reanchorLine tolerates missing or empty expectations", () => {
  const lines = ["- [ ] a"];
  for (const v of [undefined, null, "", "   "]) {
    assert.strictEqual(reanchorLine(lines, 0, v), 0);
  }
});
