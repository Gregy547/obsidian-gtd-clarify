const { test } = require("node:test");
const assert = require("node:assert");
const { RANK, rankCandidates, buildCandidates, makeIgnoreMatcher } = require("./helpers/load.js");
const { makeApp, makeVault } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const files = (paths) => paths.map((p) => new TFile(p));

function cands(paths, opts = {}) {
  const app = makeApp(makeVault(), opts);
  if (opts.userIgnoreFilters !== undefined) {
    app.vault.getConfig = (k) => (k === "userIgnoreFilters" ? opts.userIgnoreFilters : null);
  }
  return buildCandidates(app, files(paths), (f) => ({
    name: f.basename,
    path: f.path,
    aliases: (opts.aliases && opts.aliases[f.path]) || []
  }));
}
const order = (results) => results.map((r) => r.item.path);
const tierOf = (r) => Object.keys(RANK).find((k) => RANK[k] === r.rank);

test("an exact filename match outranks a match earlier in the path", () => {
  // The original defect: fuzzy-matching the whole path let an offset-0 hit on a long
  // filename beat an exact hit on a nested note.
  const c = cands([
    "Relationships - Do project which is relationship focused.md",
    "Areas/Relationships.md"
  ]);
  assert.deepStrictEqual(order(rankCandidates(c, "Relationships")), [
    "Areas/Relationships.md",
    "Relationships - Do project which is relationship focused.md"
  ]);
});

test("tiers run exact -> prefix -> substring -> fuzzy", () => {
  const c = cands(["Notes.md", "Notebook.md", "My Notes archive.md", "N o t e s.md"]);
  const r = rankCandidates(c, "notes");
  assert.strictEqual(tierOf(r[0]), "NAME_EXACT");
  assert.ok(RANK[tierOf(r[1])] <= RANK.NAME_SUBSTR);
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i - 1].rank <= r[i].rank, "results must be ordered by tier");
  }
});

test("a filename match beats a folder-only match", () => {
  const c = cands(["Roadmap/Other.md", "Plans/Roadmap.md"]);
  assert.strictEqual(order(rankCandidates(c, "roadmap"))[0], "Plans/Roadmap.md");
});

test("frontmatter aliases are matched", () => {
  const c = cands(["Projects/Website redesign.md"], {
    aliases: { "Projects/Website redesign.md": ["Roadmap 2026"] }
  });
  const r = rankCandidates(c, "2026");
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].alias, "Roadmap 2026");
});

test("an empty query lists recently opened files first", () => {
  const app = makeApp(makeVault(), { recent: ["Deep/Later.md"] });
  const c = buildCandidates(app, files(["Aaa.md", "Deep/Later.md"]), (f) => ({
    name: f.basename, path: f.path, aliases: []
  }));
  assert.strictEqual(order(rankCandidates(c, ""))[0], "Deep/Later.md");
});

test("a query matching nothing returns nothing", () => {
  assert.strictEqual(rankCandidates(cands(["Alpha.md"]), "zzzzz").length, 0);
});

test("excluded paths sort below every non-excluded result", () => {
  const c = cands(
    [
      "Archive/Areas/Relationships.md",
      "Areas/Relationships/Weekly.md",
      "Archive/2023/Relationships review.md",
      "Areas/Relationships.md"
    ],
    { isUserIgnored: (p) => p.startsWith("Archive/"), userIgnoreFilters: ["Archive/"] }
  );
  const r = rankCandidates(c, "Relationships");
  let seenDemoted = false;
  for (const item of r) {
    if (item.demoted) seenDemoted = true;
    else assert.ok(!seenDemoted, `${item.item.path} ranked after a demoted result`);
  }
  // An exact match inside Archive/ must still lose to a weaker match outside it.
  const archiveExact = r.find((x) => x.item.path === "Archive/Areas/Relationships.md");
  assert.ok(archiveExact.demoted, "excluded exact match should be demoted");
});

test("a mirrored archive still sorts below the live copy", () => {
  // The defect this guards: an "escape hatch" that lifted demotion whenever the query
  // appeared in the folder path. An archive mirroring the live tree (Archive/Areas/...)
  // contains the query too, so it fired on exactly the copies meant to sink.
  const c = cands(["Archive/Areas/Notes.md", "Areas/Notes.md"], {
    isUserIgnored: (p) => p.startsWith("Archive/"),
    userIgnoreFilters: ["Archive/"]
  });
  assert.deepStrictEqual(order(rankCandidates(c, "Notes")), [
    "Areas/Notes.md",
    "Archive/Areas/Notes.md"
  ]);
});

test("excluded results stay demoted even when the query names the excluded folder", () => {
  const c = cands(["Archive/Areas/Notes.md"], {
    isUserIgnored: (p) => p.startsWith("Archive/"),
    userIgnoreFilters: ["Archive/"]
  });
  const r = rankCandidates(c, "archive");
  assert.strictEqual(r.length, 1, "the note is still reachable, not hidden");
  assert.ok(r[0].demoted, "but it remains demoted");
});

test("makeIgnoreMatcher prefers Obsidian's own matcher", () => {
  const app = makeApp(makeVault(), { isUserIgnored: (p) => p.startsWith("X/") });
  app.vault.getConfig = () => ["ignored-by-config/"];
  const m = makeIgnoreMatcher(app);
  assert.strictEqual(m("X/a.md"), true);
  assert.strictEqual(m("ignored-by-config/a.md"), false, "config must not override the app matcher");
});

test("makeIgnoreMatcher falls back to userIgnoreFilters", () => {
  const app = makeApp(makeVault());
  app.vault.getConfig = (k) => (k === "userIgnoreFilters" ? ["Archive/", "/^_/"] : null);
  const m = makeIgnoreMatcher(app);
  assert.strictEqual(m("Archive/2023/a.md"), true, "folder prefix");
  assert.strictEqual(m("_scratch/a.md"), true, "regex filter");
  assert.strictEqual(m("Areas/a.md"), false);
});

test("makeIgnoreMatcher survives junk configuration", () => {
  for (const cfg of [undefined, null, "not-an-array", ["/[unclosed/"], []]) {
    const app = makeApp(makeVault());
    app.vault.getConfig = () => cfg;
    assert.doesNotThrow(() => makeIgnoreMatcher(app)("any/path.md"), `config: ${JSON.stringify(cfg)}`);
  }
});

test("makeIgnoreMatcher does not call into Obsidian when nothing is excluded", () => {
  let calls = 0;
  const app = makeApp(makeVault(), { isUserIgnored: () => { calls++; return false; } });
  app.vault.getConfig = () => [];
  const m = makeIgnoreMatcher(app);
  ["a.md", "b.md", "c.md"].forEach(m);
  assert.strictEqual(calls, 0, "empty exclusion list should short-circuit");
});
