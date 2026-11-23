/**
 * The progress counter's denominator is "tasks in this review that still exist", so
 * deleting, filing or marking a task shrinks it. A rewind puts the task back and must
 * restore the count with it.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

/** Mirrors the loop's counter bookkeeping. */
function runLoop(n, script) {
  const disposedAt = [];
  const goneBefore = () => disposedAt.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  const shown = [];
  let prevJournal = null, prevIndex = -1, step = 0;
  for (let i = 0; i < n; i++) {
    const gone = goneBefore();
    shown.push(`${i - gone + 1}/${n - gone}`);
    const action = script[step++] || "done";
    if (action === "back") { disposedAt[i] = false; i -= 1; continue; }
    if (action === "prev" && i > 0 && prevJournal) {
      const t = prevIndex;
      disposedAt[i] = false; disposedAt[t] = false;
      prevJournal = null; prevIndex = -1; i = t - 1; continue;
    }
    disposedAt[i] = action === "dispose";
    prevJournal = {}; prevIndex = i;
  }
  return shown;
}

test("with no disposals the counter is a plain 1..N", () => {
  assert.deepStrictEqual(runLoop(4, ["done", "done", "done", "done"]),
    ["1/4", "2/4", "3/4", "4/4"]);
});

test("disposing of a task shrinks the denominator", () => {
  // Delete the first task: the next is now the first of three that still exist.
  assert.deepStrictEqual(runLoop(4, ["dispose", "done", "done", "done"]),
    ["1/4", "1/3", "2/3", "3/3"]);
});

test("the counter never exceeds its denominator", () => {
  for (const n of [1, 3, 8]) {
    for (const shown of runLoop(n, Array(n).fill("dispose"))) {
      const [a, b] = shown.split("/").map(Number);
      assert.ok(a <= b, `${shown} is not a coherent position`);
      assert.ok(a >= 1 && b >= 1, `${shown} must stay positive`);
    }
  }
});

test("disposing of everything ends at 1 of 1, not 8 of 1", () => {
  const shown = runLoop(3, ["dispose", "dispose", "dispose"]);
  assert.deepStrictEqual(shown, ["1/3", "1/2", "1/1"]);
});

test("mixed disposals and completions stay coherent", () => {
  assert.deepStrictEqual(runLoop(5, ["done", "dispose", "done", "dispose", "done"]),
    ["1/5", "2/5", "2/4", "3/4", "3/3"]);
});

test("Restart re-runs the current task without disturbing the count", () => {
  // Restart acts on the task in front of you; it cannot undo an earlier task's disposal,
  // which is what Revert is for.
  assert.deepStrictEqual(runLoop(3, ["done", "back", "done", "done"]),
    ["1/3", "2/3", "2/3", "3/3"]);
});

test("Revert restores the previous task's disposal", () => {
  // Dispose of task 2, then Revert from task 3: both come back, so the denominator
  // returns to 3 and task 2 is reopened.
  const shown = runLoop(3, ["done", "dispose", "prev", "done", "done"]);
  assert.deepStrictEqual(shown, ["1/3", "2/3", "2/2", "2/3", "3/3"]);
  assert.strictEqual(shown[2], "2/2", "while task 2 is disposed, only 2 tasks remain");
  assert.strictEqual(shown[3], "2/3", "reverting puts it back");
  assert.strictEqual(shown[shown.length - 1], "3/3");
});

/* ------------------------- wiring in the shipped file ------------------------- */

test("every Process path that removes a task marks it disposed", () => {
  // tickle, reference, delete/complete/cancel, someday, move, a step filed under a project
  // in another note, a project's last next action sent to Someday with its project, a
  // project sent to Someday after its walk, and one sent there from Organise's "no next
  // action". A deferred task stays in the file but leaves this review, so it counts as
  // disposed for the progress total.
  assert.strictEqual((main.match(/item\.disposed = true;/g) || []).length, 9);
});

test("the disposed flag is cleared at the start of each attempt", () => {
  // The item object is reused across a restart, so a stale flag would double-count.
  assert.match(main, /item\.disposed = false;\s*\n\s*const gone = goneBefore\(\)/);
});

test("the counter uses the live totals, not the snapshot length", () => {
  assert.match(main, /this\.renderProgress\(mode, i - gone, items\.length - gone\)/);
  assert.ok(!/renderProgress\(mode, i, items\.length\)/.test(main), "the fixed-total call must be gone");
});

test("a rewind clears the disposal it undid", () => {
  assert.match(main, /disposedAt\[i\] = false;/);
  assert.match(main, /disposedAt\[target\] = false;/);
});

test("Organise filing is not counted as disposal", () => {
  // Every Organise task is filed, so counting those would shrink the total to 1. Only
  // re-processing (which runs Process) can dispose of a task during Organise.
  for (const fn of ["async function runOrganise", "async function organiseTask", "async function organiseProject",
                    "async function organiseNextActions", "async function labelUnit"]) {
    const at = main.indexOf(fn);
    assert.ok(at > -1, fn);
    // Sending a project with no next action to Someday is the one exception: it leaves the
    // review, as it would from re-processing.
    const body = main.slice(at, main.indexOf("\n}", at)).replace(/if \(fix === "someday"\) item\.disposed = true;/, "");
    assert.ok(!/\.disposed = /.test(body), `${fn} must not mark anything disposed`);
  }
});
