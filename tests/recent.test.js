/**
 * Recent destinations: the last few notes Move to… sent a task to, offered again.
 *
 * Filing a run of tasks into the same area or project meant searching for it each time.
 * The last three are now answers of their own, after the fixed ones so those keep their
 * numbers, under "Recent".
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { DefaultFilingStrategy, DEFAULT_SETTINGS, recentDestinationOptions, MAX_RECENT_DESTINATIONS } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const plain = (q) => String(q).replace(/\*\*/g, "");

function setup(files, { recent = [], curated = [], answers = [], picks = [] } = {}) {
  const vault = makeVault(files);
  const asked = [];
  const queue = [...answers], pickQueue = [...picks];
  let saves = 0;
  const ctx = {
    app: makeApp(vault), mode: "organise", sourceKind: "query",
    plugin: { saveSettings: async () => { saves++; } },
    settings: Object.assign({}, DEFAULT_SETTINGS, { recentDestinations: recent, curatedMoveTargets: curated }),
    prompter: {
      choice: async (q, opts) => { asked.push(opts.map((o) => ({ label: plain(o.label), value: o.value, group: o.group }))); return queue.shift(); },
      suggestFile: async () => { const p = pickQueue.shift(); return p ? new TFile(p) : null; },
      info: () => {}
    }
  };
  return { vault, ctx, asked, saves: () => saves };
}
const task = (path = "Inbox.md", raw = "- [ ] Book the dentist") => ({ file: new TFile(path), startLine: 0, endLine: 0, raw, isProject: false });

test("a note a task was moved to is offered next time, last, under Recent", async () => {
  const h = setup({ "Inbox.md": "- [ ] Book the dentist\n- [ ] Buy vitamins", "AreasOfFocus/Health.md": "" },
    { answers: ["__search__", "AreasOfFocus/Health.md"], picks: ["AreasOfFocus/Health.md"] });
  const f = new DefaultFilingStrategy();
  await f.fileTask(h.ctx, task());
  assert.deepStrictEqual(h.ctx.settings.recentDestinations, ["AreasOfFocus/Health.md"]);
  assert.strictEqual(h.saves(), 1, "kept for next time");
  await f.fileTask(h.ctx, task("Inbox.md", "- [ ] Buy vitamins"));
  const second = h.asked[1];
  assert.deepStrictEqual(second[second.length - 1], { label: "Health — AreasOfFocus", value: "AreasOfFocus/Health.md", group: "Recent" });
  assert.strictEqual(h.vault.store.get("AreasOfFocus/Health.md").trim(), "- [ ] Book the dentist\n- [ ] Buy vitamins");
});

test("the fixed answers keep their places", () => {
  const h = setup({ "Inbox.md": "", "A.md": "", "B.md": "" }, { recent: ["A.md", "B.md"] });
  const opts = recentDestinationOptions(h.ctx, task());
  assert.deepStrictEqual(opts.map((o) => o.value), ["A.md", "B.md"]);
  assert.ok(opts.every((o) => o.group === "Recent"));
});

test("most recent first, no repeats, at most three", async () => {
  const files = { "Inbox.md": "- [ ] a\n- [ ] b\n- [ ] c\n- [ ] d\n- [ ] e", "A.md": "", "B.md": "", "C.md": "", "D.md": "" };
  const h = setup(files, { answers: ["__search__", "__search__", "__search__", "__search__", "__search__"], picks: ["A.md", "B.md", "A.md", "C.md", "D.md"] });
  const f = new DefaultFilingStrategy();
  for (const raw of ["- [ ] a", "- [ ] b", "- [ ] c", "- [ ] d", "- [ ] e"]) await f.fileTask(h.ctx, task("Inbox.md", raw));
  assert.strictEqual(MAX_RECENT_DESTINATIONS, 3);
  assert.deepStrictEqual(h.ctx.settings.recentDestinations, ["D.md", "C.md", "A.md"]);
});

test("not offered: a quick destination, the task's own note, or a note that has gone", () => {
  const h = setup({ "Inbox.md": "", "Lists/Next.md": "", "Kept.md": "" }, {
    recent: ["Lists/Next.md", "Inbox.md", "Gone.md", "Kept.md"], curated: ["Lists/Next.md"]
  });
  assert.deepStrictEqual(recentDestinationOptions(h.ctx, task()).map((o) => o.value), ["Kept.md"]);
});

test("a quick destination is not remembered: it is offered already", async () => {
  const h = setup({ "Inbox.md": "- [ ] a", "Lists/Next.md": "" }, { curated: ["Lists/Next.md"], answers: ["Lists/Next.md"] });
  await new DefaultFilingStrategy().fileTask(h.ctx, task("Inbox.md", "- [ ] a"));
  assert.deepStrictEqual(h.ctx.settings.recentDestinations, []);
});
