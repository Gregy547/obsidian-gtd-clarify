const { test } = require("node:test");
const assert = require("node:assert");
const { VaultJournal, journalledApp } = require("./helpers/load.js");
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

function setup(initial) {
  const vault = makeVault(initial);
  const app = makeApp(vault);
  const journal = new VaultJournal(app);
  return { vault, app, journal, wrapped: journalledApp(app, journal) };
}

test("a modified file is restored to its original contents", async () => {
  const { vault, journal, wrapped } = setup({ "Inbox.md": "- [ ] task A\n- [ ] task B" });
  await journal.capture(new TFile("Inbox.md"));
  await wrapped.vault.process(new TFile("Inbox.md"), (d) => d.replace("task A", "task A #project"));
  assert.ok(vault.store.get("Inbox.md").includes("#project"));
  await journal.restore();
  assert.strictEqual(vault.store.get("Inbox.md"), "- [ ] task A\n- [ ] task B");
});

test("the first observed state wins across repeated writes", async () => {
  const { vault, wrapped, journal } = setup({ "a.md": "ORIGINAL" });
  await wrapped.vault.process(new TFile("a.md"), () => "second");
  await wrapped.vault.process(new TFile("a.md"), () => "third");
  await journal.restore();
  assert.strictEqual(vault.store.get("a.md"), "ORIGINAL");
});

test("a created note is trashed rather than left behind", async () => {
  const { vault, journal, wrapped } = setup({ "Inbox.md": "- [ ] move me" });
  await journal.capture(new TFile("Inbox.md"));
  await wrapped.vault.create("Projects/New.md", "# New");
  await wrapped.vault.process(new TFile("Inbox.md"), () => "");
  await journal.restore();
  assert.strictEqual(vault.store.get("Inbox.md"), "- [ ] move me");
  assert.strictEqual(vault.store.has("Projects/New.md"), false);
  assert.deepStrictEqual(vault.trashed, ["Projects/New.md"], "trashed, not hard-deleted");
});

test("a task touching two files restores both", async () => {
  const { vault, journal, wrapped } = setup({ "Inbox.md": "- [ ] x", "Areas/Ref.md": "# Ref" });
  await journal.capture(new TFile("Inbox.md"));
  await wrapped.vault.process(new TFile("Areas/Ref.md"), (d) => d + "\n- [ ] x");
  await wrapped.vault.process(new TFile("Inbox.md"), () => "");
  await journal.restore();
  assert.strictEqual(vault.store.get("Inbox.md"), "- [ ] x");
  assert.strictEqual(vault.store.get("Areas/Ref.md"), "# Ref");
});

test("a folder that already existed is not trashed", async () => {
  const { vault, journal, wrapped } = setup({ Projects: "<folder>" });
  await wrapped.vault.createFolder("Projects");
  await journal.restore();
  assert.ok(vault.store.has("Projects"));
  assert.deepStrictEqual(vault.trashed, []);
});

test("a folder the task created is trashed", async () => {
  const { vault, journal, wrapped } = setup({});
  await wrapped.vault.createFolder("Brand New");
  await journal.restore();
  assert.deepStrictEqual(vault.trashed, ["Brand New"]);
});

test("restore reports files it could not put back", async () => {
  const { vault, journal, wrapped } = setup({ "gone.md": "content" });
  await wrapped.vault.process(new TFile("gone.md"), () => "changed");
  vault.store.delete("gone.md"); // deleted outside the plugin
  const failed = await journal.restore();
  assert.deepStrictEqual(failed, ["gone.md"], "caller must be able to warn the user");
});

test("isEmpty reflects whether anything was journalled", async () => {
  const { journal, wrapped } = setup({ "a.md": "x" });
  assert.strictEqual(journal.isEmpty(), true);
  await wrapped.vault.process(new TFile("a.md"), (d) => d + "!");
  assert.strictEqual(journal.isEmpty(), false);
});

test("the wrapped app delegates non-mutating calls untouched", async () => {
  const { app, journal, wrapped } = setup({ "z.md": "hello" });
  assert.strictEqual(await wrapped.vault.read(new TFile("z.md")), "hello");
  assert.ok(wrapped.vault.getAbstractFileByPath("z.md"));
  assert.strictEqual(wrapped.workspace, app.workspace, "unrelated app surface passes through");
  assert.strictEqual(wrapped.metadataCache, app.metadataCache);
  assert.strictEqual(journal.isEmpty(), true, "reads must not journal anything");
});

test("capture is a no-op for a missing file rather than throwing", async () => {
  const { journal } = setup({});
  await assert.doesNotReject(() => journal.capture(null));
  await assert.doesNotReject(() => journal.capture(new TFile("nope.md")));
});
