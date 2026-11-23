/**
 * Cancellation scope inside a project's subtask walk.
 *
 * `retry` (raised automatically when a Tasks dialogue is cancelled) redoes the smallest
 * enclosing unit — one subtask. `back` (raised only by the "Restart task" button) restarts
 * the whole project, as the label promises. These are driven against the real
 * processProjectChildren with a prompter scripted per subtask.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const {
  processProjectChildren, ReviewControl, VaultJournal, journalledApp, MAX_SUBTASK_RETRIES
} = require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const PROJECT = [
  "- [ ] project #project",
  "    - [ ] alpha",
  "    - [ ] beta",
  "    - [ ] gamma"
].join("\n");

/**
 * Run the real walk. `script` maps a subtask's text to a list of outcomes, consumed in
 * order: "skip", "retry", "back", or a function that mutates the file then resolves.
 */
async function walk(content, script, opts = {}) {
  const vault = makeVault({ "P.md": content });
  const seen = [];
  const pending = new Map(Object.entries(script).map(([k, v]) => [k, [...v]]));
  const ctx = {
    app: makeApp(vault),
    settings: { projectTag: "project" },
    tasks: {},
    prompter: {
      highlightInSource: async (child) => { seen.push(child.raw.trim()); },
      choice: async () => { throw next(seen[seen.length - 1]); },
      optionalChoice: async () => { throw next(seen[seen.length - 1]); },
      text: async () => { throw next(seen[seen.length - 1]); },
      confirm: async () => { throw next(seen[seen.length - 1]); },
      info: () => {}
    }
  };
  function next(raw) {
    const key = raw.replace(/^-\s*\[.\]\s*/, "");
    const queue = pending.get(key);
    const action = queue && queue.length ? queue.shift() : "skip";
    if (typeof action === "function") { action(vault); return new ReviewControl("skip"); }
    return new ReviewControl(action);
  }
  const item = {
    file: new TFile("P.md"), startLine: 0,
    endLine: content.split("\n").length - 1, raw: content.split("\n")[0]
  };
  let escaped = null;
  try {
    await processProjectChildren(ctx, item, 0);
  } catch (e) {
    escaped = e;
  }
  return { seen, escaped, vault };
}

test("a cancel redoes just that subtask", async () => {
  const { seen, escaped } = await walk(PROJECT, { beta: ["retry", "skip"] });
  assert.strictEqual(escaped, null, "must not escape to the review loop");
  assert.deepStrictEqual(seen, ["- [ ] alpha", "- [ ] beta", "- [ ] beta", "- [ ] gamma"],
    "beta is offered again; alpha is not redone and gamma still follows");
});

test("earlier subtasks are never redone by a later cancel", async () => {
  const { seen } = await walk(PROJECT, { gamma: ["retry", "skip"] });
  assert.strictEqual(seen.filter((s) => s.includes("alpha")).length, 1);
  assert.strictEqual(seen.filter((s) => s.includes("beta")).length, 1);
  assert.strictEqual(seen.filter((s) => s.includes("gamma")).length, 2);
});

test("'Restart task' from inside a subtask escalates to the whole project", async () => {
  const { seen, escaped } = await walk(PROJECT, { beta: ["back"] });
  assert.ok(escaped instanceof ReviewControl && escaped.kind === "back",
    "back must reach the review loop, which restarts the task with the journal restored");
  assert.deepStrictEqual(seen, ["- [ ] alpha", "- [ ] beta"], "the walk stops there");
});

test("Revert and Exit also escalate", async () => {
  for (const kind of ["prev", "exit"]) {
    const { escaped } = await walk(PROJECT, { beta: [kind] });
    assert.ok(escaped instanceof ReviewControl && escaped.kind === kind, kind);
  }
});

test("Skip still moves to the next subtask", async () => {
  const { seen, escaped } = await walk(PROJECT, {});
  assert.strictEqual(escaped, null);
  assert.deepStrictEqual(seen, ["- [ ] alpha", "- [ ] beta", "- [ ] gamma"]);
});

test("repeated cancels keep offering the same subtask", async () => {
  const { seen, escaped } = await walk(PROJECT, { beta: ["retry", "retry", "retry", "skip"] });
  assert.strictEqual(escaped, null);
  assert.strictEqual(seen.filter((s) => s.includes("beta")).length, 4);
});

test("endless cancelling is bounded rather than spinning forever", async () => {
  const forever = Array(MAX_SUBTASK_RETRIES + 5).fill("retry");
  const { escaped } = await walk(PROJECT, { beta: forever });
  assert.ok(escaped instanceof ReviewControl && escaped.kind === "back",
    "past the bound it escalates to a full restart rather than looping");
});

test("a retry undoes what the abandoned attempt had written", async () => {
  // The one cancel point that fires after a write: a subtask turned into a project, then
  // the first sub-subtask cancelled. The half-made project must not survive the retry.
  const vault = makeVault({ "P.md": PROJECT });
  const app = makeApp(vault);
  const journal = new VaultJournal(app);
  const wrapped = journalledApp(app, journal);
  await journal.capture(new TFile("P.md"));
  await wrapped.vault.process(new TFile("P.md"), (d) =>
    d.replace("    - [ ] beta", "    - [ ] Some new project #project\n        - [ ] beta"));
  assert.match(vault.store.get("P.md"), /Some new project/);
  await journal.restore();
  assert.strictEqual(vault.store.get("P.md"), PROJECT, "the retry starts from a clean slate");
});

test("subtask journals nest inside the task journal", async () => {
  // Inner restore returns to the subtask's start; the outer still holds the task's start,
  // so a later "Restart task" is unaffected by a subtask retry.
  const vault = makeVault({ "P.md": "start" });
  const app = makeApp(vault);
  const outer = new VaultJournal(app);
  const outerApp = journalledApp(app, outer);
  await outerApp.vault.process(new TFile("P.md"), () => "after task step");

  const inner = new VaultJournal(outerApp);
  const innerApp = journalledApp(outerApp, inner);
  await innerApp.vault.process(new TFile("P.md"), () => "after subtask step");

  await inner.restore();
  assert.strictEqual(vault.store.get("P.md"), "after task step", "inner undoes only the subtask");
  await outer.restore();
  assert.strictEqual(vault.store.get("P.md"), "start", "outer still reaches the task's start");
});

test("the review loop treats retry as a full restart", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
  // There is no smaller unit at the top level.
  assert.match(main, /if \(e\.kind === "back" \|\| e\.kind === "retry" \|\| e\.kind === "reprocess"\) rewind = "back"/);
  assert.match(main, /else if \(e\.kind === "prev"\) rewind = "prev"/);
});
