/**
 * The review loop, driven for real: what it shows after an earlier task has moved lines.
 *
 * Reported: organising a project with indented notes, then moving it to the Someday note,
 * left the review showing "tags do not include waitingfor" — a line of a tasks query block
 * above the project — as the next task. A task that Obsidian's list parser called
 * top-level sat inside the project's indented block, so it moved away with the project;
 * when the loop reached it, it fell back to a predicted line number, which by then pointed
 * above where the project had been.
 *
 * ReviewView.start is lifted from the source and run against a fake vault, with the
 * organising itself replaced by a script: these tests are about the loop's bookkeeping.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

const NOTE = [
  "```tasks",            // 0
  "not done",            // 1
  "tags do not include waitingfor", // 2
  "```",                 // 3
  "- [ ] Plan the move #project", // 4
  "    - note: quotes from two firms", // 5
  "    - note: keys back by the 30th", // 6
  " - [ ] Book the van", // 7  one space: top-level to the parser, inside the project's block
  "    - note: van needs a tail lift", // 8
  "- [ ] Call Sam",      // 9
  "- [ ] Email Priya"    // 10
];

/** The real start(), on a pane with just enough of a view around it. */
function review({ files, items, organise }) {
  const at = main.indexOf("  async start(mode, file");
  const body = main.slice(at, main.indexOf("\n  }\n", at) + 4);
  const deps = Object.assign({}, L, { runOrganise: organise, obsidian: L.obsidian });
  const names = Object.keys(deps).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  const Klass = new Function(...names, `return class { ${body} }`)(...names.map((k) => deps[k]));
  const vault = makeVault(files);
  const pane = new Klass();
  const shown = [];
  pane.app = makeApp(vault);
  pane.plugin = { settings: Object.assign({}, L.DEFAULT_SETTINGS), tasksApi: { isAvailable: () => true } };
  pane.headerEl = { setText() {} };
  pane.bodyEl = { empty() {}, createEl() { return {}; } };
  pane.chooseSource = async () => ({ collect: async () => items(vault) });
  pane.renderProgress = (mode, index, total) => shown.push({ index, total });
  pane.highlightInSource = async () => {};
  pane.renderDone = () => {};
  return { pane, vault, shown, run: () => pane.start("organise", vault.getAbstractFileByPath("Inbox.md")) };
}
const itemAt = (vault, line) => {
  const file = vault.getAbstractFileByPath("Inbox.md");
  const lines = vault.store.get("Inbox.md").split("\n");
  return { file, startLine: line, endLine: L.computeSubtreeEnd(lines, line), raw: lines[line], isProject: L.lineHasTag(lines[line], "project") };
};
/** Organising: the project is moved out to Someday (its whole block); the rest are labelled. */
function organiser(seen) {
  return async (ctx, item) => {
    seen.push(item.raw);
    if (item.isProject) {
      await ctx.app.vault.process(item.file, (d) => {
        const lines = d.split("\n");
        lines.splice(item.startLine, item.endLine - item.startLine + 1);
        return lines.join("\n");
      });
      item.disposed = true;
      return;
    }
    await ctx.app.vault.process(item.file, (d) => {
      const lines = d.split("\n");
      lines[item.startLine] += " #home";
      return lines.join("\n");
    });
  };
}

test("a task taken away with an earlier project is passed over, not replaced by another line", async () => {
  const seen = [];
  // The items as the parser saw them: the one-space task counts as top-level.
  const r = review({
    files: { "Inbox.md": NOTE.join("\n") },
    items: (vault) => [itemAt(vault, 4), itemAt(vault, 7), itemAt(vault, 9), itemAt(vault, 10)],
    organise: organiser(seen)
  });
  await r.run();
  assert.deepStrictEqual(seen, ["- [ ] Plan the move #project", "- [ ] Call Sam", "- [ ] Email Priya"]);
  assert.ok(!seen.some((s) => /tags do not include/.test(s)), "never a line of the query block");
  assert.deepStrictEqual(r.vault.store.get("Inbox.md").split("\n").slice(0, 4), NOTE.slice(0, 4), "the query block is untouched");
});

test("the count shrinks for a task that went with an earlier one", async () => {
  const r = review({
    files: { "Inbox.md": NOTE.join("\n") },
    items: (vault) => [itemAt(vault, 4), itemAt(vault, 7), itemAt(vault, 9), itemAt(vault, 10)],
    organise: organiser([])
  });
  await r.run();
  assert.deepStrictEqual(r.shown.map((s) => s.total), [4, 2, 2], "of 4, then of the 2 that are left");
});

test("each task's block is measured when it is reached, so one that grew moves whole", async () => {
  // An earlier task files a next action under a later project; the project then moves out.
  const files = { "Inbox.md": ["- [ ] Capture", "- [ ] Trip #project", "    - [ ] Book flights", "- [ ] Last"].join("\n") };
  const moved = [];
  const r = review({
    files,
    items: (vault) => [itemAt(vault, 0), itemAt(vault, 1), itemAt(vault, 3)],
    organise: async (ctx, item) => {
      if (item.raw === "- [ ] Capture") {
        // Filed under the project, below its existing next action.
        await ctx.app.vault.process(item.file, (d) => {
          const lines = d.split("\n");
          const [cap] = lines.splice(0, 1);
          lines.splice(2, 0, "    " + cap.trim());
          return lines.join("\n");
        });
        return;
      }
      if (item.isProject) {
        await ctx.app.vault.process(item.file, (d) => {
          const lines = d.split("\n");
          moved.push(...lines.splice(item.startLine, item.endLine - item.startLine + 1));
          return lines.join("\n");
        });
      }
    }
  });
  await r.run();
  assert.deepStrictEqual(moved, ["- [ ] Trip #project", "    - [ ] Book flights", "    - [ ] Capture"], "the filed action went with it");
  assert.strictEqual(r.vault.store.get("Inbox.md"), "- [ ] Last");
});

/* ------------------------------- the this-note source ------------------------------- */

function cacheFor(lines, entries) {
  return { listItems: entries.map(([line, task, parent]) => ({ task, parent, position: { start: { line } } })) };
}

test("this note: a task inside a project's block is part of the project, not its own item", async () => {
  const vault = makeVault({ "Inbox.md": NOTE.join("\n") });
  const app = makeApp(vault, {
    getFileCache: () => cacheFor(NOTE, [[4, " ", -4], [5, undefined, 4], [6, undefined, 4], [7, " ", -4], [8, undefined, 7], [9, " ", -4], [10, " ", -4]])
  });
  const items = await new L.ActiveFileTopLevelTaskSource(app, vault.getAbstractFileByPath("Inbox.md"), "project").collect();
  assert.deepStrictEqual(items.map((i) => i.startLine), [4, 9, 10]);
  assert.strictEqual(items[0].endLine, 8, "the project's block includes the one-space task and the note after it");
});

test("this note: a cache a revision behind is not trusted for a line that isn't a task", async () => {
  // The cache still lists a task at line 2, but the note now has a query line there.
  const vault = makeVault({ "Inbox.md": NOTE.join("\n") });
  const app = makeApp(vault, { getFileCache: () => cacheFor(NOTE, [[2, " ", -2], [9, " ", -9], [10, "x", -9]]) });
  const items = await new L.ActiveFileTopLevelTaskSource(app, vault.getAbstractFileByPath("Inbox.md"), "project").collect();
  assert.deepStrictEqual(items.map((i) => i.raw), ["- [ ] Call Sam"], "not the query line, and not a finished task");
});

test("locateByText finds a moved line, and reports one that has gone", () => {
  const lines = ["a", "- [ ] x", "b"];
  assert.strictEqual(L.locateByText(lines, 0, "- [ ] x"), 1);
  assert.strictEqual(L.locateByText(lines, 1, "- [ ] gone"), -1, "no fallback to the predicted line");
});
