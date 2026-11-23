/**
 * The example configuration in examples/data.json: one real setup, kept usable.
 *
 * It is documentation people copy, so it must load as settings, its queries must run, and
 * its dimensions must read cleanly in Organise. The plugin's own defaults stay general.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { DEFAULT_SETTINGS, parseTasksQuery, dimensionQuestion } = require("./helpers/load.js");

const ROOT = path.join(__dirname, "..");
const example = JSON.parse(fs.readFileSync(path.join(ROOT, "examples", "data.json"), "utf8"));

test("it is a complete settings file, with nothing the plugin doesn't know", () => {
  assert.deepStrictEqual(Object.keys(example).sort(), Object.keys(DEFAULT_SETTINGS).sort());
});

test("each setting has the type the plugin expects", () => {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (v === null) continue;
    assert.strictEqual(Array.isArray(example[k]), Array.isArray(v), k);
    if (!Array.isArray(v)) assert.strictEqual(typeof example[k], typeof v, k);
  }
});

test("every saved query runs", () => {
  for (const q of example.savedQueries) {
    const parsed = parseTasksQuery(q.query, "2026-10-20");
    assert.deepStrictEqual(parsed.errors, [], q.name);
    assert.ok(parsed.filters.length > 0, q.name);
  }
});

test("every dimension reads as one heading in Organise", () => {
  for (const d of example.dimensions) {
    const heading = dimensionQuestion(d);
    assert.ok(!heading.includes("›"), `${heading} says it twice`);
    assert.match(heading, /\*\*.+\*\*/, `${heading} has its bold word`);
  }
});

test("values are tidy: no stray spaces, no repeated ids", () => {
  for (const d of example.dimensions) {
    const ids = d.values.map((v) => v.id);
    assert.strictEqual(new Set(ids).size, ids.length, d.id);
    for (const v of d.values) {
      assert.strictEqual(v.label, v.label.trim(), `${d.id}: "${v.label}"`);
      assert.strictEqual(v.value, v.value.trim(), `${d.id}: "${v.value}"`);
    }
  }
});

test("the plugin's own defaults stay general", () => {
  const all = DEFAULT_SETTINGS.savedQueries.map((q) => q.query).join("\n");
  assert.ok(!/Work\//.test(all), "no one else's folders");
  assert.match(fs.readFileSync(path.join(ROOT, "README.md"), "utf8"), /examples\/data\.json/, "the example is documented");
});
