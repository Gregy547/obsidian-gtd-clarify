/**
 * Where a link ends.
 *
 * Bare URLs used to stop at the first ")", which cut any URL with brackets in it — a Jira
 * "NOT IN (Done, …)" query among them — and opened the truncated half. They now follow
 * GitHub-flavoured Markdown's autolink rules: a trailing ")" is kept only when it closes a
 * "(" in the URL, and trailing sentence punctuation is dropped.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { renderTaskText, trimAutolink } = require("./helpers/load.js");
const { makeEl } = require("./helpers/fake-vault.js");

// The URL as reported: encoded newlines, quotes and brackets, plus literal parentheses.
const JIRA = "https://anaplansite.atlassian.net/issues?jql=issuetype%20%3D%20Bug%0Aand%20createdDate%20%3C%20%27-90d%27%0Aand%20status%20NOT%20IN%20(Done%2C%20Aborted%2C%20%22WON%27T%20DO%22%2C%20Cancelled%2C%20%22Won%27t%20Fix%22%2C%20Closed%2C%20Rejected%2C%20Resolved%2C%20Obsolete%2C%20Approved%2C%20%22Done%2FPublished%22)%0Aand%20description%20!~%20%22r2p2%22%0Aand%20summary%20!~%20%22r2p2%22%0AORDER%20BY%20%22cf%5B16137%5D%22%20ASC&selectedIssue=LOTUS-1241";

function render(text, internal) {
  const el = makeEl();
  renderTaskText(el, text, internal);
  return { el, hrefs: el.links().map((a) => a.attrs.href), text: el.text() };
}

/* ------------------------------- the reported URL ------------------------------- */

test("the reported Jira URL is linked whole", () => {
  const { hrefs, el } = render("- [ ] Triage " + JIRA + " #work");
  assert.deepStrictEqual(hrefs, [JIRA], "the whole query, not the half before the first ')'");
  assert.ok(el.text().endsWith(" #work"), "and what follows stays text");
});

test("the reported URL survives being wrapped in parentheses", () => {
  // Its own brackets are balanced; the outer closing one is prose.
  const { hrefs, el } = render("- [ ] Triage (old bugs: " + JIRA + ")");
  assert.deepStrictEqual(hrefs, [JIRA]);
  assert.ok(el.text().endsWith(")"));
});

test("the reported URL works as a markdown link target", () => {
  const { hrefs, el } = render("- [ ] Triage [old bugs](" + JIRA + ") today");
  assert.deepStrictEqual(hrefs, [JIRA]);
  assert.strictEqual(el.links()[0].value, "old bugs");
  assert.ok(el.text().endsWith(" today"));
});

test("clicking opens the full URL", () => {
  const { el } = render(JIRA);
  const opened = [];
  const was = global.window;
  global.window = { open: (u) => opened.push(u) };
  try {
    el.links()[0].handlers.click({ preventDefault() {}, stopPropagation() {} });
  } finally {
    global.window = was;
  }
  assert.deepStrictEqual(opened, [JIRA]);
});

/* -------------------------------- parentheses -------------------------------- */

test("balanced parentheses stay in the URL", () => {
  assert.deepStrictEqual(render("https://en.wikipedia.org/wiki/Getting_Things_Done_(book)").hrefs,
    ["https://en.wikipedia.org/wiki/Getting_Things_Done_(book)"]);
});

test("an unbalanced closing parenthesis is prose", () => {
  const { hrefs, text } = render("(see https://example.com/a) next");
  assert.deepStrictEqual(hrefs, ["https://example.com/a"]);
  assert.ok(text.endsWith(") next"));
});

test("only as many closing parentheses are dropped as are unbalanced", () => {
  assert.strictEqual(trimAutolink("https://x.com/a_(b))"), "https://x.com/a_(b)");
  assert.strictEqual(trimAutolink("https://x.com/a_(b)))"), "https://x.com/a_(b)");
});

test("a markdown target with balanced parentheses is read whole", () => {
  const { hrefs, el } = render("[the book](https://en.wikipedia.org/wiki/GTD_(book)) is good");
  assert.deepStrictEqual(hrefs, ["https://en.wikipedia.org/wiki/GTD_(book)"]);
  assert.ok(el.text().endsWith(" is good"), "no stray ')' left behind");
});

test("a note link with parentheses opens the right note", () => {
  const opened = [];
  render("[minutes](Meetings/Q3_(draft).md)", { open: (t) => opened.push(t), exists: () => true });
  assert.deepStrictEqual(opened.length, 0);
  const { el } = render("[minutes](Meetings/Q3_(draft).md)", { open: (t) => opened.push(t), exists: () => true });
  el.links()[0].handlers.click({ preventDefault() {}, stopPropagation() {} });
  assert.deepStrictEqual(opened, ["Meetings/Q3_(draft).md"]);
});

/* ------------------------------ trailing punctuation ------------------------------ */

test("sentence punctuation after a URL is not part of it", () => {
  for (const p of [".", ",", ":", "?", "!", "*", "_", "~", "...", "?!"]) {
    const { hrefs, text } = render("Read https://example.com/a" + p);
    assert.deepStrictEqual(hrefs, ["https://example.com/a"], JSON.stringify(p));
    assert.ok(text.endsWith(p), JSON.stringify(p) + " stays as text");
  }
});

test("the same characters inside a URL are kept", () => {
  for (const url of ["https://x.com/a?b=1&c=2", "https://x.com/a.b/c", "https://x.com/a!~b",
                     "https://x.com/a:b", "https://x.com/a_b*c"]) {
    assert.deepStrictEqual(render(url + " end").hrefs, [url], url);
  }
});

test("punctuation and a closing parenthesis are peeled off together", () => {
  // Stripping one exposes the other: "x.com/a)." -> "x.com/a)" -> "x.com/a".
  const { hrefs, text } = render("(see https://example.com/a).");
  assert.deepStrictEqual(hrefs, ["https://example.com/a"]);
  assert.ok(text.endsWith(")."));
});

test("a trailing entity reference is dropped, a query ending in ';' is not", () => {
  assert.strictEqual(trimAutolink("https://x.com/a&amp;"), "https://x.com/a");
  assert.strictEqual(trimAutolink("https://x.com/a?b=1;"), "https://x.com/a?b=1;");
});

test("a URL trimmed to nothing is left as text", () => {
  const { hrefs, text } = render("visit https://. today");
  assert.deepStrictEqual(hrefs, []);
  assert.strictEqual(text, "visit https://. today");
});

/* ------------------------------ scanning continues ------------------------------ */

test("links after a trimmed URL are still found", () => {
  // The scan resumes where the link ends, not where the greedy match ended.
  const { hrefs } = render("(a https://one.example.com/x), [b](https://two.example.com/y)");
  assert.deepStrictEqual(hrefs, ["https://one.example.com/x", "https://two.example.com/y"]);
});

test("text is preserved exactly around every link", () => {
  const line = "- [ ] (see https://example.com/a), then https://example.com/b. Done";
  const { el } = render(line);
  const rebuilt = el.parts.map((p) => (p.type === "a" ? p.attrs.href : p.value)).join("");
  assert.strictEqual(rebuilt, line);
});
