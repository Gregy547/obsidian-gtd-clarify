/**
 * Walking a project's existing subtasks during Process.
 *
 * The hazard is that processing one child changes the file: it can be deleted, moved out,
 * or expanded into a project of its own. A list of children captured before the walk is
 * stale the moment that happens, so the walk re-derives positions each time.
 *
 * Child identification and ordering are tested against the REAL processProjectChildren,
 * driven by a prompter that skips every child (Skip applies to one subtask, so the walk
 * continues). The delete/expand cases mirror the shipped position arithmetic, because
 * making the real runProcess delete a child would mean scripting the whole Process
 * dialogue; that mirror is marked where it appears.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const {
  processProjectChildren, isTaskLine, taskStatusOf, computeAncestorLines,
  computeSubtreeEnd, MAX_PROJECT_DEPTH, ReviewControl
} = require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

/** Run the real walk with a prompter that skips each child, recording what it was shown. */
async function walkSkippingAll(content) {
  const vault = makeVault({ "P.md": content });
  const seen = [];
  const ctx = {
    app: makeApp(vault),
    settings: { projectTag: "project" },
    tasks: {},
    prompter: {
      highlightInSource: async (child) => { seen.push(child.raw.trim()); },
      choice: async () => { throw new ReviewControl("skip"); },
      optionalChoice: async () => { throw new ReviewControl("skip"); },
      text: async () => { throw new ReviewControl("skip"); },
      confirm: async () => { throw new ReviewControl("skip"); },
      info: () => {}
    }
  };
  const item = {
    file: new TFile("P.md"), startLine: 0,
    endLine: content.split("\n").length - 1, raw: content.split("\n")[0]
  };
  const end = await processProjectChildren(ctx, item, 0);
  return { seen, end, vault };
}

test("isTaskLine recognises the list markers Obsidian allows", () => {
  for (const l of ["- [ ] a", "* [x] b", "+ [-] c", "1. [ ] d", "  - [ ] indented"]) {
    assert.ok(isTaskLine(l), l);
  }
  for (const l of ["- plain bullet", "# heading", "", "text"]) {
    assert.ok(!isTaskLine(l), l);
  }
});

test("taskStatusOf extracts the checkbox character", () => {
  assert.strictEqual(taskStatusOf("- [ ] a"), " ");
  assert.strictEqual(taskStatusOf("    - [x] a"), "x");
  assert.strictEqual(taskStatusOf("- [-] a"), "-");
  assert.strictEqual(taskStatusOf("not a task"), null);
});

test("direct children are identified by their ancestor chain", () => {
  // The rule the walk uses: a direct child's nearest ancestor is the project line.
  const lines = [
    "- [ ] project #project",
    "    - [ ] child one",
    "        - [ ] grandchild",
    "    - [ ] child two",
    "- [ ] unrelated"
  ];
  const direct = [1, 2, 3].filter((i) => {
    const anc = computeAncestorLines(lines, i);
    return anc.length && anc[anc.length - 1] === 0;
  });
  assert.deepStrictEqual(direct, [1, 3], "grandchild is not a direct child");
});

test("the walk visits every direct child in order", async () => {
  const { seen, end } = await walkSkippingAll([
    "- [ ] project #project",
    "    - [ ] first",
    "    - [ ] second",
    "    - [ ] third"
  ].join("\n"));
  assert.deepStrictEqual(seen, ["- [ ] first", "- [ ] second", "- [ ] third"]);
  assert.strictEqual(end, 3, "the parent's subtree end is returned so the caller can append");
});

test("grandchildren are not walked as direct children", async () => {
  const { seen } = await walkSkippingAll([
    "- [ ] project #project",
    "    - [ ] child",
    "        - [ ] grandchild",
    "    - [ ] sibling"
  ].join("\n"));
  assert.deepStrictEqual(seen, ["- [ ] child", "- [ ] sibling"],
    "a nested project handles its own children when it recurses");
});

test("completed and cancelled children are skipped", async () => {
  const { seen } = await walkSkippingAll([
    "- [ ] project #project",
    "    - [x] done already",
    "    - [-] cancelled already",
    "    - [ ] still open"
  ].join("\n"));
  assert.deepStrictEqual(seen, ["- [ ] still open"]);
});

test("non-task lines inside the subtree are not treated as children", async () => {
  const { seen } = await walkSkippingAll([
    "- [ ] project #project",
    "    some prose",
    "    - [ ] real child"
  ].join("\n"));
  assert.deepStrictEqual(seen, ["- [ ] real child"]);
});

test("a project with no children walks nothing and returns its own line", async () => {
  const { seen, end } = await walkSkippingAll("- [ ] lonely project #project");
  assert.deepStrictEqual(seen, []);
  assert.strictEqual(end, 0);
});

test("tasks after the project are not walked", async () => {
  const { seen } = await walkSkippingAll([
    "- [ ] project #project",
    "    - [ ] mine",
    "- [ ] someone else's"
  ].join("\n"));
  assert.deepStrictEqual(seen, ["- [ ] mine"]);
});

test("skipping a child does not abandon the rest of the walk", async () => {
  // Every child is skipped in this harness; reaching the third proves Skip is scoped to
  // one subtask rather than the whole task.
  const { seen } = await walkSkippingAll([
    "- [ ] project #project", "    - [ ] a", "    - [ ] b", "    - [ ] c"
  ].join("\n"));
  assert.strictEqual(seen.length, 3);
});

/* --- position arithmetic (mirrors the shipped cursor logic; see file header) --- */

async function mirrorWalk(vault, item, run) {
  let cursor = item.startLine + 1;
  const visited = [];
  for (let guard = 0; guard < 500; guard++) {
    const lines = vault.store.get("P.md").split("\n");
    const end = computeSubtreeEnd(lines, item.startLine);
    let childLine = -1;
    for (let i = Math.max(cursor, item.startLine + 1); i <= end && i < lines.length; i++) {
      if (!isTaskLine(lines[i])) continue;
      if ("xX-".includes(taskStatusOf(lines[i]))) continue;
      const anc = computeAncestorLines(lines, i);
      if (anc.length && anc[anc.length - 1] === item.startLine) { childLine = i; break; }
    }
    if (childLine < 0) break;
    const childEnd = computeSubtreeEnd(lines, childLine);
    const before = lines.length;
    visited.push(lines[childLine].trim());
    run({ startLine: childLine, endLine: childEnd });
    const after = vault.store.get("P.md").split("\n").length;
    cursor = childEnd + (after - before) + 1;
  }
  return visited;
}

test("deleting a child does not cause the next one to be skipped", async () => {
  const vault = makeVault({ "P.md": ["- [ ] project #project", "    - [ ] first", "    - [ ] second", "    - [ ] third"].join("\n") });
  const item = { startLine: 0 };
  let n = 0;
  const visited = await mirrorWalk(vault, item, (c) => {
    if (n++ === 0) {
      const lines = vault.store.get("P.md").split("\n");
      lines.splice(c.startLine, c.endLine - c.startLine + 1);
      vault.store.set("P.md", lines.join("\n"));
    }
  });
  assert.deepStrictEqual(visited, ["- [ ] first", "- [ ] second", "- [ ] third"]);
});

test("a child that grows is not revisited", async () => {
  const vault = makeVault({ "P.md": ["- [ ] project #project", "    - [ ] first", "    - [ ] second"].join("\n") });
  let n = 0;
  const visited = await mirrorWalk(vault, { startLine: 0 }, (c) => {
    if (n++ === 0) {
      const lines = vault.store.get("P.md").split("\n");
      lines.splice(c.endLine + 1, 0, "        - [ ] new grandchild");
      vault.store.set("P.md", lines.join("\n"));
    }
  });
  assert.deepStrictEqual(visited, ["- [ ] first", "- [ ] second"]);
});

test("recursion is depth-limited", () => {
  assert.ok(MAX_PROJECT_DEPTH > 0 && MAX_PROJECT_DEPTH <= 10,
    "a nested project recurses, so the depth must be bounded");
});


