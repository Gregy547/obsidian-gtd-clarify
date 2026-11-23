/** In-memory stand-in for Obsidian's Vault and App, enough for journal/undo tests. */
const { TFile } = require("./obsidian.js");

function makeVault(initial = {}) {
  const store = new Map(Object.entries(initial));
  const trashed = [];
  return {
    store,
    trashed,
    getAbstractFileByPath: (p) => (store.has(p) ? new TFile(p) : null),
    read: async (f) => store.get(f.path),
    cachedRead: async (f) => store.get(f.path),
    process: async (f, fn) => {
      const next = fn(store.get(f.path));
      store.set(f.path, next);
      return next;
    },
    create: async (p, data) => {
      store.set(p, data);
      return new TFile(p);
    },
    createFolder: async (p) => {
      store.set(p, "<folder>");
      return { path: p };
    },
    trash: async (f) => {
      trashed.push(f.path);
      store.delete(f.path);
    },
    getMarkdownFiles: () => [...store.keys()].filter((p) => p.endsWith(".md")).map((p) => new TFile(p)),
    getAllLoadedFiles: () => [...store.keys()].map((p) => new TFile(p)),
    getRoot: () => ({ path: "/" }),
    getConfig: () => null
  };
}

function makeApp(vault, opts = {}) {
  return {
    vault,
    workspace: { getLastOpenFiles: () => opts.recent || [] },
    metadataCache: {
      getFileCache: opts.getFileCache || (() => null),
      ...(opts.isUserIgnored ? { isUserIgnored: opts.isUserIgnored } : {})
    }
  };
}

/** Minimal element that records what was appended, standing in for Obsidian's DOM helpers.
 * createEl also records attributes and click listeners so link behaviour can be asserted. */
function makeEl() {
  const parts = [];
  const mk = (type, cls, text) => {
    const node = {
      type, cls, value: text, title: null, attrs: {}, handlers: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      addEventListener(evt, fn) { this.handlers[evt] = fn; }
    };
    parts.push(node);
    return node;
  };
  return {
    parts,
    appendText(t) { parts.push({ type: "text", value: t }); },
    createSpan({ cls, text }) { return mk("span", cls, text); },
    createEl(tag, { cls, text } = {}) { return mk(tag, cls, text); },
    text() { return parts.map((p) => p.value).join(""); },
    spans() { return parts.filter((p) => p.type === "span" || p.type === "a"); },
    links() { return parts.filter((p) => p.type === "a"); }
  };
}

module.exports = { makeVault, makeApp, makeEl };

/**
 * Build a fake Tasks-plugin Task object.
 *
 * Mirrors the fields the real Task class exposes that this plugin reads: status.symbol,
 * tags, priority (0 highest .. 5 lowest), date getters, dependsOn/id, parent,
 * originalMarkdown, and taskLocation.{path,lineNumber,precedingHeader}.
 */
function makeTask(opts = {}) {
  const {
    path = "Inbox.md", line = 0, status = " ", description = "a task",
    tags = [], priority = 3, due = null, start = null, scheduled = null,
    id = "", dependsOn = [], parent = null, heading = null, markdown = null
  } = opts;
  const md = markdown !== null ? markdown : `- [${status}] ${description}${tags.map((t) => " " + t).join("")}`;
  return {
    status: { symbol: status },
    statusCharacter: status,
    description,
    tags,
    priority,
    dueDate: due,
    startDate: start,
    scheduledDate: scheduled,
    doneDate: null,
    id,
    dependsOn,
    parent,
    originalMarkdown: md,
    taskLocation: { path, lineNumber: line, precedingHeader: heading }
  };
}

/** A stand-in for the Tasks plugin object exposing the two undocumented methods used. */
function makeTasksPlugin(tasks, state = "Warm") {
  return { getTasks: () => tasks, getState: () => state, apiV1: {} };
}

module.exports.makeTask = makeTask;
module.exports.makeTasksPlugin = makeTasksPlugin;
