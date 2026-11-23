/**
 * TasksQueryTaskSource must emit items in exactly the shape the single-file source emits,
 * because every pipeline, the undo journal and the rewind controls consume that shape.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { TasksQueryTaskSource, ActiveFileTopLevelTaskSource, linesLookLikeSameTask } =
  require("./helpers/load.js");
const { makeVault, makeApp, makeTask, makeTasksPlugin } = require("./helpers/fake-vault.js");

const apiFor = (plugin) => ({ plugin: () => plugin, canQuery: () => !!plugin && !!plugin.getTasks });

function setup(files, tasks, state = "Warm") {
  const vault = makeVault(files);
  const app = makeApp(vault);
  return { app, vault, api: apiFor(makeTasksPlugin(tasks, state)) };
}

test("emits the same item shape as the single-file source", async () => {
  const { app, api } = setup(
    { "Inbox.md": "- [ ] alpha #home\n- [ ] beta" },
    [makeTask({ path: "Inbox.md", line: 0, description: "alpha", tags: ["#home"], markdown: "- [ ] alpha #home" })]
  );
  const items = await new TasksQueryTaskSource(app, api, "not done", "project").collect();
  assert.strictEqual(items.length, 1);
  const it = items[0];
  for (const key of ["file", "startLine", "endLine", "raw", "status", "isProject"]) {
    assert.ok(key in it, `missing key: ${key}`);
  }
  assert.strictEqual(it.file.path, "Inbox.md");
  assert.strictEqual(it.startLine, 0);
  assert.strictEqual(it.raw, "- [ ] alpha #home");
  assert.strictEqual(it.isProject, false);
});

test("spans multiple files, grouped and ordered", async () => {
  const { app, api } = setup(
    { "A.md": "- [ ] a1\n- [ ] a2", "B.md": "- [ ] b1" },
    [
      makeTask({ path: "B.md", line: 0, description: "b1", markdown: "- [ ] b1" }),
      makeTask({ path: "A.md", line: 1, description: "a2", markdown: "- [ ] a2" }),
      makeTask({ path: "A.md", line: 0, description: "a1", markdown: "- [ ] a1" })
    ]
  );
  const items = await new TasksQueryTaskSource(app, api, "not done", "project").collect();
  assert.deepStrictEqual(items.map((i) => `${i.file.path}:${i.startLine}`), ["A.md:0", "A.md:1", "B.md:0"]);
});

test("computes the subtree end so a project's children travel with it", async () => {
  const { app, api } = setup(
    { "P.md": "- [ ] parent #project\n    - [ ] child\n        - [ ] grandchild\n- [ ] sibling" },
    [makeTask({ path: "P.md", line: 0, description: "parent", markdown: "- [ ] parent #project" })]
  );
  const items = await new TasksQueryTaskSource(app, api, "not done", "project").collect();
  assert.strictEqual(items[0].endLine, 2, "subtree must stop before the sibling");
  assert.strictEqual(items[0].isProject, true, "project tag must be detected");
});

test("a descendant of an accepted match is dropped", async () => {
  // Acting on the ancestor rewrites the descendant, so its recorded line would be stale.
  const { app, api } = setup(
    { "P.md": "- [ ] parent\n    - [ ] child\n- [ ] other" },
    [
      makeTask({ path: "P.md", line: 0, description: "parent", markdown: "- [ ] parent" }),
      makeTask({ path: "P.md", line: 1, description: "child", markdown: "    - [ ] child" }),
      makeTask({ path: "P.md", line: 2, description: "other", markdown: "- [ ] other" })
    ]
  );
  const items = await new TasksQueryTaskSource(app, api, "not done", "project").collect();
  assert.deepStrictEqual(items.map((i) => i.startLine), [0, 2], "the nested child must be skipped");
});

test("a stale cache entry is skipped rather than editing the wrong line", async () => {
  // The file has changed since Tasks parsed it; the recorded line now holds something else.
  const { app, api } = setup(
    { "S.md": "- [ ] completely different text" },
    [makeTask({ path: "S.md", line: 0, description: "old", markdown: "- [ ] old text" })]
  );
  const items = await new TasksQueryTaskSource(app, api, "not done", "project").collect();
  assert.strictEqual(items.length, 0, "must not hand the pipeline a mismatched line");
});

test("indentation differences do not count as a mismatch", () => {
  assert.strictEqual(linesLookLikeSameTask("    - [ ] x", "- [ ] x"), true);
  assert.strictEqual(linesLookLikeSameTask("- [ ] x", "- [ ] y"), false);
  assert.strictEqual(linesLookLikeSameTask("- [ ] x", null), true, "no markdown recorded -> accept");
});

test("a task pointing at a missing file is skipped", async () => {
  const { app, api } = setup({}, [makeTask({ path: "Gone.md", line: 0, markdown: "- [ ] x" })]);
  assert.deepStrictEqual(await new TasksQueryTaskSource(app, api, "not done", "project").collect(), []);
});

test("a line number beyond the end of the file is skipped", async () => {
  const { app, api } = setup({ "T.md": "- [ ] only" }, [makeTask({ path: "T.md", line: 99, markdown: "- [ ] only" })]);
  assert.deepStrictEqual(await new TasksQueryTaskSource(app, api, "not done", "project").collect(), []);
});

test("an unsupported filter surfaces as an error and yields no items", async () => {
  const { app, api } = setup({ "A.md": "- [ ] a" }, [makeTask({ path: "A.md", line: 0, markdown: "- [ ] a" })]);
  const src = new TasksQueryTaskSource(app, api, "sort by urgency", "project");
  assert.deepStrictEqual(await src.collect(), []);
  assert.strictEqual(src.errors.length, 1);
  assert.ok(src.errors[0].includes("sort by urgency"));
});

test("a Tasks plugin without getTasks reports an error instead of throwing", async () => {
  const app = makeApp(makeVault({}));
  const src = new TasksQueryTaskSource(app, { plugin: () => ({}) }, "not done", "project");
  assert.deepStrictEqual(await src.collect(), []);
  assert.strictEqual(src.errors.length, 1);
});

test("an absent Tasks plugin reports an error instead of throwing", async () => {
  const app = makeApp(makeVault({}));
  const src = new TasksQueryTaskSource(app, { plugin: () => null }, "not done", "project");
  assert.deepStrictEqual(await src.collect(), []);
  assert.strictEqual(src.errors.length, 1);
});

test("a cache that never warms degrades instead of hanging", async () => {
  const { app, api } = setup({ "A.md": "- [ ] a" }, [makeTask({ path: "A.md", line: 0, markdown: "- [ ] a" })], "Cold");
  const started = Date.now();
  const src = new TasksQueryTaskSource(app, api, "not done", "project");
  const items = await Promise.race([
    src.collect(),
    new Promise((r) => setTimeout(() => r("TIMEOUT"), 6000))
  ]);
  assert.notStrictEqual(items, "TIMEOUT", "collect must be bounded");
  assert.ok(Date.now() - started < 5000);
});

test("the single-file source is unaffected and still returns only top-level tasks", async () => {
  const vault = makeVault({ "F.md": "- [ ] top\n    - [ ] nested\n- [x] done" });
  const app = makeApp(vault, {
    getFileCache: () => ({
      listItems: [
        { task: " ", parent: -1, position: { start: { line: 0 } } },
        { task: " ", parent: 0, position: { start: { line: 1 } } },
        { task: "x", parent: -1, position: { start: { line: 2 } } }
      ]
    })
  });
  const file = vault.getAbstractFileByPath("F.md");
  const items = await new ActiveFileTopLevelTaskSource(app, file, "project").collect();
  assert.deepStrictEqual(items.map((i) => i.startLine), [0], "nested and completed excluded");
});

/* ------------------------ source label for disambiguation ------------------------ */

const { taskSourceLabel } = require("./helpers/load.js");

test("a queried task carries its note and heading", async () => {
  const { app, api } = setup(
    { "Work/Clients.md": "# H\n- [ ] chase invoice" },
    [makeTask({ path: "Work/Clients.md", line: 1, description: "chase invoice",
                heading: "Acme Ltd", markdown: "- [ ] chase invoice" })]
  );
  const items = await new TasksQueryTaskSource(app, api, "not done", "project").collect();
  assert.strictEqual(items[0].sourceLabel, "Work/Clients \u203A Acme Ltd");
});

test("a task under no heading shows just the note", () => {
  assert.strictEqual(taskSourceLabel({ taskLocation: {} }, "Inbox.md"), "Inbox");
  assert.strictEqual(taskSourceLabel({ taskLocation: { precedingHeader: null } }, "A/B.md"), "A/B");
});

test("two identically worded tasks are distinguishable by their labels", async () => {
  const { app, api } = setup(
    { "A.md": "- [ ] chase invoice", "B.md": "- [ ] chase invoice" },
    [
      makeTask({ path: "A.md", line: 0, description: "chase invoice", heading: "Acme", markdown: "- [ ] chase invoice" }),
      makeTask({ path: "B.md", line: 0, description: "chase invoice", heading: "Globex", markdown: "- [ ] chase invoice" })
    ]
  );
  const items = await new TasksQueryTaskSource(app, api, "not done", "project").collect();
  const labels = items.map((i) => i.sourceLabel);
  assert.strictEqual(new Set(labels).size, 2, "labels must differ");
  assert.deepStrictEqual(labels, ["A \u203A Acme", "B \u203A Globex"]);
});

test("the single-file source sets no label, so nothing extra is shown", async () => {
  const vault = makeVault({ "F.md": "- [ ] top" });
  const app = makeApp(vault, {
    getFileCache: () => ({ listItems: [{ task: " ", parent: -1, position: { start: { line: 0 } } }] })
  });
  const items = await new ActiveFileTopLevelTaskSource(app, vault.getAbstractFileByPath("F.md"), "project").collect();
  assert.strictEqual(items[0].sourceLabel, undefined);
});
