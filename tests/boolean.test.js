/**
 * Boolean combination of filters, reproduced from the Tasks "Combining Filters" guide.
 *
 * The behaviours pinned here are all documented ones: precedence NOT > XOR > AND > OR,
 * four delimiter pairs with no mixing, case-sensitive operators, optional spaces around
 * operators, line continuations, and nesting.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const { runTasksQuery, parseTasksQuery, tokenizeBoolean, hasBooleanOperator, joinLineContinuations } =
  require("./helpers/load.js");
const { makeTask } = require("./helpers/fake-vault.js");

const TODAY = "2026-08-12";
const run = (tasks, q) => runTasksQuery(tasks, q, TODAY);
const names = (r) => r.tasks.map((t) => t.description).sort();
const tagged = (desc, ...tags) => makeTask({ description: desc, tags });

const HOME = tagged("home", "#home");
const PHONE = tagged("phone", "#phone");
const PC = tagged("pc", "#pc");
const NONE = tagged("none", "#other");
const ALL = [HOME, PHONE, PC, NONE];

test("the reported query parses and matches any listed tag", () => {
  const q = "(tags include home) OR (tags include phone) OR (tags include lookup) OR (tags include pc)";
  const r = run(ALL, q);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(names(r), ["home", "pc", "phone"]);
});

test("AND requires both", () => {
  const both = makeTask({ description: "both", tags: ["#home", "#phone"] });
  assert.deepStrictEqual(names(run([...ALL, both], "(tags include home) AND (tags include phone)")), ["both"]);
});

test("XOR matches exactly one of two", () => {
  const both = makeTask({ description: "both", tags: ["#home", "#phone"] });
  assert.deepStrictEqual(
    names(run([HOME, PHONE, both, NONE], "(tags include home) XOR (tags include phone)")),
    ["home", "phone"]
  );
});

test("NOT negates a whole parenthesised expression", () => {
  const r = run(ALL, "NOT ( (tags include home) OR (tags include phone) )");
  assert.deepStrictEqual(names(r), ["none", "pc"]);
});

test("AND NOT and OR NOT behave as documented", () => {
  const both = makeTask({ description: "both", tags: ["#home", "#phone"] });
  assert.deepStrictEqual(
    names(run([HOME, PHONE, both], "(tags include home) AND NOT (tags include phone)")), ["home"]);
  assert.deepStrictEqual(
    names(run([HOME, PHONE, both], "(tags include home) OR NOT (tags include phone)")).sort(),
    ["both", "home", "pc"].filter((x) => x !== "pc"));
});

test("precedence is NOT > XOR > AND > OR", () => {
  // Documented equivalence: A OR B AND C  ==  A OR (B AND C)
  const a = makeTask({ description: "a", tags: ["#x"] });
  const bc = makeTask({ description: "bc", tags: ["#y", "#z"] });
  const b = makeTask({ description: "b", tags: ["#y"] });
  const tasks = [a, bc, b];
  const flat = "(tags include x) OR (tags include y) AND (tags include z)";
  const explicit = "(tags include x) OR ( (tags include y) AND (tags include z) )";
  assert.deepStrictEqual(names(run(tasks, flat)), names(run(tasks, explicit)));
  assert.deepStrictEqual(names(run(tasks, flat)), ["a", "bc"]);
});

test("all four delimiter pairs work", () => {
  for (const q of [
    "(tags include home) OR (tags include phone)",
    "[tags include home] OR [tags include phone]",
    "{tags include home} OR {tags include phone}",
    '"tags include home" OR "tags include phone"'
  ]) {
    assert.deepStrictEqual(names(run(ALL, q)), ["home", "phone"], `failed for: ${q}`);
  }
});

test("mixed delimiter types are rejected, as in Tasks 7.0.0", () => {
  const r = parseTasksQuery('"not done" AND (is not blocked)', TODAY);
  assert.strictEqual(r.errors.length, 1);
});

test("operators are case-sensitive so prose is never mistaken for one", () => {
  // A description containing the lowercase word "or" must not become an operator.
  const t = makeTask({ description: "milk or bread" });
  assert.strictEqual(hasBooleanOperator("description includes milk or bread"), false);
  assert.deepStrictEqual(names(run([t], "description includes milk or bread")), ["milk or bread"]);
});

test("spaces around operators are optional", () => {
  assert.deepStrictEqual(names(run(ALL, "(tags include home)OR(tags include phone)")), ["home", "phone"]);
});

test("nesting to several levels", () => {
  const q = "( (tags include home) OR (tags include phone) ) AND NOT (tags include pc)";
  assert.deepStrictEqual(names(run([...ALL, tagged("hp", "#home", "#pc")], q)), ["home", "phone"]);
});

test("trailing backslashes continue a line", () => {
  const q = "(tags include home) OR \\\n  (tags include phone) OR \\\n  (tags include pc)";
  const r = run(ALL, q);
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(names(r), ["home", "pc", "phone"]);
});

test("joinLineContinuations folds only backslash-terminated lines", () => {
  assert.deepStrictEqual(joinLineContinuations(["a \\", "b", "c"]), ["a b", "c"]);
  assert.deepStrictEqual(joinLineContinuations(["a", "b"]), ["a", "b"]);
});

test("boolean lines still AND with other lines", () => {
  const doneHome = makeTask({ description: "done home", tags: ["#home"], status: "x" });
  const q = "not done\n(tags include home) OR (tags include phone)";
  assert.deepStrictEqual(names(run([...ALL, doneHome], q)), ["home", "phone"]);
});

test("an unbalanced expression is an error, not a silent match-all", () => {
  const r = parseTasksQuery("(tags include home) OR (tags include phone", TODAY);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /unbalanced/, "the message must say what is wrong");
});

test("an unsupported filter inside a boolean expression is reported", () => {
  const r = parseTasksQuery("(tags include home) OR (sort by urgency)", TODAY);
  assert.strictEqual(r.errors.length, 1);
});

test("tokenizeBoolean rejects bare text outside delimiters", () => {
  assert.strictEqual(tokenizeBoolean("tags include home", "(", ")"), null);
  assert.ok(tokenizeBoolean("(a) OR (b)", "(", ")"));
});

test("single-filter lines are unaffected by the boolean parser", () => {
  const r = run(ALL, "tags include home");
  assert.deepStrictEqual(r.errors, []);
  assert.deepStrictEqual(names(r), ["home"]);
});

test("tags includes (plural) is accepted, as the Tasks docs use both", () => {
  assert.deepStrictEqual(names(run(ALL, "tags includes home")), ["home"]);
});

/* --------------------- diagnostics and input normalisation --------------------- */

const { normaliseQueryText, hasLowercaseOperator } = require("./helpers/load.js");

test("non-breaking spaces do not break a filter", () => {
  // Pasted from a web page or a rendered note. A literal space in a filter pattern does
  // not match U+00A0, so every one of these used to fail with an opaque message.
  const q = "(tags include creative) OR (tags include critical)".replace(/ /g, "\u00A0");
  assert.deepStrictEqual(parseTasksQuery(q, TODAY).errors, []);
});

test("zero-width characters are stripped", () => {
  const q = "(tags include creative)\u200b OR \u200b(tags include critical)";
  assert.deepStrictEqual(parseTasksQuery(q, TODAY).errors, []);
});

test("full-width brackets are folded to ASCII", () => {
  const q = "\uff08tags include creative\uff09 OR \uff08tags include critical\uff09";
  assert.deepStrictEqual(parseTasksQuery(q, TODAY).errors, []);
});

test("curly quotes work as a delimiter pair", () => {
  // Obsidian's smart typography rewrites straight quotes in notes.
  const q = "\u201Ctags include creative\u201D OR \u201Ctags include critical\u201D";
  assert.deepStrictEqual(parseTasksQuery(q, TODAY).errors, []);
});

test("normaliseQueryText leaves ordinary text alone", () => {
  const q = "(description includes a b) OR (path includes x/y)";
  assert.strictEqual(normaliseQueryText(q), q);
});

test("normaliseQueryText does not alter quote characters inside a filter", () => {
  const q = '(description includes \u201Chello\u201D)';
  assert.strictEqual(normaliseQueryText(q), q, "search terms must not be rewritten");
});

test("a failing sub-expression is named in the error", () => {
  const r = parseTasksQuery("(tags include home) OR (sort by urgency)", TODAY);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /sort by urgency/, "must name the offending sub-expression");
});

test("a line with no delimiters at all says so", () => {
  const r = parseTasksQuery("tags include home OR tags include phone", TODAY);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /wrapped in/);
});

test("lowercase operators get a specific message, not a generic one", () => {
  const r = parseTasksQuery("(tags include home) or (tags include phone)", TODAY);
  assert.strictEqual(r.errors.length, 1);
  assert.match(r.errors[0], /must be capitalised/);
});

test("hasLowercaseOperator only fires when no capitalised operator is present", () => {
  assert.strictEqual(hasLowercaseOperator("(a) or (b)"), true);
  assert.strictEqual(hasLowercaseOperator("(a) OR (b)"), false);
  assert.strictEqual(hasLowercaseOperator("tags include home"), false);
});

test("every error names the line number and quotes the line", () => {
  const r = parseTasksQuery("not done\n(tags include home) or (tags include phone)", TODAY);
  assert.match(r.errors[0], /^Line 2:/);
  assert.match(r.errors[0], /tags include home/);
});
