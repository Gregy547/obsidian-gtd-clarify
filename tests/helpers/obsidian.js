/**
 * Minimal stand-in for the `obsidian` module.
 *
 * Only the surface main.js actually touches is implemented. Anything the tests do not
 * exercise is a class or function that exists but does nothing, so `require("obsidian")`
 * resolves and module-level code runs. Where a test needs real behaviour (fuzzy search,
 * TFile identity), that behaviour lives here.
 */

class TFile {
  constructor(path = "") {
    this.path = path;
    const slash = path.lastIndexOf("/");
    const name = slash >= 0 ? path.slice(slash + 1) : path;
    const dot = name.lastIndexOf(".");
    this.name = name;
    this.basename = dot > 0 ? name.slice(0, dot) : name;
    this.extension = dot > 0 ? name.slice(dot + 1) : "";
  }
}

class TFolder {
  constructor(path = "") {
    this.path = path;
    const slash = path.lastIndexOf("/");
    this.name = slash >= 0 ? path.slice(slash + 1) : path;
    this.children = [];
  }
  isRoot() {
    return this.path === "/" || this.path === "";
  }
}

/**
 * Stand-in for Obsidian's fuzzy matcher: subsequence match that rewards contiguous runs
 * and penalises late starts. Not the real algorithm — Obsidian has never published it —
 * but it has the properties the ranking code relies on: null when no subsequence match
 * exists, a numeric score, and match spans as [start, end) pairs.
 */
function prepareFuzzySearch(query) {
  const q = query.toLowerCase().replace(/\s+/g, "");
  return (text) => {
    const t = text.toLowerCase();
    const matches = [];
    let i = 0, score = 0, runStart = -1, prev = -2;
    for (const ch of q) {
      const idx = t.indexOf(ch, i);
      if (idx === -1) return null;
      if (idx === prev + 1) {
        score += 1;
      } else {
        score -= 0.5 + idx * 0.01;
        if (runStart >= 0) matches.push([runStart, prev + 1]);
        runStart = idx;
      }
      if (runStart < 0) runStart = idx;
      prev = idx;
      i = idx + 1;
    }
    if (runStart >= 0) matches.push([runStart, prev + 1]);
    return { score, matches };
  };
}

const noop = () => {};
class Plugin { constructor(app) { this.app = app; } }
class PluginSettingTab { constructor(app, plugin) { this.app = app; this.plugin = plugin; } }
class ItemView { constructor(leaf) { this.leaf = leaf; } }
class MarkdownView {}
class Menu {}
class Notice { constructor(message) { this.message = message; Notice.log.push(message); } }
Notice.log = [];
class Setting { constructor() {} }
class SuggestModal {
  constructor(app) {
    this.app = app;
    this.limit = 50;
    this.inputEl = { value: "" };
  }
  setPlaceholder(text) { this.placeholder = text; }
  open() {}
  close() {}
  onClose() {}
}

module.exports = {
  TFile,
  TFolder,
  Plugin,
  PluginSettingTab,
  ItemView,
  MarkdownView,
  Menu,
  Notice,
  Setting,
  SuggestModal,
  prepareFuzzySearch,
  // Desktop, unless a test says otherwise.
  Platform: { isDesktop: true, isMobile: false, isPhone: false, isTablet: false },
  normalizePath: (p) => p.replace(/\\/g, "/").replace(/\/+/g, "/"),
  // Obsidian re-exports moment; only .format("YYYY-MM-DD") is used here.
  moment: () => ({
    format: () => new Date().toISOString().slice(0, 10)
  })
};
