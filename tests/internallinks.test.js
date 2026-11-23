/**
 * Clickable internal links in task text, and click-through from a query result's source
 * path to the task in its note.
 *
 * The renderer is tested directly. The pane's behaviour is tested by lifting the real
 * methods out of the shipped main.js and running them against a fake workspace, because
 * what matters there is WHICH leaf gets navigated: replacing the editor that shows the note
 * under review would pull it out from under the review.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const { renderTaskText, wikiLabel, reanchorLine, URL_SCHEME_RE } = L;
const { makeEl } = require("./helpers/fake-vault.js");
const { Notice } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

/** An opener that records what was asked of it. */
function opener({ missing = [] } = {}) {
  const opened = [], checked = [];
  return {
    opened, checked,
    open: (t) => opened.push(t),
    exists: (p) => { checked.push(p); return !missing.includes(p); }
  };
}
const click = (a) => {
  const ev = { prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
  a.handlers.click(ev);
  return ev;
};

/* ================================= the renderer ================================= */

test("a wikilink becomes a link that opens its target", () => {
  const el = makeEl(), o = opener();
  renderTaskText(el, "- [ ] read [[Berlin trip]] first", o);
  const [a] = el.links();
  assert.strictEqual(a.value, "Berlin trip");
  assert.match(a.cls, /gtd-clarify-internal-link/);
  const ev = click(a);
  assert.deepStrictEqual(o.opened, ["Berlin trip"]);
  assert.ok(ev.prevented && ev.stopped, "no navigation, and the click stays off the task box");
});

test("the surrounding text is kept, in order", () => {
  const el = makeEl();
  renderTaskText(el, "- [ ] read [[Berlin trip]] then [[Packing]] now", opener());
  assert.strictEqual(el.text(), "- [ ] read Berlin trip then Packing now");
});

test("an alias is shown, but the link opens the target", () => {
  const el = makeEl(), o = opener();
  renderTaskText(el, "see [[Projects/Berlin|the trip]]", o);
  assert.strictEqual(el.links()[0].value, "the trip");
  click(el.links()[0]);
  assert.deepStrictEqual(o.opened, ["Projects/Berlin"], "never the alias");
});

test("headings and blocks are labelled as Obsidian shows them", () => {
  assert.strictEqual(wikiLabel("Berlin#Flights"), "Berlin › Flights");
  assert.strictEqual(wikiLabel("Berlin#^abc123"), "Berlin › ^abc123");
  assert.strictEqual(wikiLabel("#Flights"), "Flights", "a same-note heading");
  assert.strictEqual(wikiLabel("Berlin#"), "Berlin");
  assert.strictEqual(wikiLabel("Berlin#Flights", "  "), "Berlin › Flights", "a blank alias is no alias");
});

test("a heading link opens the heading, and resolution checks only the note", () => {
  const el = makeEl(), o = opener();
  renderTaskText(el, "[[Berlin#Flights]]", o);
  click(el.links()[0]);
  assert.deepStrictEqual(o.opened, ["Berlin#Flights"]);
  assert.deepStrictEqual(o.checked, ["Berlin"]);
});

test("an embed is a link too, without its '!'", () => {
  const el = makeEl(), o = opener();
  renderTaskText(el, "diagram ![[plan.png]] here", o);
  assert.strictEqual(el.text(), "diagram plan.png here");
  click(el.links()[0]);
  assert.deepStrictEqual(o.opened, ["plan.png"]);
});

test("a link to a note that doesn't exist yet is marked unresolved", () => {
  // Opening it creates the note — Obsidian's own behaviour, but not a surprise.
  const el = makeEl();
  renderTaskText(el, "[[Not yet]] and [[Exists]]", opener({ missing: ["Not yet"] }));
  const [missing, present] = el.links();
  assert.match(missing.cls, /is-unresolved/);
  assert.match(missing.title, /not created yet/);
  assert.doesNotMatch(present.cls, /is-unresolved/);
});

test("a markdown link to a note is internal, decoded", () => {
  const el = makeEl(), o = opener();
  renderTaskText(el, "see [the spec](Specs/My%20Spec.md) and [](Notes.md)", o);
  const [spec, bare] = el.links();
  assert.strictEqual(spec.value, "the spec");
  assert.strictEqual(bare.value, "Notes", "no text: the note name, without .md");
  click(spec);
  assert.deepStrictEqual(o.opened, ["Specs/My Spec.md"]);
});

test("a malformed escape doesn't throw, and is opened as written", () => {
  const el = makeEl(), o = opener();
  assert.doesNotThrow(() => renderTaskText(el, "[x](bad%E0%A4%A.md)", o));
  click(el.links()[0]);
  assert.deepStrictEqual(o.opened, ["bad%E0%A4%A.md"]);
});

test("a markdown link with a scheme stays external", () => {
  for (const url of ["https://example.com/a", "mailto:sam@example.com", "obsidian://open?vault=x"]) {
    assert.ok(URL_SCHEME_RE.test(url), url);
    const el = makeEl(), o = opener();
    renderTaskText(el, `[go](${url})`, o);
    assert.strictEqual(el.links()[0].attrs.target, "_blank", url);
    assert.deepStrictEqual(o.opened, [], `${url} must not be opened as a note`);
  }
});

test("bare URLs are still compacted and external", () => {
  const el = makeEl(), o = opener();
  renderTaskText(el, "[[Note]] https://example.com/a/very/long/path/that/goes/on", o);
  const [, url] = el.links();
  assert.strictEqual(url.attrs.href, "https://example.com/a/very/long/path/that/goes/on");
  assert.match(url.value, /…$/);
});

test("without an opener, internal links stay exactly as written", () => {
  // A link that can't be followed is better as text than something that looks clickable.
  const line = "- [ ] see [[Berlin|trip]], ![[x.png]] and [spec](Spec.md) or https://example.com";
  const el = makeEl();
  renderTaskText(el, line);
  assert.strictEqual(el.links().length, 1, "only the external link");
  assert.strictEqual(el.text().replace("example.com", "https://example.com"), line);
});

test("things that merely look like links are left alone", () => {
  for (const line of ["[[unclosed", "[[]]", "a ] b [ c", "[[a\nb]]"]) {
    const el = makeEl();
    renderTaskText(el, line, opener());
    assert.strictEqual(el.links().length, 0, JSON.stringify(line));
    assert.strictEqual(el.text(), line);
  }
});

/* =================================== the pane =================================== */

/** Lift named ReviewView methods out of the shipped file into a class we can drive. */
function lift(names, deps) {
  const bodies = names.map((n) => {
    const start = main.search(new RegExp(`\\n  (async )?${n}\\(`)) + 1;
    assert.ok(start > 0, `${n} not found`);
    return main.slice(start, main.indexOf("\n  }\n", start) + 4);
  });
  const keys = Object.keys(deps);
  return new Function(...keys, `return class { ${bodies.join("\n")} }`)(...keys.map((k) => deps[k]));
}
const DEPS = {
  obsidian: { Notice },
  PLUGIN_NAME: L.PLUGIN_NAME,
  reanchorLine,
  nextFrame: async () => {},
  renderTaskText
};

/** A workspace with a main leaf showing `mainShows`, plus any other open notes. */
function workspace({ mainShows = "Elsewhere.md", others = [], files = {} } = {}) {
  const calls = { getLeaf: [], openFile: [], setActiveLeaf: [], openLinkText: [] };
  const mkLeaf = (p) => {
    const editor = {
      cursor: null, scrolled: null,
      setCursor(c) { this.cursor = c; },
      scrollIntoView(r) { this.scrolled = r; }
    };
    const leaf = {
      view: { file: { path: p }, editor },
      async openFile(f, o) { calls.openFile.push([f.path, o]); leaf.view.file = { path: f.path }; }
    };
    return leaf;
  };
  const main = mkLeaf(mainShows);
  const leaves = [main, ...others.map(mkLeaf)];
  return {
    calls, main, leaves,
    app: {
      vault: {
        read: async (f) => {
          if (!(f.path in files)) throw new Error("missing");
          return files[f.path];
        }
      },
      workspace: {
        getLeavesOfType: () => leaves,
        getLeaf: (arg) => { calls.getLeaf.push(arg); return main; },
        setActiveLeaf: (l, o) => calls.setActiveLeaf.push([l.view.file.path, o]),
        openLinkText: (...a) => { calls.openLinkText.push(a); }
      },
      metadataCache: { getFirstLinkpathDest: (p) => (p === "Exists" ? { path: "Exists.md" } : null) }
    }
  };
}
const Pane = () => lift(["revealTaskInSource", "openInternalLink", "linkResolves", "internalLinksFor"], DEPS);
const TASK = { path: "Work/Q.md" };
const Q = "- [ ] intro\n- [ ] Call Sam\n    - [ ] dates";

test("linked notes open in a new tab, never in place", () => {
  const ws = workspace(), pane = new (Pane())();
  pane.app = ws.app;
  pane.openInternalLink("Berlin#Flights", "Work/Q.md");
  assert.deepStrictEqual(ws.calls.openLinkText, [["Berlin#Flights", "Work/Q.md", "tab"]],
    "replacing the editor would take the reviewed note out from under the review");
});

test("a failure to open a link is reported, not thrown", () => {
  const pane = new (Pane())();
  pane.app = { workspace: { openLinkText: () => { throw new Error("boom"); } } };
  const before = Notice.log.length;
  assert.doesNotThrow(() => pane.openInternalLink("x", "y.md"));
  assert.match(Notice.log[before], /couldn't open that link/);
});

test("links resolve relative to the task's own note", () => {
  const ws = workspace(), pane = new (Pane())();
  pane.app = ws.app;
  const internal = pane.internalLinksFor(TASK);
  internal.open("Berlin");
  assert.strictEqual(ws.calls.openLinkText[0][1], "Work/Q.md");
  assert.strictEqual(internal.exists("Exists"), true);
  assert.strictEqual(internal.exists("Missing"), false);
  assert.strictEqual(internal.exists(""), true, "a same-note link always resolves");
});

test("a resolution error never marks a link unresolved", () => {
  const pane = new (Pane())();
  pane.app = { metadataCache: { getFirstLinkpathDest: () => { throw new Error("cache"); } } };
  assert.strictEqual(pane.linkResolves("Anything", "a.md"), true);
});

test("clicking through reuses an editor already showing the note", async () => {
  const ws = workspace({ others: ["Work/Q.md"], files: { "Work/Q.md": Q } }), pane = new (Pane())();
  pane.app = ws.app;
  await pane.revealTaskInSource(TASK, 1, 2, "- [ ] Call Sam");
  assert.deepStrictEqual(ws.calls.openFile, [], "no second copy");
  assert.strictEqual(ws.calls.setActiveLeaf[0][0], "Work/Q.md");
  const editor = ws.leaves[1].view.editor;
  assert.deepStrictEqual(editor.cursor, { line: 1, ch: 0 });
  assert.deepStrictEqual(editor.scrolled, { from: { line: 1, ch: 0 }, to: { line: 2, ch: 0 } });
});

test("otherwise it opens in the main editor, not a new tab or the review pane", async () => {
  const ws = workspace({ files: { "Work/Q.md": Q } }), pane = new (Pane())();
  pane.app = ws.app;
  await pane.revealTaskInSource(TASK, 1, 1, "- [ ] Call Sam");
  assert.deepStrictEqual(ws.calls.getLeaf, [false], "the same leaf the review's own edits would use");
  assert.deepStrictEqual(ws.calls.openFile, [["Work/Q.md", { active: true }]]);
  assert.deepStrictEqual(ws.main.view.editor.cursor, { line: 1, ch: 0 });
});

test("a task that has moved since it was shown is still found", async () => {
  // An earlier step of this task may have written above it.
  const files = { "Work/Q.md": "- [ ] new project #project\n- [ ] intro\n- [ ] Call Sam\n    - [ ] dates" };
  const ws = workspace({ files }), pane = new (Pane())();
  pane.app = ws.app;
  await pane.revealTaskInSource(TASK, 1, 2, "- [ ] Call Sam");
  assert.deepStrictEqual(ws.main.view.editor.cursor, { line: 2, ch: 0 });
  assert.deepStrictEqual(ws.main.view.editor.scrolled.to, { line: 3, ch: 0 }, "its subtasks come with it");
});

test("a task whose text has changed falls back to where it was shown", async () => {
  const ws = workspace({ files: { "Work/Q.md": "- [ ] intro\n- [ ] Call Sam about dates" } }), pane = new (Pane())();
  pane.app = ws.app;
  await pane.revealTaskInSource(TASK, 1, 1, "- [ ] Call Sam");
  assert.deepStrictEqual(ws.main.view.editor.cursor, { line: 1, ch: 0 });
});

test("an unreadable note still opens, at the line it was shown", async () => {
  const ws = workspace({ files: {} }), pane = new (Pane())();
  pane.app = ws.app;
  await pane.revealTaskInSource(TASK, 4, 4, "- [ ] x");
  assert.deepStrictEqual(ws.main.view.editor.cursor, { line: 4, ch: 0 });
});

test("a failure to open the note is reported, not thrown", async () => {
  const ws = workspace({ files: { "Work/Q.md": Q } }), pane = new (Pane())();
  pane.app = ws.app;
  ws.main.openFile = async () => { throw new Error("locked"); };
  const before = Notice.log.length;
  await assert.doesNotReject(() => pane.revealTaskInSource(TASK, 1, 1, "- [ ] Call Sam"));
  assert.match(Notice.log[before], /couldn't open Work\/Q\.md/);
});

/* ------------------------------ focusOnLine wiring ------------------------------ */

/** A DOM-ish element tree, enough for focusOnLine and addTaskLine. */
function node(tag = "div", cls = "") {
  const n = {
    tag, cls, text: "", children: [], attrs: {}, handlers: {}, title: null,
    createDiv(o = {}) { return this.createEl("div", o); },
    createSpan(o = {}) { return this.createEl("span", o); },
    createEl(t, o = {}) { const c = node(t, o.cls || ""); if (o.text) c.text = o.text; this.children.push(c); return c; },
    appendText(t) { this.children.push({ tag: "#text", text: t, children: [] }); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(e, f) { this.handlers[e] = f; },
    empty() { this.children = []; },
    all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); if (c.all) c.all(pred, out); } return out; }
  };
  return n;
}
function focusPane() {
  const Klass = lift(["focusOnLine", "addTaskLine", "internalLinksFor", "openInternalLink", "linkResolves"], DEPS);
  const pane = new Klass();
  const ws = workspace();
  pane.app = ws.app;
  pane.taskEl = node();
  pane.plugin = { settings: { highlightSourceLine: false } };
  pane.scrollToActiveTask = () => {};
  pane.applySourceHighlight = () => {};
  pane.revealed = [];
  pane.revealTaskInSource = (...a) => { pane.revealed.push(a); return Promise.resolve(); };
  global.window = { requestAnimationFrame: () => {} };
  return { pane, ws };
}

test("a query result's source path is a link to the task", () => {
  const { pane } = focusPane();
  pane.focusOnLine(TASK, 7, 9, "- [ ] Call Sam", null, "Work/Q › Calls");
  const [link] = pane.taskEl.all((c) => c.cls === "gtd-clarify-sourcelink");
  assert.ok(link, "the path is rendered as a link");
  assert.strictEqual(link.text, "Work/Q › Calls");
  assert.match(link.attrs["aria-label"], /line 8/, "1-based for people");
  assert.ok(!link.title, "one tooltip, not two stacked: no title beside the aria-label");
  const ev = click(link);
  assert.ok(ev.prevented && ev.stopped);
  assert.deepStrictEqual(pane.revealed, [[TASK, 7, 9, "- [ ] Call Sam"]]);
});

test("with no source label, nothing is added", () => {
  const { pane } = focusPane();
  pane.focusOnLine(TASK, 0, 0, "- [ ] a", null, null);
  assert.strictEqual(pane.taskEl.all((c) => /gtd-clarify-tasksource|gtd-clarify-sourcelink/.test(c.cls)).length, 0);
});

test("wikilinks in the task and its parent open relative to the task's note", () => {
  const { pane, ws } = focusPane();
  pane.focusOnLine(TASK, 1, 1, "- [ ] read [[Brief]]", "- [ ] Launch [[Plan]] #project", null);
  const links = pane.taskEl.all((c) => /gtd-clarify-internal-link/.test(c.cls));
  assert.deepStrictEqual(links.map((l) => l.text), ["Plan", "Brief"], "parent box and active box both");
  for (const l of links) click(l);
  assert.deepStrictEqual(ws.calls.openLinkText.map((c) => [c[0], c[1], c[2]]),
    [["Plan", "Work/Q.md", "tab"], ["Brief", "Work/Q.md", "tab"]]);
});
