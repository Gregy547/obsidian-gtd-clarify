/**
 * Line-offset bookkeeping across the review loop.
 *
 * A query source draws tasks from many files. A single running offset — which is what the
 * loop used before — would apply one file's growth to another file's line numbers, so
 * every task after the first edit would point at the wrong line. These tests drive the
 * same arithmetic the loop performs, against independently computed truth.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { restoreOffsets } = require("./helpers/load.js");

/** Mirrors the loop: per-file offsets, snapshotted per task, restored on rewind. */
function runLoop(items, script) {
  const bases = items.map((it) => ({ start: it.startLine, end: it.endLine }));
  const offsets = new Map();
  const offsetOf = (p) => (offsets.get(p) === undefined ? 0 : offsets.get(p));
  const offsetAt = [];
  const visits = [];
  let prevJournal = null, prevIndex = -1, step = 0;
  for (let i = 0; i < items.length; i++) {
    offsetAt[i] = new Map(offsets);
    const item = items[i];
    const off = offsetOf(item.path);
    item.startLine = bases[i].start + off;
    item.endLine = bases[i].end + off;
    visits.push({ name: item.name, path: item.path, line: item.startLine });
    const action = script[step++] || "done";
    if (action === "back") {
      item.startLine = bases[i].start; item.endLine = bases[i].end;
      restoreOffsets(offsets, offsetAt[i]); i -= 1; continue;
    }
    if (action === "prev" && i > 0 && prevJournal) {
      item.startLine = bases[i].start; item.endLine = bases[i].end;
      const t = prevIndex;
      restoreOffsets(offsets, offsetAt[t]);
      prevJournal = null; prevIndex = -1; i = t - 1; continue;
    }
    prevJournal = {}; prevIndex = i;
    offsets.set(item.path, offsetOf(item.path) + (item.delta || 0));
  }
  return visits;
}

/** Truth: each task's pristine line plus growth from EARLIER tasks IN THE SAME FILE. */
function truth(items) {
  const per = new Map(); const out = {};
  for (const it of items) {
    const off = per.get(it.path) || 0;
    out[it.name] = it.startLine + off;
    per.set(it.path, off + (it.delta || 0));
  }
  return out;
}

const mk = (spec) => spec.map(([name, path, line, delta]) =>
  ({ name, path, startLine: line, endLine: line, delta }));

function check(label, spec, script) {
  const T = truth(mk(spec));
  const visits = runLoop(mk(spec), script);
  for (const v of visits) {
    assert.strictEqual(v.line, T[v.name],
      `${label}: ${v.name} visited at ${v.line}, expected ${T[v.name]}`);
  }
  return visits;
}

test("single file behaves exactly as the old scalar offset did", () => {
  check("single", [["T1", "A.md", 0, 2], ["T2", "A.md", 1, 0], ["T3", "A.md", 2, 0]],
    ["done", "done", "done"]);
});

test("growth in one file does not shift line numbers in another", () => {
  // The defect a single running offset would cause: A.md grows by 2, and B.md's tasks
  // silently move by 2 as well.
  const visits = check("cross-file",
    [["A1", "A.md", 0, 2], ["B1", "B.md", 0, 0], ["B2", "B.md", 1, 0]],
    ["done", "done", "done"]);
  assert.strictEqual(visits.find((v) => v.name === "B1").line, 0, "B.md must be untouched by A.md's growth");
  assert.strictEqual(visits.find((v) => v.name === "B2").line, 1);
});

test("growth accumulates within a file while interleaved with another", () => {
  check("interleaved",
    [["A1", "A.md", 0, 2], ["B1", "B.md", 0, 3], ["A2", "A.md", 1, 0], ["B2", "B.md", 1, 0]],
    ["done", "done", "done", "done"]);
});

test("Restart restores the whole offset map, not just the current file", () => {
  check("restart",
    [["A1", "A.md", 0, 2], ["B1", "B.md", 0, 1], ["A2", "A.md", 1, 0]],
    ["done", "done", "back", "done", "done"]);
});

test("Revert steps back across a file boundary correctly", () => {
  check("revert",
    [["A1", "A.md", 0, 2], ["B1", "B.md", 0, 1], ["A2", "A.md", 1, 0]],
    ["done", "done", "prev", "done", "done", "done"]);
});

test("Revert then Restart still lands on the true line", () => {
  check("revert+restart",
    [["A1", "A.md", 0, 2], ["B1", "B.md", 0, 1], ["A2", "A.md", 1, 0]],
    ["done", "done", "prev", "back", "done", "done", "done"]);
});

test("a shrinking task (subtree moved out) is handled", () => {
  check("shrink",
    [["A1", "A.md", 0, -1], ["A2", "A.md", 3, 0], ["B1", "B.md", 0, 0]],
    ["done", "done", "prev", "done", "done"]);
});

test("many files with mixed growth stay independent", () => {
  check("many",
    [["A1", "A.md", 0, 2], ["B1", "B.md", 5, 1], ["C1", "C.md", 3, -2],
     ["A2", "A.md", 4, 0], ["B2", "B.md", 9, 0], ["C2", "C.md", 8, 0]],
    ["done", "done", "done", "done", "done", "done"]);
});

test("restoreOffsets replaces contents in place", () => {
  // The loop closes over the live map, so restore must mutate rather than rebind.
  const live = new Map([["A.md", 5], ["B.md", 3]]);
  const ref = live;
  restoreOffsets(live, new Map([["A.md", 1]]));
  assert.strictEqual(ref, live, "must be the same object");
  assert.strictEqual(live.get("A.md"), 1);
  assert.strictEqual(live.has("B.md"), false, "stale entries must be cleared");
});
