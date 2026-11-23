/**
 * Loads the real main.js with `obsidian` stubbed, and hands back its internals.
 *
 * Tests exercise the shipped file directly — not a copy pasted into the test, and not a
 * model of what it does. If main.js changes, these tests see the change.
 */
const Module = require("node:module");
const path = require("node:path");

const STUB = path.join(__dirname, "obsidian.js");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "obsidian") return STUB;
  return originalResolve.call(this, request, ...rest);
};

const plugin = require(path.join(__dirname, "..", "..", "main.js"));

module.exports = {
  plugin,
  obsidian: require(STUB),
  ...plugin.__testables
};
