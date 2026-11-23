const { test } = require("node:test");
const assert = require("node:assert");
const { compactUrl, renderTaskText, LINK_MAX } = require("./helpers/load.js");
const { makeEl } = require("./helpers/fake-vault.js");

test("compactUrl strips scheme and www, keeps the host", () => {
  assert.strictEqual(compactUrl("https://www.example.com", 30), "example.com");
});

test("compactUrl keeps a short path intact", () => {
  assert.strictEqual(compactUrl("https://example.com/docs", 30), "example.com/docs");
});

test("compactUrl truncates a long path with an ellipsis", () => {
  const out = compactUrl("https://example.com/" + "a".repeat(200), 30);
  assert.ok(out.length <= 30, `expected <= 30 chars, got ${out.length}`);
  assert.ok(out.startsWith("example.com/"));
  assert.ok(out.endsWith("\u2026"));
});

test("compactUrl falls back to a plain clip for unparseable input", () => {
  const out = compactUrl("https://", 30);
  assert.ok(out.length <= 30);
  assert.ok(out.length > 0, "must not lose the text entirely");
});

test("renderTaskText compacts a bare URL and keeps the full one in the title", () => {
  const url = "https://www.theguardian.com/technology/2026/jul/12/a-very-long-article-slug?utm_source=x";
  const el = makeEl();
  renderTaskText(el, `- [ ] Read ${url} #inbox`);
  const spans = el.spans();
  assert.strictEqual(spans.length, 1);
  assert.ok(spans[0].value.length <= LINK_MAX);
  assert.strictEqual(spans[0].title, url, "full URL must remain recoverable");
  assert.ok(el.text().includes("#inbox"), "surrounding text must survive");
  assert.ok(el.text().length < `- [ ] Read ${url} #inbox`.length);
});

test("renderTaskText collapses a markdown link to its link text", () => {
  const el = makeEl();
  renderTaskText(el, "- [ ] Review [the Q3 doc](https://docs.example.com/d/1a2b3c/edit#h.abc) today");
  assert.strictEqual(el.spans()[0].value, "the Q3 doc");
  assert.ok(el.text().includes("today"));
});

// With no way to open internal links (no opener passed), they stay exactly as written —
// internallinks.test.js covers what happens when there is one.
test("renderTaskText leaves wikilinks and plain text alone", () => {
  const el = makeEl();
  const line = "    - [ ] see [[Internal Note]] and nothing else";
  renderTaskText(el, line);
  assert.strictEqual(el.spans().length, 0);
  assert.strictEqual(el.text(), line, "indentation and wikilinks must be untouched");
});

test("renderTaskText handles several links in one line", () => {
  const el = makeEl();
  renderTaskText(el, "a https://one.example.com/x b [two](https://two.example.com/y) c");
  assert.strictEqual(el.spans().length, 2);
  assert.ok(el.text().startsWith("a "));
  assert.ok(el.text().endsWith(" c"));
});

/* ----------------------------- clickable links ----------------------------- */

test("a compacted URL is rendered as an anchor, not a plain span", () => {
  const el = makeEl();
  renderTaskText(el, "see https://example.com/a/long/path/here now");
  const links = el.links();
  assert.strictEqual(links.length, 1);
  assert.strictEqual(links[0].type, "a");
});

test("the anchor carries the full URL, and opens in a new context", () => {
  const url = "https://example.com/a/very/long/path?x=1";
  const el = makeEl();
  renderTaskText(el, `see ${url}`);
  const a = el.links()[0];
  assert.strictEqual(a.attrs.href, url, "href must be the full URL, not the abbreviation");
  assert.strictEqual(a.title, url, "the full URL stays available on hover");
  assert.strictEqual(a.attrs.target, "_blank");
  assert.strictEqual(a.attrs.rel, "noopener");
});

test("a markdown link's target is used as the href, its text as the label", () => {
  const el = makeEl();
  renderTaskText(el, "[the Q3 doc](https://docs.example.com/d/1a2b/edit)");
  const a = el.links()[0];
  assert.strictEqual(a.value, "the Q3 doc");
  assert.strictEqual(a.attrs.href, "https://docs.example.com/d/1a2b/edit");
});

test("clicking suppresses default navigation", () => {
  // A bare navigation in Electron would replace the Obsidian window itself.
  const el = makeEl();
  renderTaskText(el, "see https://example.com/x");
  let prevented = false, stopped = false;
  el.links()[0].handlers.click({
    preventDefault: () => { prevented = true; },
    stopPropagation: () => { stopped = true; }
  });
  assert.ok(prevented, "must preventDefault");
  assert.ok(stopped, "must not let the click reach the task box");
});

test("openExternalUrl is safe without a DOM", () => {
  const { openExternalUrl } = require("./helpers/load.js");
  assert.doesNotThrow(() => openExternalUrl("https://example.com"));
});

test("links wrap rather than overflow the task box", () => {
  const css = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "..", "styles.css"), "utf8");
  // nowrap here overrode the box's word-break and pushed long links past the edge.
  assert.ok(!/\.gtd-clarify-link \{[^}]*white-space: nowrap/s.test(css));
  assert.match(css, /\.gtd-clarify-link \{[^}]*overflow-wrap: anywhere/s);
  assert.match(css, /\.gtd-clarify-taskline \{[^}]*min-width: 0/s,
    "a flex child needs min-width: 0 or long content escapes the container");
});
