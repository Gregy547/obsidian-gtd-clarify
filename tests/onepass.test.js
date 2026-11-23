/**
 * "Organise as you process": one pass instead of two, when the setting is on.
 *
 * Each task is organised straight after Process decides it. A task put in the two-minute
 * batch waits until the batch is done — if it was done there is nothing to organise, and
 * labelling it first would stop the batch finding it by its words. Undo still covers the
 * whole task: going back undoes the organising with the processing.
 *
 * ReviewView.start is lifted from the source and run against a fake vault, with Process
 * and Organise replaced by scripts: these tests are about the loop's order of work.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { organiseAfterProcess, DefaultFilingStrategy, DEFAULT_SETTINGS, ReviewControl } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
const method = (sig) => {
  const at = main.indexOf(sig);
  assert.ok(at >= 0, sig);
  return main.slice(at, main.indexOf("\n  }\n", at) + 4);
};

/** The real start() and organiseAfterBatch(), with Process, Organise and the batch scripted. */
function review({ onePass, process, organise, batch = async () => 0 }) {
  const body = method("  async start(mode, file") + method("  async organiseAfterBatch(ctx, units, filing) {");
  const deps = Object.assign({}, L, { runProcess: process, organiseAfterProcess: organise, obsidian: L.obsidian });
  const names = Object.keys(deps).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  const Klass = new Function(...names, `return class { ${body} }`)(...names.map((k) => deps[k]));
  const vault = makeVault({ "Inbox.md": "- [ ] Call Sam\n- [ ] Reply to Priya\n- [ ] Plan the party" });
  const pane = new Klass();
  pane.app = makeApp(vault);
  pane.plugin = { settings: Object.assign({}, DEFAULT_SETTINGS, { organiseAfterProcessing: onePass }), tasksApi: { isAvailable: () => true } };
  pane.headerEl = { setText() {} };
  pane.bodyEl = { empty() {}, createEl() { return {}; } };
  pane.chooseSource = async () => ({
    collect: async () => vault.store.get("Inbox.md").split("\n").map((raw, i) => ({
      file: new TFile("Inbox.md"), startLine: i, endLine: i, raw, isProject: false
    }))
  });
  pane.renderProgress = () => {};
  pane.highlightInSource = async () => {};
  pane.renderDone = () => {};
  pane.runQuickBatch = batch;
  return { pane, vault, run: () => pane.start("process", new TFile("Inbox.md")) };
}
const word = (item) => item.raw.replace("- [ ] ", "").split(" ")[0];

test("off: Process only processes", async () => {
  const log = [];
  const r = review({
    onePass: false,
    process: async (ctx, item) => log.push(`process ${word(item)}`),
    organise: async (ctx, item) => log.push(`organise ${word(item)}`)
  });
  await r.run();
  assert.deepStrictEqual(log, ["process Call", "process Reply", "process Plan"]);
});

test("on: each task is organised straight after it is processed", async () => {
  const log = [];
  const r = review({
    onePass: true,
    process: async (ctx, item) => log.push(`process ${word(item)}`),
    organise: async (ctx, item) => log.push(`organise ${word(item)}`)
  });
  await r.run();
  assert.deepStrictEqual(log, ["process Call", "organise Call", "process Reply", "organise Reply", "process Plan", "organise Plan"]);
});

test("on: a task batched as two minutes is organised after the batch, not before", async () => {
  const log = [];
  const r = review({
    onePass: true,
    process: async (ctx, item) => {
      log.push(`process ${word(item)}`);
      if (word(item) === "Reply") ctx.quickBatch.push({ file: item.file, line: item.startLine, raw: item.raw });
    },
    organise: async (ctx, item) => log.push(`organise ${word(item)}`),
    batch: async () => { log.push("batch"); return 0; }
  });
  await r.run();
  assert.deepStrictEqual(log, ["process Call", "organise Call", "process Reply", "process Plan", "organise Plan", "batch", "organise Reply"]);
});

test("going back undoes the organising with the processing, and asks both again", async () => {
  const log = [];
  let backOnce = true;
  const r = review({
    onePass: true,
    process: async (ctx, item) => log.push(`process ${word(item)}`),
    organise: async (ctx, item) => {
      log.push(`organise ${word(item)}`);
      await ctx.app.vault.process(item.file, (d) => d.replace(item.raw, `${item.raw} #home`));
      if (word(item) === "Reply" && backOnce) { backOnce = false; throw new ReviewControl("back"); }
    }
  });
  await r.run();
  assert.deepStrictEqual(log.slice(2, 6), ["process Reply", "organise Reply", "process Reply", "organise Reply"]);
  assert.strictEqual(r.vault.store.get("Inbox.md"), "- [ ] Call Sam #home\n- [ ] Reply to Priya #home\n- [ ] Plan the party #home",
    "the first try's label was undone, not doubled");
});

test("a task batched, then gone back over and not batched, is organised once, in place", async () => {
  const log = [];
  let first = true;
  const r = review({
    onePass: true,
    process: async (ctx, item) => {
      log.push(`process ${word(item)}`);
      if (word(item) !== "Reply") return;
      if (first) { first = false; ctx.quickBatch.push({ file: item.file, line: item.startLine, raw: item.raw }); throw new ReviewControl("back"); }
    },
    organise: async (ctx, item) => log.push(`organise ${word(item)}`),
    batch: async (ctx, b) => { log.push(`batch of ${b.length}`); return 0; }
  });
  await r.run();
  assert.deepStrictEqual(log.filter((l) => l.includes("Reply")), ["process Reply", "process Reply", "organise Reply"]);
  assert.ok(!log.includes("batch of 1"), "the batch entry went with the undo");
});

test("a batched task reopened with Previous, and not batched this time, is organised once, in place", async () => {
  const log = [];
  let first = true, prevOnce = true;
  const r = review({
    onePass: true,
    process: async (ctx, item) => {
      log.push(`process ${word(item)}`);
      if (word(item) === "Call" && first) { first = false; ctx.quickBatch.push({ file: item.file, line: item.startLine, raw: item.raw }); }
      if (word(item) === "Reply" && prevOnce) { prevOnce = false; throw new ReviewControl("prev"); }
    },
    organise: async (ctx, item) => log.push(`organise ${word(item)}`),
    batch: async (ctx, b) => { log.push(`batch of ${b.length}`); return 0; }
  });
  await r.run();
  assert.deepStrictEqual(log.filter((l) => l.includes("Call")), ["process Call", "process Call", "organise Call"]);
  assert.ok(!log.some((l) => l.startsWith("batch")), "nothing left in the batch");
});

test("after the batch, Skip leaves a task, Back asks it again, Exit leaves the rest", async () => {
  const log = [];
  const tries = {};
  const r = review({
    onePass: true,
    process: async (ctx, item) => ctx.quickBatch.push({ file: item.file, line: item.startLine, raw: item.raw }),
    organise: async (ctx, item) => {
      const w = word(item);
      tries[w] = (tries[w] || 0) + 1;
      log.push(`organise ${w}`);
      if (w === "Call") throw new ReviewControl("skip");
      if (w === "Reply" && tries[w] === 1) throw new ReviewControl("back");
      if (w === "Reply") throw new ReviewControl("exit");
    }
  });
  await r.run();
  assert.deepStrictEqual(log, ["organise Call", "organise Reply", "organise Reply"], "Plan is left after Exit");
});

/* -------------------------- what is organised afterwards -------------------------- */

test("a batched task that was done in the batch is not organised", async () => {
  const vault = makeVault({ "Inbox.md": "- [x] Reply to Priya ✅ 2026-11-06" });
  const asked = [];
  const ctx = {
    app: makeApp(vault), settings: Object.assign({}, DEFAULT_SETTINGS), mode: "process",
    prompter: { optionalChoice: async (q) => { asked.push(q); return null; }, choice: async (q) => { asked.push(q); return null; }, text: async () => "" }
  };
  const unit = { file: new TFile("Inbox.md"), startLine: 0, endLine: 0, raw: "- [ ] Reply to Priya", isProject: false };
  await organiseAfterProcess(ctx, unit, new DefaultFilingStrategy(), true, null);
  assert.deepStrictEqual(asked, []);
});
