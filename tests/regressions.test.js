/**
 * Guards for defects that actually shipped. Each test names the symptom, so a future
 * change that reintroduces one fails with an explanation rather than a bare assertion.
 *
 * Several of these inspect main.js and styles.css as text. That is deliberate: the
 * defects they guard were structural (a deleted CSS rule, an inherited method that
 * silently won) and are not reachable by calling a function.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const { plainSource } = require("./helpers/plain.js");
// Read for its wording: the **bold** markers in prompt text are left out.
const main = plainSource(fs.readFileSync(path.join(ROOT, "src", "main.js"), "utf8"));
const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("every gtd-clarify class used in main.js has a CSS rule", () => {
  // Symptom: a range-based patch deleted .gtd-clarify-taskline/-taskparent/-taskactive,
  // and the task display silently lost its boxes and greying.
  const used = new Set(main.match(/gtd-clarify-[a-z0-9-]+|gtd-dim-[a-z0-9-]+/g) || []);
  const defined = new Set(
    (css.match(/\.(gtd-clarify-[a-z0-9-]+|gtd-dim-[a-z0-9-]+)/g) || []).map((c) => c.slice(1))
  );
  // gtd-clarify-review is the pane's view id, which shares the prefix but is not a class.
  const missing = [...used].filter((c) => !defined.has(c) && !/^gtd-clarify-\d/.test(c) && c !== "gtd-clarify-review");
  assert.deepStrictEqual(missing, [], `classes used but never styled: ${missing.join(", ")}`);
});

test("no CSS rule is defined for a class nothing uses", () => {
  const used = new Set(main.match(/gtd-clarify-[a-z0-9-]+|gtd-dim-[a-z0-9-]+/g) || []);
  const defined = new Set(
    (css.match(/\.(gtd-clarify-[a-z0-9-]+|gtd-dim-[a-z0-9-]+)/g) || []).map((c) => c.slice(1))
  );
  const orphans = [...defined].filter((c) => !used.has(c));
  assert.deepStrictEqual(orphans, [], `styled but unused: ${orphans.join(", ")}`);
});

test("the two task boxes share one scroll region, not one each", () => {
  // Symptom: parent and active box each had their own overflow-y, so there were two
  // independent scrollbars and no way to scroll from the subtask up to the project.
  assert.match(css, /\.gtd-clarify-task \{[^}]*overflow-y: auto/s, "the region itself must scroll");
  assert.ok(
    !/\.gtd-clarify-taskparent \{[^}]*overflow-y: auto/s.test(css),
    "the parent box must not scroll internally"
  );
  assert.ok(!/\.gtd-clarify-taskscroll/.test(css), "the old inner-scroller rule should be gone");
  assert.ok(!/gtd-clarify-taskscroll/.test(main), "the old inner-scroller class should be unused");
});

test("neither task box shrinks inside the scroll region", () => {
  // Without flex: 0 0 auto a flex child shrinks to fit instead of overflowing, and the
  // region never scrolls at all.
  assert.match(css, /\.gtd-clarify-taskparent \{[^}]*flex: 0 0 auto/s);
  assert.match(css, /\.gtd-clarify-taskactive \{[^}]*flex: 0 0 auto/s);
});

test("the region scrolls to the active box and stops once the user takes over", () => {
  assert.match(main, /scrollToActiveTask\(\)/);
  assert.match(main, /taskFollow/);
  assert.match(main, /taskExpectedTop/, "must distinguish our own scroll from the user's");
  assert.match(main, /this\.taskScrollObserver\.disconnect\(\)/, "observer must be cleaned up");
});

test("touch targets stay larger on mobile than on desktop", () => {
  // Compacting the prompt controls must not shrink them below a usable size for a thumb.
  const desktop = css.match(/\.gtd-clarify-btn \{[^}]*min-height: (\d+)px/s);
  const mobile = css.match(/body\.is-mobile \.gtd-clarify-btn \{[^}]*min-height: (\d+)px/s);
  assert.ok(desktop && mobile, "both a base and a mobile min-height must be defined");
  assert.ok(
    Number(mobile[1]) > Number(desktop[1]),
    `mobile (${mobile[1]}px) must exceed desktop (${desktop[1]}px)`
  );
  assert.ok(Number(mobile[1]) >= 40, "mobile target should stay close to the 44px guideline");
});

test("only documented Obsidian CSS variables are used", () => {
  // --size-2-1 (2px) and --line-height-tight (1.3) are real; a typo here fails silently
  // at runtime, so pin the ones this stylesheet depends on.
  const known = new Set([
    "--size-2-1", "--size-2-2", "--size-4-1", "--size-4-2", "--size-4-3",
    "--font-ui-smaller", "--font-ui-small", "--font-ui-medium",
    "--font-monospace", "--font-medium", "--font-semibold", "--font-bold", "--line-height-tight",
    "--text-normal", "--radius-s",
    "--radius-m", "--background-secondary", "--background-primary",
    "--background-modifier-border", "--background-modifier-hover",
    "--background-modifier-error-hover", "--background-modifier-box-shadow",
    "--text-muted", "--text-faint", "--text-error", "--text-accent",
    "--text-accent-hover", "--text-on-accent",
    "--interactive-accent", "--interactive-accent-hover", "--interactive-normal",
    "--input-shadow", "--gtd-clarify-clamp"
  ]);
  const used = new Set((css.match(/var\((--[a-z0-9-]+)/g) || []).map((v) => v.slice(4)));
  const unknown = [...used].filter((v) => !known.has(v));
  assert.deepStrictEqual(unknown, [], `unrecognised CSS variables: ${unknown.join(", ")}`);
});

test("Restart is offered before Revert, and reads as the primary recovery action", () => {
  // An error is far more often about the task in front of you than a realisation about
  // the previous one, so Restart must be the one reached for first.
  const restart = main.indexOf('text: "Restart task"');
  const revert = main.indexOf('text: "Revert last"');
  assert.ok(restart > -1 && revert > -1, "both rewind buttons must exist");
  assert.ok(restart < revert, "Restart must be rendered before Revert");
  assert.ok(!/text: "[^"]*Previous/.test(main), "the old 'Previous' button label should be gone");
  assert.match(css, /\.gtd-clarify-revert \{[^}]*color: var\(--text-muted\)/s, "Revert is the quieter option");
  assert.ok(
    !/\.gtd-clarify-restart \{[^}]*color: var\(--text-muted\)/s.test(css),
    "Restart must not be muted alongside Revert"
  );
});

test("rewind buttons are styled by class, not by matching label text", () => {
  // The previous rule keyed off [aria-label^="Undo"], which breaks silently the moment a
  // label is reworded — exactly what renaming Previous to Revert would have done.
  // Strip comments before checking — the rule is gone, but it is described in one.
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/aria-label\^=/.test(rules), "no attribute-prefix selectors on label text");
  assert.match(main, /cls: "gtd-clarify-btn gtd-clarify-restart"/);
  assert.match(main, /cls: "gtd-clarify-btn gtd-clarify-revert"/);
});

test("query filtering is our own, and says so where a reader will look", () => {
  // The Tasks API exposes no search. Anyone reading this code needs to know the filters
  // are a re-implementation, or they will assume full query-language parity.
  assert.match(main, /not yet possible to run Tasks searches via the API/);
  assert.match(main, /QUERY_FILTER_HELP/);
  assert.match(main, /getTasks/, "the undocumented route must be named");
});

test("an unsupported filter is reported rather than ignored", () => {
  const { parseTasksQuery } = require("./helpers/load.js");
  assert.strictEqual(parseTasksQuery("sort by due", "2026-01-01").errors.length, 1);
});

test("line offsets are tracked per file, not as one running total", () => {
  // A query source spans many files; a single offset would apply one file's growth to
  // another's line numbers.
  assert.match(main, /const offsets = \/\* @__PURE__ \*\/ new Map\(\)/);
  assert.match(main, /offsets\.set\(item\.file\.path/);
  assert.ok(!/\boffset \+= after - before\b/.test(main), "the old scalar accumulator must be gone");
});

test("both review modes offer the source choice at runtime", () => {
  // The mode is passed through so the opening tip names the right GTD stage.
  assert.match(main, /chooseSource\(file, projectTag, mode\)/);
  assert.match(main, /A Tasks query/);
  // start() is shared by Process and Organise, so one call site covers both.
  assert.strictEqual((main.match(/await this\.chooseSource\(/g) || []).length, 1);
});

test("the query source is skipped when Tasks cannot supply a task list", () => {
  assert.match(main, /canQuery\(\)/);
  assert.match(main, /typeof p\.getTasks === "function"/);
});

test("a surfaced subtask is shown with its parent context", () => {
  // A query can match a subtask whose ancestors did not match. Presenting it bare — "call
  // them back", with no sign of which project it belongs to — makes it undecidable.
  assert.match(main, /computeAncestorLines\(fresh, item\.startLine\)/);
  assert.match(main, /item\.parentRaw = ancestors\.length/);
  assert.ok(
    !/focusOnLine\(item\.file, item\.startLine, item\.endLine, item\.raw, null\)/.test(main),
    "the parent argument must no longer be hardcoded to null"
  );
});

test("renaming a project applies the rename AND the tag in one write", () => {
  // Symptom: "actionable this week" -> "project" -> rename applied #project to the OLD
  // title, then the editor's flush overwrote it with the new title and no tag.
  assert.match(main, /editTaskLineTagged/);
  assert.match(main, /canEditViaApi\(\)/, "prefer the API, which returns the edited line");
  assert.ok(
    !/const fresh = \(_b = await readLine\(ctx\.app, item\.file, item\.startLine\)\)/.test(main),
    "the unguarded read-back must be gone"
  );
});

test("an edit does not return until the vault matches the editor", () => {
  // Fixed once at the source so every caller that reads a line back is protected.
  assert.match(main, /await this\.flushEditorLine\(file, target, editor\)/);
  assert.match(main, /async flushEditorLine\(file, line, editor/);
});

test("the source-choice prompt has no skip option", () => {
  // "Skip step" there silently meant "current file" — a decision disguised as a
  // non-decision.
  const at = main.indexOf("Which tasks do you want to work through?");
  assert.ok(at > -1);
  assert.ok(main.slice(at - 200, at).includes("this.choice("), "must use choice, not optionalChoice");
});

test("Revert is disabled rather than removed when unavailable", () => {
  // A button that appears and disappears shifts Skip and Exit sideways mid-review.
  assert.match(main, /prev\.disabled = true/);
  assert.match(main, /gtd-clarify-btn-disabled/);
  assert.match(css, /\.gtd-clarify-btn-disabled \{[^}]*opacity/s);
});

test("an existing project skips the is-this-a-project question", () => {
  const at = main.indexOf('"Does this need more than one step?"');
  const guard = main.indexOf("if (item.isProject) {");
  assert.ok(guard > -1 && guard < at, "the guard must come first");
});

test("cancelling the first subtask restarts the task only when one is required", () => {
  // Rolling back is right for a project just created, which would be left childless. An
  // existing project already has children, so declining to add more is a valid answer.
  assert.match(main, /if \(session\.made\.length === 0\) \{[\s\S]{0,500}if \(requireOne\) throw new ReviewControl\("retry"\);\s*\n\s*return 0;/);
  assert.match(main, /addSubtasks\(ctx, item\.file, item\.endLine, null, false, true, item\.startLine\)/,
    "a newly created project must require at least one subtask");
  assert.match(main, /addSubtasks\(ctx, item\.file, end, null, false, false, item\.startLine\)/,
    "an existing project must not");
});

test("an existing project walks its subtasks before offering to append", () => {
  const body = main.slice(main.indexOf("if (item.isProject) {"));
  const branch = body.slice(0, body.indexOf("const projectKind"));
  const walk = branch.indexOf("processProjectChildren");
  const append = branch.indexOf("addSubtasks");
  assert.ok(walk > -1, "existing children must be walked");
  assert.ok(append > walk, "appending must come after the walk, not instead of it");
  assert.match(branch, /Add another next action to this project\?/, "appending must be offered, not assumed");
});

test("the child walk re-reads the file rather than listing children up front", () => {
  // Processing a child can delete it or expand it, so a snapshot goes stale immediately.
  const fn = main.slice(main.indexOf("async function processProjectChildren"));
  const body = fn.slice(0, fn.indexOf("\nasync function runProcess"));
  assert.match(body, /await ctx\.app\.vault\.read\(item\.file\)/);
  assert.match(body, /cursor = childEnd \+ \(after - before\) \+ 1/, "cursor must absorb the size change");
  assert.match(body, /depth \+ 1/, "recursion must carry depth");
});

test("each ending is its own Process option and its own setting", () => {
  // Previously one button whose meaning was chosen in settings, so only one of the three
  // decisions could ever be recorded.
  assert.ok(!/disposeAction\s*[:=]/.test(main), "the single-mode setting must be gone");
  assert.ok(!/disposeMode\(|disposeLabel\(/.test(main), "the single-mode helpers must be gone");
  assert.match(main, /new Map\(disposeOptions\(settings\)\.map/, "options come from the enabled set");
  assert.match(main, /for \(const action of DISPOSE_ACTIONS\) \{\s*\n\s*this\.toggleField/,
    "one settings row per ending");
});

test("one option covers filing under a new or an existing project", () => {
  // These used to be two options, one labelled Yes and one labelled No, for what GTD
  // treats as a single decision: this capture is a step in a bigger project.
  assert.match(main, /value: "step"/);
  assert.ok(!/value: "subtask"/.test(main), "the old new-project option must be gone");
  assert.ok(!/value: "existing"/.test(main), "the old existing-project option must be gone");
  const at = main.indexOf('"Which project is it a step in?"');
  assert.ok(at > -1);
  assert.match(main.slice(at, at + 400), /Create a new project/,
    "creating a project is offered alongside the existing ones");
});

test("the nesting move is a single read-modify-write", () => {
  // Two steps against the original numbering misplace the task whenever the project sits
  // below it, because removing the block shifts everything underneath.
  // Bounded by the function's own closing brace, not by whatever happens to follow it.
  const own = (name) => {
    const at = main.indexOf(`async function ${name}(`);
    return main.slice(at, main.indexOf("\n}\n", at));
  };
  for (const [name, re] of [
    ["moveSubtreeUnderProject", /projectLine > endLine \? projectLine - block\.length : projectLine/],
    ["moveSubtreeUnderHeading", /headingLine > endLine \? headingLine - block\.length : headingLine/]
  ]) {
    const body = own(name);
    assert.strictEqual((body.match(/vault\.process/g) || []).length, 1, `${name}: one write`);
    assert.match(body, re, `${name}: the target must be re-derived inside the modified array`);
  }
});

test("queued tasks are re-anchored by content", () => {
  // Moving a task reorders lines without changing the file length, so offsets alone
  // cannot locate the remaining tasks.
  // By content, and with no fallback to the predicted line when the text has gone.
  assert.match(main, /locateByText\(fresh, item\.startLine, bases\[i\]\.raw\)/);
  assert.match(main, /raw: it\.raw/, "bases must carry the original text");
});

test("the task display keeps its bordered box, grey parent and accent bar", () => {
  assert.match(css, /\.gtd-clarify-taskline \{[^}]*font-family: var\(--font-monospace\)/s);
  assert.match(css, /\.gtd-clarify-taskparent \{[^}]*color: var\(--text-muted\)/s);
  assert.match(css, /\.gtd-clarify-taskactive \{[^}]*border-left: 3px solid/s);
});

test("suggest modals extend SuggestModal, not FuzzySuggestModal", () => {
  // Symptom: FuzzySuggestModal ships a concrete getSuggestions(); overriding it left the
  // parent implementation reachable, so the old path-wide ranking kept running.
  assert.match(main, /NoteSuggestModal = class extends obsidian\.SuggestModal/);
  assert.match(main, /FolderSuggestModal = class extends obsidian\.SuggestModal/);
  assert.ok(
    !/class extends obsidian\.FuzzySuggestModal/.test(main),
    "FuzzySuggestModal's inherited getSuggestions must not be reachable"
  );
});

test("the Exit button does not borrow Obsidian's mod-warning class", () => {
  // Symptom: mod-warning gets a solid red fill from the desktop stylesheet, so Exit
  // rendered as a pure red block on desktop while mobile looked fine.
  assert.ok(!/gtd-clarify-btn mod-warning/.test(main));
  assert.match(css, /\.gtd-clarify-exit \{[^}]*background:/s);
});

test("the typing state hides the nav but does not resize the task box", () => {
  // Symptom: resizing the task box on blur moved the OK button out from under the
  // finger, which is what made the custom-tag prompt need two presses.
  assert.match(css, /is-typing \.gtd-clarify-nav \{\s*display: none/);
  assert.ok(!/is-typing \.gtd-clarify-task \{/.test(css));
});

test("submitting on pointerdown swallows the stray click from the same gesture", () => {
  // Symptom: the click that followed pointerdown landed on the next prompt's third
  // control — "Create a new note..." — silently choosing it.
  assert.match(main, /addEventListener\("pointerdown"/);
  assert.match(main, /swallowNextClick/);
  assert.match(main, /if \(settled\) return;/);
});

test("review line numbers derive from pristine bases, never from the mutated item", () => {
  // Symptom: item.startLine is overwritten with base + offset; re-reading it when a task
  // was revisited via Previous added the offset twice and landed on the next task.
  assert.match(main, /const bases = items\.map/);
  assert.match(main, /const baseStart = bases\[i\]\.start;/);
  assert.ok(
    !/const baseStart = item\.startLine;/.test(main),
    "must not re-derive the base from a field the loop mutates"
  );
});

test("the editor is settled before the Tasks edit modal is opened", () => {
  // Symptom: the cursor was placed before Obsidian propagated vault writes into the open
  // editor, so the Tasks modal edited the line below the intended one.
  assert.match(main, /settleOnLine/);
  assert.match(main, /async settleOnLine\(editor, line, expected\)/);
});

test("the source carries no bundler scaffolding, and imports obsidian once", () => {
  // src/main.js is what people read; the scaffolding belongs only in the built main.js.
  for (const marker of ["__toCommonJS", "__copyProps", "__getOwnPropNames", "import_obsidian", "module.exports", "require("]) {
    assert.ok(!main.includes(marker), `bundler or CommonJS leftover in the source: ${marker}`);
  }
  assert.strictEqual((main.match(/^import \* as obsidian from "obsidian";$/gm) || []).length, 1);
  assert.match(main, /^export default GtdFlowPlugin;$/m);
});

test("main.js is built, not committed, and data.json stays out except the example", () => {
  const ignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8").split("\n").map((l) => l.trim());
  assert.ok(ignore.includes("/main.js"), "the build output is not committed");
  assert.ok(ignore.includes("/data.json"), "your own settings are not committed");
  assert.ok(!ignore.includes("data.json"), "an unanchored pattern would hide examples/data.json too");
  assert.ok(fs.existsSync(path.join(ROOT, "main.js")), "npm test builds it first");
});

test("the plugin exports a default in the shape Obsidian expects", () => {
  const mod = require("./helpers/load.js").plugin;
  assert.strictEqual(mod.__esModule, true);
  assert.strictEqual(typeof mod.default, "function");
});

test("manifest and versions.json agree", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const versions = JSON.parse(fs.readFileSync(path.join(ROOT, "versions.json"), "utf8"));
  assert.ok(versions[manifest.version], `versions.json is missing ${manifest.version}`);
  assert.strictEqual(versions[manifest.version], manifest.minAppVersion);
  assert.ok(!/\(your name\)/.test(manifest.author), "author placeholder left in manifest");
});

test("the build marker matches the manifest version", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const marker = main.match(/BUILD_VERSION = "([^"]+)"/);
  assert.ok(marker, "build marker missing");
  assert.ok(
    marker[1].startsWith(manifest.version),
    `build marker ${marker[1]} does not match manifest version ${manifest.version}`
  );
});
