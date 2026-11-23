/*
 * GTD Clarify — a guided GTD Process/Organise workflow for Obsidian.
 *
 * This file is the source. `npm run build` bundles it into main.js, the file Obsidian
 * loads; main.js is built, not committed, and is attached to each GitHub release.
 * The `// ---` section markers are navigation aids, one per area of the plugin.
 *
 * Tests live in tests/ and run with `npm test`, which builds first. The `__testables`
 * export at the bottom exists so those tests can reach the internal helpers.
 */
import * as obsidian from "obsidian";

// ----------------------------------------------------------------------
// src/main.ts
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// src/settings.ts
// ----------------------------------------------------------------------
function genId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}
var DEFAULT_SETTINGS = {
  somedayNotePath: "Someday/Someday.md",
  referenceFolder: "",
  referenceTemplatePath: "",
  curatedMoveTargets: [],
  newNoteFolder: "",
  projectFolder: "Projects",
  newNoteTemplatePath: "",
  templateEngine: "auto",
  templateFolder: "",
  taskPlaceholder: "{{tasks}}",
  enablePriorityStep: true,
  enableCustomTagStep: true,
  /* GTD coaching. Clarifying a capture into a physical, visible next action is the step
   * the method depends on most and that people skip most often, so the plugin prompts for
   * it rather than assuming the captured wording is already usable. Both can be switched
   * off by anyone who already clarifies at capture time. */
  clarifyNextAction: true,
  nudgeVagueActions: true,
  /* The phrases the vague-action check looks for, and the filler it skips past first.
   * null means "the built-in list". Kept null until you edit it, so an improved built-in
   * list in a later version reaches you — a stored copy would freeze it at today's. */
  vagueOpeners: null,
  fillerPrefixes: null,
  /* How GTD tips are shown alongside a question. "onDemand" keeps the question clean and
   * puts the tip behind an info button, so it is there when you want a reminder and costs
   * nothing to read past when you don't. */
  guidanceDisplay: "onDemand",
  /* Tickled tasks — those with a start date still in the future — are left out of every
   * review until that date, so deferring something actually takes it off your plate. */
  hideTickledTasks: true,
  /* Each way of finishing with a task is its own option in Process, independently
   * switchable. They are genuinely different decisions — "this is done", "this is
   * abandoned", "this should never have been written down" — so folding them into one
   * button meant choosing in settings which of the three you were allowed to record. */
  enableCompleteOption: true,
  enableCancelOption: true,
  enableDeleteOption: true,
  confirmBeforeDelete: false,
  highlightSourceLine: true,
  /* Number keys pick answers on a keyboard: 1 for the first, 2 for the second, 0 to skip an
   * optional step. The numbers are shown on the buttons while it is on. Never on a phone. */
  numberKeys: true,
  // Set once a number key has been used, so the one-line hint stops appearing.
  numberKeysUsed: false,
  projectTag: "project",
  // What "Someone else does it" tags a task with, without the #.
  waitingForTag: "waitingfor",
  /* Organise each task as soon as Process has decided it, instead of in a pass of its own.
   * Off by default: GTD keeps clarifying and organising apart, and some people like a
   * clear inbox before they think about where anything goes. */
  organiseAfterProcessing: false,
  // The last few notes Move to… sent a task to, most recent first. Kept by the plugin.
  recentDestinations: [],
  /* Sweep: where captures go, and what it prompts with. The trigger list is null until
   * edited, so an improved built-in list reaches you, as with the phrase lists. */
  sweepInboxPath: "Inbox.md",
  areasFolder: "",
  sweepProjects: true,
  sweepContexts: true,
  sweepTriggers: null,
  /* Someday holds things you are NOT committed to, so it is excluded from anything meant
   * to show what to do next. Only affects new installs; existing saved queries are kept. */
  savedQueries: [
    { name: "Next actions (not blocked)", query: "not done\nis not blocked\npath does not include Someday" },
    { name: "Home context", query: "not done\nis not blocked\ntags include home\npath does not include Someday" },
    { name: "Overdue", query: "not done\ndue before today\npath does not include Someday" }
  ],
  lastCustomQuery: "not done\nis not blocked",
  dimensions: [
    {
      id: "context",
      label: "Context",
      group: "Physical context",
      defaultFormat: "tag",
        values: [
          { id: "home", label: "Home", value: "home" },
          { id: "office", label: "Office", value: "office" },
          { id: "errands", label: "Errands", value: "errands" }
        ]
    },
    {
      id: "mode",
      label: "Processing mode",
      group: "Mental processing mode",
      defaultFormat: "tag",
        values: [
          { id: "creative", label: "Creative", value: "creative" },
          { id: "admin", label: "Admin", value: "admin" },
          { id: "social", label: "Social", value: "social" }
        ]
    },
    {
      id: "energy",
      label: "Energy",
      group: "Energy",
      // 'text' so values write as `hi` / `lo`, not `#hi` (Spec: D16, ORG-5).
      defaultFormat: "text",
        values: [
          { id: "hi", label: "High", value: "hi" },
          { id: "lo", label: "Low", value: "lo" }
        ]
    },
    {
      id: "duration",
      label: "Duration",
      group: "Duration",
      defaultFormat: "text",
        values: [
          { id: "long", label: "Long", value: "long" },
          { id: "short", label: "Short", value: "short" }
        ]
    }
  ]
};
var GtdFlowSettingTab = class extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  async save() {
    await this.plugin.saveSettings();
  }
  textField(name, desc, key) {
    new obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addText(
      (t) => {
        var _a;
        return t.setValue(String((_a = this.plugin.settings[key]) != null ? _a : "")).onChange(async (v) => {
          this.plugin.settings[key] = v.trim();
          await this.save();
        });
      }
    );
  }
  /** A multi-line phrase list stored as text, null meaning "the built-in default". */
  phraseListField(name, desc, key, defaultText) {
    const setting = new obsidian.Setting(this.containerEl).setName(name).setDesc(desc);
    setting.addTextArea((t) => {
      const current = this.plugin.settings[key];
      t.setValue(typeof current === "string" ? current : defaultText());
      t.inputEl.rows = 10;
      t.inputEl.addClass("gtd-clarify-phraselist");
      t.onChange(async (v) => {
        // Unchanged from the default stays null, so it keeps following the built-in list.
        this.plugin.settings[key] = v === defaultText() ? null : v;
        await this.save();
      });
    });
    setting.addExtraButton(
      (b) => b.setIcon("rotate-ccw").setTooltip("Restore the built-in list").onClick(async () => {
        this.plugin.settings[key] = null;
        await this.save();
        this.display();
      })
    );
  }
  toggleField(name, desc, key) {
    new obsidian.Setting(this.containerEl).setName(name).setDesc(desc).addToggle(
      (t) => t.setValue(Boolean(this.plugin.settings[key])).onChange(async (v) => {
        this.plugin.settings[key] = v;
        await this.save();
      })
    );
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new obsidian.Setting(containerEl).setName("Destinations").setHeading();
    this.textField("Someday note", "Where Someday items go. Each is added to the end of this note.", "somedayNotePath");
    this.textField("Reference folder", "Where File as reference creates its notes. Leave empty for the vault root.", "referenceFolder");
    this.textField("Reference template", "Optional. A note to use as the template for reference notes.", "referenceTemplatePath");
    this.textField("New-note folder", "Where Create a new note puts the note, when moving a task.", "newNoteFolder");
    this.textField("Project folder", "Where Create a new note puts the note, when moving a project.", "projectFolder");
    this.textField("New-note template", "Optional. A note to use as the template for notes made by Create a new note.", "newNoteTemplatePath");
    new obsidian.Setting(containerEl).setName("Templates").setHeading();
    containerEl.createEl("p", {
      text: "Used by \u201CRun a template \u2192 move here\u201D when filing in Organise: pick a template, choose where the new note goes, and the task or project is moved into it.",
      cls: "setting-item-description"
    });
    new obsidian.Setting(containerEl).setName("Template engine").setDesc(
      "How the chosen template is applied. Auto-detect uses Templater if installed, then the core Templates plugin, otherwise a plain copy."
    ).addDropdown(
      (d) => d.addOption("auto", "Auto-detect").addOption("templater", "Templater (runs <% %>)").addOption("core", "Core Templates ({{title}}/{{date}}/{{time}})").addOption("copy", "Copy verbatim").setValue(this.plugin.settings.templateEngine).onChange(async (v) => {
        this.plugin.settings.templateEngine = v;
        await this.save();
      })
    );
    this.textField(
      "Template folder",
      "Folder the template picker lists from. Empty = auto-detect from Templater / core Templates.",
      "templateFolder"
    );
    this.textField(
      "Task placeholder",
      "Marker in a template that the moved task/project replaces (e.g. put {{tasks}} where tasks should land). If the template has no marker, the task is appended at the end. Empty = always append.",
      "taskPlaceholder"
    );
    new obsidian.Setting(containerEl).setName("Curated move targets").setDesc("One note path per line. Each is offered as a one-tap destination when filing.").addTextArea(
      (t) => t.setValue(this.plugin.settings.curatedMoveTargets.join("\n")).onChange(async (v) => {
        this.plugin.settings.curatedMoveTargets = v.split("\n").map((s) => s.trim()).filter(Boolean);
        await this.save();
      })
    );
    new obsidian.Setting(containerEl).setName("Behaviour").setHeading();
    this.textField("Project tag", "The tag, without #, that marks a task as a project.", "projectTag");
    this.textField(
      "Waiting-for tag",
      "The tag, without #, that “Someone else does it” adds in Process. Organise files a waiting-for without asking for labels.",
      "waitingForTag"
    );
    this.toggleField(
      "Organise as you process",
      "In Process, ask Organise\u2019s questions about each task straight after deciding it, so one pass does both. A task in the two-minute batch is organised after the batch, if it\u2019s still open then.",
      "organiseAfterProcessing"
    );
    this.toggleField(
      "Hide deferred tasks",
      "Leave tasks with a start date still in the future out of Process until that date. Organise still includes them, since deferred work still needs a home. A query that filters on start dates itself always sees them.",
      "hideTickledTasks"
    );
    this.toggleField(
      "Number keys pick answers",
      "On a keyboard, press 1\u20139 to choose an answer \u2014 the number is shown on each button \u2014 and 0 to skip an optional step. Ignored while you are typing in a note or a field, and not used on a phone.",
      "numberKeys"
    );
    new obsidian.Setting(containerEl).setName("Sweep").setHeading();
    this.textField("Inbox note", "Where Sweep puts what you capture: each thought is added to the end of this note as a task. Created if it doesn\u2019t exist.", "sweepInboxPath");
    this.textField("Areas of focus folder", "Sweep asks about each note in this folder. Leave empty to leave areas out.", "areasFolder");
    this.toggleField("Ask about each project", "Each open project in the project folder \u2014 or anywhere, if that is empty. Deferred projects and Someday are left out.", "sweepProjects");
    this.toggleField("Ask about each context", "Each answer of your context step in Organise.", "sweepContexts");
    this.phraseListField(
      "Trigger list",
      "Asked last. A line ending in a colon is one prompt, with the lines under it as its reminders. Lines starting with # are off. Until you edit this, it follows the built-in list, including improvements in later versions.",
      "sweepTriggers",
      defaultTriggerText
    );
    new obsidian.Setting(containerEl).setName("GTD coaching").setHeading();
    new obsidian.Setting(containerEl).setName("GTD tips").setDesc(
      "The short reminders shown with questions about outcomes and next actions."
    ).addDropdown(
      (d) => d.addOption("onDemand", "Tap \u24D8 to show").addOption("always", "Always shown").addOption("off", "Hidden").setValue(guidanceMode(this.plugin.settings)).onChange(async (v) => {
        this.plugin.settings.guidanceDisplay = v;
        await this.save();
      })
    );
    this.toggleField(
      "Clarify filed next actions",
      "When you file a capture under a project, ask whether it is a clear next action before moving on. Turn off if you already write clear actions when you capture.",
      "clarifyNextAction"
    );
    this.toggleField(
      "Flag vague next actions",
      "Offer a rewrite when an action starts with words like \u2018look into\u2019 or \u2018sort out\u2019, or is a single word. Silent when the wording looks fine.",
      "nudgeVagueActions"
    );
    this.phraseListField(
      "Vague-action phrases",
      "One per line. Lines starting with # are off \u2014 delete the # to switch one on. Until you edit this, it follows the built-in list, including improvements in later versions.",
      "vagueOpeners",
      defaultVagueText
    );
    this.phraseListField(
      "Filler skipped before checking",
      "Words like \u2018need to\u2019 that are skipped, not flagged \u2014 \u2018Need to call Sam\u2019 is a fine action.",
      "fillerPrefixes",
      defaultFillerText
    );
    this.toggleField("Priority step", "Ask for a priority during Organise.", "enablePriorityStep");
    this.toggleField(
      "Custom tag step",
      "Offer a free-text tag prompt at the end of Organise. Turn off to finish a task one step sooner.",
      "enableCustomTagStep"
    );
    new obsidian.Setting(containerEl).setName("Finishing with a task").setHeading();
    new obsidian.Setting(containerEl).setDesc(
      "Which endings Process offers for a task that is not actionable. Each is independent \u2014 switch on as many as you use."
    );
    for (const action of DISPOSE_ACTIONS) {
      this.toggleField(plainText(action.label), action.description, action.setting);
    }
    this.toggleField("Confirm before removing", "Ask before deleting or marking a task and its subtasks.", "confirmBeforeDelete");
    this.toggleField("Highlight current task in source note", "Show and highlight the task being worked on in its note.", "highlightSourceLine");
    this.renderSavedQueries(containerEl);
    this.renderDimensions(containerEl);
  }
  /* ------------------------------ saved queries ------------------------------ */
  /* Queries offered when a review is started against the vault rather than one note.
   * Stored as name + query text; the query text uses the subset of the Tasks query
   * language listed in QUERY_FILTER_HELP, because the Tasks API cannot run a real
   * search (see the tasksQuery section). */
  renderSavedQueries(containerEl) {
    new obsidian.Setting(containerEl).setName("Saved task queries").setHeading();
    new obsidian.Setting(containerEl).setDesc(
      "Offered when you choose \u201CA Tasks query\u2026\u201D at the start of a review. Supported filters: " +
        QUERY_FILTER_HELP.join("; ") + "."
    );
    const queries = this.plugin.settings.savedQueries || (this.plugin.settings.savedQueries = []);
    queries.forEach((q, i) => {
      const box = containerEl.createDiv({ cls: "gtd-clarify-dim-editor" });
      new obsidian.Setting(box).setName("Name").addText(
        (t) => t.setValue(q.name).onChange(async (v) => {
          q.name = v;
          await this.save();
        })
      ).addExtraButton(
        (b) => b.setIcon("trash").setTooltip("Remove this query").onClick(async () => {
          queries.splice(i, 1);
          await this.save();
          this.display();
        })
      );
      new obsidian.Setting(box).setName("Query").setDesc("One filter per line.").addTextArea(
        (t) => t.setValue(q.query).onChange(async (v) => {
          q.query = v;
          await this.save();
        })
      );
    });
    new obsidian.Setting(containerEl).addButton(
      (b) => b.setButtonText("Add query").onClick(async () => {
        queries.push({ name: "New query", query: "not done" });
        await this.save();
        this.display();
      })
    );
  }
  /* ----------------------------- dimension editor ---------------------------- */
  // Spec: SET-3 / EXT-2. Context, energy, duration, and any custom dimension are edited here.
  renderDimensions(containerEl) {
    new obsidian.Setting(containerEl).setName("Organise dimensions").setHeading();
    containerEl.createEl("p", {
      text: "Each dimension is one skippable step in Organise. The written value goes on the task line, either as a tag (#value) or as the bare word (hi).",
      cls: "setting-item-description"
    });
    this.plugin.settings.dimensions.forEach((dim, index) => this.renderDimensionEditor(containerEl, dim, index));
    new obsidian.Setting(containerEl).addButton(
      (b) => b.setButtonText("Add dimension").setCta().onClick(async () => {
        this.plugin.settings.dimensions.push({
          id: genId("dim"),
          label: "New dimension",
          group: "New dimension",
          defaultFormat: "tag",
          values: [{ id: genId("val"), label: "Value", value: "value" }]
        });
        await this.save();
        this.display();
      })
    );
  }
  renderDimensionEditor(containerEl, dim, index) {
    const box = containerEl.createDiv({ cls: "gtd-clarify-dim-editor" });
    new obsidian.Setting(box).setName(plainText(dimensionQuestion(dim)) || "\u2014").setHeading().addExtraButton(
      (b) => b.setIcon("trash").setTooltip("Delete dimension").onClick(async () => {
        this.plugin.settings.dimensions.splice(index, 1);
        await this.save();
        this.display();
      })
    );
    // Heading first: it is what you see in Organise. The label only shows there when it
    // adds something the heading doesn't already say.
    new obsidian.Setting(box).setName("Heading").setDesc("The question shown for this step in Organise. Put **double asterisks** round the word to show in bold; without them, the label's words are bolded where the heading contains them.").addText(
      (t) => t.setValue(dim.group).onChange(async (v) => {
        dim.group = v;
        await this.save();
      })
    );
    new obsidian.Setting(box).setName("Label").setDesc("A short name for the dimension. Shown after the heading only when the heading doesn't already say it.").addText(
      (t) => t.setValue(dim.label).onChange(async (v) => {
        dim.label = v;
        await this.save();
      })
    );
    new obsidian.Setting(box).setName("Default format").addDropdown(
      (d) => d.addOption("tag", "Tag (#value)").addOption("text", "Plain text").setValue(dim.defaultFormat).onChange(async (v) => {
        dim.defaultFormat = v;
        await this.save();
      })
    );
    box.createEl("div", { text: "Values", cls: "setting-item-description" });
    dim.values.forEach((val, vi) => {
      new obsidian.Setting(box).addText(
        (t) => t.setPlaceholder("Label").setValue(val.label).onChange(async (v) => {
          val.label = v;
          await this.save();
        })
      ).addText(
        (t) => t.setPlaceholder("Written value").setValue(val.value).onChange(async (v) => {
          val.value = v;
          await this.save();
        })
      ).addDropdown(
        (d) => {
          var _a;
          return d.addOption("", "Default").addOption("tag", "Tag").addOption("text", "Text").setValue((_a = val.format) != null ? _a : "").onChange(async (v) => {
            val.format = v === "" ? void 0 : v;
            await this.save();
          });
        }
      ).addExtraButton(
        (b) => b.setIcon("trash").setTooltip("Remove value").onClick(async () => {
          dim.values.splice(vi, 1);
          await this.save();
          this.display();
        })
      );
    });
    new obsidian.Setting(box).addButton(
      (b) => b.setButtonText("Add value").onClick(async () => {
        dim.values.push({ id: genId("val"), label: "New", value: "new" });
        await this.save();
        this.display();
      })
    );
  }
};

// ----------------------------------------------------------------------
// src/tasksApi.ts
// ----------------------------------------------------------------------
var TASKS_PLUGIN_ID = "obsidian-tasks-plugin";
var TASKS_EDIT_COMMAND_ID = "obsidian-tasks-plugin:edit-task";
/** Yield until the next paint, but never longer than `maxMs` — rAF alone does not fire
 * in a backgrounded window, which would hang the review flow. */
/** Close whatever modal is currently open, without assuming which mechanism works.
 * Entirely best-effort: if neither route lands, the caller has still been released. */
function dismissOpenModal() {
  try {
    if (typeof document === "undefined") return;
    const button = document.querySelector(".modal-container .modal-close-button, .modal .modal-close-button");
    if (button && typeof button.click === "function") {
      button.click();
      return;
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  } catch {
    // Nothing more can be done to close it; the caller has been released either way.
  }
}
function nextFrame(maxMs = 32) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    window.requestAnimationFrame(finish);
    window.setTimeout(finish, maxMs);
  });
}
var TasksApiAdapter = class {
  constructor(app) {
    this.app = app;
  }
  /** True if the Tasks plugin and its v1 API are present (Spec: DEP-1, DEP-2). */
  isAvailable() {
    return !!this.api();
  }
  api() {
    var _a, _b;
    const plugin = (_b = (_a = this.app.plugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b[TASKS_PLUGIN_ID];
    return plugin == null ? void 0 : plugin.apiV1;
  }
  /** The Tasks plugin object itself, for `getTasks()` and `getState()`.
   *
   * These are public methods on the plugin class but are NOT part of the documented
   * apiV1 surface, so they are reached separately and every caller must tolerate their
   * absence. The documented API cannot run searches at all — Tasks' own docs list that
   * as a known limitation (issue #2459) — so this is the only route to a query. */
  plugin() {
    var _a, _b;
    return (_b = (_a = this.app.plugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b[TASKS_PLUGIN_ID];
  }
  /** True if query-backed sourcing is possible on this Tasks version. */
  canQuery() {
    const p = this.plugin();
    return !!p && typeof p.getTasks === "function";
  }
  /**
   * Create a brand-new task line via the Tasks modal (NLP dates, dependencies).
   * Returns the task-line string, or null if cancelled. Caller persists it (INT-2).
   * Used for project subtask creation (Spec: PROC-7b). Awaitable — unlike the
   * edit-in-place command below.
   */
  async createNewTaskLine() {
    const api = this.api();
    if (!(api == null ? void 0 : api.createTaskLineModal)) {
      new obsidian.Notice("Tasks plugin API not available.");
      return null;
    }
    const result = await api.createTaskLineModal();
    return result && result.trim().length > 0 ? result : null;
  }
  /**
   * Edit an EXISTING task line using the Tasks "Create or edit task" command,
   * in place, in the open editor (Spec: INT-3, INT-3a; PROC-4).
   *
   * Caveat: the command opens a modal and does not return a promise we can await,
   * so completion is fire-and-forget. Callers MUST re-read the line from disk after
   * the user has moved past the modal rather than trusting any cached line text.
   *
   * Caveat 2 (the reason for settleOnLine): every mutation in fileOps goes through
   * `vault.process`, and Obsidian propagates those writes into an already-open CodeMirror
   * document asynchronously. Placing the cursor before that propagation lands puts the
   * Tasks modal on the wrong task, in either of two ways:
   *   (a) we read a stale document, so `line` still addresses the pre-write content; or
   *   (b) the pending sync inserts a line above us and CodeMirror remaps our cursor down.
   * Both land one line low. PROC-7b ("rewrite this as a subtask under a new project task")
   * hit this every time because it inserts the project line DIRECTLY above the line it
   * then wants to edit; the other edit paths write nothing above the cursor first, which
   * is why only that one branch misbehaved.
   *
   * The vault copy is the source of truth here — we just wrote it. So: read the expected
   * text from the vault, wait until the editor agrees, and only then place the cursor.
   */
  async editExistingInPlace(file, line) {
    var _a, _b;
    const leaf = this.leafForFile(file);
    await leaf.openFile(file, { active: true });
    const view = leaf.view;
    if (!(view instanceof obsidian.MarkdownView) || !view.editor) {
      new obsidian.Notice("Could not open an editor to edit this task.");
      return false;
    }
    const editor = view.editor;
    const expected = await readLine(this.app, file, line);
    let target = await this.settleOnLine(editor, line, expected);
    editor.setCursor({ line: target, ch: 0 });
    await nextFrame();
    const moved = this.findLine(editor, target, expected);
    if (moved !== null && moved !== target) {
      target = moved;
      editor.setCursor({ line: target, ch: 0 });
    }
    const ran = (_b = (_a = this.app.commands) == null ? void 0 : _a.executeCommandById) == null ? void 0 : _b.call(_a, TASKS_EDIT_COMMAND_ID);
    if (!ran) {
      new obsidian.Notice("Tasks 'Create or edit task' command not found.");
      return false;
    }
    await this.waitForModalToClose();
    await this.flushEditorLine(file, target, editor);
    return true;
  }
  /** Wait until the vault agrees with the editor about this line.
   *
   * The Tasks edit command mutates the open EDITOR; Obsidian writes that to disk on its
   * own schedule. Every caller that reads the line back afterwards — to re-tag it, to
   * move it, to append a dependency id — would otherwise see the PRE-edit text, write
   * something derived from it, and then have the editor's flush overwrite that. The
   * observed symptom was a project tag applied to the old title, then the new title
   * appearing with the tag gone.
   *
   * Costs nothing when the user changed nothing: editor and vault already agree, so this
   * returns on the first comparison. A save is requested first so the common case does
   * not sit through Obsidian's autosave delay. */
  async flushEditorLine(file, line, editor, timeoutMs = 2e3) {
    var _a, _b;
    const inEditor = () => (line >= 0 && line <= editor.lastLine() ? editor.getLine(line) : null);
    const expected = inEditor();
    if (expected === null) return;
    if ((await readLine(this.app, file, line)) === expected) return;
    try {
      (_b = (_a = this.app.commands) == null ? void 0 : _a.executeCommandById) == null ? void 0 : _b.call(_a, "editor:save-file");
    } catch {
      // Saving only nudges the editor to flush; the read-back below copes if it fails.
    }
    const deadline = Date.now() + timeoutMs;
    for (; ; ) {
      const now = inEditor();
      if (now === null) return;
      if ((await readLine(this.app, file, line)) === now) return;
      if (Date.now() >= deadline) return;
      await new Promise((r) => window.setTimeout(r, 50));
    }
  }
  /** Prefer a markdown leaf already showing this file over the generic active leaf, so we
   * never navigate the review pane's own leaf and never force a needless reload (which is
   * itself one of the things that triggers the resync race below). Mirrors the leaf lookup
   * in ReviewView.applySourceHighlight. */
  leafForFile(file) {
    const open = this.app.workspace.getLeavesOfType("markdown").find((l) => {
      var _a;
      return ((_a = l.view.file) == null ? void 0 : _a.path) === file.path;
    });
    return open != null ? open : this.app.workspace.getLeaf(false);
  }
  /** Wait (bounded) for the open editor to catch up with the vault copy of `line`, and
   * return the index the line actually sits at. On timeout, fall back to `line` — worst
   * case we behave exactly as before rather than stalling the review. */
  async settleOnLine(editor, line, expected) {
    if (expected === null) return line;
    const hit = () => line >= 0 && line <= editor.lastLine() && editor.getLine(line) === expected;
    const deadline = Date.now() + 1e3;
    // Phase 1: an exact hit at the exact index is the signal that the vault write has
    // propagated into CodeMirror. Hold out for it — accepting a match elsewhere would
    // just latch onto the pre-sync document, which is the bug we are fixing.
    for (; ; ) {
      if (hit()) return line;
      if (Date.now() >= deadline) break;
      await nextFrame();
    }
    // Phase 2: the editor never converged (unsaved user edits, or a sync we cannot
    // observe). Settle for the nearest occurrence so we at least edit the right task.
    const near = this.findLine(editor, line, expected);
    return near !== null ? near : line;
  }
  /** Index of `expected` at, or nearest to, `line`; null if it is not there. Searches
   * outward to absorb a small drift, checking upward first because a lagging editor sits
   * ABOVE the vault index (the vault has inserted lines the editor has not applied yet).
   * Nearest-first so duplicate task text resolves to the occurrence we meant. */
  findLine(editor, line, expected) {
    if (expected === null) return null;
    const last = editor.lastLine();
    const at = (i) => i >= 0 && i <= last && editor.getLine(i) === expected;
    if (at(line)) return line;
    for (let d = 1; d <= 5; d++) {
      if (at(line - d)) return line - d;
      if (at(line + d)) return line + d;
    }
    return null;
  }
  /** Resolve once a modal has opened and then closed. DOM-based because the Tasks edit
   * command returns no promise. Times out safely if no modal is detected.
   * TODO: '.modal-container' is a DOM class and may change across Obsidian versions. */
  dismissOpenModal() {
    return dismissOpenModal();
  }
  waitForModalToClose() {
    return new Promise((resolve) => {
      const isOpen = () => !!document.querySelector(".modal-container, .modal");
      const appearDeadline = Date.now() + 1500;
      const watchForClose = () => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          observer.disconnect();
          window.clearInterval(timer);
          window.setTimeout(resolve, 50);
        };
        const observer = new MutationObserver(() => {
          if (!isOpen()) finish();
        });
        observer.observe(document.body, { childList: true, subtree: true });
        /* The observer only runs on mutations. If the selector keeps matching something
         * else on screen, or the close produces no further mutation, nothing ever fires
         * it again. Poll as a backstop rather than trusting a single mechanism. */
        const timer = window.setInterval(() => {
          if (!isOpen()) finish();
        }, 250);
      };
      const waitForOpen = () => {
        if (isOpen()) watchForClose();
        else if (Date.now() < appearDeadline) window.setTimeout(waitForOpen, 40);
        else resolve();
      };
      window.setTimeout(waitForOpen, 40);
    });
  }
  /**
   * Alternative edit path: if the installed Tasks API can pre-fill createTaskLineModal
   * from an existing line, this returns the edited string for the caller to persist.
   * Left as a stub because availability is version-dependent (Spec: INT-3a).
   */
  /** Edit a task line via the Tasks API, returning the edited markdown.
   *
   * `editTaskLineModal` (Tasks 7.21.0+) opens the same UI pre-filled, but does NOT touch
   * the file — it hands back the edited line as a string. That matters here far beyond
   * convenience: the command-based path edits the open EDITOR, whose contents reach disk
   * asynchronously, so reading the line back afterwards can return the pre-edit text.
   * Getting the text as a return value removes that race entirely.
   *
   * Returns null when the API is unavailable, and "" when the user cancelled — Tasks
   * documents an empty return for cancellation. (It also returns "" for a task using
   * `🏁 delete` on-completion, which is indistinguishable; treated as a cancel, which
   * leaves the line untouched rather than destroying it.) */
  async editTaskLine(existingLine) {
    const api = this.api();
    if (!(api == null ? void 0 : api.editTaskLineModal)) return null;
    const result = await api.editTaskLineModal(existingLine);
    return typeof result === "string" ? result : "";
  }
  /** True if this Tasks version can edit without the editor round-trip. */
  canEditViaApi() {
    const api = this.api();
    return !!(api == null ? void 0 : api.editTaskLineModal);
  }
  /**
   * One of the five Tasks priority signifiers (Spec: INT-4, ORG-6). The caller decides
   * placement; in Organise it is inserted BEFORE the date signifiers to match the order
   * the Tasks modal itself writes (fix for QA: priority before due date).
   */
  prioritySignifier(level) {
    var _a;
    const map = {
      highest: "\u{1F53A}",
      // 🔺
      high: "\u23EB",
      // ⏫
      medium: "\u{1F53C}",
      // 🔼
      low: "\u{1F53D}",
      // 🔽
      lowest: "\u23EC"
      // ⏬
    };
    return (_a = map[level]) != null ? _a : "";
  }
  /* ----------------------------- dependencies ------------------------------ */
  // Spec: INT-5, PROC-7d. Tasks places id (🆔) and blocked-by (⛔) near the end of a line.
  /** Complete a task line the way Tasks itself would, via executeToggleTaskDoneCommand
   * (Tasks 7.2.0+). Returns the resulting text — TWO lines when a recurring task was
   * completed, since Tasks writes the next occurrence alongside — or null if the API is
   * unavailable or throws, so the caller can fall back. */
  toggleTaskDone(line, path) {
    const api = this.api();
    if (!api || typeof api.executeToggleTaskDoneCommand !== "function") return null;
    try {
      const out = api.executeToggleTaskDoneCommand(line, path);
      return typeof out === "string" && out.length ? out : null;
    } catch {
      return null;
    }
  }
  /** What Tasks writes when a task is finished, from its own saved settings: whether to
   * add a done date and a cancelled date, in emoji or Dataview format, and its global filter
   * (a line without it is not a task to Tasks, so gets no date). Read each time, so a
   * change in Tasks' settings applies at once. Where Tasks has saved nothing, its documented
   * defaults: both dates on, emoji format. */
  async taskDateSettings() {
    const fallback = { doneDate: true, cancelledDate: true, dataview: false, globalFilter: "" };
    const p = this.plugin();
    if (!p || typeof p.loadData !== "function") return fallback;
    try {
      const d = await p.loadData() || {};
      return {
        doneDate: d.setDoneDate !== false,
        cancelledDate: d.setCancelledDate !== false,
        dataview: d.taskFormat === "dataview",
        globalFilter: typeof d.globalFilter === "string" ? d.globalFilter.trim() : ""
      };
    } catch {
      return fallback;
    }
  }
  newDependencyId() {
    return Math.random().toString(36).slice(2, 8);
  }
  idSignifier(id) {
    return `\u{1F194} ${id}`;
  }
  blockedBySignifier(id) {
    return `\u26D4 ${id}`;
  }
};

// ----------------------------------------------------------------------
// src/review/ReviewView.ts
// ----------------------------------------------------------------------

// ----------------------------------------------------------------------
// src/types.ts
// ----------------------------------------------------------------------
/* Control-flow signals raised out of a pipeline and caught by whoever should act on them.
 *
 *   exit   the whole review stops
 *   skip   this task (or, inside a project walk, this subtask) is left alone
 *   back   the user pressed "Restart task": redo the WHOLE task, journal restored
 *   prev   the user pressed "Revert last": undo this task and the previous one
 *   retry  something was cancelled: redo the SMALLEST enclosing unit of work
 *   reprocess  Organise only: undo the current unit's organising and re-process it
 *
 * `back` and `retry` differ only in scope, and only inside a project's subtask walk.
 * There, `retry` re-runs the one subtask, while `back` — which only ever comes from the
 * button — restarts the entire project as the label promises. At the top level there is
 * no smaller unit, so `retry` and `back` do the same thing. */
var ReviewControl = class extends Error {
  constructor(kind) {
    super(`review-control:${kind}`);
    this.kind = kind;
    this.name = "ReviewControl";
  }
};

// ----------------------------------------------------------------------
// src/journal.ts
// ----------------------------------------------------------------------
/* ------------------------------- Undo journal -------------------------------
 * Going back a step means undoing whatever the step already wrote. There is no
 * transaction support to lean on, so this records the prior state of every file a task
 * touches and can put it all back.
 *
 * Why this shape rather than a step-by-step state machine: runProcess/runOrganise are
 * linear `await` chains, so there is no step index to decrement. Rewinding a single
 * prompt would mean rewriting both pipelines as resumable machines — the largest and
 * riskiest change available in this codebase. Journalling instead leaves every line of
 * pipeline logic untouched: writes are captured because the pipelines already take their
 * `app` from `ctx`, so a wrapped `app` sees all of them.
 *
 * What is NOT captured: edits made by the Tasks plugin's own modal, which writes to the
 * file directly rather than through our `app`. Handled by snapshotting the task's own
 * file eagerly at the start of the task, which is the only file that modal touches. */
var VaultJournal = class {
  constructor(app) {
    this.app = app;
    this.saved = /* @__PURE__ */ new Map();
    this.created = [];
  }
  /** Record a file's contents before it is first modified. No-op if already recorded —
   * the FIRST state seen is the one to restore to. */
  async capture(file) {
    if (!file || this.saved.has(file.path)) return;
    try {
      this.saved.set(file.path, await this.app.vault.read(file));
    } catch {
      // A file that can't be read can't be restored either, so there is nothing to keep.
    }
  }
  async captureByPath(path) {
    const f = this.app.vault.getAbstractFileByPath(path);
    if (f instanceof obsidian.TFile) await this.capture(f);
  }
  noteCreated(path) {
    this.created.push(path);
  }
  isEmpty() {
    return this.saved.size === 0 && this.created.length === 0;
  }
  /** Put everything back. Returns a list of paths that could NOT be restored, so the
   * caller can tell the user rather than silently leaving a half-undone state. */
  async restore() {
    const failed = [];
    // Newest first: a note created inside a folder we also created must go before it.
    for (let i = this.created.length - 1; i >= 0; i--) {
      const path = this.created[i];
      const f = this.app.vault.getAbstractFileByPath(path);
      if (!f) continue;
      try {
        // Trash rather than delete, the way your "Deleted files" setting says — so if this
        // undo is itself a mistake, the note can still be recovered.
        const fm = this.app.fileManager;
        if (fm && typeof fm.trashFile === "function") await fm.trashFile(f);
        else await this.app.vault.trash(f, false);
      } catch {
        failed.push(path);
      }
    }
    for (const [path, content] of this.saved) {
      const f = this.app.vault.getAbstractFileByPath(path);
      if (!(f instanceof obsidian.TFile)) {
        failed.push(path);
        continue;
      }
      try {
        await this.app.vault.process(f, () => content);
      } catch {
        failed.push(path);
      }
    }
    this.saved.clear();
    this.created = [];
    return failed;
  }
};
/** An `app` that looks and behaves exactly like the real one, except that every write is
 * announced to the journal first. Only the mutating methods are intercepted; everything
 * else is delegated straight through, so nothing else in the plugin can tell the
 * difference. */
function journalledApp(app, journal) {
  const realVault = app.vault;
  const vault = {
    process: async (file, fn) => {
      await journal.capture(file);
      return realVault.process(file, fn);
    },
    create: async (path, data) => {
      const created = await realVault.create(path, data);
      journal.noteCreated(path);
      return created;
    },
    createFolder: async (path) => {
      const existed = !!realVault.getAbstractFileByPath(path);
      const folder = await realVault.createFolder(path);
      if (!existed) journal.noteCreated(path);
      return folder;
    },
    read: (f) => realVault.read(f),
    cachedRead: (f) => realVault.cachedRead(f),
    getAbstractFileByPath: (p) => realVault.getAbstractFileByPath(p),
    getMarkdownFiles: () => realVault.getMarkdownFiles(),
    getAllLoadedFiles: () => realVault.getAllLoadedFiles(),
    getRoot: () => realVault.getRoot(),
    trash: (f, sys) => realVault.trash(f, sys),
    getConfig: (k) => {
      var _a;
      return (_a = realVault.getConfig) == null ? void 0 : _a.call(realVault, k);
    }
  };
  const proxy = Object.create(app);
  proxy.vault = vault;
  return proxy;
}

// ----------------------------------------------------------------------
// src/tasksQuery.ts
// ----------------------------------------------------------------------
/* A filter engine over the Tasks plugin's parsed task list.
 *
 * WHY THIS EXISTS RATHER THAN CALLING TASKS' OWN QUERY ENGINE: the Tasks API does not
 * expose one. Its documentation states plainly under "Limitations of the Tasks API" that
 * "It is not yet possible to run Tasks searches via the API" (tracked as issue #2459,
 * open since 2023; issue #3142 asks specifically for the Query class to be exposed).
 * The public API is three methods: createTaskLineModal, editTaskLineModal and
 * executeToggleTaskDoneCommand.
 *
 * What IS reachable is `plugin.getTasks()` — a public method on the Tasks plugin object,
 * though absent from the documented API — returning fully parsed Task objects with
 * status, tags, priority, dates, dependsOn/id, and taskLocation. So the parsing is
 * Tasks', and only the filtering is ours.
 *
 * CONSEQUENCE, AND IT MATTERS: this is a re-implementation of a SUBSET of the Tasks query
 * language, not the language itself. Filters listed in QUERY_FILTER_HELP behave as
 * documented; anything else is reported as an error rather than silently ignored, so a
 * query never quietly matches the wrong set. Tasks may also change its language without
 * changing ours. */
var QUERY_FILTER_HELP = [
  "combine on one line with AND / OR / NOT / AND NOT / OR NOT / XOR, each filter in (), [], {} or \"\"",
  "done / not done",
  "is blocked / is not blocked",
  "tags include <tag> / tags do not include <tag>",
  "path includes <text> / path does not include <text>",
  "description includes <text> / description does not include <text>",
  "heading includes <text>",
  "has due date / no due date / not due",
  "due [before|after|on|on or before|on or after] <date>  (comparator optional)",
  "dates: YYYY-MM-DD, today, tomorrow, yesterday, in N days, N days ago, next week, last week",
  "has start date / no start date",
  "has scheduled date / no scheduled date",
  "starts / scheduled: same comparators and dates as due",
  "priority is [above|below] <none|low|medium|high|highest|lowest>",
  "exclude subitems",
  "limit <n>"
];
var PRIORITY_NAMES = { highest: 0, high: 1, medium: 2, none: 3, low: 4, lowest: 5 };

/** Resolve a date word to a YYYY-MM-DD string. `today` is resolved once per query run so
 * every comparison in a query sees the same day. */
function shiftDate(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Resolve a date word to YYYY-MM-DD, or null if unrecognised.
 *
 * Tasks runs dates through a natural-language parser; this understands a fixed, listed
 * vocabulary instead. Anything outside it is rejected with a clear error rather than
 * silently matching nothing, which is the failure mode that actually costs time. */
function resolveQueryDate(word, today) {
  const w = word.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return w;
  if (w === "today") return today;
  if (w === "tomorrow") return shiftDate(today, 1);
  if (w === "yesterday") return shiftDate(today, -1);
  let m;
  if ((m = w.match(/^in (\d+) days?$/))) return shiftDate(today, Number(m[1]));
  if ((m = w.match(/^(\d+) days? ago$/))) return shiftDate(today, -Number(m[1]));
  if (w === "next week") return shiftDate(today, 7);
  if (w === "last week") return shiftDate(today, -7);
  return null;
}
function taskDateString(task, field) {
  const v = task[field];
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (typeof v.format === "function") return v.format("YYYY-MM-DD");
  return null;
}
/** A task is blocked when something it depends on exists and is not yet done — the same
 * rule Tasks uses for `is blocked`. Unknown ids are ignored rather than treated as
 * blocking, so a deleted dependency does not strand a task forever. */
function isTaskBlocked(task, byId) {
  const deps = task.dependsOn || [];
  for (const id of deps) {
    const others = byId.get(id);
    if (!others) continue;
    for (const other of others) if (!isTaskDone(other)) return true;
  }
  return false;
}
function isTaskDone(task) {
  var _a, _b;
  const sym = (_b = (_a = task.status) == null ? void 0 : _a.symbol) != null ? _b : task.statusCharacter;
  return COMPLETED_STATUSES.has(sym);
}
function normaliseTag(t) {
  const s = String(t).trim().toLowerCase();
  return s.startsWith("#") ? s : "#" + s;
}

/** Compile ONE filter (no boolean operators) into a predicate, or null if unsupported. */
function compileSingleFilter(raw, today) {
  const line = raw.trim().toLowerCase();
  let m;
  if (line === "not done") return (t) => !isTaskDone(t);
  if (line === "done") return (t) => isTaskDone(t);
  if (line === "is blocked") return (t, c) => isTaskBlocked(t, c.byId);
  if (line === "is not blocked") return (t, c) => !isTaskBlocked(t, c.byId);
  if ((m = raw.trim().match(/^tags (include|includes|do not include|does not include) (.+)$/i))) {
    const want = normaliseTag(m[2]);
    const neg = /not/i.test(m[1]);
    return (t) => {
      const has = (t.tags || []).some((x) => normaliseTag(x) === want);
      return neg ? !has : has;
    };
  }
  if ((m = raw.trim().match(/^(path|description|heading) (includes|does not include) (.+)$/i))) {
    const field = m[1].toLowerCase();
    const needle = m[3].trim().toLowerCase();
    const neg = m[2].toLowerCase() !== "includes";
    return (t) => {
      var _a, _b, _c;
      let hay = "";
      if (field === "path") hay = (_a = t.taskLocation == null ? void 0 : t.taskLocation.path) != null ? _a : "";
      else if (field === "description") hay = (_b = t.description) != null ? _b : "";
      else hay = (_c = t.taskLocation == null ? void 0 : t.taskLocation.precedingHeader) != null ? _c : "";
      const has = String(hay).toLowerCase().includes(needle);
      return neg ? !has : has;
    };
  }
  if ((m = line.match(/^(has|no|not) (due|start|scheduled|done)( date)?$/))) {
    // "not due" and "no due date" both mean the field is absent.
    const field = { due: "dueDate", start: "startDate", scheduled: "scheduledDate", done: "doneDate" }[m[2]];
    const want = m[1] === "has";
    return (t) => (taskDateString(t, field) !== null) === want;
  }
  if ((m = line.match(/^(due|starts|scheduled|done)(?: (on or before|on or after|before|after|on))? (.+)$/))) {
    // The comparator is optional: bare "due today" means "due on today", as in Tasks.
    const field = { due: "dueDate", starts: "startDate", scheduled: "scheduledDate", done: "doneDate" }[m[1]];
    const when = resolveQueryDate(m[3], today);
    if (!when) return null;
    const op = m[2] || "on";
    return (t) => {
      const d = taskDateString(t, field);
      /* A START date exists to keep a task OUT of results until then — so a task with no
       * start date has nothing to wait for and must match, whatever the comparator. That
       * is Tasks' documented behaviour, and it is what makes "starts before tomorrow" the
       * native way to hide deferred work while keeping everything undated. Treating an
       * undated task as a non-match, as every other field does, silently dropped all of
       * them from any start-date query. Due, scheduled and done keep the ordinary rule. */
      if (d === null) return field === "startDate";
      if (op === "before") return d < when;
      if (op === "after") return d > when;
      if (op === "on or before") return d <= when;
      if (op === "on or after") return d >= when;
      return d === when;
    };
  }
  if ((m = line.match(/^priority is (above |below )?(none|low|medium|high|highest|lowest)$/))) {
    const target = PRIORITY_NAMES[m[2]];
    const mode = (m[1] || "").trim();
    return (t) => {
      // Tasks orders priority highest=0 .. lowest=5, so "above" is a SMALLER number.
      const p = Number(t.priority);
      if (!Number.isFinite(p)) return false;
      if (mode === "above") return p < target;
      if (mode === "below") return p > target;
      return p === target;
    };
  }
  return null;
}

/* ------------------------- boolean filter combination -------------------------
 * Tasks lets filters be combined on one line with AND / OR / NOT / AND NOT / OR NOT /
 * XOR, each sub-expression wrapped in one of four delimiter pairs. Faithfully
 * reproduced here from the Tasks documentation, including:
 *   - operator precedence NOT > XOR > AND > OR;
 *   - the four delimiter pairs (....) [....] {....} "...."  — one type per line, since
 *     mixing was made an error in Tasks 7.0.0;
 *   - operators are CASE-SENSITIVE and must be capitalised, so a task description
 *     containing the word "and" is never mistaken for an operator;
 *   - spaces around operators are optional (Tasks 7.0.0);
 *   - trailing backslash line continuations;
 *   - arbitrary nesting.
 * A sub-expression whose text ends with its own closing delimiter is rejected — the same
 * limitation Tasks documents, with the same remedy of choosing a different delimiter. */
var BOOLEAN_DELIMITERS = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ['"', '"'],
  // Obsidian's smart-typography setting rewrites straight quotes as curly ones, so a
  // query typed in a note can arrive with these. Accepted as a delimiter pair rather
  // than rewritten, so quote characters inside a filter's text are never altered.
  ["\u201C", "\u201D"]
];
/** Fold characters that are invisible or that look identical to ASCII but are not.
 *
 * Real queries are typed in notes and pasted from web pages, so they pick up
 * non-breaking spaces, zero-width joiners and full-width brackets. Every one of those
 * previously produced the same opaque "could not interpret" error, because a literal
 * space in a filter pattern does not match U+00A0. Only invisible or unambiguous
 * look-alike characters are touched; nothing that could be part of a search term. */
function normaliseQueryText(text) {
  return String(text == null ? "" : text)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, " ")
    .replace(/\uFF08/g, "(").replace(/\uFF09/g, ")")
    .replace(/\uFF3B/g, "[").replace(/\uFF3D/g, "]")
    .replace(/\uFF5B/g, "{").replace(/\uFF5D/g, "}");
}
/** Lowercase boolean keywords standing alone. Tasks requires operators to be capitalised
 * so ordinary prose is never treated as one; spotting the lowercase form lets us say so
 * instead of reporting a generic parse failure. */
function hasLowercaseOperator(line) {
  // Only meaningful when the line is SHAPED like a boolean combination — i.e. it has
  // delimited groups. Without that guard, "due on or before today" trips on the "or"
  // and gets told to capitalise an operator it never used.
  if (!BOOLEAN_DELIMITERS.some((d) => line.indexOf(d[0]) >= 0)) return false;
  return /(^|[^A-Za-z])(and not|or not|and|or|xor|not)([^A-Za-z]|$)/.test(line) &&
    !/(^|[^A-Za-z])(AND NOT|OR NOT|AND|OR|XOR|NOT)([^A-Za-z]|$)/.test(line);
}
var BOOLEAN_OPERATOR_RE = /^(AND NOT|OR NOT|AND|OR|XOR|NOT)(?![A-Za-z])/;

/** True if a line uses boolean combination at all. Operators must be capitalised and
 * stand alone, so ordinary prose in a filter cannot trigger this. */
function hasBooleanOperator(line) {
  // CAPITALISED operators only. That single rule separates "(a) OR (b)" — boolean intent,
  // even if the delimiters are missing — from "due on or before today", where the "or" is
  // lowercase and part of a comparator. Deliberately does NOT require a delimiter: a line
  // written as "tags include home OR tags include phone" is a mistake worth reporting,
  // not a tag search for "home OR tags include phone".
  return /(^|[^A-Za-z])(AND NOT|OR NOT|AND|OR|XOR|NOT)([^A-Za-z]|$)/.test(line);
}
/** Join lines ending with a trailing backslash, as Tasks' Line Continuations do. */
function joinLineContinuations(lines) {
  const out = [];
  let parts = null;
  const flush = () => {
    if (parts === null) return;
    // A line with no continuation is emitted verbatim: whitespace inside a filter can be
    // significant, so only the join points are normalised.
    out.push(parts.length === 1 ? parts[0] : parts.join(" "));
    parts = null;
  };
  for (const line of lines) {
    const cont = /\\\s*$/.test(line);
    const body = cont ? line.replace(/\\\s*$/, "").replace(/\s+$/, "") : line;
    if (parts === null) parts = [body];
    else parts.push(body.trim());
    if (!cont) flush();
  }
  flush();
  return out;
}
/** Split a string into delimited groups and operators at nesting depth zero.
 * Returns null when the text is unbalanced or has bare text outside delimiters. */
function tokenizeBoolean(text, open, close) {
  const tokens = [];
  const sameChar = open === close;
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    if (text[i] === open) {
      let j = i + 1;
      if (sameChar) {
        j = text.indexOf(close, i + 1);
        if (j < 0) return null;
      } else {
        let depth = 1;
        for (; j < text.length; j++) {
          if (text[j] === open) depth++;
          else if (text[j] === close) { depth--; if (depth === 0) break; }
        }
        if (depth !== 0) return null;
      }
      tokens.push({ type: "group", text: text.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const m = text.slice(i).match(BOOLEAN_OPERATOR_RE);
    if (m) { tokens.push({ type: "op", op: m[1] }); i += m[1].length; continue; }
    return null;
  }
  return tokens.length ? tokens : null;
}
/** Recursive-descent parse over the token list. Precedence: NOT > XOR > AND > OR. */
function parseBooleanTokens(tokens, delim, today) {
  let pos = 0;
  const peek = () => tokens[pos];
  const fail = (why) => { throw new Error(why); };

  const primary = () => {
    const tok = peek();
    if (!tok) fail("expression ended unexpectedly");
    if (tok.type !== "group") fail(`expected a filter in ${delim[0]}${delim[1]} but found "${tok.op}"`);
    pos++;
    return compileBooleanText(tok.text, delim, today);
  };
  const notExpr = () => {
    const tok = peek();
    if (tok && tok.type === "op" && tok.op === "NOT") {
      pos++;
      const inner = notExpr();
      return (t, c) => !inner(t, c);
    }
    return primary();
  };
  const binary = (nextLevel, ops) => {
    let left = nextLevel();
    for (; ; ) {
      const tok = peek();
      if (!tok || tok.type !== "op" || !ops.includes(tok.op)) return left;
      pos++;
      const negated = tok.op.endsWith(" NOT");
      const base = tok.op.split(" ")[0];
      const rightRaw = nextLevel();
      const right = negated ? (t, c) => !rightRaw(t, c) : rightRaw;
      const l = left;
      if (base === "XOR") left = (t, c) => l(t, c) !== right(t, c);
      else if (base === "AND") left = (t, c) => l(t, c) && right(t, c);
      else left = (t, c) => l(t, c) || right(t, c);
    }
  };
  const xorExpr = () => binary(notExpr, ["XOR"]);
  const andExpr = () => binary(xorExpr, ["AND", "AND NOT"]);
  const orExpr = () => binary(andExpr, ["OR", "OR NOT"]);

  const fn = orExpr();
  if (pos !== tokens.length) fail("unexpected trailing content");
  return fn;
}
/** Compile the inside of a delimiter pair: either a nested boolean expression or a leaf
 * filter. Throws on anything unsupported so the caller can report the whole line. */
function compileBooleanText(text, delim, today) {
  const tokens = tokenizeBoolean(text, delim[0], delim[1]);
  if (tokens) return parseBooleanTokens(tokens, delim, today);
  const leaf = compileSingleFilter(text, today);
  // Naming the sub-expression is the whole point: "could not interpret as a boolean
  // combination" is true of the line but useless for finding which part is wrong.
  if (!leaf) throw new Error(`unsupported filter "${text.trim()}"`);
  return leaf;
}
/** Parse a whole boolean line. Returns a predicate, or null if it cannot be parsed with
 * any single delimiter type. */
function compileBooleanLine(raw, today) {
  let firstReason = null;
  let sawDelimiter = false;
  for (const delim of BOOLEAN_DELIMITERS) {
    if (raw.indexOf(delim[0]) < 0) continue;
    sawDelimiter = true;
    const tokens = tokenizeBoolean(raw, delim[0], delim[1]);
    if (!tokens) {
      if (firstReason === null) {
        firstReason = `unbalanced ${delim[0]}${delim[1]}, or text outside them`;
      }
      continue;
    }
    try {
      return { fn: parseBooleanTokens(tokens, delim, today) };
    } catch (e) {
      if (firstReason === null) firstReason = e instanceof Error ? e.message : String(e);
    }
  }
  if (!sawDelimiter) {
    firstReason = `each filter must be wrapped in ${BOOLEAN_DELIMITERS.map((d) => d[0] + "..." + d[1]).join(" or ")}`;
  }
  return { error: firstReason || "could not be interpreted" };
}

/** Parse query text into predicates. One instruction per line (joined across trailing
 * backslashes); blank lines and `#` comments are skipped. Lines are combined with an
 * implicit AND, exactly as a Tasks query block does. Unrecognised lines become errors —
 * never silently dropped. */
function parseTasksQuery(text, today) {
  const filters = [];
  const errors = [];
  let limit = null;
  let excludeSubitems = false;
  const lines = joinLineContinuations(normaliseQueryText(text).split("\n"));
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n].trim();
    if (!raw || raw.startsWith("#")) continue;
    const line = raw.toLowerCase();
    let m;
    if (line === "exclude subitems") { excludeSubitems = true; continue; }
    if ((m = line.match(/^limit (?:to )?(\d+)(?: tasks?)?$/))) { limit = Number(m[1]); continue; }
    if (hasBooleanOperator(raw)) {
      const res = compileBooleanLine(raw, today);
      if (res.fn) filters.push(res.fn);
      else errors.push(`Line ${n + 1}: ${res.error} \u2014 in "${raw}"`);
      continue;
    }
    const single = compileSingleFilter(raw, today);
    if (single) { filters.push(single); continue; }
    if (hasLowercaseOperator(raw)) {
      errors.push(`Line ${n + 1}: boolean operators must be capitalised (AND, OR, NOT, XOR) \u2014 in "${raw}"`);
      continue;
    }
    errors.push(`Line ${n + 1}: unsupported filter "${raw}"`);
  }
  return { filters, errors, limit, excludeSubitems };
}

/** Run a parsed query over a task list. Returns matches in vault order plus any errors. */
function runTasksQuery(tasks, queryText, today) {
  const parsed = parseTasksQuery(queryText, today);
  const byId = /* @__PURE__ */ new Map();
  for (const t of tasks) {
    if (!t.id) continue;
    if (!byId.has(t.id)) byId.set(t.id, []);
    byId.get(t.id).push(t);
  }
  const ctx = { byId };
  let matched = tasks.filter((t) => parsed.filters.every((f) => f(t, ctx)));
  if (parsed.excludeSubitems) {
    matched = matched.filter((t) => !t.parent);
  }
  matched.sort((a, b) => {
    var _a, _b, _c, _d;
    const pa = (_b = (_a = a.taskLocation) == null ? void 0 : _a.path) != null ? _b : "";
    const pb = (_d = (_c = b.taskLocation) == null ? void 0 : _c.path) != null ? _d : "";
    if (pa !== pb) return pa.localeCompare(pb);
    return taskLineNumber(a) - taskLineNumber(b);
  });
  if (parsed.limit !== null) matched = matched.slice(0, parsed.limit);
  return { tasks: matched, errors: parsed.errors };
}
/** Replace the live offset map with a snapshot taken before a task ran. Mutates in place
 * so the closure over `offsets` in the review loop stays valid. */
/** Where `expected` actually sits now, given it was predicted at `predicted`.
 *
 * Returns `predicted` unchanged when the text already matches, or when the text cannot be
 * found at all — falling back to the old behaviour rather than guessing. With several
 * identical lines, the one nearest the prediction wins, which is what keeps a review of a
 * file full of repeated task text on the right one. */
function reanchorLine(lines, predicted, expected) {
  if (expected === void 0 || expected === null) return predicted;
  const want = String(expected).trim();
  if (!want) return predicted;
  if (predicted >= 0 && predicted < lines.length && lines[predicted].trim() === want) return predicted;
  let best = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== want) continue;
    if (best < 0 || Math.abs(i - predicted) < Math.abs(best - predicted)) best = i;
  }
  return best >= 0 ? best : predicted;
}
function restoreOffsets(live, snapshot) {
  live.clear();
  for (const [k, v] of snapshot) live.set(k, v);
}
function taskLineNumber(task) {
  var _a, _b;
  return (_b = (_a = task.taskLocation) == null ? void 0 : _a.lineNumber) != null ? _b : 0;
}
function taskPath(task) {
  var _a, _b;
  return (_b = (_a = task.taskLocation) == null ? void 0 : _a.path) != null ? _b : "";
}

// ----------------------------------------------------------------------
// src/taskSource.ts
// ----------------------------------------------------------------------
var COMPLETED_STATUSES = /* @__PURE__ */ new Set(["x", "X", "-"]);
/** Task source backed by a Tasks query, spanning the whole vault rather than one file.
 *
 * Emits items in exactly the shape ActiveFileTopLevelTaskSource emits, so every pipeline,
 * the undo journal and the rewind controls work unchanged.
 *
 * Two hazards that do not arise for a single file, both handled here:
 *
 * 1. NESTED MATCHES. A query can match both a task and one of its own subtasks. Acting on
 *    the ancestor moves or rewrites the descendant, so the descendant's recorded line is
 *    stale by the time it is reached. Descendants of an already-accepted match are
 *    therefore dropped — the ancestor's subtree covers them.
 *
 * 2. STALE CACHE. Tasks' cache is asynchronous and starts Cold. Collecting while it is
 *    still warming returns a partial list, so collect() waits for Warm, and line numbers
 *    are re-read from the file rather than trusted from the cache. */
var TasksQueryTaskSource = class {
  constructor(app, tasksApi, queryText, projectTag, hideTickled = false) {
    this.app = app;
    this.tasksApi = tasksApi;
    this.queryText = queryText;
    this.projectTag = projectTag;
    this.hideTickled = hideTickled;
    this.errors = [];
  }
  async collect() {
    var _a;
    const plugin = this.tasksApi.plugin();
    if (!plugin || typeof plugin.getTasks !== "function") {
      this.errors = ["The Tasks plugin is not available, or is too old to expose getTasks()."];
      return [];
    }
    await this.waitForWarmCache(plugin);
    const today = todayString();
    const result = runTasksQuery(plugin.getTasks(), this.queryText, today);
    const hideTickledHere = this.hideTickled && !queryMentionsStartDates(this.queryText);
    this.errors = result.errors;
    if (result.errors.length) return [];

    // Group by file so each file is read once, and so subtree ends can be computed.
    const byPath = /* @__PURE__ */ new Map();
    for (const t of result.tasks) {
      const path = taskPath(t);
      if (!path) continue;
      if (!byPath.has(path)) byPath.set(path, []);
      byPath.get(path).push(t);
    }
    const items = [];
    for (const [path, group] of byPath) {
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof obsidian.TFile)) continue;
      const lines = (await this.app.vault.cachedRead(file)).split("\n");
      group.sort((a, b) => taskLineNumber(a) - taskLineNumber(b));
      let coveredThrough = -1;
      for (const t of group) {
        const startLine = taskLineNumber(t);
        if (startLine < 0 || startLine >= lines.length) continue;
        // Hazard 1: skip anything already inside an accepted task's subtree.
        if (startLine <= coveredThrough) continue;
        const raw = (_a = lines[startLine]) != null ? _a : "";
        // Hazard 2: the cache may be a revision behind the file. If the line no longer
        // looks like the task we were given, skip it rather than edit the wrong line.
        if (!linesLookLikeSameTask(raw, t.originalMarkdown)) continue;
        // Deferred until later. Skipped only when the query does not mention start dates
        // itself: a query that asks about them — "starts after today", to look over what
        // is coming back — means to see deferred tasks and must not have them removed.
        if (hideTickledHere && isTickled(raw, today)) continue;
        const endLine = computeSubtreeEnd(lines, startLine);
        coveredThrough = endLine;
        items.push({
          file,
          startLine,
          endLine,
          raw,
          status: statusSymbolOf(t),
          isProject: lineHasTag(raw, this.projectTag),
          // Where this came from. A query spans the whole vault, so two tasks reading
          // "chase invoice" can be entirely different jobs; without the note and heading
          // there is no way to tell which one is on screen.
          sourceLabel: taskSourceLabel(t, path)
        });
      }
    }
    return items;
  }
  /** Tasks' cache starts Cold and fills asynchronously; querying too early silently
   * returns a short list. Bounded, so a cache that never warms degrades to whatever is
   * available rather than hanging the review. */
  async waitForWarmCache(plugin, timeoutMs = 3e3) {
    if (typeof plugin.getState !== "function") return;
    const deadline = Date.now() + timeoutMs;
    while (plugin.getState() !== "Warm" && Date.now() < deadline) {
      await new Promise((r) => window.setTimeout(r, 50));
    }
  }
};
/** Today as YYYY-MM-DD. Uses the moment instance Obsidian re-exports so the review agrees
 * with what Tasks itself considers "today" (including any locale offset), falling back to
 * the platform Date only if that is unavailable. */
function todayString() {
  try {
    if (typeof obsidian.moment === "function") return obsidian.moment().format("YYYY-MM-DD");
  } catch {
    // Fall back to the platform's date below.
  }
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
/** "Folder/Note > Heading" for a task, or just the note when it sits under no heading. */
function taskSourceLabel(task, path) {
  var _a, _b;
  const note = String(path).replace(/\.md$/i, "");
  const heading = (_b = (_a = task.taskLocation) == null ? void 0 : _a.precedingHeader) != null ? _b : null;
  return heading ? `${note} \u203A ${heading}` : note;
}
/** Does a query filter on start dates itself? If so it is asking about deferred tasks,
 * and silently dropping them would contradict what was asked for. */
function queryMentionsStartDates(text) {
  // A filter begins a line or follows an opening delimiter — never mid-phrase. Matching
  // after any space made a tag literally named "starts" count as a start-date filter.
  return /(^|[([{"\u201C])\s*(starts|has start|no start|not start)\b/im.test(String(text || ""));
}
function statusSymbolOf(task) {
  var _a, _b, _c;
  return (_c = (_b = (_a = task.status) == null ? void 0 : _a.symbol) != null ? _b : task.statusCharacter) != null ? _c : " ";
}
/** Compare a file line against the markdown Tasks recorded for it, ignoring indentation
 * and trailing whitespace. Exact equality is too strict — Tasks stores the line without
 * the leading indent in some versions. */
function linesLookLikeSameTask(fileLine, taskMarkdown) {
  if (!taskMarkdown) return true;
  return fileLine.trim() === String(taskMarkdown).trim();
}
var ActiveFileTopLevelTaskSource = class {
  constructor(app, file, projectTag, hideTickled = false) {
    this.app = app;
    this.file = file;
    this.projectTag = projectTag;
    this.hideTickled = hideTickled;
  }
  async collect() {
    var _a, _b;
    const cache = this.app.metadataCache.getFileCache(this.file);
    const content = await this.app.vault.cachedRead(this.file);
    const lines = content.split("\n");
    const items = [];
    const listItems = ((_a = cache == null ? void 0 : cache.listItems) != null ? _a : []).slice().sort((a, b) => a.position.start.line - b.position.start.line);
    /* A task's block is measured by indentation (computeSubtreeEnd), but "top-level" comes
     * from Obsidian's own list parsing, and the two can disagree: a task indented by one
     * space, say, or under a numbered project with two-space children, is top-level to the
     * parser yet inside the project's indented block. Reviewed on its own, it was moved
     * away with the project first — and the review then showed whatever line had taken its
     * place. So, as for a query, anything inside an accepted task's block belongs to it. */
    let coveredThrough = -1;
    for (let i = 0; i < listItems.length; i++) {
      const li = listItems[i];
      if (li.task === void 0) continue;
      if (COMPLETED_STATUSES.has(li.task)) continue;
      const isTopLevel = li.parent < 0;
      if (!isTopLevel) continue;
      const startLine = li.position.start.line;
      if (startLine <= coveredThrough) continue;
      const raw = (_b = lines[startLine]) != null ? _b : "";
      // The cache can be a revision behind the note: if its line isn't an open task now,
      // leave it out rather than review whatever line is there.
      if (!isTaskLine(raw) || COMPLETED_STATUSES.has(taskStatusOf(raw))) continue;
      const endLine = computeSubtreeEnd(lines, startLine);
      coveredThrough = endLine;
      // Deferred until a later date: out of this review, back by itself when it is due.
      if (this.hideTickled && isTickled(raw, todayString())) continue;
      items.push({
        file: this.file,
        startLine,
        endLine,
        raw,
        status: li.task,
        isProject: lineHasTag(raw, this.projectTag)
      });
    }
    return items;
  }
};
/** Line indices of every ancestor of `startLine`, outermost first.
 *
 * The mirror of computeSubtreeEnd: that walks DOWN to find what a task owns, this walks
 * UP to find what owns the task. Needed because a query can surface a subtask whose
 * ancestors did not themselves match, and a bare subtask out of context — "call them
 * back" with no sign of which project it belongs to — is close to useless to decide on.
 *
 * Walks by indentation rather than following Tasks' parent links, so the chain reflects
 * the file as it is now, including any edits made earlier in this review. Blank lines are
 * skipped; a shallower non-task line (a bullet, say) is still a legitimate ancestor and
 * is included, because it is part of where the task lives. */
function computeAncestorLines(lines, startLine) {
  var _a;
  const out = [];
  let indent = indentOf((_a = lines[startLine]) != null ? _a : "");
  for (let i = startLine - 1; i >= 0 && indent > 0; i--) {
    const text = lines[i];
    if (text === void 0 || text.trim() === "") continue;
    const ind = indentOf(text);
    if (ind < indent) {
      out.unshift(i);
      indent = ind;
    }
  }
  return out;
}
function computeSubtreeEnd(lines, startLine) {
  var _a, _b;
  const baseIndent = indentOf((_a = lines[startLine]) != null ? _a : "");
  let end = startLine;
  for (let i = startLine + 1; i < lines.length; i++) {
    const text = lines[i];
    if (text.trim() === "") {
      end = i;
      continue;
    }
    if (indentOf(text) > baseIndent) {
      end = i;
    } else {
      break;
    }
  }
  while (end > startLine && ((_b = lines[end]) != null ? _b : "").trim() === "") end--;
  return end;
}
function indentOf(line) {
  const m = line.match(/^[\t ]*/);
  if (!m) return 0;
  return m[0].replace(/\t/g, "    ").length;
}
function lineHasTag(line, tag) {
  if (!tag) return false;
  const re = new RegExp(`(^|\\s)#${escapeRegExp(tag)}(\\b|$)`);
  return re.test(line);
}
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ----------------------------------------------------------------------
// src/fileOps.ts
// ----------------------------------------------------------------------
var TASKS_SIGNIFIERS = [
  "\u{1F4C5}",
  // 📅 due
  "\u23F3",
  // ⏳ scheduled
  "\u{1F6EB}",
  // 🛫 start
  "\u2795",
  // ➕ created
  "\u2705",
  // ✅ done
  "\u274C",
  // ❌ cancelled
  "\u{1F501}",
  // 🔁 recurrence
  "\u{1F53A}",
  "\u23EB",
  "\u{1F53C}",
  "\u{1F53D}",
  "\u23EC",
  // priorities
  "\u{1F194}",
  "\u26D4"
  // 🆔 / ⛔ dependencies
];
var PRIORITY_SIGNIFIERS = ["\u{1F53A}", "⏫", "\u{1F53C}", "\u{1F53D}", "⏬"];
/** Where a task's own words end: at the first Tasks field, or at a block id (`^abc`) that
 * ends the line, so nothing is ever written after a block id and its links keep working. */
function descriptionEnd(line) {
  let cut = line.length;
  for (const sig of TASKS_SIGNIFIERS) {
    const idx = line.indexOf(sig);
    if (idx !== -1 && idx < cut) cut = idx;
  }
  const block = line.match(/\s\^[A-Za-z0-9-]+\s*$/);
  if (block && block.index < cut) cut = block.index;
  return cut;
}
/** True if the line carries exactly this tag. Obsidian matches tags without regard to case,
 * and #home is not #homework or #home/kitchen. */
function hasExactTag(line, tag) {
  const name = String(tag || "").trim().replace(/^#/, "");
  if (!name) return false;
  return new RegExp(`(^|\\s)#${escapeRegExp(name)}(?=$|[^\\p{L}\\p{N}_/-])`, "iu").test(line);
}
/** The labels at the end of a task's words, lower-cased: tags, and any word in `known`.
 * Organise writes labels there, so a plain-text label only counts as present in that run —
 * "long" in "Write a long letter" is part of the wording, not a duration. The first word
 * is never a label: it is the task. */
function trailingLabels(line, known) {
  const words = line.slice(0, descriptionEnd(line)).replace(/^\s*[-*+]\s+\[.\]\s*/, "").trim().split(/\s+/).filter(Boolean);
  const run = new Set();
  for (let i = words.length - 1; i >= 1; i--) {
    const w = words[i].toLowerCase();
    if (!w.startsWith("#") && !known.has(w)) break;
    run.add(w);
  }
  return run;
}
/** True if the line already has one of this dimension's labels — Organise then does not
 * ask, rather than adding a second context next to the first (or the same one twice). */
function dimensionAlreadySet(dim, line, run) {
  return (dim.values || []).some((v) => {
    var _a;
    const value = String(v.value || "").trim();
    if (!value) return false;
    if (((_a = v.format) != null ? _a : dim.defaultFormat) === "tag") return hasExactTag(line, value);
    return value.toLowerCase().split(/\s+/).every((w) => run.has(w));
  });
}
/** Every word of every plain-text label, so trailingLabels can tell labels from wording. */
function textLabelWords(dimensions) {
  const words = new Set();
  for (const dim of dimensions || []) {
    for (const v of dim.values || []) {
      var _a;
      if (((_a = v.format) != null ? _a : dim.defaultFormat) === "tag") continue;
      for (const w of String(v.value || "").toLowerCase().split(/\s+/)) if (w) words.add(w);
    }
  }
  return words;
}
function insertBeforeTasksMetadata(line, tokens) {
  // A tag the line already has is not written again: "#home #home" helps no filter.
  tokens = tokens.filter((t) => !(String(t).startsWith("#") && hasExactTag(line, t)));
  if (tokens.length === 0) return line;
  const insertion = " " + tokens.join(" ");
  const cut = descriptionEnd(line);
  const head = line.slice(0, cut).replace(/\s+$/, "");
  const tail = line.slice(cut);
  return `${head}${insertion}${tail ? " " + tail.replace(/^\s+/, "") : ""}`;
}
function formatToken(value, format) {
  return format === "tag" ? `#${value}` : value;
}
function getIndentUnit(app) {
  var _a, _b;
  const v = app.vault;
  const useTab = (_a = v.getConfig) == null ? void 0 : _a.call(v, "useTab");
  const tabSize = (_b = v.getConfig) == null ? void 0 : _b.call(v, "tabSize");
  return useTab ? "	" : " ".repeat(typeof tabSize === "number" && tabSize > 0 ? tabSize : 4);
}
async function readLine(app, file, line) {
  const lines = (await app.vault.read(file)).split("\n");
  return line >= 0 && line < lines.length ? lines[line] : null;
}
async function lineCount(app, file) {
  return (await app.vault.read(file)).split("\n").length;
}
async function replaceLine(app, file, line, newText) {
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    if (line < 0 || line >= lines.length) return data;
    lines[line] = newText;
    return lines.join("\n");
  });
}
async function insertLineAfter(app, file, afterLine, text) {
  let at = afterLine + 1;
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    at = Math.min(Math.max(afterLine + 1, 0), lines.length);
    lines.splice(at, 0, text);
    return lines.join("\n");
  });
  return at;
}
async function indentRange(app, file, startLine, endLine, indent) {
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      if (lines[i].trim() !== "") lines[i] = indent + lines[i];
    }
    return lines.join("\n");
  });
}
async function getChildTaskLines(app, file, startLine, endLine) {
  const lines = (await app.vault.read(file)).split("\n");
  const out = [];
  for (let i = startLine + 1; i <= endLine && i < lines.length; i++) {
    const m = lines[i].match(/^\s*[-*+]\s+\[(.)\]\s/);
    if (m && !COMPLETED_STATUSES.has(m[1])) out.push({ line: i, raw: lines[i] });
  }
  return out;
}
async function appendToNote(app, path, block) {
  const file = await ensureNote(app, path);
  await app.vault.process(file, (data) => {
    const sep = data.length === 0 || data.endsWith("\n") ? "" : "\n";
    return `${data}${sep}${block}
`;
  });
}
async function insertBlockAtPlaceholder(app, path, block, placeholder) {
  const token = placeholder.trim();
  if (!token) {
    await appendToNote(app, path, block);
    return false;
  }
  const file = await ensureNote(app, path);
  let used = false;
  await app.vault.process(file, (data) => {
    const idx = data.indexOf(token);
    if (idx === -1) {
      const sep = data.length === 0 || data.endsWith("\n") ? "" : "\n";
      return `${data}${sep}${block}
`;
    }
    used = true;
    return data.slice(0, idx) + block + data.slice(idx + token.length);
  });
  return used;
}
/** Project task lines in a file that `item` could legitimately be nested under.
 *
 * Excludes the task itself and everything inside its own subtree — a task cannot become a
 * child of its own descendant — and completed projects, which are not somewhere to file
 * new work. */
async function findProjectLines(app, file, projectTag, excludeStart, excludeEnd) {
  const lines = (await app.vault.read(file)).split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (i >= excludeStart && i <= excludeEnd) continue;
    if (!isTaskLine(lines[i])) continue;
    if (COMPLETED_STATUSES.has(taskStatusOf(lines[i]))) continue;
    if (!lineHasTag(lines[i], projectTag)) continue;
    out.push({ line: i, raw: lines[i], label: projectPickerLabel(lines[i]) });
  }
  return out;
}
function projectPickerLabel(raw) {
  const text = deTaskLine(raw).trim().replace(/\s+/g, " ");
  return text.length > 60 ? text.slice(0, 59) + "\u2026" : text;
}
/** Open projects in every note but `excludePath`: { file, line, raw, label }.
 *
 * Found from Obsidian's index of tags, so only notes that have the project tag are read.
 * A note the index hasn't reached yet is read and checked line by line instead. */
async function findProjectsElsewhere(app, projectTag, excludePath) {
  const want = `#${String(projectTag || "").replace(/^#/, "")}`.toLowerCase();
  const out = [];
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.path === excludePath) continue;
    const cache = app.metadataCache && app.metadataCache.getFileCache ? app.metadataCache.getFileCache(file) : null;
    let candidates = null;
    if (cache) {
      candidates = (cache.tags || []).filter((t) => String(t.tag || "").toLowerCase() === want).map((t) => t.position.start.line);
      if (!candidates.length) continue;
    }
    let lines;
    try {
      lines = (await app.vault.cachedRead(file)).split("\n");
    } catch {
      continue;
    }
    const at = candidates ? [...new Set(candidates)].sort((a, b) => a - b) : lines.map((_, i) => i);
    for (const n of at) {
      const raw = lines[n];
      if (raw == null || !isTaskLine(raw) || COMPLETED_STATUSES.has(taskStatusOf(raw))) continue;
      if (!lineHasTag(raw, projectTag)) continue;
      out.push({ file, line: n, raw, label: projectPickerLabel(raw) });
    }
  }
  return out;
}
/** Move a subtree out of its note to be the last step of a project in another note.
 *
 * The project is found again by its text first — the note may have changed since the list
 * was made — and nothing is written if it has gone. The step is added before it is removed
 * from where it was, so a failure part-way leaves a copy rather than nothing. Returns the
 * step's line in the project's note, or -1. */
async function moveSubtreeToProjectIn(app, source, startLine, endLine, project, indentUnit) {
  const block = (await app.vault.read(source)).split("\n").slice(startLine, endLine + 1);
  if (!block.length) return -1;
  const rootIndent = (block[0].match(/^[\t ]*/) || [""])[0];
  let newStart = -1;
  await app.vault.process(project.file, (data) => {
    const lines = data.split("\n");
    const at = locateByText(lines, project.line, project.raw);
    if (at < 0) return data;
    const base = (lines[at].match(/^[\t ]*/) || [""])[0] + indentUnit;
    const rebased = block.map((l) => {
      if (l.trim() === "") return "";
      return base + (l.startsWith(rootIndent) ? l.slice(rootIndent.length) : l.replace(/^[\t ]*/, ""));
    });
    newStart = computeSubtreeEnd(lines, at) + 1;
    lines.splice(newStart, 0, ...rebased);
    return lines.join("\n");
  });
  if (newStart < 0) return -1;
  await app.vault.process(source, (data) => {
    const cur = data.split("\n");
    cur.splice(startLine, endLine - startLine + 1);
    return cur.join("\n");
  });
  return newStart;
}
/** Which project a step belongs to. This note's projects are listed by name; projects in
 * other notes are found with a search, each shown with the note it is in, so the two are
 * never mixed up. Returns "__new__", the line of a project in this note, or "__filed__"
 * once a step has been filed in another note. */
async function chooseStepProject(ctx, item, existingProjects) {
  const { prompter } = ctx;
  const here = ctx.sourceKind === "query" ? `In ${item.file.basename}` : "In this note";
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    const target = await prompter.choice("**Which project** is it a step in?", [
      { label: "Create a **new** project\u2026", value: "__new__" },
      // Second, every time: its number doesn't depend on how many projects this note has.
      { label: "**Search** projects\u2026", value: "__elsewhere__", group: "In other notes" },
      ...existingProjects.map((p) => ({ label: p.label, value: String(p.line), group: here }))
    ]);
    if (target !== "__elsewhere__") return target;
    const projects = await findProjectsElsewhere(ctx.app, ctx.settings.projectTag, item.file.path);
    if (!projects.length) {
      prompter.info("No open projects in other notes.");
      continue;
    }
    const picked = typeof prompter.suggestProject === "function" ? await prompter.suggestProject(projects) : null;
    // Dismissed: back to this question, not on to the next task.
    if (!picked) continue;
    if (await fileStepElsewhere(ctx, item, picked)) return "__filed__";
    prompter.info("That project has changed since it was listed \u2014 pick it again.");
  }
  throw new ReviewControl("retry");
}
/** File a step under a project in another note, then label it there and then.
 *
 * Labelled now because nothing later will reach it: Organise on this note no longer has
 * it, and the project it joined is already organised. It has left this review, as a task
 * sent to Someday has. */
async function fileStepElsewhere(ctx, item, project) {
  const moved = await moveSubtreeToProjectIn(ctx.app, item.file, item.startLine, item.endLine, project, getIndentUnit(ctx.app));
  if (moved < 0) return false;
  item.disposed = true;
  item.outcome = "step";
  const lines = (await ctx.app.vault.read(project.file)).split("\n");
  const at = locateByText(lines, project.line, project.raw);
  const where = { file: project.file, raw: at >= 0 ? lines[at] : project.raw };
  item.movedElsewhere = { file: project.file, line: moved, raw: lines[moved] };
  const show = (raw) => {
    if (ctx.prompter.highlightInSource) {
      ctx.prompter.highlightInSource({
        file: project.file, startLine: moved, endLine: moved, raw, parentRaw: where.raw,
        sourceLabel: project.file.basename
      });
    }
  };
  const batchMark = Array.isArray(ctx.quickBatch) ? ctx.quickBatch.length : 0;
  const rewritten = await clarifyFiledAction(ctx, project.file, moved, project.file.basename);
  const raw = rewritten || await readLine(ctx.app, project.file, moved);
  if (raw != null && isTaskLine(raw)) {
    show(raw);
    await organiseLine(ctx, project.file, moved, raw);
    item.movedElsewhere.raw = await readLine(ctx.app, project.file, moved);
    // Put in the two-minute batch just now: the batch finds a task by its words, and
    // labelling has just changed them.
    if (Array.isArray(ctx.quickBatch)) {
      for (const entry of ctx.quickBatch.slice(batchMark)) {
        if (entry.file && entry.file.path === project.file.path && entry.line === moved) entry.raw = item.movedElsewhere.raw;
      }
    }
  }
  ctx.prompter.info(`Filed under \u201c${projectPickerLabel(where.raw)}\u201d in ${project.file.basename}.`);
  return true;
}
/** Move a subtree so it becomes the last child of `projectLine`, in the same file.
 *
 * Done as ONE read-modify-write over a single array. Removing the block shifts every line
 * below it, so computing the insertion point against the original numbering — the obvious
 * two-step version — puts the task in the wrong place whenever the project sits below it.
 * Splicing out first and re-deriving the target inside the modified array removes that
 * ordering hazard entirely.
 *
 * Relative nesting within the moved block is preserved: each line keeps its depth
 * relative to the block's root, which is re-based to one indent under the project. */
async function moveSubtreeUnderProject(app, file, startLine, endLine, projectLine, indentUnit) {
  let newStart = startLine;
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    const block = lines.slice(startLine, endLine + 1);
    const rootIndent = (block[0].match(/^[\t ]*/) || [""])[0];
    lines.splice(startLine, block.length);
    // The project's own line index only moves if it sat below the block.
    const target = projectLine > endLine ? projectLine - block.length : projectLine;
    const targetIndent = (lines[target].match(/^[\t ]*/) || [""])[0];
    const base = targetIndent + indentUnit;
    const rebased = block.map((l) => {
      if (l.trim() === "") return "";
      const body = l.startsWith(rootIndent) ? l.slice(rootIndent.length) : l.replace(/^[\t ]*/, "");
      return base + body;
    });
    const insertAt = computeSubtreeEnd(lines, target) + 1;
    lines.splice(insertAt, 0, ...rebased);
    newStart = insertAt;
    return lines.join("\n");
  });
  return newStart;
}
/* ------------------------------ Headings in a note ------------------------------
 * A note's headings work as lists within it, so Organise can file a task under one without
 * it leaving the note. ATX headings only ("## Calls"); a "#" in front-matter, in a fenced
 * code block, or with no space after it (a tag) is not one. */
var HEADING_RE = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
/** Every heading in `lines`: { line, level, text, path }, where `path` is the heading with
 * the ones it sits under ("Work \u203A Calls"), so two headings of the same name can be
 * told apart. */
function noteHeadings(lines) {
  const out = [];
  const stack = [];
  let fence = null;
  let i = 0;
  if ((lines[0] || "").trim() === "---") {
    for (i = 1; i < lines.length && lines[i].trim() !== "---"; i++) ;
    i++;
  }
  for (; i < lines.length; i++) {
    const line = lines[i];
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (fence) continue;
    const m = line.match(HEADING_RE);
    if (!m || !m[2].trim()) continue;
    const level = m[1].length;
    const text = m[2].trim();
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    stack.push({ level, text });
    out.push({ line: i, level, text, path: stack.map((h) => h.text).join(" \u203A ") });
  }
  return out;
}
/** The heading a line currently sits under, or null if it is above the first one. */
function headingAbove(headings, line) {
  let found = null;
  for (const h of headings) {
    if (h.line < line) found = h;
    else break;
  }
  return found;
}
/** Move a subtree to the end of a heading's own content, in the same note.
 *
 * "Own content" stops at the next heading of ANY level: filing under "## Work" must not
 * land the task beneath "### Calls" inside it, which is where the end of Work's whole
 * section would put it. Trailing blank lines are stepped over, so the gap before the next
 * heading is kept.
 *
 * One read-modify-write, for the same reason as moving under a project: removing the block
 * shifts everything below it, so the heading is found again inside the modified copy. The
 * block is re-based to the left margin, keeping its own nesting. Returns the new start line,
 * or -1 if the heading is no longer where it was, in which case nothing is written. */
async function moveSubtreeUnderHeading(app, file, startLine, endLine, headingLine) {
  let newStart = -1;
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    const headingText = lines[headingLine];
    if (headingText === void 0 || !HEADING_RE.test(headingText)) return data;
    if (headingLine >= startLine && headingLine <= endLine) return data;
    const block = lines.slice(startLine, endLine + 1);
    const rootIndent = (block[0].match(/^[\t ]*/) || [""])[0];
    const rebased = block.map((l) => {
      if (l.trim() === "") return "";
      return l.startsWith(rootIndent) ? l.slice(rootIndent.length) : l.replace(/^[\t ]*/, "");
    });
    lines.splice(startLine, block.length);
    const target = headingLine > endLine ? headingLine - block.length : headingLine;
    const next = noteHeadings(lines).find((h) => h.line > target);
    let at = (next ? next.line : lines.length) - 1;
    while (at > target && lines[at].trim() === "") at--;
    lines.splice(at + 1, 0, ...rebased);
    newStart = at + 1;
    return lines.join("\n");
  });
  return newStart;
}
async function moveSubtree(app, source, startLine, endLine, targetPath, placeholder) {
  const lines = (await app.vault.read(source)).split("\n");
  const block = lines.slice(startLine, endLine + 1).join("\n");
  let usedPlaceholder = false;
  if (placeholder && placeholder.trim()) {
    usedPlaceholder = await insertBlockAtPlaceholder(app, targetPath, block, placeholder);
  } else {
    await appendToNote(app, targetPath, block);
  }
  await app.vault.process(source, (data) => {
    const cur = data.split("\n");
    cur.splice(startLine, endLine - startLine + 1);
    return cur.join("\n");
  });
  return usedPlaceholder;
}
/** Rewrite the status character of a task line, preserving indentation, list marker and
 * everything after the checkbox. Returns null if the line is not a task. */
function setTaskStatus(line, symbol) {
  const m = line.match(/^(\s*(?:[-*+]|\d+[.)])\s+\[)(.)(\]\s?)([\s\S]*)$/);
  if (!m) return null;
  return `${m[1]}${symbol}${m[3]}${m[4]}`;
}
async function removeSubtree(app, file, startLine, endLine) {
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    lines.splice(startLine, endLine - startLine + 1);
    return lines.join("\n");
  });
}
async function createNoteFromTemplate(app, folder, name, templatePath, fallbackBody) {
  const cleanName = name.replace(/[\\/:*?"<>|]/g, "").trim() || "Untitled";
  const dir = (0, obsidian.normalizePath)(folder || "");
  if (dir && !app.vault.getAbstractFileByPath(dir)) {
    await app.vault.createFolder(dir).catch(() => void 0);
  }
  let body = fallbackBody;
  if (templatePath) {
    const tpl = app.vault.getAbstractFileByPath((0, obsidian.normalizePath)(templatePath));
    if (tpl instanceof obsidian.TFile) {
      body = await app.vault.read(tpl);
    }
  }
  const path = (0, obsidian.normalizePath)(dir ? `${dir}/${cleanName}.md` : `${cleanName}.md`);
  return app.vault.create(path, body);
}
async function ensureNote(app, path) {
  const p = (0, obsidian.normalizePath)(path);
  const existing = app.vault.getAbstractFileByPath(p);
  if (existing instanceof obsidian.TFile) return existing;
  const slash = p.lastIndexOf("/");
  if (slash > 0) {
    const dir = p.slice(0, slash);
    if (!app.vault.getAbstractFileByPath(dir)) {
      await app.vault.createFolder(dir).catch(() => void 0);
    }
  }
  return app.vault.create(p, "");
}
function deTaskLine(line) {
  const text = line.replace(/^\s*[-*+]\s+\[.\]\s+/, "");
  let cut = text.length;
  for (const sig of TASKS_SIGNIFIERS) {
    const idx = text.indexOf(sig);
    if (idx !== -1 && idx < cut) cut = idx;
  }
  return text.slice(0, cut).trim();
}

// ----------------------------------------------------------------------
// src/templates.ts
// ----------------------------------------------------------------------
var TEMPLATER_ID = "templater-obsidian";
var CORE_TEMPLATES_ID = "templates";
function templaterInstance(app) {
  var _a, _b, _c;
  return (_c = (_b = (_a = app.plugins) == null ? void 0 : _a.plugins) == null ? void 0 : _b[TEMPLATER_ID]) == null ? void 0 : _c.templater;
}
function templaterEnabled(app) {
  var _a;
  return typeof ((_a = templaterInstance(app)) == null ? void 0 : _a.create_new_note_from_template) === "function";
}
function coreTemplates(app) {
  var _a, _b, _c;
  const ip = app.internalPlugins;
  return (_c = (_a = ip == null ? void 0 : ip.getPluginById) == null ? void 0 : _a.call(ip, CORE_TEMPLATES_ID)) != null ? _c : (_b = ip == null ? void 0 : ip.plugins) == null ? void 0 : _b[CORE_TEMPLATES_ID];
}
function coreTemplatesEnabled(app) {
  var _a;
  const p = coreTemplates(app);
  return !!(p && ((_a = p.enabled) != null ? _a : true) && p.instance);
}
function coreTemplatesOptions(app) {
  var _a, _b, _c;
  return (_c = (_b = (_a = coreTemplates(app)) == null ? void 0 : _a.instance) == null ? void 0 : _b.options) != null ? _c : {};
}
function getTemplateFolder(app, settings) {
  var _a, _b, _c, _d, _e;
  const override = (_a = settings.templateFolder) == null ? void 0 : _a.trim();
  if (override) return (0, obsidian.normalizePath)(override);
  const templaterFolder = (_e = (_d = (_c = (_b = app.plugins) == null ? void 0 : _b.plugins) == null ? void 0 : _c[TEMPLATER_ID]) == null ? void 0 : _d.settings) == null ? void 0 : _e.templates_folder;
  if (templaterFolder && String(templaterFolder).trim()) return (0, obsidian.normalizePath)(String(templaterFolder).trim());
  const coreFolder = coreTemplatesOptions(app).folder;
  if (coreFolder && String(coreFolder).trim()) return (0, obsidian.normalizePath)(String(coreFolder).trim());
  return null;
}
function getTemplateFiles(app, settings) {
  const folder = getTemplateFolder(app, settings);
  const all = app.vault.getMarkdownFiles();
  if (!folder) return all;
  const prefix = folder.endsWith("/") ? folder : folder + "/";
  const scoped = all.filter((f) => f.path === folder || f.path.startsWith(prefix));
  return scoped.length ? scoped : all;
}
function resolveEngine(app, engine) {
  switch (engine) {
    case "templater":
      return templaterEnabled(app) ? "templater" : "copy";
    case "core":
      return "core";
    // substitution is self-contained; the plugin need not be enabled
    case "copy":
      return "copy";
    default:
      if (templaterEnabled(app)) return "templater";
      if (coreTemplatesEnabled(app)) return "core";
      return "copy";
  }
}
function formatNow(app, kind, explicit) {
  const opts = coreTemplatesOptions(app);
  const fallback = kind === "date" ? "YYYY-MM-DD" : "HH:mm";
  const fmt = explicit && explicit.length ? explicit : (kind === "date" ? opts.dateFormat : opts.timeFormat) || fallback;
  try {
    return (0, obsidian.moment)().format(fmt);
  } catch {
    return (0, obsidian.moment)().format(fallback);
  }
}
function applyCoreTemplateSyntax(app, content, title) {
  return content.replace(/{{\s*title\s*}}/gi, title).replace(/{{\s*date\s*(?::\s*([^}]+?))?\s*}}/gi, (_m, f) => formatNow(app, "date", (f != null ? f : "").trim())).replace(/{{\s*time\s*(?::\s*([^}]+?))?\s*}}/gi, (_m, f) => formatNow(app, "time", (f != null ? f : "").trim()));
}
function sanitizeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "").trim() || "Untitled";
}
async function ensureFolder(app, dir) {
  const d = (0, obsidian.normalizePath)(dir || "");
  if (d && !app.vault.getAbstractFileByPath(d)) {
    await app.vault.createFolder(d).catch(() => void 0);
  }
}
function uniquePath(app, dir, rawName) {
  const folder = (0, obsidian.normalizePath)(dir || "");
  const base = sanitizeName(rawName);
  const make = (n) => (0, obsidian.normalizePath)(folder ? `${folder}/${n}.md` : `${n}.md`);
  let name = base;
  let i = 1;
  while (app.vault.getAbstractFileByPath(make(name))) name = `${base} ${++i}`;
  return make(name);
}
function newestMarkdownWithBasename(app, basename) {
  const matches = app.vault.getMarkdownFiles().filter((f) => f.basename === basename);
  if (!matches.length) return null;
  return matches.sort((a, b) => {
    var _a, _b, _c, _d;
    return ((_b = (_a = b.stat) == null ? void 0 : _a.mtime) != null ? _b : 0) - ((_d = (_c = a.stat) == null ? void 0 : _c.mtime) != null ? _d : 0);
  })[0];
}
async function runTemplateIntoNote(app, settings, opts) {
  const engine = resolveEngine(app, settings.templateEngine);
  await ensureFolder(app, opts.folder);
  if (engine === "templater") {
    const created = await tryTemplater(app, opts);
    if (created) return created;
  }
  const raw = await app.vault.read(opts.template);
  const body = engine === "core" ? applyCoreTemplateSyntax(app, raw, sanitizeName(opts.name)) : raw;
  const path = uniquePath(app, opts.folder, opts.name);
  return app.vault.create(path, body);
}
async function tryTemplater(app, opts) {
  var _a;
  const tp = templaterInstance(app);
  if (typeof (tp == null ? void 0 : tp.create_new_note_from_template) !== "function") return null;
  const clean = sanitizeName(opts.name);
  const folderArg = opts.folder ? (_a = app.vault.getAbstractFileByPath((0, obsidian.normalizePath)(opts.folder))) != null ? _a : app.vault.getRoot() : app.vault.getRoot();
  try {
    const res = await tp.create_new_note_from_template(opts.template, folderArg, clean, false);
    if (res instanceof obsidian.TFile) return res;
    const expected = app.vault.getAbstractFileByPath(
      (0, obsidian.normalizePath)((opts.folder ? opts.folder + "/" : "") + clean + ".md")
    );
    if (expected instanceof obsidian.TFile) return expected;
    return newestMarkdownWithBasename(app, clean);
  } catch (e) {
    console.warn(`${PLUGIN_NAME}: Templater note creation failed; falling back to a copy.`, e);
    return null;
  }
}

// ----------------------------------------------------------------------
// src/pipelines.ts
// ----------------------------------------------------------------------
var PRIORITY_OPTIONS = [
  { label: "Highest", value: "highest" },
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
  { label: "Lowest", value: "lowest" }
];
/** Open the Tasks editor on a task line, apply `tokens`, and write the result once.
 *
 * Prefers the API's editTaskLineModal, which returns the edited markdown and so never
 * needs a read-back. Falls back to the command + read-back path on Tasks versions without
 * it, where the read is retried briefly: after the modal closes the editor still has to
 * flush to disk, and the pre-edit text is what a read sees until it does.
 *
 * Returns the written line, or null if the user cancelled. */
/** Await a Tasks-plugin modal while the pane's nav buttons stay live.
 *
 * Every await on the Tasks API goes through here. Anything that opens a window we do not
 * control is somewhere the review can get stuck, and the fix has to be applied at all of
 * them or the lockup just moves. */
function awaitTasksModal(ctx, promise) {
  const { prompter } = ctx;
  return prompter && typeof prompter.withControls === "function"
    ? prompter.withControls(promise)
    : promise;
}
async function editTaskLineTagged(ctx, file, line, tokens) {
  const { tasks } = ctx;
  const before = await readLine(ctx.app, file, line);
  /* The edited text is trimmed to place tags reliably, so the line's own indentation is put
   * back explicitly. Without it, rewording a project's next action promoted it to the top
   * level — out of its project — because the leading spaces are what nest it. */
  const indent = (String(before || "").match(/^[\t ]*/) || [""])[0];
  if (tasks.canEditViaApi()) {
    const edited = await awaitTasksModal(ctx, tasks.editTaskLine(before != null ? before : ""));
    if (!edited || !edited.trim()) return null;
    const tagged = indent + insertBeforeTasksMetadata(edited.trim(), tokens);
    await replaceLine(ctx.app, file, line, tagged);
    return tagged;
  }
  // editExistingInPlace does not return until the vault matches the editor, so this read
  // is safe. The short retry is belt-and-braces for a flush that outran its timeout.
  await awaitTasksModal(ctx, tasks.editExistingInPlace(file, line));
  const fresh = await readLineAfterEdit(ctx, { file, startLine: line }, before, 500);
  const tagged = indent + insertBeforeTasksMetadata((fresh != null ? fresh : before || "").trim(), tokens);
  await replaceLine(ctx.app, file, line, tagged);
  return tagged;
}
/** Edit a task line, restarting the whole task if the user cancels the Tasks modal.
 *
 * ONE place decides what a cancel means, because the answer has to be the same wherever
 * it happens. Previously each site made its own call and they all chose "carry on without
 * the edit", which quietly moved to the next task — so a mis-tap cost you the task you
 * were working on and you had to re-run the review to reach it again.
 *
 * ReviewControl("back") reaches the review loop, which restores the undo journal before
 * re-running. That is what makes restarting safe rather than merely repetitive: whatever
 * the abandoned attempt had already written is rolled back first, so the second attempt
 * starts from the same state as the first. */
async function editTaskLineOrRestart(ctx, file, line, tokens) {
  const edited = await editTaskLineTagged(ctx, file, line, tokens);
  if (edited === null) throw new ReviewControl("retry");
  return edited;
}
/** Read a line back after the Tasks modal, giving the editor a bounded chance to flush.
 *
 * A change is the signal that the flush landed. If the user made no change there is
 * nothing to wait for, so this simply costs the timeout and returns the same text —
 * correct either way, just slower in that case. */
async function readLineAfterEdit(ctx, item, before, timeoutMs = 1500) {
  const deadline = Date.now() + timeoutMs;
  let latest = before;
  for (; ; ) {
    latest = await readLine(ctx.app, item.file, item.startLine);
    if (latest !== before) return latest;
    if (Date.now() >= deadline) return latest;
    await new Promise((r) => window.setTimeout(r, 50));
  }
}
/* The three ways a task can finish without being filed somewhere.
 * `symbol` is the status character to write; null means remove the lines entirely. */
var DISPOSE_ACTIONS = [
  {
    value: "complete",
    label: "Mark as **completed**",
    setting: "enableCompleteOption",
    symbol: "x",
    description: "Offer marking the task and its subtasks done, through Tasks, with a done date if Tasks adds one. They stay where they are."
  },
  {
    value: "cancel",
    label: "Mark as **cancelled**",
    setting: "enableCancelOption",
    symbol: "-",
    description: "Offer marking the task and its open subtasks cancelled [-], with a cancelled date if Tasks adds one. They stay where they are."
  },
  {
    value: "delete",
    label: "**Delete**",
    setting: "enableDeleteOption",
    symbol: null,
    description: "Offer removing the task and its subtasks from the note entirely."
  }
];
/** Those the user has left switched on. Absent counts as on, so a settings file written
 * before these existed keeps every option rather than silently losing all three. */
function disposeOptions(settings) {
  return DISPOSE_ACTIONS.filter((a) => (settings == null ? void 0 : settings[a.setting]) !== false);
}
function disposeActionFor(value) {
  return DISPOSE_ACTIONS.find((a) => a.value === value) || null;
}
/* ------------------------------- GTD coaching -------------------------------
 * Guidance shown in the pane at the moment a decision is made, and a detector for the
 * commonest way a next action goes wrong.
 *
 * The detector is deliberately high-precision rather than clever. It only flags openers
 * that GTD writing singles out as non-actions — "look into", "sort out", "plan" — and
 * descriptions with no verb at all, like "Taxes". A false positive costs a tap; a nagging
 * false positive costs trust in the whole prompt, so anything ambiguous is left alone. */
var VAGUE_OPENERS = [
  "look into", "deal with", "think about", "sort out", "work on", "figure out",
  "do something about", "check on", "handle", "consider", "plan", "organise",
  "organize", "research", "explore", "address", "tackle", "manage", "finalise",
  "finalize", "get on with", "start on",
  // David Allen's project verbs (GTD Fast) not already above: they name outcomes.
  "resolve", "ensure", "implement", "roll out", "maximise", "maximize", "optimise",
  "optimize", "improve", "streamline",
  // Intentions rather than steps.
  "see about", "think through", "get round to", "get around to", "get to grips with",
  "get a handle on", "wrap up", "progress the", "move forward",
  // Ongoing responsibilities: in GTD terms these are areas of focus, not actions.
  "keep on top of", "stay on top of", "keep an eye on", "keep track of", "maintain",
  // Work jargon that hides the actual step. Some carry their next word because the bare
  // verb is often concrete or a noun: "Sync phone", "Action items", "Progress report".
  "follow up", "sync with", "sync on", "align with", "align on", "touch base",
  "circle back", "action the", "own", "socialise", "socialize", "kick off", "flesh out",
  "iterate on", "dig into", "deep dive", "get buy-in", "unblock"
];
/* Vague unless what follows makes them concrete: "Fix typo in README" is an action, "Fix
 * the login bug" is a project. Offered in settings switched off, for you to opt into —
 * how you write decides which way they fall. "monitor" and "work out" live here rather
 * than above because "Monitor stand" and "Work out at the gym" are perfectly concrete. */
var VAGUE_OPENERS_OPTIONAL = [
  "fix", "set up", "prepare", "prep", "get ready for", "finish", "complete", "update",
  "install", "design", "submit", "arrange", "coordinate", "decide", "investigate", "scope",
  "triage", "chase", "escalate", "start", "continue", "look at", "drive", "monitor",
  "work out"
];
/* Skipped before checking, not flagged: "Need to call Sam" is a fine next action. Without
 * this, "Need to sort out the trip" passed, because only the first words are checked. */
var FILLER_PREFIXES = [
  "need to", "needs to", "have to", "has to", "must", "should", "remember to",
  "don't forget to", "dont forget to", "want to", "try to", "maybe", "possibly",
  "todo:", "todo", "to do:", "asap", "urgent:", "urgent"
];
/** Lowercased, curly apostrophes straightened, whitespace collapsed — so a phrase typed on
 * a phone ("don’t forget to") matches one typed on a desktop. */
function normaliseForMatch(text) {
  return String(text || "").toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
}
/** One phrase per line; blank lines and lines starting with # are ignored. */
function parsePhraseList(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const p = normaliseForMatch(line);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}
/** What a settings box shows when it has never been edited: the built-in list, with the
 * opt-in phrases present but commented out, so switching one on is deleting a "#". */
function defaultVagueText() {
  return [
    "# One phrase per line. A next action starting with one of these is offered a rewrite.",
    "# Lines starting with # are ignored.",
    ...VAGUE_OPENERS,
    "",
    "# Vague unless what follows makes them concrete. Remove the # to switch one on:",
    ...VAGUE_OPENERS_OPTIONAL.map((p) => `# ${p}`)
  ].join("\n");
}
function defaultFillerText() {
  return [
    "# One per line. Skipped before checking, so \u2018Need to sort out X\u2019 is checked as \u2018sort out X\u2019.",
    ...FILLER_PREFIXES
  ].join("\n");
}
function vaguePhrases(settings) {
  const v = settings == null ? void 0 : settings.vagueOpeners;
  return typeof v === "string" ? parsePhraseList(v) : VAGUE_OPENERS.map(normaliseForMatch);
}
function fillerPhrases(settings) {
  const v = settings == null ? void 0 : settings.fillerPrefixes;
  return typeof v === "string" ? parsePhraseList(v) : FILLER_PREFIXES.map(normaliseForMatch);
}
/** Remove leading filler, repeatedly: "TODO: maybe look into CRMs" -> "look into CRMs".
 * A filler only counts when a space or punctuation follows it, so "Musty smell" is not
 * read as "must" + "y smell". */
function stripFiller(text, fillers) {
  let t = text;
  for (let guard = 0; guard < 10; guard++) {
    const f = fillers.find((p) => t === p || (t.startsWith(p) && /[\s:,;]/.test(t.charAt(p.length))));
    if (!f) return t;
    t = t.slice(f.length).replace(/^[\s:,;\u2013\u2014-]+/, "");
  }
  return t;
}
var GUIDANCE = {
  nextAction:
    "Write the very next physical, visible action \u2014 something you could start right now. Begin with a verb you can picture: \u2018Call Sam re: dates\u2019, not \u2018Sort out trip\u2019.",
  outcome:
    "Name the outcome: what will be true when this is finished? \u2018Berlin trip booked\u2019 rather than \u2018Berlin\u2019. Its next actions go underneath.",
  clarify:
    "This is now the project\u2019s next action. If it isn\u2019t something you could start right now, rewrite it until it is.",
  tickle:
    "Only defer to a date if there\u2019s a real reason it can\u2019t happen before then. If it\u2019s just \u2018eventually\u2019, Someday is the honest answer \u2014 a made-up date only comes back and gets pushed again.",
  /* --- the review as a whole --- */
  reviewProcess:
    "Process is GTD\u2019s Clarify step. For each item, decide what it is and what \u2014 if anything \u2014 you\u2019ll do about it. The aim is an empty list, not finished work: you\u2019re deciding, not doing.",
  reviewOrganise:
    "Organise is GTD\u2019s Organize step. Clarified work goes where you\u2019ll see it when you can act on it, labelled by context, time and energy so the right task finds you at the right moment.",
  /* --- Clarify --- */
  actionable:
    "Decide what this IS before deciding where it goes. Asking \u2018this week\u2019 keeps your action lists to things you\u2019d genuinely do soon. If it would take under two minutes, say so here: it\u2019s done in a batch at the end, so a quick task can\u2019t derail the list.",
  clarifyBeforeFiling:
    "Make the wording clear enough that you\u2019ll understand it months from now, out of context. Whatever you decide next, this is the version you\u2019ll meet again.",
  quickBatch:
    "Do it now. If it\u2019s still going at five minutes, stop and choose \u2018Took longer\u2019 \u2014 it stays on your list as an ordinary next action, and nothing is lost.",
  batchHere:
    "If this one would take under two minutes, batch it: it\u2019s done at the end with the others, and you carry on building the project now.",
  split:
    "One item per entry \u2014 each is clarified on its own afterwards. If they\u2019re all steps towards one outcome, that\u2019s a project, not a split: choose Restart and answer \u2018this is the project\u2019s outcome\u2019 instead.",
  deferredHome:
    "Deferred work still needs a home. Filing it now means that when it comes back, it comes back to the right list \u2014 not to your inbox to be sorted again. If you\u2019re not sure yet, leave it: Organise still includes deferred tasks.",
  reprocess:
    "Things move on between processing and organising. Fix the wording if it no longer says what you\u2019d actually do; process it again if it\u2019s now done, bigger than one step, or not wanted. Anything already organised for it is undone first.",
  reprocessInProject:
    "Fixing the wording or processing it again changes only the next action on screen. Processing the whole project again starts where Process does \u2014 is the project actionable this week? \u2014 so you can defer it, put it in Someday or cancel it, next actions and all. Anything already organised for it is undone first.",
  fixAction:
    "Fixing one leaves the others as they are. Remove one that others wait on and they wait on whatever it was waiting on instead, so the order still holds.",
  disposition:
    "Not this week isn\u2019t one answer. If you\u2019ll do it but can\u2019t yet, give it a date and it comes back by itself. If you might never, that\u2019s Someday.",
  projectShape:
    "In GTD, anything needing more than one action is a project. A project is named by its outcome; the things you actually do are its next actions.",
  reference:
    "Reference is information you might need, not something to do. It goes wherever you\u2019d look it up, and leaves your task lists entirely.",
  moreActions:
    "A project doesn\u2019t need a full plan here \u2014 just the next actions you could start now. Steps that must wait for others can be added when they become possible.",
  sequential:
    "If yes, only the first is a true next action and the rest wait behind it, so they stay off your \u2018is not blocked\u2019 lists. If they can happen in any order, say no and they\u2019ll all appear.",
  /* --- Organize: GTD's four criteria for choosing what to do --- */
  context:
    "GTD sorts next actions by context \u2014 the place, tool or person you need. At the shops you want to see only what can be done at the shops, and nothing else.",
  time:
    "How long it takes. With twenty minutes before a meeting, you want only the things that fit in twenty minutes.",
  energy:
    "Some work needs you sharp; some you can do tired. Labelling energy lets you match the task to the state you\u2019re actually in, instead of the one you wish you were in.",
  mode:
    "The kind of thinking it needs. Batching similar work \u2014 all the admin together, all the creative work together \u2014 saves the cost of switching between them.",
  priority:
    "GTD chooses what to do by context, then time, then energy \u2014 and only then priority. It still matters, but it\u2019s the last filter rather than the first: the most important task is no use if you can\u2019t do it where you are.",
  dimensionGeneric:
    "Labels like this are for later. When you look at your lists, they let you narrow down to what fits the moment.",
  filing:
    "Put this where you\u2019ll look for it when you can act on it. Choose the list or note you\u2019d actually check in that situation \u2014 a task filed somewhere you never look is lost.",
  noNextAction:
    "Every active project needs at least one next action \u2014 otherwise it sits on your list with nothing you can actually do about it.",
  lastNextAction:
    "A project is only active while it has a next action. If its last one is going to Someday, the project usually belongs there too: sent whole, it comes back with its steps when you take it up again. If the project carries on, give it its next action now.",
  delegate:
    "Word it as what you\u2019re waiting for and who from \u2014 \u2018Sam: quote for the boiler\u2019 \u2014 so a glance at the list tells you who to chase. It\u2019s tagged {tag} for you.",
  sweep:
    "Write down anything that has your attention, without deciding anything about it yet — that is what Process is for. Each one goes into your inbox as you add it.",
  sweepProcess:
    "Processing straight after a sweep, while it’s all fresh, is how GTD gets you to an empty inbox. If you’d rather wait, it will all be in your inbox when you are ready.",
  chase:
    "A waiting-for with no date to check on it tends to wait forever. The date goes on as its start date, like Not yet, so it stays out of Process until then and a Tasks query can list just the ones due a chase."
};
/** The description of a task line, without checkbox, tags, links or Tasks metadata. */
function actionText(line) {
  return deTaskLine(String(line || ""))
    .replace(/\[\[[^\]]*\]\]/g, " ")
    .replace(/#[\w/-]+/g, " ")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\u23F0-\u23FF]\uFE0F?.*$/u, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** Is this wording a usable next action? Returns { vague, reason }. */
function assessNextAction(line, settings) {
  const original = normaliseForMatch(actionText(line));
  if (!original) return { vague: false, reason: "" };
  const text = stripFiller(original, fillerPhrases(settings));
  if (!text) {
    return { vague: true, reason: "It\u2019s only a reminder word \u2014 there\u2019s nothing to do in it yet." };
  }
  const opener = vaguePhrases(settings).find((v) => text === v || text.startsWith(v + " "));
  if (opener) {
    return { vague: true, reason: `\u201C${opener}\u201D describes a project or an intention, not a step you can take.` };
  }
  if (!/\s/.test(text)) {
    return { vague: true, reason: "A single word names a topic, not something to do." };
  }
  return { vague: false, reason: "" };
}
/** Show what is being asked while a Tasks dialogue is open. Without this the pane keeps
 * showing the last question, already answered, for as long as the dialogue is up. */
var GUIDANCE_MODES = ["always", "onDemand", "off"];
/** How tips are shown. Anything unrecognised — including a settings file written before
 * this option existed — falls back to on-demand, the least intrusive mode that still
 * keeps the tip reachable. */
function guidanceMode(settings) {
  const v = settings == null ? void 0 : settings.guidanceDisplay;
  return GUIDANCE_MODES.includes(v) ? v : "onDemand";
}
/** The GTD tip for an Organise dimension.
 *
 * Dimensions are user-editable, so they are matched by what they ARE — id, label or group —
 * rather than by position. One renamed to "Where" still reads as context if its id is
 * unchanged. Anything unrecognised gets a general tip that is true of every dimension,
 * rather than no tip or a wrong one. */
function dimensionGuidance(dim) {
  const text = `${dim && dim.id || ""} ${dim && dim.label || ""} ${dim && dim.group || ""}`.toLowerCase();
  if (/context|location|place|where/.test(text)) return GUIDANCE.context;
  if (/energy/.test(text)) return GUIDANCE.energy;
  if (/duration|time|length|effort/.test(text)) return GUIDANCE.time;
  if (/mode|processing|kind/.test(text)) return GUIDANCE.mode;
  return GUIDANCE.dimensionGeneric;
}
/* -------------------------------- Emphasis ---------------------------------
 * A word in **double asterisks** is shown bold: the word that tells one answer from the
 * next, so a glance down the bold words is enough to choose. It lives in the wording
 * itself, so it is edited along with it, and an unpaired ** is left as typed. */
function richRuns(text) {
  const s = String(text == null ? "" : text);
  const runs = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index), bold: false });
    runs.push({ text: m[1], bold: true });
    last = re.lastIndex;
  }
  if (last < s.length) runs.push({ text: s.slice(last), bold: false });
  return runs;
}
/** The same text without the emphasis markers — for settings, notices and labels read aloud. */
function plainText(text) {
  return richRuns(text).map((r) => r.text).join("");
}
/** Add a `tag` element under `parent` showing `text`, with its **bold** runs in <strong>. */
function appendRich(parent, tag, text, cls) {
  const runs = richRuns(text);
  if (!runs.some((r) => r.bold)) return parent.createEl(tag, cls ? { text: String(text == null ? "" : text), cls } : { text: String(text == null ? "" : text) });
  const el = parent.createEl(tag, cls ? { cls } : {});
  /* The runs go inside one span of their own. Obsidian lays buttons out as flex boxes, and a
   * flex box makes each child its own item and trims the spaces at its edges — so on a phone,
   * where answers have no number in front, "This **note** (Inbox)" read "Thisnote(Inbox)". */
  const host = tag === "span" ? el : el.createSpan();
  for (const r of runs) {
    if (r.bold) host.createEl("strong", { text: r.text });
    else host.createSpan({ text: r.text });
  }
  /* No aria-label: the words themselves are the accessible name, read without the markers
   * because the markers never reach the page. Obsidian shows any aria-label as a hover
   * tooltip, so one here only repeated the button's own words back at you. */
  return el;
}
/* ------------------------------- Number keys --------------------------------
 * 1\u20139 pick the answer with that number and 0 skips an optional step, while the review
 * is waiting on a choice. Never while you are typing — in a note, a field, or a dialogue —
 * so a digit typed into your note stays in your note. */
var MAX_NUMBER_KEYS = 9;
function isTypingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (target.isContentEditable) return true;
  return typeof target.closest === "function" && !!target.closest("[contenteditable='true'], .cm-editor");
}
/** What a key press should answer, or null to let it through untouched. */
function keyAnswer(e, pending, doc) {
  if (!pending || !e || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTypingTarget(e.target)) return null;
  if (doc && typeof doc.querySelector === "function" && doc.querySelector(".modal-container")) return null;
  if (e.key === "0") return pending.skip || null;
  if (/^[1-9]$/.test(String(e.key))) return pending.picks[Number(e.key) - 1] || null;
  return null;
}
/** Whether number keys are on here: the setting, and not on a phone, which has no keys. */
function numberKeysEnabled(settings) {
  if (settings && settings.numberKeys === false) return false;
  const platform = obsidian.Platform;
  return !(platform && platform.isPhone);
}
/** One heading for a dimension's step in Organise.
 *
 * It used to be "Group \u203A Label", which says the same thing twice for most dimensions
 * ("Physical context \u203A Context"). Now the heading alone, with the label's words bold
 * in it; the label is added after it only when it says something the heading doesn't.
 * A heading written with its own **bold** is used as written. */
function dimensionQuestion(dim) {
  const group = String(dim && dim.group || "").trim();
  const label = String(dim && dim.label || "").trim();
  if (group.includes("**")) return group;
  if (!group) return label ? `**${label}**` : "";
  if (!label) return `**${group}**`;
  const at = group.toLowerCase().indexOf(label.toLowerCase());
  if (at >= 0) return `${group.slice(0, at)}**${group.slice(at, at + label.length)}**${group.slice(at + label.length)}`;
  const words = (t) => t.toLowerCase().split(/\s+/).filter(Boolean);
  const inGroup = new Set(words(group));
  if (words(label).every((w) => inGroup.has(w))) return `**${group}**`;
  return `${group} \u203A **${label}**`;
}
function guide(ctx, question, guidance) {
  const p = ctx.prompter;
  if (p && typeof p.showGuidance === "function") p.showGuidance(question, guidance);
}
/* --------------------------------- Tickler ----------------------------------
 * GTD's incubate covers two different things: Someday/Maybe, which is passive and only
 * resurfaces if you review it, and the tickler, which brings something back on a date by
 * itself. "Not this week" previously had only the first, so work you WERE committed to,
 * just not yet, was filed beside things you never meant to do — and never came back.
 *
 * The Tasks start date (🛫) is a native tickler: Tasks treats a future start date as
 * "not yet", and a task with no start date as already started. Setting it, rather than
 * moving the task anywhere, leaves the task where it belongs and lets it reappear in place. */
var START_EMOJI_RE = /\u{1F6EB}\uFE0F?\s*(\d{4}-\d{2}-\d{2})/u;
var START_DATAVIEW_RE = /\[start::\s*(\d{4}-\d{2}-\d{2})\s*\]/i;
/** The start date written on a task line, in either emoji or Dataview form. */
function lineStartDate(line) {
  const text = String(line || "");
  const m = text.match(START_EMOJI_RE) || text.match(START_DATAVIEW_RE);
  return m ? m[1] : null;
}
/** True while a task's start date is still in the future. */
function isTickled(line, today) {
  const d = lineStartDate(line);
  return d !== null && d > today;
}
/** Set a line's start date, replacing any existing one in whichever form it uses.
 * A new date goes before a trailing block reference, which Tasks requires to stay last. */
function setLineStartDate(line, date) {
  const text = String(line || "");
  if (START_EMOJI_RE.test(text)) return text.replace(START_EMOJI_RE, `\u{1F6EB} ${date}`);
  if (START_DATAVIEW_RE.test(text)) return text.replace(START_DATAVIEW_RE, `[start:: ${date}]`);
  const block = text.match(/(\s+\^[\w-]+)\s*$/);
  if (block) {
    const head = text.slice(0, text.length - block[0].length).replace(/\s+$/, "");
    return `${head} \u{1F6EB} ${date}${block[1]}`;
  }
  return `${text.replace(/\s+$/, "")} \u{1F6EB} ${date}`;
}
function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  // Clamp to the month's last day: one month after 31 January is 28/29 February, not 3 March.
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
/* ------------------------------ Dates in words ------------------------------
 * For "bring it back on…": a date said the way you would say it — "next Wednesday", "3 Nov",
 * "in two weeks" — rather than worked out and typed as YYYY-MM-DD. Anything it can't read
 * is reported, never guessed: the preview shows the date it has read before you accept it. */
var WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
var MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
var NUMBER_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
var WEEKDAY_ALIASES = { weds: 3, thur: 4, thurs: 4, tues: 2 };
function dayOfWeek(iso) {
  return (/* @__PURE__ */ new Date(iso + "T00:00:00Z")).getUTCDay();
}
/** A weekday from its name or a prefix of at least three letters ("wed", "thurs"). */
function weekdayFromWord(word) {
  const w = String(word || "").toLowerCase();
  if (w in WEEKDAY_ALIASES) return WEEKDAY_ALIASES[w];
  if (w.length < 3) return -1;
  return WEEKDAY_NAMES.findIndex((d) => d.toLowerCase().startsWith(w));
}
function monthFromWord(word) {
  const w = String(word || "").toLowerCase().replace(/\.$/, "");
  if (w.length < 3) return -1;
  if (w === "sept") return 8;
  return MONTH_NAMES.findIndex((m) => m.toLowerCase().startsWith(w));
}
function isoOf(y, m, d) {
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  if (d < 1 || d > last) return null;
  return `${String(y).padStart(4, "0")}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** "Wednesday 28 October 2026". */
function formatLongDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${WEEKDAY_NAMES[dayOfWeek(iso)]} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
/** A date in words, as YYYY-MM-DD, or null if it can't be read.
 *
 * "Wednesday" (or "this Wednesday", "on Wed") is the next Wednesday after today. "Next
 * Wednesday" is the Wednesday of next week, weeks starting on Monday — so said on a Tuesday
 * it is eight days away, not one. Both readings are common; the preview settles which. A
 * day and month without a year is the next time that date comes round. */
function parsePlainDate(text, today) {
  const w = String(text || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,!]+$/, "");
  if (!w) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    // Checked, not passed through: 2026-02-30 is not a date.
    const [y, mo, d] = w.split("-").map(Number);
    return isoOf(y, mo - 1, d);
  }
  const known = resolveQueryDate(w, today);
  if (known) return known;
  let m;
  if (w === "day after tomorrow" || w === "the day after tomorrow") return shiftDate(today, 2);
  if (w === "fortnight" || w === "in a fortnight") return shiftDate(today, 14);
  if (w === "next month") return addMonths(today, 1);
  if (w === "next year") return addMonths(today, 12);
  if ((m = w.match(/^(?:in )?(\d+|[a-z]+) (day|week|fortnight|month|year)s?(?: time)?$/))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUMBER_WORDS[m[1]];
    if (!n) return null;
    if (m[2] === "day") return shiftDate(today, n);
    if (m[2] === "week") return shiftDate(today, 7 * n);
    if (m[2] === "fortnight") return shiftDate(today, 14 * n);
    if (m[2] === "month") return addMonths(today, n);
    return addMonths(today, 12 * n);
  }
  if (w === "end of the month" || w === "end of month") {
    // The last day of this month, or of next month if that is today.
    const [y, mo] = today.split("-").map(Number);
    const lastDay = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const end = isoOf(y, mo - 1, lastDay(y, mo - 1));
    return end > today ? end : isoOf(mo === 12 ? y + 1 : y, mo % 12, lastDay(mo === 12 ? y + 1 : y, mo % 12));
  }
  const todayDow = dayOfWeek(today);
  const fromMonday = (dow) => (dow + 6) % 7;
  if ((m = w.match(/^(this |next |on |coming |this coming )?(weekend|[a-z]+)$/))) {
    const which = (m[1] || "").trim();
    const day = m[2] === "weekend" ? 6 : weekdayFromWord(m[2]);
    if (day >= 0) {
      if (which === "next") {
        const nextMonday = shiftDate(today, 7 - fromMonday(todayDow));
        return shiftDate(nextMonday, fromMonday(day));
      }
      const ahead = (day - todayDow + 7) % 7 || 7;
      return shiftDate(today, ahead);
    }
  }
  const [ty] = today.split("-").map(Number);
  const dated = (day, month, year) => {
    if (month < 0) return null;
    if (year) return isoOf(year, month, day);
    const thisYear = isoOf(ty, month, day);
    if (thisYear && thisYear > today) return thisYear;
    return isoOf(ty + 1, month, day);
  };
  if ((m = w.match(/^(?:on |the )?(\d{1,2})(?:st|nd|rd|th)?(?: of)? ([a-z.]+)(?:,? (\d{4}))?$/))) {
    return dated(Number(m[1]), monthFromWord(m[2]), m[3] ? Number(m[3]) : 0);
  }
  if ((m = w.match(/^(?:on )?([a-z.]+) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/))) {
    return dated(Number(m[2]), monthFromWord(m[1]), m[3] ? Number(m[3]) : 0);
  }
  return null;
}
/** Defer a task and its open subtasks to `date`.
 *
 * Applied to the whole subtree, because a deferred project whose next actions still show
 * on your lists has not been deferred at all. A subtask already deferred to a LATER date
 * keeps it — this only ever pushes things back, never pulls them forward. Completed
 * subtasks are left untouched. */
async function tickleSubtree(app, file, startLine, endLine, date) {
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      if (!isTaskLine(lines[i])) continue;
      if (COMPLETED_STATUSES.has(taskStatusOf(lines[i]))) continue;
      const existing = lineStartDate(lines[i]);
      if (existing !== null && existing > date) continue;
      lines[i] = setLineStartDate(lines[i], date);
    }
    return lines.join("\n");
  });
}
/** Ask when something should come back. Returns a YYYY-MM-DD after today, or null.
 *
 * "Another date…" takes the date in words — "next Wednesday", "3 Nov" — or from a calendar,
 * with the date it has read shown before you accept it. Going back from there returns to
 * this list, not further. */
async function pickTickleDate(ctx) {
  const { prompter } = ctx;
  const today = todayString();
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    const choice = await prompter.choice(
      "**When** should this come back?",
      [
        { label: `**Tomorrow** \u2014 ${shiftDate(today, 1)}`, value: shiftDate(today, 1) },
        { label: `**Next week** \u2014 ${shiftDate(today, 7)}`, value: shiftDate(today, 7) },
        { label: `In **two weeks** \u2014 ${shiftDate(today, 14)}`, value: shiftDate(today, 14) },
        { label: `Next **month** \u2014 ${addMonths(today, 1)}`, value: addMonths(today, 1) },
        { label: `In **three months** \u2014 ${addMonths(today, 3)}`, value: addMonths(today, 3) },
        { label: "**Another date**\u2026", value: "__pick__" }
      ],
      GUIDANCE.tickle
    );
    if (choice !== "__pick__") return choice;
    const when = await askForDate(ctx, today);
    if (when) return when;
  }
  return null;
}
/** A date after today, in words or from a calendar; null for Back. */
async function askForDate(ctx, today, question = "Bring it back **on**\u2026") {
  const { prompter } = ctx;
  const parse = (t) => parsePlainDate(t, today);
  if (typeof prompter.date === "function") {
    return await prompter.date(question, { after: today, parse, placeholder: "e.g. next Wednesday, 3 Nov, in 10 days" });
  }
  // A prompter without a date picker: the same words, typed.
  for (let attempt = 0; attempt < 5; attempt++) {
    const typed = await prompter.text(`${question} (e.g. next Wednesday, 3 Nov, in 10 days)`, {
      placeholder: shiftDate(today, 7)
    });
    const when = parse(String(typed || ""));
    if (when && when > today) return when;
    prompter.info(when ? "That isn\u2019t in the future \u2014 pick a later date." : "Couldn\u2019t read that date \u2014 try \u2018next Wednesday\u2019 or \u20183 Nov\u2019.");
  }
  return null;
}
/** Move a subtree to the end of another note, re-based so its root sits at the top level.
 *
 * "Send to Someday" used to copy only the task's own line and then delete its whole
 * subtree, so any subtasks, notes or links beneath it were lost. This moves all of it.
 * The re-basing matters for a task surfaced by a query from inside another task: kept at
 * its old depth, it would land in Someday looking like a child of whatever was above it. */
async function moveSubtreeToNote(app, source, startLine, endLine, targetPath) {
  const lines = (await app.vault.read(source)).split("\n");
  const block = lines.slice(startLine, endLine + 1);
  const rootIndent = (block[0].match(/^[\t ]*/) || [""])[0];
  const rebased = block.map((l) => (l.startsWith(rootIndent) ? l.slice(rootIndent.length) : l.replace(/^[\t ]*/, "")));
  await appendToNote(app, targetPath, rebased.join("\n").replace(/\s+$/, ""));
  await app.vault.process(source, (data) => {
    const cur = data.split("\n");
    cur.splice(startLine, endLine - startLine + 1);
    return cur.join("\n");
  });
}
/* ------------------------------- Completing ---------------------------------
 * Writing "[x]" into a line directly looks like completing it, but Tasks never sees it
 * happen: no done date is added, and a RECURRING task never produces its next occurrence —
 * the series silently stops. So completion goes through Tasks' own toggle wherever it is
 * available, and only falls back to rewriting the status character when it is not. */

/* ---------------------------- Done and cancelled dates ----------------------------
 * Tasks adds the date a task was finished — ✅ for done, ❌ for cancelled, or
 * [completion:: …] and [cancelled:: …] in Dataview format — unless its settings say not
 * to. Anything finished here without going through Tasks gets the same date, the same way. */
var FINISHED_DATE_FORMS = {
  done: { emoji: "\u2705", field: "completion" },
  cancelled: { emoji: "\u274C", field: "cancelled" }
};
function finishedDateRes(kind) {
  const f = FINISHED_DATE_FORMS[kind];
  return [new RegExp(`${f.emoji}\uFE0F?\\s*\\d{4}-\\d{2}-\\d{2}`, "u"), new RegExp(`\\[${f.field}::\\s*\\d{4}-\\d{2}-\\d{2}\\s*\\]`, "i")];
}
function hasFinishedDate(line, kind) {
  return finishedDateRes(kind).some((re) => re.test(String(line || "")));
}
/** The line with its done (or cancelled) date set to `date`: replaced if it has one,
 * otherwise added at the end, before any block id, as Tasks writes it. */
function setFinishedDate(line, kind, date, dataview) {
  const text = String(line || "");
  const f = FINISHED_DATE_FORMS[kind];
  const [emojiRe, fieldRe] = finishedDateRes(kind);
  if (emojiRe.test(text)) return text.replace(emojiRe, `${f.emoji} ${date}`);
  if (fieldRe.test(text)) return text.replace(fieldRe, `[${f.field}:: ${date}]`);
  const token = dataview ? ` [${f.field}:: ${date}]` : `${f.emoji} ${date}`;
  const block = text.match(/(\s+\^[\w-]+)\s*$/);
  const head = (block ? text.slice(0, text.length - block[0].length) : text).replace(/\s+$/, "");
  return `${head} ${token}${block ? block[1] : ""}`;
}
/** True if Tasks would date this line: with a global filter set, only lines carrying it
 * are tasks to Tasks. */
function datedByTasks(line, dates) {
  return !dates.globalFilter || String(line || "").includes(dates.globalFilter);
}
/** The lines a single task line becomes once completed.
 *
 * `dates` is Tasks' date settings (see taskDateSettings); without it, no date is added. */
function completedLines(tasks, line, path, dates = null, today = todayString()) {
  const toggled = tasks && typeof tasks.toggleTaskDone === "function" ? tasks.toggleTaskDone(line, path) : null;
  if (toggled !== null) {
    const out = toggled.split("\n");
    // A custom status cycle can make "toggle" mean something other than done — Todo to
    // In Progress, say. Only accept the result if it actually completed something.
    if (out.some((l) => /^[xX]$/.test(taskStatusOf(l) || ""))) {
      // Tasks dates what it completes; one it left undated is given the date it would add.
      if (!dates || !dates.doneDate) return out;
      return out.map((l) => /^[xX]$/.test(taskStatusOf(l) || "") && !hasFinishedDate(l, "done") && datedByTasks(l, dates) ? setFinishedDate(l, "done", today, dates.dataview) : l);
    }
  }
  /* Completed without Tasks — no API, or a status cycle that doesn't reach done — so the
   * done date Tasks would have written is written here: today's, replacing any left over
   * from an earlier completion. */
  const marked = setTaskStatus(line, "x");
  if (marked === null) return [line];
  return [dates && dates.doneDate && datedByTasks(marked, dates) ? setFinishedDate(marked, "done", today, dates.dataview) : marked];
}
/** Tasks' date settings through the adapter, or null where there is no adapter to ask. */
async function finishedDateSettings(ctx) {
  const tasks = ctx && ctx.tasks;
  return tasks && typeof tasks.taskDateSettings === "function" ? await tasks.taskDateSettings() : null;
}
/** Complete every open task in a subtree, through Tasks where possible.
 *
 * Works from the bottom up: a recurring task expands to two lines, and doing the lower
 * lines first keeps every index above them valid. One write, so the undo journal sees a
 * single change. Already-finished tasks and non-task lines are left alone. */
async function completeSubtree(ctx, file, startLine, endLine) {
  const dates = await finishedDateSettings(ctx);
  const today = todayString();
  await ctx.app.vault.process(file, (data) => {
    const lines = data.split("\n");
    for (let i = Math.min(endLine, lines.length - 1); i >= startLine; i--) {
      if (!isTaskLine(lines[i])) continue;
      if (COMPLETED_STATUSES.has(taskStatusOf(lines[i]))) continue;
      lines.splice(i, 1, ...completedLines(ctx.tasks, lines[i], file.path, dates, today));
    }
    return lines.join("\n");
  });
}
/** Cancel a task and every open subtask beneath it, each with the cancelled date Tasks
 * would add. Subtasks already done or cancelled are left as they are: done work stays done.
 * One write, so the undo journal sees a single change. */
async function cancelSubtree(ctx, file, startLine, endLine) {
  const dates = await finishedDateSettings(ctx);
  const today = todayString();
  await ctx.app.vault.process(file, (data) => {
    const lines = data.split("\n");
    for (let i = startLine; i <= endLine && i < lines.length; i++) {
      if (!isTaskLine(lines[i]) || COMPLETED_STATUSES.has(taskStatusOf(lines[i]))) continue;
      const cancelled = setTaskStatus(lines[i], "-");
      if (cancelled === null) continue;
      lines[i] = dates && dates.cancelledDate && datedByTasks(cancelled, dates) ? setFinishedDate(cancelled, "cancelled", today, dates.dataview) : cancelled;
    }
    return lines.join("\n");
  });
}
function isTaskLine(line) {
  return /^\s*(?:[-*+]|\d+[.)])\s+\[.\]/.test(line || "");
}
function taskStatusOf(line) {
  const m = String(line || "").match(/^\s*(?:[-*+]|\d+[.)])\s+\[(.)\]/);
  return m ? m[1] : null;
}
var MAX_PROJECT_DEPTH = 5;
var MAX_SUBTASK_RETRIES = 20;
/** Run the full Process flow over each existing direct child of a project, in order.
 *
 * Re-reads the file before every child rather than listing them up front: processing one
 * can delete it, move it out, or expand it into a project of its own, so a list captured
 * in advance is stale after the first change. The cursor advances by the child's subtree
 * end adjusted for how much the file grew or shrank — the same technique the review loop
 * uses between tasks.
 *
 * Direct children only. A child that is itself a project recurses back through runProcess
 * and deals with its own children, so walking grandchildren here would visit them twice.
 * Completed children are skipped; there is nothing left to decide about them.
 *
 * Returns the parent's subtree end once every child has been handled, so the caller knows
 * where to append. */
/** Take one sub-item — a project's subtask, or a piece of a split capture — through the
 * full Process flow, with its own undo journal nested inside the task's.
 *
 * Returns "done", "skip" or "retry". A cancelled dialogue ("retry") rolls back only this
 * sub-item, including anything it queued for the two-minute batch, so the caller can offer
 * it again; Skip leaves it alone. Exit, Revert and "Restart task" belong to the whole task
 * and are rethrown untouched.
 *
 * Shared by both walks deliberately: this is where the retry, rollback and batch rules
 * live, and two copies of them would drift — the batch truncation had to be added to the
 * project walk separately once already.
 *
 * journalledApp wraps whatever app it is handed, so writes pass through both journals:
 * the inner can undo just this sub-item while the outer still holds the task's start. */
async function attemptSubItem(ctx, subItem, depth) {
  const journal = new VaultJournal(ctx.app);
  await journal.capture(subItem.file);
  const batchMark = Array.isArray(ctx.quickBatch) ? ctx.quickBatch.length : 0;
  const subCtx = Object.assign({}, ctx, { app: journalledApp(ctx.app, journal) });
  try {
    await runProcess(subCtx, subItem, depth);
    return "done";
  } catch (e) {
    if (!(e instanceof ReviewControl)) throw e;
    if (e.kind === "retry") {
      if (Array.isArray(ctx.quickBatch)) ctx.quickBatch.length = batchMark;
      const failed = await journal.restore();
      if (failed.length) {
        new obsidian.Notice(`${PLUGIN_NAME}: could not fully undo ${failed.length} file(s).`);
      }
      return "retry";
    }
    if (e.kind === "skip") return "skip";
    throw e;
  }
}
async function processProjectChildren(ctx, item, depth) {
  const { prompter, settings } = ctx;
  let cursor = item.startLine + 1;
  let retries = 0;
  for (let guard = 0; guard < 500; guard++) {
    const lines = (await ctx.app.vault.read(item.file)).split("\n");
    const end = computeSubtreeEnd(lines, item.startLine);
    let childLine = -1;
    for (let i = Math.max(cursor, item.startLine + 1); i <= end && i < lines.length; i++) {
      if (!isTaskLine(lines[i])) continue;
      if (COMPLETED_STATUSES.has(taskStatusOf(lines[i]))) continue;
      const anc = computeAncestorLines(lines, i);
      if (anc.length && anc[anc.length - 1] === item.startLine) {
        childLine = i;
        break;
      }
    }
    if (childLine < 0) break;
    const childEnd = computeSubtreeEnd(lines, childLine);
    const child = {
      file: item.file,
      startLine: childLine,
      endLine: childEnd,
      raw: lines[childLine],
      status: taskStatusOf(lines[childLine]),
      isProject: lineHasTag(lines[childLine], settings.projectTag),
      parentRaw: computeAncestorLines(lines, childLine).map((n) => lines[n]).join("\n"),
      sourceLabel: item.sourceLabel
    };
    await prompter.highlightInSource(child);
    const before = lines.length;
    const outcome = await attemptSubItem(ctx, child, depth + 1);
    if (outcome === "retry") {
      // Do NOT advance the cursor — the file is back to how it was, so the same subtask
      // is in the same place. Bounded so a step that always throws cannot spin forever.
      if (++retries > MAX_SUBTASK_RETRIES) throw new ReviewControl("back");
      continue;
    }
    retries = 0;
    const after = await lineCount(ctx.app, item.file);
    cursor = childEnd + (after - before) + 1;
  }
  const lines = (await ctx.app.vault.read(item.file)).split("\n");
  return computeSubtreeEnd(lines, item.startLine);
}
/** Offer a rewrite when a freshly written next action reads as vague. Silent when it looks
 * fine, so a well-formed action costs nothing. */
/* Both return the rewritten line when the user rewrites it, or null — so a caller holding
 * the task can keep its text current. A stale copy would make the task impossible to find
 * again by its text later in the same review. */
async function confirmNextAction(ctx, file, line) {
  const { prompter, settings } = ctx;
  if (settings && settings.nudgeVagueActions === false) return null;
  const current = await readLine(ctx.app, file, line);
  const verdict = assessNextAction(current, settings);
  if (!verdict.vague) return null;
  // The reason is shown with the question, not behind the \u24D8: it is the one tip that
  // is a judgement about YOUR wording, and you need it to decide whether to agree.
  /* Cancelling the rewrite comes back to this question. It used to restart the whole task,
   * which — reached while adding a project's next actions — threw away every one made. */
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    const choice = await prompter.choice(
      `\u201C${actionText(current)}\u201D **may not be a next action** yet.`,
      [
        { label: "**Rewrite** it\u2026", value: "rewrite" },
        { label: "**Keep** it as it is", value: "keep" }
      ],
      GUIDANCE.nextAction,
      verdict.reason
    );
    if (choice !== "rewrite") return null;
    guide(ctx, "Rewrite as a next action", GUIDANCE.nextAction);
    const edited = await editTaskLineTagged(ctx, file, line, []);
    if (edited !== null) return edited;
  }
  return null;
}
/** B': a capture has just been filed as a project's next action — ask whether it is one.
 *
 * Captured wording is usually the first thing that came to mind, not the next physical
 * step, so this is asked rather than assumed. It is one tap to skip because some captures
 * are already well-formed, and the rewrite option comes first when the wording looks vague.
 * With the prompt switched off in settings, the vague-wording nudge still applies, so an
 * obviously unusable action is never filed silently. */
/** Put a filed action on screen under the project it is now in, so the question about it
 * is asked about what you can see. It used to be asked with the task still shown as it was
 * before filing — on its own, without the project it had just been put under, or made. */
async function showFiledAction(ctx, file, line, sourceLabel = null) {
  const p = ctx.prompter;
  if (!p || typeof p.highlightInSource !== "function") return;
  const lines = (await ctx.app.vault.read(file)).split("\n");
  if (!isTaskLine(lines[line])) return;
  const ancestors = computeAncestorLines(lines, line);
  await p.highlightInSource({
    file, startLine: line, endLine: computeSubtreeEnd(lines, line), raw: lines[line],
    parentRaw: ancestors.length ? ancestors.map((k) => lines[k]).join("\n") : null, sourceLabel
  });
}
async function clarifyFiledAction(ctx, file, line, sourceLabel = null) {
  const { prompter, settings } = ctx;
  await showFiledAction(ctx, file, line, sourceLabel);
  if (settings && settings.clarifyNextAction === false) {
    return await confirmNextAction(ctx, file, line);
  }
  const current = await readLine(ctx.app, file, line);
  const verdict = assessNextAction(current, settings);
  const keep = { label: "It\u2019s already **clear**", value: "keep" };
  const rewrite = { label: "**Rewrite** it\u2026", value: "rewrite" };
  /* Rewrite first, always. Captured wording is usually not yet a next action — most of the
   * time this is answered with a rewrite — and an order that flipped with the wording
   * check moved both answers about, so neither could be found without reading. */
  const options = [rewrite, keep];
  // Unlike after "Next action saved", batching here is itself an answer: something you'll
  // do in two minutes doesn't need rewording first, so there's nothing to return to.
  if (canBatch(ctx)) options.push({ label: "It\u2019s **under two minutes** \u2014 batch it", value: "batch" });
  // As above: cancelling the rewrite comes back to this question.
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    const choice = await prompter.choice(
      "Is this a **clear** next action?",
      options,
      GUIDANCE.clarify,
      verdict.vague ? verdict.reason : void 0
    );
    if (choice === "batch") {
      queueQuickAction(ctx, { file, startLine: line, raw: current != null ? current : "" });
      return null;
    }
    if (choice !== "rewrite") return null;
    guide(ctx, "Rewrite as a next action", GUIDANCE.nextAction);
    const edited = await editTaskLineTagged(ctx, file, line, []);
    if (edited !== null) return edited;
  }
  return null;
}
/** Add a task to the end-of-review two-minute batch. Without a batch to add to — a
 * context that never runs one — it is left as an ordinary next action, which is the same
 * outcome the batch's own fail-safe gives. */
/** Whether this review can offer the two-minute batch. The batch only runs at the end of
 * Process; offering it during Organise would queue tasks into a batch that never happens,
 * which looks like a decision taken and is in fact nothing at all. */
function canBatch(ctx) {
  return Array.isArray(ctx.quickBatch) && ctx.mode !== "organise";
}
/** "Next action saved — add another, done, or batch this one?"
 *
 * Batching is one more option on a question already being asked, not a new prompt per
 * action: it costs a tap only when used. Choosing it queues the action and returns to the
 * same question, so you still decide whether to add more. Returns "another" or "done". */
async function askAfterAction(ctx, file, session) {
  const { prompter } = ctx;
  for (let n = 0; n < MAX_SUBTASK_RETRIES * 2; n++) {
    const last = session.made[session.made.length - 1];
    // Everything made in this go has been removed: carry on adding.
    if (!last) return "another";
    await showMadeAction(ctx, file, session, last.line);
    const options = [
      { label: "Add **another**", value: "another" },
      { label: "Done", value: "done" }
    ];
    const offer = !last.entry && canBatch(ctx);
    if (offer) options.push({ label: "It\u2019s **under two minutes** \u2014 batch it", value: "batch" });
    options.push({ label: "**Fix** one of these\u2026", value: "fix" });
    const answer = await prompter.choice(
      last.entry ? "Added to the **two-minute batch**." : "Next action **saved**.",
      options,
      offer ? GUIDANCE.batchHere : GUIDANCE.fixAction
    );
    if (answer === "batch") {
      const raw = await readLine(ctx.app, file, last.line);
      if (queueQuickAction(ctx, { file, startLine: last.line, raw: raw != null ? raw : "" })) {
        last.entry = ctx.quickBatch[ctx.quickBatch.length - 1];
      }
      continue;
    }
    if (answer === "fix") {
      await fixMadeAction(ctx, file, session);
      continue;
    }
    return answer;
  }
  return "done";
}
function queueQuickAction(ctx, item) {
  if (!Array.isArray(ctx.quickBatch)) return false;
  ctx.quickBatch.push({ file: item.file, line: item.startLine, raw: item.raw });
  return true;
}
/** Where a queued task is now, or -1 if it has gone. By the time the batch runs, earlier
 * tasks may have moved lines about, so it is found again by its text — and anything whose
 * text no longer matches has been changed or removed since, and is not ours to touch. */
function locateQueuedAction(lines, entry) {
  return locateByText(lines, entry.line, entry.raw);
}
/** Where a line with exactly this text is now — nearest to `predicted` — or -1 if no line
 * has it. Unlike reanchorLine, never falls back to the predicted line: a line that no
 * longer reads as expected is not the one that was meant. */
function locateByText(lines, predicted, raw) {
  const at = reanchorLine(lines, predicted, raw);
  if (at < 0 || at >= lines.length) return -1;
  return lines[at].trim() === String(raw == null ? "" : raw).trim() ? at : -1;
}
/* ------------------------------ Splitting a capture ------------------------------
 * GTD clarifies one thing at a time. A capture holding several — "call Sam, book the
 * venue, plan the Berlin trip" — is split into separate items, and each is then taken
 * through Process on its own. Nothing about projects, deferral, Someday or the two-minute
 * batch needs special handling: each piece simply gets the full flow, so a capture that
 * hides a project beside some loose tasks sorts itself out. */
var MAX_SPLIT_PIECES = 20;
/** A typed piece, with any list marker or checkbox the user included stripped off. A
 * marker needs a following space to count, so "+1 the report" is left as written. */
function cleanPieceText(text) {
  return String(text || "").replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\[.\]\s*)?/, "").trim();
}
/** Replace a capture with its pieces, in one write. Returns the lines written.
 *
 * The first piece takes the capture's place, so anything indented beneath it — notes,
 * links — stays attached to it; the rest follow after that subtree as siblings. Each piece
 * keeps the capture's indentation and list marker, and starts open. */
async function replaceWithPieces(app, item, pieces) {
  const raws = [];
  await app.vault.process(item.file, (data) => {
    const lines = data.split("\n");
    const original = lines[item.startLine] || "";
    const m = original.match(/^([\t ]*)([-*+])\s+\[.\]/);
    const indent = m ? m[1] : (original.match(/^[\t ]*/) || [""])[0];
    const marker = m ? m[2] : "-";
    for (const p of pieces) raws.push(`${indent}${marker} [ ] ${p}`);
    lines[item.startLine] = raws[0];
    lines.splice(item.endLine + 1, 0, ...raws.slice(1));
    return lines.join("\n");
  });
  return raws;
}
/** Take each piece of a split through Process in turn.
 *
 * Walked INSIDE the current task rather than added to the review's queue. The queue is
 * fixed at the start and backed by four index-aligned arrays — positions, offsets, batch
 * marks, disposals — and inserting into it mid-review is exactly the kind of change that
 * has broken that loop before. Walking here instead gives the right behaviour for free:
 * Restart rolls back the whole split and restores the capture, Skip skips one piece, and
 * a cancelled dialogue redoes just the piece it happened in.
 *
 * Each piece is found again by its text before it is processed, because handling an
 * earlier one may have moved lines — filing it under a project elsewhere in the note
 * reorders the file without changing its length. A piece that has gone is passed over. */
async function processSplitPieces(ctx, file, raws, startLine, depth) {
  const { prompter, settings } = ctx;
  let predicted = startLine;
  let retries = 0;
  const processed = [];
  for (let k = 0; k < raws.length; ) {
    const lines = (await ctx.app.vault.read(file)).split("\n");
    const at = reanchorLine(lines, predicted, raws[k]);
    if (at < 0 || at >= lines.length || lines[at].trim() !== raws[k].trim()) {
      k++;
      continue;
    }
    const end = computeSubtreeEnd(lines, at);
    const ancestors = computeAncestorLines(lines, at);
    const piece = {
      file,
      startLine: at,
      endLine: end,
      raw: lines[at],
      status: taskStatusOf(lines[at]),
      isProject: lineHasTag(lines[at], settings.projectTag),
      parentRaw: ancestors.length ? ancestors.map((n) => lines[n]).join("\n") : null,
      sourceLabel: null
    };
    await prompter.highlightInSource(piece);
    const before = lines.length;
    const outcome = await attemptSubItem(ctx, piece, depth + 1);
    if (outcome === "retry") {
      // The file is back as it was, so the same piece is in the same place.
      if (++retries > MAX_SUBTASK_RETRIES) throw new ReviewControl("back");
      continue;
    }
    retries = 0;
    // Skipped pieces are left alone, here and by anything that carries on afterwards.
    if (outcome === "done") processed.push(piece);
    const after = await lineCount(ctx.app, file);
    predicted = end + (after - before) + 1;
    k++;
  }
  return processed;
}
/** Ask for the pieces, write them in, and process each. */
async function splitCapture(ctx, item, depth) {
  const { prompter } = ctx;
  const pieces = [];
  for (let n = 0; n < MAX_SPLIT_PIECES; n++) {
    // Keyed on whether a piece exists yet, not on the attempt number: an entry that cleans
    // to nothing — whitespace, a stray "- [ ]" — must ask for the FIRST item again, not
    // move on to "next item" when there is no first one.
    const first = pieces.length === 0;
    const typed = await prompter.text(
      first ? "**Split it** \u2014 first item" : "**Next item** (leave blank to finish)",
      first ? { guidance: GUIDANCE.split } : { allowEmpty: true }
    );
    const text = cleanPieceText(typed);
    if (!text) {
      if (first) continue;
      break;
    }
    pieces.push(text);
  }
  // Nothing usable entered: treat it like any other cancelled step and start the task again.
  if (!pieces.length) throw new ReviewControl("retry");
  const raws = await replaceWithPieces(ctx.app, item, pieces);
  if (item.endLine > item.startLine) prompter.info("Notes beneath it stay with the first item.");
  // Kept so a re-process in Organise can carry on with each piece in its final form.
  item.splitPieces = await processSplitPieces(ctx, item.file, raws, item.startLine, depth);
}
/** "Not actionable this week": decide what happens to it.
 *
 * The answers are in the order they are chosen — trash, incubate, done, defer, reference
 * — which is also GTD's own order for things that aren't next actions. Marking it
 * cancelled (or deleting it, if cancelling is switched off) comes first; Delete otherwise
 * goes last, as the one answer that leaves nothing behind.
 *
 * The wording is clarified only for the answers you will meet again — deferred, Someday,
 * reference, moved — and only once. It used to be asked first, for everything, so a task
 * about to be cancelled or ticked off had to be reworded on its way out. Cancelling the
 * editor comes back to this question, as cancelling does everywhere. */
async function settleNotActionable(ctx, item) {
  const { prompter, settings } = ctx;
  const enabled = new Map(disposeOptions(settings).map((a) => [a.value, a]));
  const answer = (a) => ({ label: a.label, value: a.value });
  const cancel = enabled.get("cancel");
  const del = enabled.get("delete");
  const done = enabled.get("complete");
  const options = [];
  if (cancel || del) options.push(answer(cancel || del));
  options.push({ label: "**Someday** \u2014 not committed", value: "someday" });
  if (done) options.push(answer(done));
  options.push(
    { label: "**Not yet** \u2014 bring it back on a date\u2026", value: "tickle" },
    { label: "File as **reference**", value: "reference" },
    { label: "**Move** to custom location\u2026", value: "move" }
  );
  if (cancel && del) options.push(answer(del));
  let clarified = false;
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    const choice = await prompter.choice("What should **happen** to it?", options, GUIDANCE.disposition);
    const action = disposeActionFor(choice);
    if (action) {
      if (settings.confirmBeforeDelete) {
        const ok = await prompter.confirm(`${action.label} this task (and its subtasks)?`);
        if (!ok) continue;
      }
      item.disposed = true;
      item.outcome = action.value;
      if (action.symbol === null) {
        await removeSubtree(ctx.app, item.file, item.startLine, item.endLine);
      } else if (action.value === "complete") {
        // Through Tasks, so recurring tasks continue and a done date is recorded.
        await completeSubtree(ctx, item.file, item.startLine, item.endLine);
      } else {
        // Marking keeps the task in place, so nothing else may move or remove it after.
        await cancelSubtree(ctx, item.file, item.startLine, item.endLine);
      }
      return;
    }
    if (!clarified) {
      guide(ctx, "Clarify it before filing", GUIDANCE.clarifyBeforeFiling);
      const edited = await editTaskLineTagged(ctx, item.file, item.startLine, []);
      if (edited === null) continue;
      item.raw = edited;
      clarified = true;
    }
    if (choice === "tickle") {
      const when = await pickTickleDate(ctx);
      if (!when) continue;
      // Dated FIRST, then moved: the start dates are written into the lines that move,
      // so they travel with the task. Moving first would leave the old position holding
      // whatever task slid into it — and that is the one that would be dated.
      await tickleSubtree(ctx.app, item.file, item.startLine, item.endLine, when);
      // Out of this review until its date, whether it stays or moves.
      item.disposed = true;
      item.outcome = "deferred";
      const filing = ctx.filing || new DefaultFilingStrategy();
      const placed = await filing.fileTask(ctx, item, {
        allowStay: true,
        question: `Deferred until ${when}. **Where** should it wait?`,
        guidance: GUIDANCE.deferredHome
      });
      if (placed !== "moved") prompter.info(`Deferred \u2014 back on ${when}.`);
      return;
    }
    if (choice === "reference") {
      const suggested = deTaskLine(item.raw).slice(0, 60) || "Reference";
      const name = await prompter.text("**Name** for the reference note", {
        placeholder: suggested,
        guidance: GUIDANCE.reference
      });
      await createNoteFromTemplate(
        ctx.app,
        settings.referenceFolder,
        name || suggested,
        settings.referenceTemplatePath,
        deTaskLine(item.raw) + "\n"
      );
      await removeSubtree(ctx.app, item.file, item.startLine, item.endLine);
      item.disposed = true;
      item.outcome = "reference";
      return;
    }
    if (choice === "someday") {
      if (await somedayLastOfProject(ctx, item)) return;
      await moveSubtreeToNote(ctx.app, item.file, item.startLine, item.endLine, settings.somedayNotePath);
      item.disposed = true;
      item.outcome = "someday";
      // "Just this step — add the project's next action": once the step has gone.
      if (item.projectAfter) {
        const project = item.projectAfter;
        delete item.projectAfter;
        if (await settleEmptyProject(ctx, item.file, project, "add") === "none-added") {
          await resolveEmptyProject(ctx, item.file, project, "add");
        }
      }
      return;
    }
    const picked = await prompter.suggestFile();
    if (!picked) {
      prompter.info("Move cancelled \u2014 pick a destination, or use Skip task.");
      continue;
    }
    await moveSubtree(ctx.app, item.file, item.startLine, item.endLine, picked.path);
    item.disposed = true;
    item.outcome = "moved";
    new obsidian.Notice(`Moved to ${picked.path}`);
    return;
  }
  // Asked again and again with nothing settled: start the task again rather than spin.
  throw new ReviewControl("retry");
}
/** The tag that marks a waiting-for, without its #. */
function waitingForTag(settings) {
  const tag = String(settings && settings.waitingForTag || "").trim().replace(/^#/, "");
  return tag || "waitingfor";
}
function isWaitingFor(line, settings) {
  return hasExactTag(String(line || ""), waitingForTag(settings));
}
/** When to chase a waiting-for. Returns a YYYY-MM-DD after today, "" for no date, or null. */
async function pickChaseDate(ctx) {
  const { prompter } = ctx;
  const today = todayString();
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    const choice = await prompter.choice(
      "When should you **chase** it?",
      [
        { label: `**Tomorrow** — ${shiftDate(today, 1)}`, value: shiftDate(today, 1) },
        { label: `**Next week** — ${shiftDate(today, 7)}`, value: shiftDate(today, 7) },
        { label: `In **two weeks** — ${shiftDate(today, 14)}`, value: shiftDate(today, 14) },
        { label: `Next **month** — ${addMonths(today, 1)}`, value: addMonths(today, 1) },
        { label: "**Another date**…", value: "__pick__" },
        { label: "**No date** — I’ll see it in my review", value: "__none__" }
      ],
      GUIDANCE.chase
    );
    if (choice === "__none__") return "";
    if (choice !== "__pick__") return choice;
    const when = await askForDate(ctx, today, "Chase it **on**\u2026");
    if (when) return when;
  }
  return null;
}
/** Someone else does it. What is left for you is to wait and, if nothing comes, to chase:
 * the task is reworded as what you are waiting for and from whom, tagged as a waiting-for,
 * and given the date you would chase it as its start date — the same date Not yet uses, so
 * it stays out of Process until then. Cancelling the wording starts the task again. */
async function delegateTask(ctx, item) {
  const { prompter, settings } = ctx;
  const tag = waitingForTag(settings);
  guide(ctx, "Who is it **waiting** on?", GUIDANCE.delegate.replace("{tag}", `#${tag}`));
  item.raw = await editTaskLineOrRestart(ctx, item.file, item.startLine, [`#${tag}`]);
  item.delegated = true;
  item.outcome = "waiting";
  const when = await pickChaseDate(ctx);
  if (when === null) throw new ReviewControl("retry");
  if (when) {
    await tickleSubtree(ctx.app, item.file, item.startLine, item.endLine, when);
    item.raw = await readLine(ctx.app, item.file, item.startLine);
    prompter.info(`Waiting for — chase on ${when}.`);
  } else {
    prompter.info("Waiting for — no chase date.");
  }
}
async function runProcess(ctx, item, depth = 0) {
  const { prompter, settings, tasks } = ctx;
  /* Yes and No first, in that order on every item: they are most of the answers, and a
   * fixed place for each is what lets a hand learn where to go. */
  const actionableOptions = [{ label: "Yes", value: true }, { label: "No", value: false }];
  /* The two-minute rule is answered HERE, on the first question, not after "Yes" on the
   * next one: a two-step route to it went unused. Process only — the batch runs at the
   * end of Process — and never for a project, which is more than two minutes by definition. */
  if (canBatch(ctx) && !item.isProject) {
    actionableOptions.push({ label: "Yes \u2014 **under two minutes**, batch it", value: "twomin" });
  }
  /* Actionable, but by someone else: it becomes a waiting-for. Next to the other Yes answers
   * and in the same place at every depth — a project's next action can be someone else's
   * too. Not for a project as a whole: its next actions are where the waiting happens. */
  if (!item.isProject) {
    actionableOptions.push({ label: "Yes \u2014 **someone else** does it\u2026", value: "delegate" });
  }
  /* Splitting comes before every other decision: a capture holding several things has no
   * single answer to "is it actionable?". Top level only — a piece of a split is not split
   * again, and a project's subtask is already one thing. */
  if (depth === 0 && !item.isProject) {
    actionableOptions.push({ label: "It\u2019s **several things** \u2014 split it\u2026", value: "split" });
  }
  const actionable = await prompter.choice("**Actionable** this week?", actionableOptions, GUIDANCE.actionable);
  // Checked BEFORE the actionable test below: "split" is truthy, and falling through would
  // send a compound capture down the single-action path.
  if (actionable === "split") {
    item.outcome = "split";
    await splitCapture(ctx, item, depth);
    return;
  }
  // Also before the actionable test: "twomin" is truthy too.
  if (actionable === "twomin") {
    /* GTD's two-minute rule, decided here but DONE later. Stopping mid-processing to do a
     * quick task is exactly where a session gets derailed: the quick reply becomes a long
     * one, and the list never gets emptied. So it is queued, and the whole queue is
     * cleared in one run once every item has been decided.
     *
     * Held in memory rather than tagged in the file. If the review is abandoned, the task
     * is simply still there as an ordinary next action — nothing to clean up, nothing lost. */
    queueQuickAction(ctx, item);
    item.outcome = "twomin";
    prompter.info("Saved for the two-minute batch at the end.");
    return;
  }
  // Before the actionable test too: "delegate" is truthy, and is not your next action.
  if (actionable === "delegate") {
    await delegateTask(ctx, item);
    return;
  }
  if (!actionable) {
    await settleNotActionable(ctx, item);
    return;
  }
  if (item.isProject) {
    /* Already tagged as a project. Asking "is this a project?" here invites an answer
     * that would either double-tag it or, worse, rewrite an existing project as a
     * subtask of a new one. Go straight to the work the "yes" branch does: edit the
     * parent, then add subtasks. No tag is applied because it already has one. */
    guide(ctx, "Review the project\u2019s outcome", GUIDANCE.outcome);
    item.raw = await editTaskLineOrRestart(ctx, item.file, item.startLine, []);
    item.outcome = "project";
    /* Existing subtasks are decisions already made that may need revisiting, so walk them
     * before offering to add new ones — appending becomes the last step rather than the
     * only one. Depth-limited, since a nested project recurses through here again. */
    let end = item.endLine;
    if (depth < MAX_PROJECT_DEPTH) {
      end = await processProjectChildren(Object.assign({}, ctx, { walkingProject: item }), item, depth);
    }
    // Its last next action gone during the walk: what becomes of it, not "Add another…".
    if (await settleProjectAfterWalk(ctx, item)) return;
    // A cancelled first action adds nothing and comes back here, rather than moving on.
    for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
      const more = await prompter.choice("Add **another** next action to this project?", [
        { label: "Add **another**", value: "yes" },
        { label: "**Done** with this project", value: "no" }
      ], GUIDANCE.moreActions);
      if (more !== "yes") break;
      if (await addSubtasks(ctx, item.file, end, null, false, false, item.startLine) > 0) break;
    }
    return;
  }
  /* This note's projects, listed by name in "Which project". Projects in other notes are
   * found only if you search for them, and shown with their note, so the two never mix. */
  const existingProjects = await findProjectLines(
    ctx.app,
    item.file,
    settings.projectTag,
    item.startLine,
    item.endLine
  );
  /* GTD's question here is not "is this a project?" in the abstract — it is "does this need
   * more than one step?", and if so, is what you captured the OUTCOME or one of the STEPS?
   * Those are the only two shapes, so they are offered as such. Whether the project already
   * exists is a detail for the next prompt, not a different answer to this one; it used to
   * be split across a "Yes" option and a "No" option for what is the same decision. */
  const projectKind = await prompter.choice(
    "Does this need **more than one step**?",
    [
      { label: "No \u2014 it\u2019s a **single** next action", value: "no" },
      { label: "Yes \u2014 this is the project\u2019s **outcome**", value: "yes" },
      { label: "Yes \u2014 it\u2019s **one step** in a bigger project\u2026", value: "step" }
    ],
    GUIDANCE.projectShape
  );
  if (projectKind === "step") {
    const target = await chooseStepProject(ctx, item, existingProjects);
    if (target === "__filed__") return;
    if (target === "__new__") {
      guide(ctx, "Name the new project", GUIDANCE.outcome);
      const mainRaw = await awaitTasksModal(ctx, tasks.createNewTaskLine());
      if (!mainRaw) throw new ReviewControl("retry");
      const indent = getIndentUnit(ctx.app);
      await indentRange(ctx.app, item.file, item.startLine, item.endLine, indent);
      // At the task's own depth, so a nested task's new project stays where the task was.
      const depthIndent = (String(item.raw || "").match(/^[\t ]*/) || [""])[0];
      const mainTagged = depthIndent + insertBeforeTasksMetadata(mainRaw.trim(), [`#${settings.projectTag}`]);
      await insertLineAfter(ctx.app, item.file, item.startLine - 1, mainTagged);
      item.raw = mainTagged;
      item.outcome = "project";
      const actionLine = item.startLine + 1;
      await clarifyFiledAction(ctx, item.file, actionLine);
      for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
        const more = await prompter.choice("Add **another** next action to this project?", [
          { label: "Add **another**", value: "yes" },
          { label: "Done", value: "no" }
        ], GUIDANCE.moreActions);
        if (more !== "yes") break;
        // Passing the filed action as the seed lets a new action be chained after it.
        if (await addSubtasks(ctx, item.file, item.endLine + 1, actionLine, false, false, item.startLine) > 0) break;
      }
      return;
    }
    const targetLine = Number(target);
    const moved = await moveSubtreeUnderProject(
      ctx.app,
      item.file,
      item.startLine,
      item.endLine,
      targetLine,
      getIndentUnit(ctx.app)
    );
    const span = item.endLine - item.startLine;
    item.startLine = moved;
    item.endLine = moved + span;
    item.moved = true;
    item.outcome = "step";
    const rewritten = await clarifyFiledAction(ctx, item.file, moved);
    if (rewritten) item.raw = rewritten;
    prompter.info(`Filed under \u201C${projectPickerLabel(existingProjects.find((p) => p.line === targetLine).raw)}\u201D.`);
    return;
  }
  if (projectKind === "no") {
    guide(ctx, "Clarify the next action", GUIDANCE.nextAction);
    item.raw = await editTaskLineOrRestart(ctx, item.file, item.startLine, []);
    item.outcome = "next";
    const rewritten = await confirmNextAction(ctx, item.file, item.startLine);
    if (rewritten) item.raw = rewritten;
    return;
  }
  if (projectKind === "yes") {
    guide(ctx, "Name the project\u2019s outcome", GUIDANCE.outcome);
    /* Edit the title, then tag it as a project.
     *
     * These must be ONE write derived from one known-good string. Editing via the Tasks
     * command mutates the open editor, and the editor reaches disk asynchronously, so
     * reading the line back here could return the PRE-edit text: the tag would then be
     * appended to the old title, and the editor's later flush would overwrite that with
     * the new title minus the tag. Exactly the reported symptom — the tag applied without
     * the rename, then the rename applied without the tag.
     *
     * editTaskLineTagged resolves the edited text before writing, so title and tag land
     * together in a single replaceLine. */
    item.raw = await editTaskLineOrRestart(ctx, item.file, item.startLine, [`#${settings.projectTag}`]);
    item.outcome = "project";
    await addSubtasks(ctx, item.file, item.endLine, null, false, true, item.startLine);
    return;
  }
}
/* ------------------------------ What a review did ------------------------------
 * Counted at the end, from what became of each task. Only tasks the review was working
 * through are counted — not a project's own next actions — and anything undone with Back
 * or Previous is not counted at all. */
var SUMMARY_WORDS = {
  next: ["next action", "next actions"],
  project: ["project", "projects"],
  step: ["step filed in a project", "steps filed in projects"],
  waiting: ["waiting on someone else", "waiting on someone else"],
  deferred: ["deferred", "deferred"],
  someday: ["to Someday", "to Someday"],
  reference: ["filed as reference", "filed as reference"],
  moved: ["moved to another note", "moved to other notes"],
  complete: ["marked done", "marked done"],
  cancel: ["cancelled", "cancelled"],
  delete: ["deleted", "deleted"],
  organised: ["organised", "organised"],
  skipped: ["skipped", "skipped"]
};
// Outcomes that take a task out of Organise too, when it is re-processed there.
var LEAVING_OUTCOMES = /* @__PURE__ */ new Set(["deferred", "someday", "reference", "moved", "complete", "cancel", "delete"]);
/** What became of one task: a list, since a split capture is each of its pieces. */
function outcomesOf(item, mode) {
  if (mode === "organise") return [LEAVING_OUTCOMES.has(item.outcome) ? item.outcome : "organised"];
  if (item.outcome === "split") return (item.splitPieces || []).flatMap((p) => outcomesOf(p, mode));
  return item.outcome ? [item.outcome] : [];
}
/** "6 next actions", "2 to Someday"…, in the order the answers are offered. */
function sessionSummary(outcomes, batchDone = 0) {
  const counts = /* @__PURE__ */ new Map();
  for (const o of outcomes) if (SUMMARY_WORDS[o]) counts.set(o, (counts.get(o) || 0) + 1);
  const lines = Object.keys(SUMMARY_WORDS).filter((k) => counts.has(k)).map((k) => {
    const n = counts.get(k);
    return `${n} ${SUMMARY_WORDS[k][n === 1 ? 0 : 1]}`;
  });
  if (batchDone) lines.push(`${batchDone} done in the two-minute batch`);
  return lines;
}
/* ------------------------------ Dependency markers ------------------------------
 * Tasks' own emoji fields: "🆔 abc123" names a task, "⛔ abc123,def456" makes it wait on
 * others. Read and rewritten here so a next action can be removed from a "must wait"
 * chain without breaking it. */
var TASK_ID_RE = /\u{1F194}️?\s*([A-Za-z0-9_-]+)/u;
var DEPENDS_ON_RE = /\s*⛔️?\s*([A-Za-z0-9_-]+(?:\s*,\s*[A-Za-z0-9_-]+)*)/u;
function taskIdOf(line) {
  const m = String(line || "").match(TASK_ID_RE);
  return m ? m[1] : null;
}
function dependsOnOf(line) {
  const m = String(line || "").match(DEPENDS_ON_RE);
  return m ? m[1].split(",").map((x) => x.trim()).filter(Boolean) : [];
}
/** Replace a line's "waits on" list; an empty list removes the marker altogether. */
function setDependsOn(line, ids) {
  const text = String(line || "");
  const marker = ids.length ? ` ⛔ ${ids.join(",")}` : "";
  if (DEPENDS_ON_RE.test(text)) return text.replace(DEPENDS_ON_RE, marker);
  return marker ? `${text.replace(/\s+$/, "")}${marker}` : text;
}
/** A line's id, adding one if it has none. Reused when present: a task may carry only one,
 * and a next action removed from the chain can leave its predecessor named already. */
async function ensureTaskId(ctx, file, line) {
  const current = await readLine(ctx.app, file, line);
  const existing = taskIdOf(current);
  if (existing) return existing;
  const id = ctx.tasks.newDependencyId();
  await replaceLine(ctx.app, file, line, `${String(current || "").replace(/\s+$/, "")} ${ctx.tasks.idSignifier(id)}`);
  return id;
}
/** Remove a next action made in this go. Anything that was waiting on it now waits on
 * whatever it was waiting on, so "is not blocked" lists still show the right action. */
async function removeMadeAction(ctx, file, session, target) {
  await ctx.app.vault.process(file, (data) => {
    const lines = data.split("\n");
    const raw = lines[target.line];
    const id = taskIdOf(raw);
    const waitsOn = dependsOnOf(raw);
    if (id) {
      for (const m of session.made) {
        if (m === target) continue;
        const deps = dependsOnOf(lines[m.line]);
        if (!deps.includes(id)) continue;
        const merged = [...new Set(deps.flatMap((d) => (d === id ? waitsOn : [d])))];
        lines[m.line] = setDependsOn(lines[m.line], merged);
      }
    }
    lines.splice(target.line, 1);
    return lines.join("\n");
  });
  session.made.splice(session.made.indexOf(target), 1);
  for (const m of session.made) {
    if (m.line > target.line) {
      m.line -= 1;
      if (m.entry) m.entry.line = m.line;
    }
  }
  if (target.entry) target.entry.removed = true;
}
/** "Fix one of these…": reword or remove a next action made in this go, leaving the rest.
 * Back, and cancelling the reword dialogue, each return to the question before. */
/** Put a next action made in this go on screen, under its project — the project greyed above
 * it, as when Organise labels a project's next actions. Without this the pane went on
 * showing the project alone, so "Next action saved." never showed what had been saved. */
async function showMadeAction(ctx, file, session, line) {
  if (!ctx.prompter.focusSubtask) return;
  const raw = await readLine(ctx.app, file, line);
  if (raw == null || !isTaskLine(raw)) return;
  const parentRaw = typeof session.parentLine === "number" ? await readLine(ctx.app, file, session.parentLine) : null;
  ctx.prompter.focusSubtask({ file, raw: parentRaw == null ? null : parentRaw }, line, raw);
}
async function fixMadeAction(ctx, file, session) {
  const { prompter } = ctx;
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    let target = session.made[session.made.length - 1];
    if (!target) return;
    if (session.made.length > 1) {
      const lines = (await ctx.app.vault.read(file)).split("\n");
      const options = session.made.slice().reverse().map((m) => ({ label: actionText(lines[m.line]) || "(empty)", value: String(m.line) }));
      options.push({ label: "Back", value: "__back__" });
      const picked = await prompter.choice("**Which one**?", options, GUIDANCE.fixAction);
      target = session.made.find((m) => String(m.line) === String(picked));
      if (!target) return;
    }
    for (let k = 0; k < MAX_SUBTASK_RETRIES; k++) {
      await showMadeAction(ctx, file, session, target.line);
      const text = actionText(await readLine(ctx.app, file, target.line));
      const how = await prompter.choice(
        `**Fix** “${text}”`,
        [
          { label: "**Reword** it…", value: "reword" },
          { label: "**Remove** it", value: "remove" },
          { label: "Back", value: "__back__" }
        ],
        GUIDANCE.fixAction
      );
      if (how === "reword") {
        guide(ctx, "Reword the next action", GUIDANCE.nextAction);
        const edited = await editTaskLineTagged(ctx, file, target.line, []);
        if (edited === null) continue;
        const rewritten = await confirmNextAction(ctx, file, target.line);
        if (target.entry) target.entry.raw = rewritten || edited;
        return;
      }
      if (how === "remove") {
        await removeMadeAction(ctx, file, session, target);
        return;
      }
      break;
    }
    if (session.made.length <= 1) return;
  }
}
async function addSubtasks(ctx, file, insertAfter, seedPrevLine, editSeedFirst = false, requireOne = false, parentLine) {
  const { prompter, tasks } = ctx;
  /* One level below the PROJECT, not one level below the margin. They differ once the
   * project is itself nested — a next action turned into a project during a walk — where
   * a fixed single indent made its new actions its siblings instead of its children. */
  let indent = getIndentUnit(ctx.app);
  if (typeof parentLine === "number") {
    const parentRaw = await readLine(ctx.app, file, parentLine);
    indent = (String(parentRaw || "").match(/^[\t ]*/) || [""])[0] + indent;
  }
  /* Everything made in this go, in order: { line, entry }, where entry is its place in the
   * two-minute batch if it has one. Kept so one can be fixed without starting again. The
   * first new action goes after `insertAfter`, and waits (if asked) on `seedPrevLine`. */
  const session = { made: [], parentLine };
  const lastMade = () => session.made.length ? session.made[session.made.length - 1].line : null;
  for (let cancels = 0; cancels < MAX_SUBTASK_RETRIES; ) {
    guide(ctx, session.made.length === 0 ? "Add the first next action" : "Add another next action", GUIDANCE.nextAction);
    const newLine = await awaitTasksModal(ctx, tasks.createNewTaskLine());
    if (!newLine) {
      cancels++;
      if (session.made.length === 0) {
        /* Cancelled before one exists. A project this step has just created would be left
         * with no next action, which nobody asked for, so the task is rolled back.
         * Otherwise nothing has changed, and the cancel goes back to whatever asked to
         * add one. */
        if (requireOne) throw new ReviewControl("retry");
        return 0;
      }
      // Cancelled "Add another": back to the question that opened it, below. It used to end
      // the project, leaving Restart or Revert — which discard every action made so far —
      // as the only way back to a mistake.
    } else {
      cancels = 0;
      const prevLine = lastMade() !== null ? lastMade() : seedPrevLine;
      /* Saved first, then shown, then asked about: so "Must this wait…?" and "Next action
       * saved." both have the new action on screen. Saving it ahead of the question changes
       * nothing else — the marker, if any, is added to the saved line. */
      const at = await insertLineAfter(ctx.app, file, lastMade() !== null ? lastMade() : insertAfter, indent + newLine.trim());
      session.made.push({ line: at, entry: null });
      await showMadeAction(ctx, file, session, at);
      if (prevLine !== null) {
        // Sequential vs parallel, in GTD terms: if this cannot start until the previous one
        // is done, only the first is a real next action and the rest are blocked behind it,
        // which is exactly what "is not blocked" queries rely on to show true next actions.
        const dependsOnPrevious = await prompter.confirm("Must this **wait** until the previous action is done?", GUIDANCE.sequential);
        if (dependsOnPrevious) {
          const id = await ensureTaskId(ctx, file, prevLine);
          const saved = await readLine(ctx.app, file, at);
          await replaceLine(ctx.app, file, at, `${String(saved).replace(/\s+$/, "")} ${tasks.blockedBySignifier(id)}`);
          await showMadeAction(ctx, file, session, at);
        }
      }
      await confirmNextAction(ctx, file, at);
    }
    if (await askAfterAction(ctx, file, session) === "done") return session.made.length;
  }
  return session.made.length;
}
/* ------------------------------ Re-processing in Organise ------------------------------
 * Work moves on between processing a task and organising it: the wording goes stale, a
 * step turns out to be a project, a task is already done. "Re-process" (a nav button in
 * Organise) undoes what organising has done to the task in front of you, then lets you fix
 * its wording or take it through Process again — after which Organise carries on with
 * whatever the task has become.
 *
 * Scoped to what is in front of you: the whole task, or, while a project's next actions are
 * being labelled, just the one on screen. Without that, fixing the wording of a next action
 * would edit the project's line instead. */

/** Run `first`; if Re-process is pressed during it, roll back what it did and run `again`.
 *
 * Each attempt gets its own undo journal nested inside the task's, so the rollback reaches
 * exactly the start of this unit — the task's journal, which Restart uses, still reaches
 * the start of the task. The unit's own position and text are restored with the file, since
 * steps such as adding a next action move its end line.
 *
 * `localRetry` treats a cancelled dialogue as "do this attempt again" rather than letting
 * it restart the whole task — for a project's next action, the smallest unit. */
async function withReprocess(ctx, unit, first, again, { localRetry = false } = {}) {
  const snap = {
    startLine: unit.startLine,
    endLine: unit.endLine,
    raw: unit.raw,
    isProject: unit.isProject
  };
  let step = first;
  let reprocessed = false;
  for (let attempt = 0; ; attempt++) {
    const journal = new VaultJournal(ctx.app);
    await journal.capture(unit.file);
    const subCtx = Object.assign({}, ctx, {
      app: journalledApp(ctx.app, journal),
      // Which units have a handler already, so organiseTask does not stack another.
      reprocessScopes: (ctx.reprocessScopes || []).concat([unit])
    });
    try {
      await step(subCtx);
      return reprocessed;
    } catch (e) {
      if (!(e instanceof ReviewControl)) throw e;
      // A re-process aimed at an enclosing unit — the whole project, from one of its next
      // actions — passes through to that unit's own handler.
      const mine = e.kind === "reprocess" && (!e.target || e.target === unit);
      const local = mine || localRetry && e.kind === "retry";
      if (!local) throw e;
      const failed = await journal.restore();
      if (failed.length) {
        new obsidian.Notice(`${PLUGIN_NAME}: could not fully undo ${failed.length} file(s).`);
      }
      Object.assign(unit, snap);
      delete unit.disposed;
      delete unit.moved;
      delete unit.splitPieces;
      delete unit.outcome;
      delete unit.delegated;
      delete unit.movedElsewhere;
      delete unit.projectHandled;
      delete unit.afterWalk;
      delete unit.projectAfter;
      if (attempt >= MAX_SUBTASK_RETRIES) throw new ReviewControl("back");
      if (e.kind === "reprocess") {
        // Carries the answer already given, if there was one, so it isn't asked again.
        const how = e.how;
        step = (c) => again(c, how);
        reprocessed = true;
      }
    }
  }
}
/** Find a unit again after something may have moved it, and re-read what it is now.
 * Returns false if it is gone, finished, or no longer a task. */
async function refreshUnit(ctx, unit) {
  let lines;
  try {
    lines = (await ctx.app.vault.read(unit.file)).split("\n");
  } catch {
    return false;
  }
  let at = reanchorLine(lines, unit.startLine, unit.raw);
  if (at < 0 || at >= lines.length || lines[at].trim() !== String(unit.raw || "").trim()) {
    // Not found by its text. Rewording leaves a task where it was, so the remembered line is
    // the best guess — as long as it is still an open task.
    at = unit.startLine;
  }
  if (at < 0 || at >= lines.length || !isTaskLine(lines[at])) return false;
  if (COMPLETED_STATUSES.has(taskStatusOf(lines[at]))) return false;
  unit.startLine = at;
  unit.raw = lines[at];
  unit.endLine = computeSubtreeEnd(lines, at);
  unit.isProject = lineHasTag(lines[at], ctx.settings.projectTag);
  return true;
}
/** Label a unit without filing it: for something that lives inside a project. A project's
 * own line is not labelled — its next actions are, as when Organise meets one at the top. */
async function labelUnit(ctx, unit, parent) {
  if (!unit.isProject) {
    if (ctx.prompter.focusSubtask) ctx.prompter.focusSubtask(parent || unit, unit.startLine, unit.raw);
    await organiseLine(ctx, unit.file, unit.startLine, unit.raw);
    return;
  }
  const children = await getChildTaskLines(ctx.app, unit.file, unit.startLine, unit.endLine);
  for (const child of children) {
    if (ctx.prompter.focusSubtask) ctx.prompter.focusSubtask(unit, child.line, child.raw);
    await organiseLine(ctx, unit.file, child.line, child.raw);
  }
}
/** After re-processing, organise whatever the task has become.
 *
 * `fileIt` is false inside a project: a next action is labelled where it is, and moves
 * with its project when that is filed. */
async function organiseAfterProcess(ctx, unit, filing, fileIt, parent) {
  // Deleted, completed, sent to Someday, filed as reference, moved, or deferred and placed:
  // Process has already decided where it lives.
  if (unit.disposed) return;
  if (Array.isArray(unit.splitPieces)) {
    for (const piece of unit.splitPieces) await organiseAfterProcess(ctx, piece, filing, fileIt, parent);
    return;
  }
  if (!(await refreshUnit(ctx, unit))) return;
  // Filed as a step under a project: it lives with that project now.
  if (unit.moved || !fileIt) {
    await labelUnit(ctx, unit, parent);
    return;
  }
  /* Shown before it is organised. Processing leaves the pane on whatever it showed last —
   * the last piece of a split, or a project's last next action — so without this the
   * questions for every earlier piece appeared to be about the last one. */
  if (ctx.prompter.highlightInSource) await ctx.prompter.highlightInSource(unit);
  await organiseTask(ctx, unit, filing);
}
/** How to re-process what is on screen. From a project's next action, the whole project is
 * one more answer: Organise shows a project as its next actions, one at a time, so without
 * it the project itself could only be re-processed once every action had been labelled. */
async function askHowToReprocess(ctx, isNextAction, isProject = false) {
  const options = [
    { label: "Fix the **wording**…", value: "wording" },
    { label: "Process it **again** from the start", value: "process" }
  ];
  if (isNextAction) options.push({ label: "Process the **whole project** again", value: "project" });
  options.push({ label: "**Back** to organising", value: "organise" });
  return ctx.prompter.choice(
    isNextAction ? "Re-process this **next action**" : isProject ? "Re-process this **project**" : "Re-process this **task**",
    options,
    isNextAction ? GUIDANCE.reprocessInProject : GUIDANCE.reprocess
  );
}
/** The signal for "process the whole project again", raised from one of its next actions.
 * Aimed at the project's handler, so the next action's own handler lets it through, and the
 * rollback reaches back to before anything in the project was organised. */
function reprocessWholeProject(project) {
  const e = new ReviewControl("reprocess");
  e.target = project;
  e.how = "process";
  return e;
}
async function rewordUnit(ctx, unit) {
  guide(
    ctx,
    unit.isProject ? "Review the project’s outcome" : "Clarify the next action",
    unit.isProject ? GUIDANCE.outcome : GUIDANCE.nextAction
  );
  const edited = await editTaskLineTagged(ctx, unit.file, unit.startLine, []);
  if (edited === null) return "cancelled";
  unit.raw = edited;
  if (!unit.isProject) {
    const rewritten = await confirmNextAction(ctx, unit.file, unit.startLine);
    if (rewritten) unit.raw = rewritten;
  }
  return (await refreshUnit(ctx, unit)) ? "ok" : "gone";
}
/** `preset` is an answer already given — "process", when the whole project was chosen from
 * one of its next actions — so the question is not asked a second time. */
async function reprocessTask(ctx, item, filing, preset) {
  if (ctx.prompter.highlightInSource) await ctx.prompter.highlightInSource(item);
  let how = preset === "process" ? "process" : void 0;
  let reworded = "cancelled";
  // Cancelling the reword comes back to the choice of how to re-process.
  for (let n = 0; !preset && n < MAX_SUBTASK_RETRIES && reworded === "cancelled"; n++) {
    how = await askHowToReprocess(ctx, false, item.isProject);
    if (how !== "wording") break;
    reworded = await rewordUnit(ctx, item);
  }
  if (how === "wording") {
    if (reworded !== "ok") return;
    if (ctx.prompter.highlightInSource) await ctx.prompter.highlightInSource(item);
    await organiseTask(ctx, item, filing);
    return;
  }
  if (how === "process") {
    await runProcess(ctx, item, 0);
    await organiseAfterProcess(ctx, item, filing, true, null);
    return;
  }
  await organiseTask(ctx, item, filing);
}
async function reprocessNextAction(ctx, project, unit) {
  ctx.prompter.focusSubtask(project, unit.startLine, unit.raw);
  let how;
  let reworded = "cancelled";
  for (let n = 0; n < MAX_SUBTASK_RETRIES && reworded === "cancelled"; n++) {
    how = await askHowToReprocess(ctx, true);
    if (how !== "wording") break;
    reworded = await rewordUnit(ctx, unit);
  }
  if (how === "project") throw reprocessWholeProject(project);
  if (how === "wording") {
    if (reworded !== "ok") return;
    await labelUnit(ctx, unit, project);
    return;
  }
  if (how === "process") {
    await runProcess(ctx, unit, 1);
    await organiseAfterProcess(ctx, unit, null, false, project);
    return;
  }
  await labelUnit(ctx, unit, project);
}
/** Label every open next action in a project, one at a time, each re-processable.
 *
 * Each is found again by its text before it is shown, because re-processing an earlier one
 * can add, remove or move lines. A next action that has gone or changed is passed over, as
 * is anything that now sits inside one that was just re-processed — that was handled with it. */
async function organiseNextActions(ctx, project, children) {
  let delta = 0;
  const handled = new Set();
  for (const child of children) {
    const lines = (await ctx.app.vault.read(project.file)).split("\n");
    const at = reanchorLine(lines, child.line + delta, child.raw);
    if (at < 0 || at >= lines.length || lines[at].trim() !== child.raw.trim()) continue;
    if (handled.has(lines[at].trim())) continue;
    const unit = {
      file: project.file,
      startLine: at,
      endLine: computeSubtreeEnd(lines, at),
      raw: lines[at],
      isProject: lineHasTag(lines[at], ctx.settings.projectTag),
      sourceLabel: project.sourceLabel
    };
    const before = lines.length;
    const reprocessed = await withReprocess(
      ctx,
      unit,
      async (c) => {
        c.prompter.focusSubtask(project, unit.startLine, unit.raw);
        await organiseLine(c, unit.file, unit.startLine, unit.raw);
      },
      (c) => reprocessNextAction(c, project, unit),
      { localRetry: true }
    );
    if (reprocessed && !unit.disposed && (await refreshUnit(ctx, unit))) {
      const now = (await ctx.app.vault.read(project.file)).split("\n");
      for (let k = unit.startLine + 1; k <= unit.endLine && k < now.length; k++) handled.add(now[k].trim());
    }
    delta += (await lineCount(ctx.app, project.file)) - before;
  }
}
/** Organise one task: label it (or a project's next actions) and file it. */
async function organiseTask(ctx, item, filing) {
  if (item.isProject) {
    /* "Process the whole project again" needs a handler for this project to land in. Organise
     * normally has one already (runOrganise's, for the task it is on); a project that comes
     * out of re-processing as one piece of a split does not, so it gets its own here. The
     * handler runs the project's organising directly, never organiseTask again, so it
     * cannot recurse into itself. */
    if ((ctx.reprocessScopes || []).includes(item)) {
      await organiseProject(ctx, item, filing);
      return;
    }
    await withReprocess(
      ctx,
      item,
      (c) => organiseProject(c, item, filing),
      (c, how) => reprocessTask(c, item, filing, how)
    );
    return;
  }
  await organiseLine(ctx, item.file, item.startLine, item.raw);
  /* A step a query found inside a project lives with that project, which is filed whole
   * when it is organised itself. Filing the step on its own took it out of its project. */
  const lines = (await ctx.app.vault.read(item.file)).split("\n");
  if (projectAbove(lines, item.startLine, ctx.settings.projectTag)) {
    ctx.prompter.info("Labelled — it stays in its project.");
    return;
  }
  await filing.fileTask(ctx, item);
}
/* ------------------------- A project's last next action -------------------------
 * A task inside a project belongs to it, and a project is never left silently with
 * nothing to do. When a decision takes away a project's last open task — done, cancelled,
 * deleted, moved out, filed under another project — what becomes of the project is asked
 * there and then: the question Organise asks of a project with no next action. Sending the
 * last one to Someday asks first instead, so the whole project can go, with it inside.
 *
 * "Open" is anything not done or cancelled, at any depth: a deferred step or a waiting-for
 * still counts, since the project is then deferred or waiting, not empty. */
/** The nearest project a line sits under: { line, raw }, or null. */
function projectAbove(lines, line, projectTag) {
  const ancestors = computeAncestorLines(lines, line);
  for (let k = ancestors.length - 1; k >= 0; k--) {
    const raw = lines[ancestors[k]];
    if (isTaskLine(raw) && lineHasTag(raw, projectTag)) return { line: ancestors[k], raw };
  }
  return null;
}
/** Open tasks under the project at `start`, leaving out lines `skipStart`…`skipEnd`. */
function openTasksUnder(lines, start, end, skipStart = -1, skipEnd = -2) {
  let n = 0;
  for (let i = start + 1; i <= end && i < lines.length; i++) {
    if (i >= skipStart && i <= skipEnd) continue;
    if (isTaskLine(lines[i]) && !COMPLETED_STATUSES.has(taskStatusOf(lines[i]))) n++;
  }
  return n;
}
var EMPTY_PROJECT_ANSWERS = [
  { label: "**Add** a next action…", value: "add" },
  { label: "Send the **whole project** to Someday", value: "someday" },
  { label: "It’s **finished** — mark it complete", value: "done" },
  { label: "**Cancel** the project", value: "cancel" },
  { label: "**Leave** it for now", value: "leave" }
];
/** What becomes of a project with no next action. `suggest` marks the likely answer,
 * from what happened to its last one; every answer keeps its place. */
async function askEmptyProject(ctx, suggest = null) {
  return ctx.prompter.choice(
    "This project has **no next action**.",
    EMPTY_PROJECT_ANSWERS.map((o) => Object.assign({}, o, o.value === suggest ? { suggested: true } : {})),
    GUIDANCE.noNextAction
  );
}
/** Carry out an answer about a project, found again by its text. Returns "someday",
 * "done", "cancel", "added", "none-added" (adding was cancelled), "left" or "gone". */
async function settleEmptyProject(ctx, file, project, answer) {
  const lines = (await ctx.app.vault.read(file)).split("\n");
  const at = locateByText(lines, project.line, project.raw);
  if (at < 0) return "gone";
  const end = computeSubtreeEnd(lines, at);
  if (answer === "someday") {
    await moveSubtreeToNote(ctx.app, file, at, end, ctx.settings.somedayNotePath);
    return "someday";
  }
  if (answer === "done") {
    await completeSubtree(ctx, file, at, end);
    return "done";
  }
  if (answer === "cancel") {
    await cancelSubtree(ctx, file, at, end);
    return "cancel";
  }
  if (answer === "add") return await addSubtasks(ctx, file, end, null, false, false, at) > 0 ? "added" : "none-added";
  return "left";
}
/** Ask about a project that has nothing left to do, with it on screen, and act on the
 * answer. A next action that is added and then cancelled comes back to the question. */
async function resolveEmptyProject(ctx, file, project, suggest = null) {
  let known = project;
  for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
    const lines = (await ctx.app.vault.read(file)).split("\n");
    const at = locateByText(lines, known.line, known.raw);
    if (at < 0) return "gone";
    const end = computeSubtreeEnd(lines, at);
    if (openTasksUnder(lines, at, end) > 0) return "busy";
    known = { line: at, raw: lines[at] };
    if (ctx.prompter.highlightInSource) {
      const ancestors = computeAncestorLines(lines, at);
      await ctx.prompter.highlightInSource({
        file, startLine: at, endLine: end, raw: lines[at],
        parentRaw: ancestors.length ? ancestors.map((k) => lines[k]).join("\n") : null
      });
    }
    const result = await settleEmptyProject(ctx, file, known, await askEmptyProject(ctx, suggest));
    if (result !== "none-added") return result;
  }
  return "left";
}
/** After a task's decision: if the project it was in now has nothing left to do, ask. */
async function settleProjectLeft(ctx, item, project) {
  const lines = (await ctx.app.vault.read(item.file)).split("\n");
  const at = locateByText(lines, project.line, project.raw);
  if (at < 0 || openTasksUnder(lines, at, computeSubtreeEnd(lines, at)) > 0) return null;
  const suggest = item.outcome === "complete" ? "done" : item.outcome === "someday" ? "someday" : "add";
  return resolveEmptyProject(ctx, item.file, { line: at, raw: lines[at] }, suggest);
}
/** Someday for a project's last open task: whole project, or just this step? Asked before
 * anything moves, so the whole project can go with the step still inside it. Returns true
 * if the step needs nothing more — it went with its project, or will after the walk. */
async function somedayLastOfProject(ctx, item) {
  const lines = (await ctx.app.vault.read(item.file)).split("\n");
  const project = projectAbove(lines, item.startLine, ctx.settings.projectTag);
  if (!project) return false;
  const end = computeSubtreeEnd(lines, project.line);
  if (openTasksUnder(lines, project.line, end, item.startLine, item.endLine) > 0) return false;
  const answer = await ctx.prompter.choice("That’s the project’s **last next action**.", [
    { label: "Send the **whole project** to Someday", value: "someday" },
    { label: "Just this step — **add** the project’s next action…", value: "add" },
    { label: "Just this step — **leave** the project for now", value: "leave" }
  ], GUIDANCE.lastNextAction);
  item.projectHandled = true;
  item.outcome = "someday";
  /* Inside the project's own walk, the project can't move out from under it: the walk
   * finishes, then the project goes — or gets its next action. */
  const walk = ctx.walkingProject;
  if (walk && walk.file.path === item.file.path && walk.startLine === project.line) {
    walk.afterWalk = answer;
    return answer === "someday";
  }
  if (answer === "someday") {
    await moveSubtreeToNote(ctx.app, item.file, project.line, end, ctx.settings.somedayNotePath);
    item.disposed = true;
    ctx.prompter.info(`Sent to Someday with its project, “${projectPickerLabel(project.raw)}”.`);
    return true;
  }
  if (answer === "add") item.projectAfter = project;
  return false;
}
/** After a project's own walk: its last next action may have gone during it. Returns true
 * if that is settled here, in place of "Add another next action…". */
async function settleProjectAfterWalk(ctx, item) {
  const lines = (await ctx.app.vault.read(item.file)).split("\n");
  const at = locateByText(lines, item.startLine, item.raw);
  if (at < 0) return false;
  const end = computeSubtreeEnd(lines, at);
  const decided = item.afterWalk;
  delete item.afterWalk;
  const project = { line: at, raw: lines[at] };
  let result;
  if (decided === "someday") result = await settleEmptyProject(ctx, item.file, project, "someday");
  else if (decided === "leave") return true;
  else if (decided === "add") {
    result = await settleEmptyProject(ctx, item.file, project, "add");
    if (result === "none-added") result = await resolveEmptyProject(ctx, item.file, project, "add");
  } else {
    if (openTasksUnder(lines, at, end) > 0) return false;
    result = await resolveEmptyProject(ctx, item.file, project);
  }
  if (result === "someday") {
    item.disposed = true;
    item.outcome = "someday";
  } else if (result === "done") item.outcome = "complete";
  else if (result === "cancel") item.outcome = "cancel";
  return true;
}
/** A project: make sure it has a next action, label each one, then file it whole. */
async function organiseProject(ctx, item, filing) {
  /* GTD's core project rule: every active project has at least one next action. Without
   * one it sits on your list as a reminder you can do nothing about. Organise is where a
   * project is looked at whole, so this is where the gap is caught. */
  let children = await getChildTaskLines(ctx.app, item.file, item.startLine, item.endLine);
  // Asked again if adding one is cancelled: back to this question, not on to filing.
  for (let n = 0; children.length === 0 && n < MAX_SUBTASK_RETRIES; n++) {
    ctx.prompter.focusSubtask(item, item.startLine, item.raw);
    const fix = await askEmptyProject(ctx);
    if (fix === "done" || fix === "cancel" || fix === "someday") {
      await settleEmptyProject(ctx, item.file, { line: item.startLine, raw: item.raw }, fix);
      item.outcome = fix === "done" ? "complete" : fix;
      if (fix === "someday") item.disposed = true;
      return;
    }
    if (fix !== "add") break;
    const before = await lineCount(ctx.app, item.file);
    await addSubtasks(ctx, item.file, item.endLine, null, false, false, item.startLine);
    const grown = await lineCount(ctx.app, item.file) - before;
    item.endLine += grown;
    children = await getChildTaskLines(ctx.app, item.file, item.startLine, item.endLine);
  }
  await organiseNextActions(ctx, item, children);
  // Re-processing a next action can change the project's size, or where it sits; filing
  // the stale range would move the wrong lines.
  if (!(await refreshUnit(ctx, item))) return;
  // Filing moves the whole project, so the project is what's shown — not its last action.
  if (ctx.prompter.highlightInSource) await ctx.prompter.highlightInSource(item);
  await filing.fileTask(ctx, item);
}
async function runOrganise(ctx, item, filing) {
  await withReprocess(
    ctx,
    item,
    (c) => organiseTask(c, item, filing),
    (c, how) => reprocessTask(c, item, filing, how)
  );
}
/* ------------------------------ A suggested context ------------------------------
 * The verb a next action starts with usually says where it is done: you call from a
 * phone, buy when you are out. The context it points to is marked "suggested" on its
 * button — never chosen for you, and never moved, so every answer keeps its number.
 * Matched against your own contexts' names, so it only suggests one you have. */
var CONTEXT_HINTS = [
  { verbs: ["call", "phone", "ring", "text", "dial", "whatsapp"], names: ["phone", "phones", "call", "calls", "mobile"] },
  { verbs: ["email", "e-mail", "reply", "message", "order", "research", "google", "download", "renew", "submit", "look up", "find out"], names: ["computer", "pc", "laptop", "online", "internet", "email", "lookup", "desk"] },
  { verbs: ["buy", "pick up", "collect", "return", "drop off", "post", "shop"], names: ["errands", "errand", "outings", "outing", "out", "shops", "shopping", "town"] },
  { verbs: ["ask", "discuss", "talk", "tell", "raise", "mention"], names: ["agenda", "agendas", "people", "talk"] },
  { verbs: ["clean", "tidy", "cook", "wash", "water", "hoover", "vacuum", "iron", "bake", "mow", "hang"], names: ["home", "house"] },
  { verbs: ["print", "scan", "photocopy"], names: ["office", "printer", "work"] }
];
/** The id of the context a task's opening verb points to, or null. */
function suggestContext(dim, line, settings) {
  const words = stripFiller(normaliseForMatch(actionText(line)), fillerPhrases(settings)).split(" ");
  const opening = [words.slice(0, 2).join(" "), words[0]];
  const hint = CONTEXT_HINTS.find((h) => h.verbs.some((v) => opening.includes(v)));
  if (!hint) return null;
  const value = (dim.values || []).find((v) => {
    const names = `${v.label || ""} ${v.value || ""}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
    return names.some((n) => hint.names.includes(n));
  });
  return value ? value.id : null;
}
async function organiseLine(ctx, file, line, raw) {
  var _a;
  const { prompter, settings } = ctx;
  // A waiting-for is someone else's action: where, when and how you would do it don't apply.
  if (isWaitingFor(raw, settings)) return;
  let current = raw;
  const dimTokens = [];
  /* A label the task already has is not asked for again. Re-organising a labelled task, or
   * one captured with its context typed in, used to add a second one next to it. */
  const run = trailingLabels(raw, textLabelWords(settings.dimensions));
  for (const dim of settings.dimensions) {
    if (dimensionAlreadySet(dim, raw, run)) continue;
    const suggested = dimensionGuidance(dim) === GUIDANCE.context ? suggestContext(dim, raw, settings) : null;
    const chosen = await prompter.optionalChoice(
      dimensionQuestion(dim),
      dim.values.map((v) => Object.assign({ label: v.label, value: v.id }, v.id === suggested ? { suggested: true } : {})),
      dimensionGuidance(dim)
    );
    if (chosen) {
      const value = dim.values.find((v) => v.id === chosen);
      if (value) dimTokens.push(formatToken(value.value, (_a = value.format) != null ? _a : dim.defaultFormat));
    }
  }
  if (dimTokens.length) {
    current = insertBeforeTasksMetadata(current, dimTokens);
    await replaceLine(ctx.app, file, line, current);
  }
  if (settings.enablePriorityStep && !PRIORITY_SIGNIFIERS.some((s) => current.includes(s))) {
    const level = await prompter.optionalChoice(
      "**Priority**",
      PRIORITY_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
      GUIDANCE.priority
    );
    if (level) {
      const sig = ctx.tasks.prioritySignifier(level);
      if (sig) {
        current = insertBeforeTasksMetadata(current, [sig]);
        await replaceLine(ctx.app, file, line, current);
      }
    }
  }
  // Optional free-text tag, last in the Organise sequence. Skipped entirely when turned
  // off rather than shown-and-ignored, so the step costs no keystroke.
  if (settings.enableCustomTagStep === false) return;
  const custom = await prompter.text("**Custom tag** (optional)", {
    allowEmpty: true,
    guidance: GUIDANCE.dimensionGeneric
  });
  if (custom.trim()) {
    const tag = custom.trim().startsWith("#") ? custom.trim() : `#${custom.trim()}`;
    current = insertBeforeTasksMetadata(current, [tag]);
    await replaceLine(ctx.app, file, line, current);
  }
}
/* ------------------------------ Recent destinations ------------------------------
 * The last few notes tasks were moved to, offered again in Move to… so filing a run of
 * tasks into the same project or area is one tap after the first. Your quick destinations
 * are offered already, so they are not repeated here. */
var MAX_RECENT_DESTINATIONS = 3;
function recentDestinationOptions(ctx, item) {
  const { settings } = ctx;
  const curated = new Set((settings.curatedMoveTargets || []).map((p) => p.trim()));
  return (settings.recentDestinations || [])
    .filter((p) => p && p !== item.file.path && !curated.has(p) && ctx.app.vault.getAbstractFileByPath(p))
    .slice(0, MAX_RECENT_DESTINATIONS)
    .map((p) => {
      const slash = p.lastIndexOf("/");
      const name = p.slice(slash + 1).replace(/\.md$/, "");
      return { label: `**${name}**${slash > 0 ? ` \u2014 ${p.slice(0, slash)}` : ""}`, value: p, group: "Recent" };
    });
}
async function rememberDestination(ctx, path) {
  const { settings } = ctx;
  if (!settings || (settings.curatedMoveTargets || []).some((p) => p.trim() === path)) return;
  const before = settings.recentDestinations || [];
  settings.recentDestinations = [path, ...before.filter((p) => p !== path)].slice(0, MAX_RECENT_DESTINATIONS);
  if (ctx.plugin && typeof ctx.plugin.saveSettings === "function") await ctx.plugin.saveSettings();
}
var DefaultFilingStrategy = class {
  /** Move a task and its subtree to where it belongs. Returns "moved", "stayed", or
   * "cancelled" (a picker was dismissed and the task left where it was).
   *
   * `opts.allowStay` adds a "leave it here" answer to the same question, for callers where
   * filing is optional — deferring a task, where you may not know its home yet. Organise
   * does not pass it: filing is the point of that step. */
  /** Move a task and its subtree to where it belongs. Returns "moved", "stayed", or
   * "cancelled" (only if asked again and again with no answer that leads anywhere).
   *
   * Dismissing a picker, or choosing Back, returns to this question — the one that opened
   * it. It used to leave the task where it was and move on to the next one, so a slip of
   * the thumb meant Revert, which also undoes the task before. Skip task remains the
   * deliberate way to move on. */
  async fileTask(ctx, item, opts = {}) {
    for (let n = 0; n < MAX_SUBTASK_RETRIES; n++) {
      const result = await this.fileTaskOnce(ctx, item, opts);
      if (result !== "back") return result;
    }
    return "cancelled";
  }
  async fileTaskOnce(ctx, item, opts) {
    const { prompter, settings } = ctx;
    const options = [];
    if (opts.allowStay) options.push({ label: "**Leave it here** \u2014 organise it later", value: "__stay__" });
    /* Most-used first. Your own quick destinations, if you have set any, are one tap each;
     * then searching for a note, which is where most tasks go; then a new note. A heading in
     * this note follows — offered only when working through a note, and only when there is
     * a heading to go to other than the one the task is already under. */
    let headings = [];
    if (ctx.sourceKind === "file") {
      const lines = (await ctx.app.vault.read(item.file)).split("\n");
      const all = noteHeadings(lines);
      const current = headingAbove(all, item.startLine);
      headings = all.filter((h) => h !== current);
    }
    options.push(
      ...settings.curatedMoveTargets.filter((p) => p.trim()).map((p) => ({ label: p, value: p })),
      { label: "**Search** for a note\u2026", value: "__search__" },
      { label: "Create a **new** note\u2026", value: "__new__" }
    );
    if (headings.length) options.push({ label: "A **heading** in this note\u2026", value: "__heading__" });
    options.push({ label: "Run a **template** \u2192 move here\u2026", value: "__template__" });
    // Last, so the answers above keep their numbers however many there are.
    options.push(...recentDestinationOptions(ctx, item));
    const target = await prompter.choice(opts.question || "**Move to**\u2026", options, opts.guidance || GUIDANCE.filing);
    // Not one of the answers offered: nothing to act on, and asking again would not help.
    if (!options.some((o) => o.value === target)) return "cancelled";
    if (target === "__stay__") return "stayed";
    if (target === "__heading__") {
      const picked = await prompter.choice(
        "**Which heading**?",
        [...headings.map((h) => ({ label: h.path, value: String(h.line) })), { label: "Back", value: "__back__" }]
      );
      if (picked === "__back__") return "back";
      const heading = headings.find((h) => String(h.line) === String(picked));
      if (!heading) return "cancelled";
      const moved = await moveSubtreeUnderHeading(ctx.app, item.file, item.startLine, item.endLine, heading.line);
      if (moved < 0) {
        prompter.info("That heading has moved \u2014 pick again.");
        return "back";
      }
      new obsidian.Notice(`Moved under ${heading.path}`);
      return "moved";
    }
    let targetPath = null;
    let fromTemplate = false;
    if (target === "__search__") {
      const picked = await prompter.suggestFile();
      if (!picked) return "back";
      targetPath = picked.path;
    } else if (target === "__new__") {
      const name = await prompter.text("**New note** name");
      const folder = item.isProject ? settings.projectFolder : settings.newNoteFolder;
      const file = await createNoteFromTemplate(
        ctx.app,
        folder,
        name,
        settings.newNoteTemplatePath,
        ""
      );
      targetPath = file.path;
      fromTemplate = true;
    } else if (target === "__template__") {
      const template = await prompter.suggestTemplate();
      if (!template) return "back";
      const suggested = deTaskLine(item.raw).slice(0, 60) || (item.isProject ? "Project" : "Note");
      const typed = await prompter.text("**New note** name", { placeholder: suggested, allowEmpty: true });
      const name = typed.trim() || suggested;
      // Dismissing the folder picker goes back too. It used to carry on with the default
      // folder — creating the note and moving the task — which is not what cancel means.
      const folder = await prompter.suggestFolder();
      if (!folder) return "back";
      const folderPath = folder.isRoot() ? "" : folder.path;
      const created = await runTemplateIntoNote(ctx.app, settings, {
        folder: folderPath,
        name,
        template
      });
      targetPath = created.path;
      fromTemplate = true;
    } else {
      targetPath = target;
    }
    if (!targetPath) return "cancelled";
    const usedPlaceholder = await moveSubtree(
      ctx.app,
      item.file,
      item.startLine,
      item.endLine,
      targetPath,
      fromTemplate ? settings.taskPlaceholder : void 0
    );
    await rememberDestination(ctx, targetPath);
    new obsidian.Notice(usedPlaceholder ? `Moved into ${settings.taskPlaceholder} in ${targetPath}` : `Moved to ${targetPath}`);
    return "moved";
  }
};

// ----------------------------------------------------------------------
// Sweep
// ----------------------------------------------------------------------
/* GTD's mind sweep: get everything out of your head and into the inbox before deciding
 * anything about it. One prompt at a time — what's on your mind, then each area of focus,
 * each project and each context from your vault, then a list of common triggers — and
 * each thing you type goes into the inbox note as a task the moment you press Enter.
 *
 * Prompts drawn from your vault all read the same way, "Anything about X?": they are
 * reminders of where to look, not questions about what you will find there. */
var DEFAULT_TRIGGERS = [
  ["Commitments", ["Promises you’ve made", "Things people are waiting on from you", "Things you said you’d look into"]],
  ["Communication", ["Calls to make or return", "Emails and messages to answer", "Forms, letters and replies to send", "Conversations you’ve been putting off"]],
  ["Work", ["Projects not started yet", "Meetings to prepare for or follow up", "Decisions to make", "Deadlines coming up", "Things to hand on or chase"]],
  ["Home", ["Repairs and maintenance", "Clearing out and tidying", "Things to buy or replace", "Car, garden, appliances"]],
  ["Money", ["Bills and payments", "Budget, savings, tax", "Insurance, subscriptions, refunds"]],
  ["Health", ["Appointments to book", "Prescriptions and check-ups", "Exercise, sleep, food"]],
  ["People", ["Birthdays and gifts", "Family", "Friends to get back in touch with"]],
  ["Plans", ["Trips and events", "Things to learn or read", "Hobbies and ideas"]],
  ["Waiting on", ["Replies you’re expecting", "Orders and deliveries", "Things you’ve lent"]],
  ["Loose ends", ["Anything still nagging at you"]]
];
function defaultTriggerText() {
  return [
    "# A line ending in a colon is one prompt; the lines under it are shown with it as reminders.",
    "# Lines starting with # are ignored.",
    ...DEFAULT_TRIGGERS.flatMap(([heading, items]) => [`${heading}:`, ...items])
  ].join("\n");
}
/** The trigger list as { heading, items } sections. Reminders before any heading go under
 * "Anything else". */
function parseTriggerList(text) {
  const sections = [];
  let current = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.endsWith(":")) {
      const heading = line.slice(0, -1).trim();
      if (!heading) continue;
      current = { heading, items: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: "Anything else", items: [] };
      sections.push(current);
    }
    current.items.push(line.replace(/^[-*+]\s+/, ""));
  }
  return sections;
}
function triggerSections(settings) {
  const text = settings && typeof settings.sweepTriggers === "string" ? settings.sweepTriggers : defaultTriggerText();
  return parseTriggerList(text);
}
function sweepInboxPath(settings) {
  const p = String(settings && settings.sweepInboxPath || "").trim();
  if (!p) return "Inbox.md";
  return /\.md$/i.test(p) ? p : `${p}.md`;
}
/** A folder setting as a path with no slashes at either end; "" for the vault root. */
function folderSetting(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}
function inFolder(path, folder) {
  return !folder || path.startsWith(`${folder}/`);
}
/** Every prompt the sweep will show, in order: { group, question, note, reminders }. */
async function sweepPrompts(app, settings) {
  const prompts = [{
    group: "mind",
    question: "What’s **on your mind**?",
    note: "Anything at all — big or small, work or home. One thing at a time; press Enter after each.",
    reminders: []
  }];
  const add = (group, kind, names, remindersOf = () => []) => {
    names.forEach((name, i) => prompts.push({
      group,
      question: `Anything about **${name}**?`,
      note: `${kind} · ${i + 1} of ${names.length}`,
      reminders: remindersOf(i)
    }));
  };
  const areas = folderSetting(settings.areasFolder);
  if (areas) {
    const notes = app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(`${areas}/`) && !f.path.slice(areas.length + 1).includes("/"))
      .sort((a, b) => a.basename.localeCompare(b.basename));
    add("areas", "Area of focus", notes.map((f) => f.basename));
  }
  if (settings.sweepProjects !== false) {
    const folder = folderSetting(settings.projectFolder);
    const today = todayString();
    const someday = (0, obsidian.normalizePath)(String(settings.somedayNotePath || ""));
    const projects = (await findProjectsElsewhere(app, settings.projectTag, null))
      .filter((p) => inFolder(p.file.path, folder) && p.file.path !== someday && !isTickled(p.raw, today));
    add("projects", "Project", projects.map((p) => actionText(p.raw) || projectPickerLabel(p.raw)));
  }
  if (settings.sweepContexts !== false) {
    const dim = (settings.dimensions || []).find((d) => dimensionGuidance(d) === GUIDANCE.context);
    if (dim) add("contexts", "Context", (dim.values || []).map((v) => String(v.label || v.value || "").trim()).filter(Boolean));
  }
  /* A trigger with the same name as an area, project or context already asked about —
   * Health, Home — lends that prompt its reminders rather than being asked twice. */
  const asked = new Map(prompts.map((p) => [plainText(p.question).toLowerCase(), p]));
  const triggers = [];
  for (const t of triggerSections(settings)) {
    const same = asked.get(`anything about ${t.heading.toLowerCase()}?`);
    if (same) same.reminders = same.reminders.concat(t.items);
    else triggers.push(t);
  }
  add("triggers", "Trigger list", triggers.map((t) => t.heading), (i) => triggers[i].items);
  return prompts;
}
var SWEEP_GROUP_NAMES = { areas: "areas of focus", projects: "projects", contexts: "contexts", triggers: "the trigger list" };
/** A thought as one task's words: lines joined, spaces tidied, any list marker dropped. */
function cleanCapture(text) {
  return cleanPieceText(String(text || "").replace(/\s*[\r\n]+\s*/g, " ").replace(/\s+/g, " "));
}
async function appendCapture(app, path, text) {
  await appendToNote(app, path, `- [ ] ${text}`);
}
/** Take back a thought added in this sweep: the last line that is exactly it. */
async function removeCapture(app, path, text) {
  const file = app.vault.getAbstractFileByPath((0, obsidian.normalizePath)(path));
  if (!(file instanceof obsidian.TFile)) return false;
  let removed = false;
  await app.vault.process(file, (data) => {
    const lines = data.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim() !== `- [ ] ${text}`) continue;
      lines.splice(i, 1);
      removed = true;
      break;
    }
    return lines.join("\n");
  });
  return removed;
}
/** Run the sweep. Returns how many thoughts were captured.
 *
 * Next (or Enter on an empty line) moves on; "Skip the rest of…" passes over the remaining
 * prompts of the same kind — the rest of your projects, say; Finish ends it. */
async function runSweep(ctx, onProgress) {
  const { prompter, settings } = ctx;
  const path = sweepInboxPath(settings);
  const prompts = await sweepPrompts(ctx.app, settings);
  let captured = 0;
  const handlers = {
    add: async (typed) => {
      const text = cleanCapture(typed);
      if (!text) return null;
      await appendCapture(ctx.app, path, text);
      captured++;
      if (onProgress) onProgress(captured);
      return text;
    },
    remove: async (text) => {
      if (!(await removeCapture(ctx.app, path, text))) return false;
      captured--;
      if (onProgress) onProgress(captured);
      return true;
    }
  };
  for (let i = 0; i < prompts.length; i++) {
    const p = prompts[i];
    const rest = prompts.slice(i + 1).some((q) => q.group === p.group);
    const prompt = Object.assign({}, p, {
      position: `${i + 1} of ${prompts.length}`,
      skipLabel: rest && SWEEP_GROUP_NAMES[p.group] ? `Skip the rest of **${SWEEP_GROUP_NAMES[p.group]}**` : null,
      guidance: GUIDANCE.sweep
    });
    let action;
    try {
      action = await prompter.sweep(prompt, handlers);
    } catch (e) {
      if (!(e instanceof ReviewControl)) throw e;
      if (e.kind === "skip") continue;
      break;
    }
    if (action === "finish") break;
    if (action === "skip") while (i + 1 < prompts.length && prompts[i + 1].group === p.group) i++;
  }
  return captured;
}
// ----------------------------------------------------------------------
// src/review/ReviewView.ts
// ----------------------------------------------------------------------
var VIEW_TYPE_REVIEW = "gtd-clarify-review";
function clipMatches(matches, start, end) {
  const out = [];
  for (const [s, e] of matches) {
    const cs = Math.max(s, start);
    const ce = Math.min(e, end);
    if (cs < ce) out.push([cs - start, ce - start]);
  }
  return out;
}
/* Raw URLs in a task line are often longer than the task itself and push everything else
 * out of view. Render them compacted to host + a little path; the full URL stays on the
 * element's title so it is still recoverable on hover. Markdown links collapse to their
 * link text, which is the whole point of having written one. Wikilinks are left alone —
 * they carry no scheme and are already short. */
var LINK_MAX = 30;
/* Links in task text, in priority order:
 *   1–3  wikilink      !?[[target|alias]]   (the "!" of an embed is swallowed)
 *   4–5  markdown link [text](target)       external if the target has a scheme
 *   6    bare URL      https://…
 * Wikilinks come first so "[[a]](b)" is read as the wikilink Obsidian would see. */
/* A markdown target may contain one level of balanced parentheses — "a_(b)" — as
 * CommonMark allows. A bare URL is matched greedily up to whitespace and then trimmed by
 * trimAutolink, because where it ends depends on the whole URL, not on any one character:
 * stopping at the first ")" cut every URL with brackets in it — a Jira "NOT IN (…)" query
 * among them — and opened the truncated half. */
var LINK_TOKEN_RE = /(!?)\[\[([^\]|\n]+?)(?:\|([^\]\n]*))?\]\]|\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|(https?:\/\/[^\s<>\]]+)/g;
/** Where a bare URL really ends, by GitHub-flavoured Markdown's autolink rules.
 *
 * Trailing ? ! . , : * _ ~ are sentence punctuation, not URL. A trailing ")" belongs to
 * the URL only if it closes a "(" inside it, so "(see https://x.com/a)" drops it while
 * "…IN%20(Done%2C%20Closed)" keeps it. A trailing "&name;" is an entity reference.
 * Repeated until nothing changes, since stripping one can expose another: "x.com/a)." */
function trimAutolink(url) {
  let u = String(url || "");
  for (; ; ) {
    const before = u;
    u = u.replace(/[?!.,:*_~]+$/, "");
    const entity = u.match(/&[a-z0-9]+;$/i);
    if (entity) u = u.slice(0, -entity[0].length);
    if (u.endsWith(")")) {
      const open = (u.match(/\(/g) || []).length;
      const close = (u.match(/\)/g) || []).length;
      if (close > open) u = u.slice(0, -1);
    }
    if (u === before) return u;
  }
}
/** A target with a scheme (https:, mailto:, obsidian:) leaves the vault; anything else in a
 * markdown link — "Specs/My%20Spec.md" — is a note, exactly as Obsidian treats it. */
var URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
function compactUrl(url, max) {
  let host, rest;
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    rest = (u.pathname === "/" ? "" : u.pathname) + (u.search || "") + (u.hash || "");
  } catch {
    // Not parseable (rare, but do not lose the text) — fall back to a plain clip.
    return url.length > max ? url.slice(0, max - 1) + "\u2026" : url;
  }
  if (!rest) return host;
  if (host.length + rest.length <= max) return host + rest;
  const keep = max - host.length - 1;
  return keep > 1 ? host + rest.slice(0, keep) + "\u2026" : host + "/\u2026";
}
/** Open a URL outside Obsidian. Guarded so the module can be loaded without a DOM. */
function openExternalUrl(url) {
  try {
    if (typeof window !== "undefined" && typeof window.open === "function") {
      window.open(url, "_blank");
    }
  } catch {
    // Opening a link is best effort; if the browser refuses, there is nothing to undo.
  }
}
/** Append `text` to `el`, replacing links with compact clickable anchors. Text outside links is
 * appended verbatim so pre-wrap indentation on nested subtasks survives. */
/** How Obsidian shows a wikilink: its alias if it has one, otherwise the target with a
 * heading or block shown as "Note › Heading", and a same-note link as just "Heading". */
function wikiLabel(target, alias) {
  const a = String(alias || "").trim();
  if (a) return a;
  const t = String(target || "").trim();
  const hash = t.indexOf("#");
  if (hash < 0) return t;
  const note = t.slice(0, hash).trim();
  const sub = t.slice(hash + 1).trim();
  if (!note) return sub;
  return sub ? `${note} \u203A ${sub}` : note;
}
/** An internal link: opens a note in the vault through the caller's opener.
 *
 * Marked unresolved, as Obsidian marks them, when the note doesn't exist yet — because
 * opening one creates it, which is Obsidian's own behaviour but shouldn't be a surprise. */
function renderInternalLink(el, linktext, label, internal) {
  const linkpath = linktext.split("#")[0].trim();
  const exists = typeof internal.exists === "function" ? internal.exists(linkpath) !== false : true;
  const link = el.createEl("a", {
    cls: exists ? "gtd-clarify-link gtd-clarify-internal-link" : "gtd-clarify-link gtd-clarify-internal-link is-unresolved",
    text: label
  });
  link.setAttribute("href", linktext);
  link.setAttribute("data-href", linktext);
  link.title = exists ? linktext : `${linktext} \u2014 not created yet; opening it creates it`;
  link.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    internal.open(linktext);
  });
}
/** Append `text` to `el`, turning links into clickable anchors.
 *
 * `internal` — `{ open(linktext), exists(linkpath) }` — is how internal links reach the
 * vault. Without it they are left exactly as written: a link that can't be followed is
 * better shown as text than as something that looks clickable and isn't. */
function renderTaskText(el, text, internal) {
  const canOpen = !!(internal && typeof internal.open === "function");
  LINK_TOKEN_RE.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = LINK_TOKEN_RE.exec(text)) !== null) {
    const isWiki = m[2] !== void 0;
    const mdTarget = m[5];
    const isMdInternal = mdTarget !== void 0 && !URL_SCHEME_RE.test(mdTarget);
    // Not advancing `last` leaves the match inside the next run of plain text, untouched.
    if ((isWiki || isMdInternal) && !canOpen) continue;
    if (m.index > last) el.appendText(text.slice(last, m.index));
    if (isWiki) {
      const target = m[2].trim();
      renderInternalLink(el, target, wikiLabel(target, m[3]), internal);
      last = m.index + m[0].length;
      continue;
    }
    if (isMdInternal) {
      let target = mdTarget;
      try {
        target = decodeURI(mdTarget);
      } catch {
        // Not URI-encoded after all: use the target as written.
      }
      const label = (m[4] || "").trim() || target.replace(/\.md$/i, "");
      renderInternalLink(el, target, label, internal);
      last = m.index + m[0].length;
      continue;
    }
    const bare = m[6] !== void 0 ? trimAutolink(m[6]) : void 0;
    // What trimming removed — punctuation, an unbalanced ")" — is plain text after the
    // link. None of it can begin another link, so the scan itself needn't rewind.
    const end = bare !== void 0 ? m.index + bare.length : m.index + m[0].length;
    // Nothing left after trimming: not a link. The text before it has already been
    // written, so plain text resumes from where the link would have begun.
    if (bare !== void 0 && /^https?:\/\/$/i.test(bare)) {
      last = m.index;
      continue;
    }
    const label = bare ? compactUrl(bare, LINK_MAX) : (m[4] || "").trim() || compactUrl(mdTarget, LINK_MAX);
    const href = bare || mdTarget;
    const link = el.createEl("a", { cls: "gtd-clarify-link", text: label });
    link.setAttribute("href", href);
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener");
    link.title = href;
    // Handled explicitly rather than left to the href: in Electron a bare navigation
    // would replace the Obsidian window itself. preventDefault plus an explicit open
    // sends it to the system browser on desktop and mobile alike. stopPropagation keeps
    // the click off the surrounding task box.
    link.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      openExternalUrl(href);
    });
    last = end;
  }
  if (last < text.length) el.appendText(text.slice(last));
}
function renderHighlighted(el, text, matches) {
  let last = 0;
  for (const [s, e] of matches) {
    if (s > last) el.appendText(text.slice(last, s));
    el.createSpan({ cls: "suggestion-highlight", text: text.slice(s, e) });
    last = e;
  }
  if (last < text.length) el.appendText(text.slice(last));
}
/* ------------------------ Quick-Switcher-style ranking ------------------------
 * Obsidian's built-in switcher (Ctrl+O) is internal, undocumented API — it does not
 * appear in obsidian.d.ts — so it cannot be reused directly. This reproduces its
 * ordering using only the public search helpers.
 *
 * Plain FuzzySuggestModal fuzzy-matches ONE string. Feeding it `file.path` (what this
 * plugin did) means a match on the filename competes on equal terms with a match on some
 * folder three levels up, and a literal exact match gets no advantage over a scattered
 * fuzzy one. Hence: rank by WHERE the match landed first, and only use the fuzzy score to
 * break ties inside a band.
 *
 * Lower rank = better. */
var RANK = {
  NAME_EXACT: 0,
  NAME_PREFIX: 1,
  NAME_SUBSTR: 2,
  ALIAS_EXACT: 3,
  ALIAS_PREFIX: 4,
  ALIAS_SUBSTR: 5,
  NAME_FUZZY: 6,
  ALIAS_FUZZY: 7,
  PATH_SUBSTR: 8,
  PATH_FUZZY: 9
};
var SUGGEST_LIMIT = 50;
function substringMatch(text, lowerQuery) {
  const i = text.toLowerCase().indexOf(lowerQuery);
  return i < 0 ? null : [[i, i + lowerQuery.length]];
}
/** Cheap subsequence test. If the query's characters do not appear in order anywhere in
 * the text then no fuzzy match is possible, so the expensive scorer can be skipped
 * outright. Whitespace is stripped so this stays a superset of what fuzzy would accept —
 * it must never reject something the real scorer would have matched. */
function isSubsequence(lowerText, queryChars) {
  let i = 0;
  for (const ch of queryChars) {
    i = lowerText.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}
function countSlashes(path) {
  let n = 0;
  for (let i = 0; i < path.length; i++) if (path[i] === "/") n++;
  return n;
}
/** Frontmatter aliases, tolerating both `aliases:` (list or scalar) and legacy `alias:`. */
function fileAliases(app, file) {
  var _a, _b;
  const fm = (_b = (_a = app.metadataCache.getFileCache(file)) == null ? void 0 : _a.frontmatter) != null ? _b : null;
  if (!fm) return [];
  const raw = fm.aliases != null ? fm.aliases : fm.alias;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter((a) => typeof a === "string" && a.length > 0);
}
/** Obsidian's "Excluded files" list (Settings -> Files and links). Those paths are
 * deprioritised — not hidden — in search, the quick switcher and graph view.
 *
 * `metadataCache.isUserIgnored` is the app's OWN matcher. It is undocumented (it is not
 * in obsidian.d.ts; Switcher++ declares it in a module augmentation to use it), but it
 * handles every filter form — folder, file, and regex — exactly as the rest of Obsidian
 * does, so there is no format to second-guess. Prefer it always.
 *
 * The manual fallback runs only if that method disappears. It reads the raw
 * `userIgnoreFilters` config and understands plain folder/file prefixes plus
 * /regex/flags entries. It is deliberately conservative and never throws: a filter it
 * cannot parse is skipped, so the worst case is a file that fails to get deprioritised. */
function makeIgnoreMatcher(app) {
  var _a, _b;
  const raw = (_b = (_a = app.vault) == null ? void 0 : _a.getConfig) == null ? void 0 : _b.call(_a, "userIgnoreFilters");
  const filters = Array.isArray(raw) ? raw : null;
  // Nothing excluded (the common case): skip the per-file work entirely rather than
  // calling into Obsidian once for every note in the vault.
  if (filters !== null && filters.length === 0) return () => false;
  const mc = app.metadataCache;
  if (typeof (mc == null ? void 0 : mc.isUserIgnored) === "function") {
    return (path) => {
      try {
        return !!mc.isUserIgnored(path);
      } catch {
        return false;
      }
    };
  }
  if (filters === null) return () => false;
  const prefixes = [];
  const regexes = [];
  for (const f of filters) {
    if (typeof f !== "string" || !f) continue;
    const asRegex = f.match(/^\/(.*)\/([a-z]*)$/);
    if (asRegex) {
      try {
        regexes.push(new RegExp(asRegex[1], asRegex[2].replace(/g/g, "")));
      } catch {
        // An invalid pattern in Excluded files is skipped, as Obsidian itself skips it.
      }
    } else {
      prefixes.push(f.replace(/\/+$/, "").toLowerCase());
    }
  }
  return (path) => {
    const lower = path.toLowerCase();
    for (const p of prefixes) {
      if (p && (lower === p || lower.startsWith(p + "/"))) return true;
    }
    for (const re of regexes) {
      try {
        if (re.test(path)) return true;
      } catch {
        // A pattern that fails while matching is treated as not matching.
      }
    }
    return false;
  };
}
/** Precompute the per-item facts the scorer needs. Built ONCE per modal, not per
 * keystroke — metadataCache lookups across a whole vault are not free. */
function buildCandidates(app, items, toFacts) {
  const recent = /* @__PURE__ */ new Map();
  const last = app.workspace.getLastOpenFiles();
  for (let i = 0; i < last.length; i++) if (!recent.has(last[i])) recent.set(last[i], i);
  const isIgnored = makeIgnoreMatcher(app);
  return items.map((item) => {
    const f = toFacts(item);
    const slash = f.path.lastIndexOf("/");
    return {
      item,
      name: f.name,
      folder: slash >= 0 ? f.path.slice(0, slash) : "",
      path: f.path,
      aliases: f.aliases || [],
      depth: countSlashes(f.path),
      recent: recent.has(f.path) ? recent.get(f.path) : Number.MAX_SAFE_INTEGER,
      ignored: isIgnored(f.path)
    };
  });
}
function scoreCandidate(cand, lowerQuery, queryChars, fuzzy) {
  // Excluded paths sort BELOW every non-excluded result, unconditionally — the same
  // behaviour as the quick switcher.
  //
  // An earlier version lifted this whenever the query appeared in the folder path, on the
  // theory that Obsidian's "less visible ... unless you explicitly search for them" meant
  // naming the folder should restore normal ranking. That was wrong in practice: an
  // archive that mirrors the live folder tree (Archive/Areas/Relationships/...) contains
  // the query too, so the exemption fired on precisely the archived copies that were
  // meant to sink. The files stayed dimmed but ranked interleaved, which reads as broken.
  //
  // `ignored` still drives the dimming; `demoted` drives the sort. They are now equal,
  // but kept separate so the debug output can distinguish "excluded" from "sank because
  // excluded" if this ever needs revisiting.
  const demoted = cand.ignored;
  const hit = (rank, score, nameMatches, pathMatches, alias) => ({
    item: cand.item,
    // `match` is retained for shape compatibility; SuggestModal passes this object
    // straight to renderSuggestion, which reads nameMatches/pathMatches directly.
    match: { score, matches: nameMatches || [] },
    rank,
    score,
    nameMatches: nameMatches || [],
    pathMatches: pathMatches || [],
    alias: alias || null,
    depth: cand.depth,
    recent: cand.recent,
    ignored: cand.ignored,
    demoted,
    path: cand.path
  });
  const name = cand.name;
  const lowerName = name.toLowerCase();
  // Cheap literal tests first. These are exactly the cases plain fuzzy matching
  // under-ranks, and short-circuiting here keeps the costly fuzzy call off most
  // candidates — the API docs warn it degrades past a few thousand invocations.
  if (lowerName === lowerQuery) return hit(RANK.NAME_EXACT, 0, [[0, name.length]]);
  if (lowerName.startsWith(lowerQuery)) return hit(RANK.NAME_PREFIX, 0, [[0, lowerQuery.length]]);
  const nameSub = substringMatch(name, lowerQuery);
  if (nameSub) return hit(RANK.NAME_SUBSTR, 0, nameSub);
  for (const alias of cand.aliases) {
    const lowerAlias = alias.toLowerCase();
    if (lowerAlias === lowerQuery) return hit(RANK.ALIAS_EXACT, 0, null, null, alias);
    if (lowerAlias.startsWith(lowerQuery)) return hit(RANK.ALIAS_PREFIX, 0, null, null, alias);
    if (substringMatch(alias, lowerQuery)) return hit(RANK.ALIAS_SUBSTR, 0, null, null, alias);
  }
  // One fuzzy pass over the FULL PATH, gated by the subsequence pre-filter. The tier is
  // then derived from where the spans landed: entirely inside the basename means this is
  // really a name match, so it ranks in the name band. That avoids a second scorer pass
  // over the basename — one fuzzy call per candidate instead of two.
  let pathFz = null;
  const slash = cand.path.lastIndexOf("/");
  const nameStart = slash >= 0 ? slash + 1 : 0;
  if (isSubsequence(cand.path.toLowerCase(), queryChars)) {
    pathFz = fuzzy(cand.path);
  }
  if (pathFz && pathFz.matches.every(([s]) => s >= nameStart)) {
    return hit(
      RANK.NAME_FUZZY,
      pathFz.score,
      clipMatches(pathFz.matches, nameStart, nameStart + name.length)
    );
  }
  for (const alias of cand.aliases) {
    const aliasFz = fuzzy(alias);
    if (aliasFz) return hit(RANK.ALIAS_FUZZY, aliasFz.score, null, null, alias);
  }
  if (cand.folder) {
    const folderSub = substringMatch(cand.folder, lowerQuery);
    if (folderSub) return hit(RANK.PATH_SUBSTR, 0, null, folderSub);
  }
  if (pathFz) {
    // Spans straddle folder and name; split them back apart so each rendered line
    // highlights the right characters.
    return hit(
      RANK.PATH_FUZZY,
      pathFz.score,
      clipMatches(pathFz.matches, nameStart, nameStart + name.length),
      slash > 0 ? clipMatches(pathFz.matches, 0, slash) : []
    );
  }
  return null;
}
function compareScored(a, b) {
  // Excluded paths sink below everything else, whatever they matched on.
  if (a.demoted !== b.demoted) return a.demoted ? 1 : -1;
  if (a.rank !== b.rank) return a.rank - b.rank;
  if (a.score !== b.score) return b.score - a.score;
  if (a.recent !== b.recent) return a.recent - b.recent;
  if (a.depth !== b.depth) return a.depth - b.depth;
  return a.path.localeCompare(b.path);
}
function rankCandidates(candidates, query) {
  const q = query.trim();
  if (!q) {
    // Empty query: most-recently-opened first, like the switcher's initial list.
    return candidates.slice().sort((a, b) => {
      if (a.ignored !== b.ignored) return a.ignored ? 1 : -1;
      if (a.recent !== b.recent) return a.recent - b.recent;
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.path.localeCompare(b.path);
    }).slice(0, SUGGEST_LIMIT).map((c) => ({
      item: c.item,
      match: { score: 0, matches: [] },
      nameMatches: [],
      pathMatches: [],
      alias: null,
      ignored: c.ignored,
      demoted: c.ignored
    }));
  }
  const lowerQuery = q.toLowerCase();
  const queryChars = lowerQuery.replace(/\s+/g, "");
  const fuzzy = (0, obsidian.prepareFuzzySearch)(q);
  const out = [];
  for (const cand of candidates) {
    const scored = scoreCandidate(cand, lowerQuery, queryChars, fuzzy);
    if (scored) out.push(scored);
  }
  out.sort(compareScored);
  return out.slice(0, SUGGEST_LIMIT);
}
var NoteSuggestModal = class extends obsidian.SuggestModal {
  constructor(app, items, placeholder, onPick) {
    super(app);
    this.items = items;
    this.onPick = onPick;
    this.picked = false;
    this.limit = SUGGEST_LIMIT;
    this.setPlaceholder(placeholder);
    this.emptyStateText = "No matching notes.";
    // Built once — the item list is fixed for the modal's lifetime.
    this.candidates = buildCandidates(app, items, (file) => ({
      name: file.basename,
      path: file.path,
      aliases: fileAliases(app, file)
    }));
  }
  /* Extends SuggestModal, NOT FuzzySuggestModal, deliberately.
   *
   * FuzzySuggestModal ships a CONCRETE getSuggestions() that fuzzy-matches a single
   * string from getItemText(). Subclassing it and overriding that method left the parent
   * implementation reachable at runtime, so the old path-wide ranking kept running even
   * with the new build loaded. On SuggestModal getSuggestions is ABSTRACT — there is no
   * inherited implementation to fall back to, so this is the only ranking that can run.
   * If it ever fails, the picker shows nothing at all rather than quietly reverting. */
  getSuggestions(query) {
    const results = rankCandidates(this.candidates, query);
    return results;
  }
  renderSuggestion(match, el) {
    var _a, _b;
    const file = match.item;
    const path = file.path;
    const slash = path.lastIndexOf("/");
    const folder = slash >= 0 ? path.slice(0, slash) : "";
    el.addClass("mod-complex");
    if (match.ignored) el.addClass("gtd-clarify-suggestion-ignored");
    const content = el.createDiv({ cls: "suggestion-content" });
    const title = content.createDiv({ cls: "suggestion-title" });
    renderHighlighted(title, file.basename, (_a = match.nameMatches) != null ? _a : []);
    if (match.alias) {
      title.createSpan({ cls: "gtd-clarify-suggestion-alias", text: `\u2004\u2192\u2004${match.alias}` });
    }
    if (folder) {
      const note = content.createDiv({ cls: "suggestion-note" });
      renderHighlighted(note, folder, (_b = match.pathMatches) != null ? _b : []);
    }
  }
  onChooseSuggestion(match) {
    this.picked = true;
    this.onPick(match.item);
  }
  onClose() {
    super.onClose();
    window.setTimeout(() => {
      if (!this.picked) this.onPick(null);
    }, 0);
  }
};
/** Projects in other notes: the project, with the note it is in beneath it. Ranked like the
 * note picker, on the project's words and its note's path. */
var ProjectSuggestModal = class extends obsidian.SuggestModal {
  constructor(app, projects, onPick) {
    super(app);
    this.onPick = onPick;
    this.picked = false;
    this.limit = SUGGEST_LIMIT;
    this.setPlaceholder("Type to find the project this is a step in…");
    this.emptyStateText = "No matching projects.";
    /* Ranked as if each project were a note inside its own note ("Projects/Kitchen/Fit the
     * sink"), so the ranking's name and folder tiers mean project and note. A slash in the
     * project's words is swapped for a look-alike, or it would read as a folder. */
    this.candidates = buildCandidates(app, projects, (p) => ({
      name: p.label,
      path: `${p.file.path.replace(/\.md$/, "")}/${p.label.replace(/\//g, "\u2215")}`,
      aliases: []
    }));
  }
  getSuggestions(query) {
    return rankCandidates(this.candidates, query);
  }
  renderSuggestion(match, el) {
    var _a, _b;
    el.addClass("mod-complex");
    if (match.ignored) el.addClass("gtd-clarify-suggestion-ignored");
    const content = el.createDiv({ cls: "suggestion-content" });
    renderHighlighted(content.createDiv({ cls: "suggestion-title" }), match.item.label, (_a = match.nameMatches) != null ? _a : []);
    const note = content.createDiv({ cls: "suggestion-note" });
    renderHighlighted(note, match.item.file.path.replace(/\.md$/, ""), (_b = match.pathMatches) != null ? _b : []);
  }
  onChooseSuggestion(match) {
    this.picked = true;
    this.onPick(match.item);
  }
  onClose() {
    super.onClose();
    window.setTimeout(() => {
      if (!this.picked) this.onPick(null);
    }, 0);
  }
};
var FolderSuggestModal = class extends obsidian.SuggestModal {
  constructor(app, onPick) {
    super(app);
    this.onPick = onPick;
    this.picked = false;
    this.limit = SUGGEST_LIMIT;
    this.setPlaceholder("Choose a destination folder\u2026");
    this.emptyStateText = "No matching folders.";
    this.folders = app.vault.getAllLoadedFiles().filter((f) => f instanceof obsidian.TFolder);
    this.candidates = buildCandidates(app, this.folders, (folder) => ({
      name: folder.isRoot() ? "/ (vault root)" : folder.name,
      path: folder.isRoot() ? "/" : folder.path,
      aliases: []
    }));
  }
  getSuggestions(query) {
    return rankCandidates(this.candidates, query);
  }
  renderSuggestion(match, el) {
    var _a, _b;
    const folder = match.item;
    if (folder.isRoot()) {
      el.setText("/ (vault root)");
      return;
    }
    const path = folder.path;
    const slash = path.lastIndexOf("/");
    const parent = slash >= 0 ? path.slice(0, slash) : "";
    el.addClass("mod-complex");
    if (match.ignored) el.addClass("gtd-clarify-suggestion-ignored");
    const content = el.createDiv({ cls: "suggestion-content" });
    const title = content.createDiv({ cls: "suggestion-title" });
    renderHighlighted(title, folder.name, (_a = match.nameMatches) != null ? _a : []);
    if (parent) {
      const note = content.createDiv({ cls: "suggestion-note" });
      renderHighlighted(note, parent, (_b = match.pathMatches) != null ? _b : []);
    }
  }
  onChooseSuggestion(match) {
    this.picked = true;
    this.onPick(match.item);
  }
  onClose() {
    super.onClose();
    window.setTimeout(() => {
      if (!this.picked) this.onPick(null);
    }, 0);
  }
};
var ReviewView = class extends obsidian.ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.exiting = false;
  }
  getViewType() {
    return VIEW_TYPE_REVIEW;
  }
  getDisplayText() {
    return PLUGIN_NAME;
  }
  getIcon() {
    return "list-checks";
  }
  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass("gtd-clarify-view");
    this.rootEl = root;
    this.canGoBack = false;
    this.canGoPrev = false;
    this.headerEl = root.createDiv({ cls: "gtd-clarify-header" });
    this.taskEl = root.createDiv({ cls: "gtd-clarify-task" });
    this.setupTaskScroll();
    this.bodyEl = root.createDiv({ cls: "gtd-clarify-body" });
    // Focusable, so number keys reach the pane rather than the note.
    this.bodyEl.setAttribute("tabindex", "-1");
    this.navEl = root.createDiv({ cls: "gtd-clarify-nav" });
    this.pendingKeys = null;
    this.registerDomEvent(document, "keydown", (e) => this.onAnswerKey(e));
    this.renderNav();
    this.headerEl.setText("Run \u201CProcess\u201D or \u201COrganise\u201D from a note, or \u201CSweep\u201D, to begin.");
  }
  async onClose() {
    if (this.taskScrollObserver) {
      try {
        this.taskScrollObserver.disconnect();
      } catch {
        // Already disconnected.
      }
      this.taskScrollObserver = void 0;
    }
    this.rejectPending(new ReviewControl("exit"));
  }
  /** Entry point invoked by the commands (Spec: GEN-1, GEN-3). */
  async start(mode, file, opts = {}) {
    if (!file) {
      new obsidian.Notice("Open a note first.");
      return;
    }
    if (mode === "process" && !this.plugin.tasksApi.isAvailable()) {
      new obsidian.Notice("Process requires the Tasks plugin to be enabled.");
      return;
    }
    this.exiting = false;
    this.reviewMode = mode;
    // Until the first task is shown, say which review this is rather than how to start one.
    this.headerEl.setText(mode === "process" ? "Process" : "Organise");
    // The number-key hint, if it is still to be given, goes on this review's first question.
    this.firstQuestionOfReview = true;
    const projectTag = this.plugin.settings.projectTag;
    let source;
    try {
      // Straight from a sweep, the inbox is the answer already: no need to ask which tasks.
      source = opts.thisNote ? new ActiveFileTopLevelTaskSource(this.app, file, projectTag, mode !== "organise" && this.plugin.settings.hideTickledTasks !== false) : await this.chooseSource(file, projectTag, mode);
    } catch (e) {
      if (e instanceof ReviewControl) {
        this.headerEl.setText("Review cancelled.");
        this.bodyEl.empty();
        return;
      }
      throw e;
    }
    if (!source) return;
    const items = await source.collect();
    if (source.errors && source.errors.length) {
      // Report a bad query rather than silently reviewing nothing — an unrecognised
      // filter that quietly matched everything would be far worse than an error.
      this.headerEl.setText("Query could not be run.");
      this.bodyEl.empty();
      this.bodyEl.createEl("p", { text: "Unsupported filters:", cls: "gtd-clarify-question" });
      for (const err of source.errors) {
        this.bodyEl.createEl("div", { text: err, cls: "gtd-clarify-queryerror" });
      }
      this.bodyEl.createEl("div", {
        text: "Supported: " + QUERY_FILTER_HELP.join("; "),
        cls: "gtd-clarify-group"
      });
      return;
    }
    if (items.length === 0) {
      this.headerEl.setText(
        source instanceof TasksQueryTaskSource ? "No tasks matched that query." : "No eligible tasks in this note."
      );
      this.bodyEl.empty();
      return;
    }
    const ctx = {
      app: this.app,
      plugin: this.plugin,
      settings: this.plugin.settings,
      prompter: this,
      tasks: this.plugin.tasksApi,
      mode,
      // "file" when working through this note, "query" for a Tasks query. Filing within the
      // note is offered only for the first: a query spans many notes, so there is no one
      // "this note" to file into.
      sourceKind: source instanceof ActiveFileTopLevelTaskSource ? "file" : "query",
      // Shared by reference with every per-task copy of ctx, so all of them add to one list.
      quickBatch: []
    };
    const filing = new DefaultFilingStrategy();
    // Process uses it too now: a deferred task can be filed at the moment it is deferred.
    ctx.filing = filing;
    // Line-offset accumulated BEFORE each task index, so stepping back to a task can also
    // restore the coordinate space its line numbers were recorded in.
    /* Line offsets are tracked PER FILE, not as one running number.
      * With a single-file source there is only ever one entry, so this behaves exactly as
      * the previous scalar did. A query source draws tasks from many files, where one
      * running total would apply file A's growth to file B's line numbers and corrupt
      * every task after the first edit. */
    const offsets = /* @__PURE__ */ new Map();
    const offsetOf = (path) => {
      const v = offsets.get(path);
      return v === void 0 ? 0 : v;
    };
    const offsetAt = [];
    /* Where the two-minute batch stood when each task began. A task rolled back by Restart
     * or Revert must take its queued entries with it, or the batch would offer something
     * the rollback has already undone — or offer it twice once the task is redone.
     * Truncating to a recorded mark handles both, because entries are only ever appended. */
    const batchMarkAt = [];
    /* Which tasks have left the review — deleted, filed away, or marked done/cancelled.
     * The counter's denominator is "tasks in this review that still exist", so disposing
     * of one shrinks it. Indexed rather than counted so a rewind, which puts the task
     * back, can clear its entry. */
    const disposedAt = [];
    const goneBefore = () => disposedAt.reduce((n, v) => n + (v ? 1 : 0), 0);
    /* Pristine line numbers, captured once. These MUST NOT be re-derived from the items
     * on each visit: `item.startLine` is overwritten with `base + offset` below, and that
     * mutation survives the task. Re-reading it when a task is revisited via "Previous"
     * therefore added the offset a second time, pushing the line pointer past the task's
     * real position and onto the following one — which is why Previous appeared to return
     * the same task. Invisible until something changed the file's line count, so it only
     * showed up once a project with a subtask had been created. */
    const bases = items.map((it) => ({ start: it.startLine, end: it.endLine, raw: it.raw }));
    // Journals for the current task and the one before it. Two is enough to support
    // "redo this task" and "back to previous task"; keeping every journal for a long
    // review would pin the whole vault's prior contents in memory.
    let prevJournal = null;
    let prevIndex = -1;
    /* One pass: Organise's questions straight after Process's, task by task, when the
     * setting is on. A task put in the two-minute batch waits until after the batch — if it
     * is done by then there is nothing to organise, and labelling it first would also stop
     * the batch finding it by its words. */
    const onePass = mode === "process" && !!this.plugin.settings.organiseAfterProcessing;
    let organiseLater = [];
    // What became of each task, for the summary. Set once a task is finished with, and
    // cleared when Back or Previous undoes it.
    const outcomes = [];
    for (let i = 0; i < items.length; i++) {
      if (this.exiting) break;
      // Snapshot of every file's offset, so a rewind restores the whole coordinate space
      // and not just the current file's.
      offsetAt[i] = new Map(offsets);
      batchMarkAt[i] = ctx.quickBatch.length;
      const item = items[i];
      const baseStart = bases[i].start;
      const baseEnd = bases[i].end;
      const itemOffset = offsetOf(item.file.path);
      item.startLine = baseStart + itemOffset;
      item.endLine = baseEnd + itemOffset;
      const before = await lineCount(this.app, item.file);
      const fresh = (await this.app.vault.read(item.file)).split("\n");
      /* Offsets assume tasks only grow or shrink in place. Filing a task under an existing
       * project MOVES it, which reorders lines without changing the file's length, so the
       * offset stays zero while everything between the two positions has shifted. Re-anchor
       * by content when the expected line no longer holds the expected text, preferring the
       * candidate closest to where it was predicted. Costs nothing when nothing moved.
       *
       * Not found at all = moved or changed by an earlier task (taken along with a project,
       * say): it is passed over. Falling back to the predicted line reviewed whatever had
       * taken its place — once, a line of a tasks query block above the project. */
      const anchored = locateByText(fresh, item.startLine, bases[i].raw);
      if (anchored < 0) {
        disposedAt[i] = true;
        continue;
      }
      item.startLine = anchored;
      // Measured now, not carried from the start of the review: an earlier task may have
      // filed a next action under this one, and moving or deferring it with the old extent
      // would leave that action behind.
      item.endLine = computeSubtreeEnd(fresh, anchored);
      if (item.startLine >= 0 && item.startLine < fresh.length) {
        item.raw = fresh[item.startLine];
        item.isProject = lineHasTag(item.raw, projectTag);
        // Recomputed here rather than at collect time so the chain is correct after
        // earlier tasks in this review have shifted the file around.
        const ancestors = computeAncestorLines(fresh, item.startLine);
        item.parentRaw = ancestors.length ? ancestors.map((n) => fresh[n]).join("\n") : null;
      }
      delete item.outcome;
      delete item.projectHandled;
      delete item.afterWalk;
      delete item.projectAfter;
      // The project a query-found task sits in, if any: it is checked once the task is done.
      const projectOf = projectAbove(fresh, item.startLine, projectTag);
      item.disposed = false;
      const gone = goneBefore();
      this.renderProgress(mode, i - gone, items.length - gone);
      await this.highlightInSource(item);
      // Fresh journal per attempt. item.file is snapshotted eagerly because the Tasks
      // plugin's modal writes to it directly, bypassing our wrapped app.
      const journal = new VaultJournal(this.app);
      await journal.capture(item.file);
      this.canGoBack = true;
      this.canGoPrev = i > 0 && prevJournal !== null;
      const taskCtx = Object.assign({}, ctx, { app: journalledApp(this.app, journal) });
      let rewind = null;
      let skipped = false;
      try {
        if (mode === "process") {
          await runProcess(taskCtx, item);
          if (onePass) {
            if (ctx.quickBatch.length > batchMarkAt[i]) organiseLater.push(i);
            else await organiseAfterProcess(taskCtx, item, filing, true, null);
          }
        } else await runOrganise(taskCtx, item, filing);
        if (projectOf && !item.projectHandled) await settleProjectLeft(taskCtx, item, projectOf);
      } catch (e) {
        if (e instanceof ReviewControl) {
          if (e.kind === "exit") {
            this.exiting = true;
            break;
          }
          // No smaller unit of work at this level, so a cancel restarts the whole task.
          // "reprocess" is handled inside Organise; reaching here means it was pressed
          // somewhere it has no unit to act on, and restarting the task is the safe reading.
          if (e.kind === "back" || e.kind === "retry" || e.kind === "reprocess") rewind = "back";
          else if (e.kind === "prev") rewind = "prev";
          else if (e.kind === "skip") skipped = true;
        } else {
          console.error(`${PLUGIN_NAME} error:`, e);
          new obsidian.Notice(`${PLUGIN_NAME}: ` + (e instanceof Error ? e.message : String(e)));
        }
      }
      if (rewind) {
        const failed = await journal.restore();
        if (failed.length) {
          new obsidian.Notice(`${PLUGIN_NAME}: could not fully undo ${failed.length} file(s). Check them before continuing.`);
        }
        // Undone, so this task contributed no net line change.
        item.startLine = baseStart;
        item.endLine = baseEnd;
        if (rewind === "back") {
          restoreOffsets(offsets, offsetAt[i]);
          ctx.quickBatch.length = batchMarkAt[i];
          disposedAt[i] = false;
          i -= 1;
          continue;
        }
        // "prev": also undo the previous task and resume at it. The button is only
        // rendered when a previous journal exists, but guard anyway — losing the button
        // to a race should degrade to "restart this task", never throw mid-review.
        if (!prevJournal || prevIndex < 0) {
          restoreOffsets(offsets, offsetAt[i]);
          ctx.quickBatch.length = batchMarkAt[i];
          disposedAt[i] = false;
          i -= 1;
          continue;
        }
        const back = await prevJournal.restore();
        if (back.length) {
          new obsidian.Notice(`${PLUGIN_NAME}: could not fully undo ${back.length} file(s) from the previous task.`);
        }
        const target = prevIndex;
        restoreOffsets(offsets, offsetAt[target]);
        ctx.quickBatch.length = batchMarkAt[target];
        organiseLater = organiseLater.filter((k) => k < target);
        outcomes[target] = void 0;
        // Both the current task and the one being reopened are back in scope.
        disposedAt[i] = false;
        disposedAt[target] = false;
        prevJournal = null;
        prevIndex = -1;
        i = target - 1;
        continue;
      }
      disposedAt[i] = !!item.disposed;
      outcomes[i] = skipped ? ["skipped"] : outcomesOf(item, mode);
      prevJournal = journal;
      prevIndex = i;
      const after = await lineCount(this.app, item.file);
      offsets.set(item.file.path, offsetOf(item.file.path) + (after - before));
    }
    this.canGoBack = false;
    this.canGoPrev = false;
    // Exiting skips the batch on purpose: queued tasks are still in the file as ordinary
    // next actions, so leaving costs nothing and needs no clean-up.
    let batchDone = 0;
    if (mode === "process" && !this.exiting && ctx.quickBatch.length) {
      batchDone = await this.runQuickBatch(ctx, ctx.quickBatch);
    }
    if (onePass && !this.exiting && organiseLater.length) {
      await this.organiseAfterBatch(ctx, organiseLater.map((k) => items[k]), filing);
    }
    this.renderDone(
      this.exiting ? "Exited \u2014 remaining tasks untouched." : "All tasks reviewed.",
      sessionSummary(outcomes.flat().filter(Boolean), batchDone)
    );
  }
  /** Clear the two-minute batch, one task at a time. Returns how many were completed.
   *
   * Restart and Revert mean nothing here — every decision is already made — so the nav
   * offers only Skip, which leaves a task as an ordinary next action, and Exit, which
   * leaves all the remaining ones that way. */
  /** One pass: organise what was batched and is still open, now the batch is done.
   *
   * Each has its own undo, as in the main loop: Back undoes what was done to it and asks
   * again, Skip leaves it as it is, Exit leaves the rest. There is no previous task to go
   * back to — the batch has come in between. */
  async organiseAfterBatch(ctx, units, filing) {
    for (const unit of units) {
      for (let attempt = 0; attempt < MAX_SUBTASK_RETRIES && !this.exiting; attempt++) {
        const journal = new VaultJournal(this.app);
        await journal.capture(unit.file);
        this.canGoBack = true;
        this.canGoPrev = false;
        const taskCtx = Object.assign({}, ctx, { app: journalledApp(this.app, journal) });
        try {
          await organiseAfterProcess(taskCtx, unit, filing, true, null);
          break;
        } catch (e) {
          if (!(e instanceof ReviewControl)) throw e;
          if (e.kind === "exit") this.exiting = true;
          if (e.kind === "exit" || e.kind === "skip") break;
          const failed = await journal.restore();
          if (failed.length) new obsidian.Notice(`${PLUGIN_NAME}: could not fully undo ${failed.length} file(s).`);
        }
      }
      if (this.exiting) break;
    }
    this.canGoBack = false;
  }
  async runQuickBatch(ctx, batch) {
    let done = 0;
    for (let k = 0; k < batch.length; k++) {
      if (this.exiting) break;
      const entry = batch[k];
      // Removed with "Fix one of these…" after it was batched.
      if (entry.removed) continue;
      let lines;
      try {
        lines = (await this.app.vault.read(entry.file)).split("\n");
      } catch {
        continue;
      }
      const at = locateQueuedAction(lines, entry);
      if (at < 0) continue;
      if (COMPLETED_STATUSES.has(taskStatusOf(lines[at]))) continue;
      const end = computeSubtreeEnd(lines, at);
      this.headerEl.setText(`Two-minute batch \u2014 ${k + 1} of ${batch.length}`);
      await this.highlightInSource({ file: entry.file, startLine: at, endLine: end, raw: lines[at] });
      let choice;
      try {
        choice = await this.choice(
          "Two-minute batch \u2014 **do it now**.",
          [
            { label: "Done", value: "done" },
            { label: "Took **longer** \u2014 keep it as a next action", value: "keep" }
          ],
          GUIDANCE.quickBatch
        );
      } catch (e) {
        if (!(e instanceof ReviewControl)) throw e;
        if (e.kind === "exit") {
          this.exiting = true;
          break;
        }
        continue;
      }
      if (choice === "done") {
        const project = ctx.settings ? projectAbove(lines, at, ctx.settings.projectTag) : null;
        await completeSubtree(ctx, entry.file, at, end);
        done++;
        // That may have been its project's last next action.
        if (project) {
          try {
            await settleProjectLeft(ctx, { file: entry.file, outcome: "complete" }, project);
          } catch (e) {
            if (!(e instanceof ReviewControl)) throw e;
            if (e.kind === "exit") {
              this.exiting = true;
              break;
            }
          }
        }
      } else {
        // It is now an ordinary next action, and was never clarified on the way in.
        await confirmNextAction(ctx, entry.file, at);
      }
    }
    return done;
  }
  /* ------------------------------ Prompter API ------------------------------ */
  /* `guidance` is a GTD tip, shown according to the tips setting. `note` is shown always:
   * it is for things specific to this item — why its wording was flagged — not general
   * advice you can learn once and stop reading. */
  choice(question, options, guidance, note) {
    return this.renderChoice(question, options, false, guidance, note);
  }
  optionalChoice(question, options, guidance, note) {
    return this.renderChoice(question, options, true, guidance, note);
  }
  text(question, opts) {
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.pendingKeys = null;
      this.revealSelf();
      this.bodyEl.empty();
      this.renderQuestion(question, opts == null ? void 0 : opts.guidance);
      const input = this.bodyEl.createEl("input", { type: "text", cls: "gtd-clarify-input" });
      // Mobile: this field is a filename, so the IME's smart behaviours are pure downside
      // here, and autocorrect/autocapitalise are what make the composing region fragile
      // enough to produce the reversal guarded against below.
      input.setAttribute("autocomplete", "off");
      input.setAttribute("autocorrect", "off");
      input.setAttribute("autocapitalize", "none");
      input.setAttribute("spellcheck", "false");
      input.setAttribute("enterkeyhint", "done");
      if (opts == null ? void 0 : opts.placeholder) input.placeholder = opts.placeholder;
      const caretToEnd = () => {
        const n = input.value.length;
        try {
          input.setSelectionRange(n, n);
        } catch {
          // Some inputs don't support selection ranges; the caret stays where it is.
        }
      };
      /* Guard against reversed input on mobile ("clarity" -> "ytiralc").
       *
       * Cause: the field was focused synchronously while the sidebar drawer was still
       * animating in. On mobile the soft keyboard can then attach with the selection
       * pinned at index 0, so every committed character is inserted at the FRONT of the
       * value instead of at the caret, which reverses the string.
       *
       * The invariant this relies on: immediately after inserting a character the caret
       * can never legitimately sit at 0 — it must be at least 1. So a caret at 0 straight
       * after the value GREW is always the bug, never a deliberate edit. Deletions are
       * excluded (backspacing to the front legitimately leaves the caret at 0), which is
       * why this tracks length growth rather than just reacting to every input event.
       *
       * Re-checked on the next frame as well, in case the platform resets the selection
       * after our handler rather than before it. Both paths re-test the condition, so
       * neither can disturb a caret the user has deliberately placed mid-string. */
      let lastLen = 0;
      const fixCaretIfPinned = () => {
        if (input.value.length > 0 && input.selectionStart === 0 && input.selectionEnd === 0) {
          caretToEnd();
        }
      };
      input.addEventListener("input", () => {
        const len = input.value.length;
        const grew = len > lastLen;
        lastLen = len;
        if (!grew) return;
        fixCaretIfPinned();
        window.requestAnimationFrame(fixCaretIfPinned);
      });
      let settled = false;
      const submit = () => {
        if (settled) return;
        const v = input.value;
        if (!v.trim() && !(opts == null ? void 0 : opts.allowEmpty)) return;
        settled = true;
        if (this.rootEl) this.rootEl.classList.remove("is-typing");
        this.settlePrompt();
        resolve(v);
      };
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
      });
      const btn = this.bodyEl.createEl("button", { text: "OK", cls: "mod-cta gtd-clarify-btn" });
      /* Submit on pointerdown, not click — and preventDefault so focus never leaves the
       * field. Otherwise the first press only blurs the input: that dismisses the mobile
       * keyboard, the pane reflows under the finger, and the click lands on nothing. That
       * is the "have to press it twice" bug.
       *
       * But submitting on pointerdown re-renders the pane mid-gesture, and this same
       * physical press is STILL going to produce a click — which then lands on whichever
       * control of the NEXT prompt now occupies that spot. OK is the third element here
       * (question, input, button), and the third element of "Move to..." is "Create a new
       * note...", so one press on OK was silently also choosing __new__ and skipping the
       * whole move-target step. Swallow exactly one click, in the capture phase, to close
       * out this gesture. */
      const swallowNextClick = () => {
        const root = this.rootEl || this.containerEl;
        if (!root) return;
        let done = false;
        const release = () => {
          if (done) return;
          done = true;
          root.removeEventListener("click", eat, true);
        };
        const eat = (ev) => {
          ev.stopPropagation();
          ev.preventDefault();
          release();
        };
        root.addEventListener("click", eat, true);
        // If the gesture never produces a click, do not leave the trap armed.
        window.setTimeout(release, 350);
      };
      btn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        swallowNextClick();
        submit();
      });
      // Keyboard activation (Enter/Space on a focused button); `settled` no-ops a repeat.
      btn.addEventListener("click", submit);
      // Focus AFTER the pane has been revealed and laid out, rather than mid-animation,
      // then park the caret explicitly at the end instead of trusting the default.
      /* While a soft keyboard is open the pane is roughly half its usual height, and the
       * Skip/Exit bar gets shoved up to sit directly above the keyboard — right where a
       * thumb reaching for the input lands. Flag the typing state so CSS can drop the nav
       * bar and shrink the task preview, giving the question and field the space instead.
       * Safe against layout shift on blur: .gtd-clarify-body stacks its children from the
       * top, so restoring the nav shrinks the body from the bottom without moving the
       * input or the OK button under the user's finger. */
      const setTyping = (on) => {
        if (this.rootEl) this.rootEl.classList.toggle("is-typing", on);
      };
      input.addEventListener("focus", () => setTyping(true));
      input.addEventListener("blur", () => setTyping(false));
      window.requestAnimationFrame(() => {
        input.focus();
        lastLen = input.value.length;
        caretToEnd();
      });
    });
  }
  /** One Sweep prompt. Type a thought and press Enter (or Add) to capture it, as many as
   * come; Enter on an empty line, or Next, moves on. Resolves "next", "skip" (the rest of
   * this kind of prompt) or "finish". `handlers.add` writes each thought as it is added, so
   * nothing typed is lost if the sweep is left part-way; `handlers.remove` takes one back.
   *
   * Pasting several lines makes ONE thought, with the lines joined by spaces: a pasted
   * paragraph is one thing on your mind, not one per line. A text field would otherwise
   * drop the line breaks and run the words together. */
  sweep(prompt, handlers) {
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.pendingKeys = null;
      this.revealSelf();
      this.bodyEl.empty();
      this.renderQuestion(prompt.question, prompt.guidance, prompt.note);
      if (prompt.reminders && prompt.reminders.length) {
        const ul = this.bodyEl.createEl("ul", { cls: "gtd-clarify-reminders" });
        for (const r of prompt.reminders) ul.createEl("li", { text: r });
      }
      const row = this.bodyEl.createDiv({ cls: "gtd-clarify-sweep-row" });
      const input = row.createEl("input", { type: "text", cls: "gtd-clarify-input" });
      input.setAttribute("autocomplete", "off");
      input.setAttribute("enterkeyhint", "enter");
      // Labelled by the question shown above it, not an aria-label: that would pop up the
      // same question again as a tooltip whenever the pointer crossed the field.
      input.setAttribute("aria-labelledby", this.questionId);
      input.placeholder = "Type a thought\u2026";
      const addBtn = row.createEl("button", { text: "Add", cls: "gtd-clarify-btn gtd-clarify-add" });
      const list = this.bodyEl.createEl("ul", { cls: "gtd-clarify-captured" });
      const controls = this.bodyEl.createDiv({ cls: "gtd-clarify-sweep-controls" });
      const nextBtn = appendRich(controls, "button", "**Next**", "gtd-clarify-btn mod-cta");
      const skipBtn = prompt.skipLabel ? appendRich(controls, "button", prompt.skipLabel, "gtd-clarify-btn") : null;
      const finishBtn = appendRich(controls, "button", "**Finish** the sweep", "gtd-clarify-btn");
      let settled = false;
      let busy = false;
      const leave = (action) => {
        if (settled) return;
        settled = true;
        if (this.rootEl) this.rootEl.classList.remove("is-typing");
        this.settlePrompt();
        resolve(action);
      };
      const submit = async () => {
        if (settled || busy) return;
        if (!input.value.trim()) {
          leave("next");
          return;
        }
        busy = true;
        try {
          const added = await handlers.add(input.value);
          if (added) {
            input.value = "";
            const li = list.createEl("li");
            li.createSpan({ text: added });
            const x = li.createEl("button", { text: "\u00D7", cls: "gtd-clarify-uncapture" });
            x.setAttribute("aria-label", `Take back \u201C${added}\u201D`);
            x.addEventListener("click", async () => {
              if (await handlers.remove(added)) li.remove();
              input.focus();
            });
          }
        } finally {
          busy = false;
        }
        input.focus();
      };
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.isComposing) return;
        e.preventDefault();
        void submit();
      });
      input.addEventListener("paste", (e) => {
        const text = e.clipboardData ? e.clipboardData.getData("text") : "";
        if (!/[\r\n]/.test(text)) return;
        e.preventDefault();
        const joined = text.replace(/\s*[\r\n]+\s*/g, " ").trim();
        const from = typeof input.selectionStart === "number" ? input.selectionStart : input.value.length;
        const to = typeof input.selectionEnd === "number" ? input.selectionEnd : from;
        input.value = input.value.slice(0, from) + joined + input.value.slice(to);
        const caret = from + joined.length;
        try {
          input.setSelectionRange(caret, caret);
        } catch {
          // The caret stays where the browser put it.
        }
      });
      /* Add keeps the field focused (so the phone keyboard stays up) and does nothing on an
       * empty field: moving on is Next's job, and a tap that re-drew the pane would land its
       * click on whatever the next prompt puts there. */
      addBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (input.value.trim()) void submit();
      });
      addBtn.addEventListener("click", () => {
        if (input.value.trim()) void submit();
      });
      /* The ways on act on pointerdown, before the field loses focus and the keyboard closes
       * — otherwise the first tap only closes the keyboard, the pane reflows, and the tap
       * lands on nothing. The click the same tap still produces is swallowed, so it cannot
       * land on the next prompt's controls. */
      const onward = (btn, action) => {
        btn.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          this.swallowNextClick();
          leave(action);
        });
        btn.addEventListener("click", () => leave(action));
      };
      onward(nextBtn, "next");
      if (skipBtn) onward(skipBtn, "skip");
      onward(finishBtn, "finish");
      const setTyping = (on) => {
        if (this.rootEl) this.rootEl.classList.toggle("is-typing", on);
      };
      input.addEventListener("focus", () => setTyping(true));
      input.addEventListener("blur", () => setTyping(false));
      window.requestAnimationFrame(() => input.focus());
    });
  }
  /** Swallow the one click a tap produces after its pointerdown has already acted. */
  swallowNextClick() {
    const root = this.rootEl || this.containerEl;
    if (!root) return;
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      root.removeEventListener("click", eat, true);
    };
    const eat = (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      release();
    };
    root.addEventListener("click", eat, true);
    window.setTimeout(release, 350);
  }
  /** Sweep, start to end: the prompts, then what was captured and whether to process it. */
  async startSweep() {
    this.exiting = false;
    this.reviewMode = "sweep";
    this.canGoBack = false;
    this.canGoPrev = false;
    this.firstQuestionOfReview = false;
    this.taskEl.empty();
    const settings = this.plugin.settings;
    const path = sweepInboxPath(settings);
    const name = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");
    const header = (n) => this.headerEl.setText(n ? `Sweep \u2014 ${n} captured` : "Sweep");
    header(0);
    const ctx = { app: this.app, plugin: this.plugin, settings, prompter: this };
    const captured = await runSweep(ctx, header);
    if (!captured) {
      this.renderDone("Nothing captured \u2014 nothing new on your mind.");
      return;
    }
    let next = "later";
    try {
      next = await this.choice(`Captured **${captured}** in \u201C${name}\u201D. **Process** them now?`, [
        { label: "**Process** the inbox now", value: "process" },
        { label: "**Not now**", value: "later" }
      ], GUIDANCE.sweepProcess);
    } catch (e) {
      if (!(e instanceof ReviewControl)) throw e;
    }
    const file = this.app.vault.getAbstractFileByPath((0, obsidian.normalizePath)(path));
    if (next !== "process" || !(file instanceof obsidian.TFile)) {
      this.renderDone(`Captured ${captured} in \u201C${name}\u201D.`);
      return;
    }
    // Open it, so each task is highlighted in its note as Process reaches it.
    try {
      await this.app.workspace.getLeaf(false).openFile(file);
    } catch {
      // Process works on the note whether or not it is open.
    }
    await this.start("process", file, { thisNote: true });
  }
  /** A date after `opts.after`, typed in words or picked from a calendar. Resolves to the
   * date, or null for Back.
   *
   * The date it has read is shown as you type — "next Wednesday \u2192 Wednesday 28 October
   * 2026" — and only a date it could read, and that is in the future, can be used. The
   * calendar is the browser's own date input, so it is a native picker on a phone. */
  date(question, opts = {}) {
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.pendingKeys = null;
      this.revealSelf();
      this.bodyEl.empty();
      this.renderQuestion(question, opts.guidance);
      const parse = opts.parse || ((t) => (/^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null));
      const after = opts.after || "";
      let chosen = null;
      const words = this.bodyEl.createEl("input", { type: "text", cls: "gtd-clarify-input" });
      for (const [k, v] of [["autocomplete", "off"], ["autocorrect", "off"], ["autocapitalize", "none"], ["spellcheck", "false"], ["enterkeyhint", "done"]]) {
        words.setAttribute(k, v);
      }
      if (opts.placeholder) words.placeholder = opts.placeholder;
      const preview = this.bodyEl.createEl("div", { cls: "gtd-clarify-datepreview" });
      const row = this.bodyEl.createEl("label", { cls: "gtd-clarify-calendar" });
      row.createSpan({ text: "Or pick it: " });
      const calendar = row.createEl("input", { type: "date", cls: "gtd-clarify-dateinput" });
      if (after) calendar.min = shiftDate(after, 1);
      const ok = this.bodyEl.createEl("button", { text: "Use this date", cls: "gtd-clarify-btn mod-cta" });
      const back = this.bodyEl.createEl("button", { text: "Back", cls: "gtd-clarify-btn" });
      const show = (iso, problem) => {
        chosen = iso && !problem ? iso : null;
        preview.setText(problem || (iso ? `\u2192 ${formatLongDate(iso)}` : ""));
        preview.toggleClass("is-problem", !!problem);
        ok.disabled = !chosen;
      };
      const check = (iso, typed) => {
        if (!typed) return show(null, "");
        if (!iso) return show(null, "Not a date I can read \u2014 try \u2018next Wednesday\u2019 or \u20183 Nov\u2019.");
        if (after && iso <= after) return show(null, `${formatLongDate(iso)} isn\u2019t in the future.`);
        return show(iso, "");
      };
      let lastLen = 0;
      words.addEventListener("input", () => {
        // The same guard as text(): a caret pinned at 0 just after the value grew is the
        // mobile reversed-input bug, never a deliberate edit.
        const len = words.value.length;
        if (len > lastLen && len > 0 && words.selectionStart === 0 && words.selectionEnd === 0) {
          try {
            words.setSelectionRange(len, len);
          } catch {
            // Some inputs don't support selection ranges; the caret stays where it is.
          }
        }
        lastLen = len;
        check(parse(words.value), words.value.trim());
        if (chosen) calendar.value = chosen;
      });
      calendar.addEventListener("change", () => {
        words.value = "";
        lastLen = 0;
        check(calendar.value || null, calendar.value);
      });
      const submit = () => {
        if (!chosen) return;
        this.settlePrompt();
        resolve(chosen);
      };
      words.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      });
      ok.addEventListener("click", submit);
      back.addEventListener("click", () => {
        this.settlePrompt();
        resolve(null);
      });
      const setTyping = (on) => {
        if (this.rootEl) this.rootEl.classList.toggle("is-typing", on);
      };
      words.addEventListener("focus", () => setTyping(true));
      words.addEventListener("blur", () => setTyping(false));
      show(null, "");
      window.requestAnimationFrame(() => words.focus());
    });
  }
  confirm(question, guidance) {
    return this.renderChoice(
      question,
      [
        { label: "Yes", value: true },
        { label: "No", value: false }
      ],
      false,
      guidance
    );
  }
  info(message) {
    this.headerEl.setText(message);
  }
  /** Bring the review pane back to the front. On mobile this re-opens the right drawer
   * after a Tasks modal or the note picker has taken over the screen, preserving the
   * current step (the flow keeps awaiting; we only re-reveal the same pane). */
  /* Lives on the PANE: guide() calls it through ctx.prompter. An earlier version was
   * inserted into TasksApiAdapter by mistake, where the prompter could never reach it, so
   * every piece of guidance was silently dropped while the tests still passed. */
  /** Render a heading and guidance into the pane without arming a prompt. Used while an
   * external dialogue is open, so the pane says what is being asked instead of showing a
   * question that has already been answered. */
  showGuidance(question, guidance) {
    this.pendingKeys = null;
    this.revealSelf();
    this.bodyEl.empty();
    this.renderQuestion(question, guidance);
  }
  /** The question heading, plus its tip in whichever form the user has chosen.
   *
   * Both the choice prompts and the during-dialogue guidance render through here, so the
   * setting applies everywhere at once rather than at whichever sites remembered to check
   * it. "always" shows the tip in full; "onDemand" puts it behind an info button on the
   * question line; "off" omits it. The question itself is always shown — it is what is
   * being asked, not commentary on it. */
  renderQuestion(question, guidance, note) {
    const q = this.bodyEl.createEl("p", { cls: "gtd-clarify-question" });
    const words = appendRich(q, "span", question);
    /* An id, so a field answering this question can name it as its label (aria-labelledby)
     * instead of repeating it in an aria-label, which Obsidian shows as a hover tooltip.
     * The pane's own token keeps ids apart if two review panes are open. */
    this.paneToken = this.paneToken || Math.random().toString(36).slice(2, 8);
    this.questionSeq = (this.questionSeq || 0) + 1;
    this.questionId = `gtd-question-${this.paneToken}-${this.questionSeq}`;
    words.setAttribute("id", this.questionId);
    if (note) this.bodyEl.createEl("div", { text: note, cls: "gtd-clarify-note" });
    if (!guidance) return q;
    const mode = guidanceMode(this.plugin && this.plugin.settings);
    if (mode === "off") return q;
    if (mode === "always") {
      this.bodyEl.createEl("div", { text: guidance, cls: "gtd-clarify-guidance" });
      return q;
    }
    const tip = this.bodyEl.createEl("div", { text: guidance, cls: "gtd-clarify-guidance" });
    tip.classList.toggle("gtd-clarify-collapsed", true);
    const info = q.createEl("button", { cls: "gtd-clarify-info", text: "\u24D8" });
    // The aria-label is its one tooltip (Obsidian shows it on hover). A title as well showed a
    // second, browser tooltip on top, and went on saying "Show tip" once the tip was open.
    info.setAttribute("aria-label", "Show tip");
    info.setAttribute("aria-expanded", "false");
    // Collapsed afresh on every question: this is a reminder you reach for, not a panel
    // that stays open and quietly becomes the "always" mode again.
    info.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = tip.classList.contains("gtd-clarify-collapsed");
      tip.classList.toggle("gtd-clarify-collapsed", !open);
      info.setAttribute("aria-expanded", String(open));
      info.setAttribute("aria-label", open ? "Hide tip" : "Show tip");
      info.classList.toggle("is-active", open);
    });
    return q;
  }
  revealSelf() {
    this.app.workspace.revealLeaf(this.leaf);
    // Every prompt routes through here, so this is the one place that reliably runs
    // whenever the nav's available actions may have changed (Restart/Revert appear and
    // disappear as the review moves between tasks). renderNav is cheap and idempotent.
    this.renderNav();
  }
  suggestFile() {
    return new Promise((resolve) => {
      new NoteSuggestModal(
        this.app,
        this.app.vault.getMarkdownFiles(),
        "Type to find a note to move the task to\u2026",
        (file) => {
          this.revealSelf();
          resolve(file);
        }
      ).open();
    });
  }
  suggestTemplate() {
    return new Promise((resolve) => {
      const files = getTemplateFiles(this.app, this.plugin.settings);
      new NoteSuggestModal(this.app, files, "Type to pick a template to run\u2026", (file) => {
        this.revealSelf();
        resolve(file);
      }).open();
    });
  }
  suggestFolder() {
    return new Promise((resolve) => {
      new FolderSuggestModal(this.app, (folder) => {
        this.revealSelf();
        resolve(folder);
      }).open();
    });
  }
  suggestProject(projects) {
    return new Promise((resolve) => {
      new ProjectSuggestModal(this.app, projects, (project) => {
        this.revealSelf();
        resolve(project);
      }).open();
    });
  }
  /* ------------------------------- rendering -------------------------------- */
  renderChoice(question, options, optional, guidance, note) {
    return new Promise((resolve, reject) => {
      this.pendingReject = reject;
      this.revealSelf();
      this.bodyEl.empty();
      const keys = numberKeysEnabled(this.plugin && this.plugin.settings);
      // Said once, on the first question, until a number key has been used.
      const hint = keys && this.plugin && this.plugin.settings && !this.plugin.settings.numberKeysUsed && this.firstQuestionOfReview ? "Tip: press 1\u20139 to answer, or 0 to skip a step." : null;
      this.firstQuestionOfReview = false;
      // The question, with what a good answer looks like available alongside it.
      this.renderQuestion(question, guidance, note || hint);
      const answer = (value) => {
        this.settlePrompt();
        resolve(value);
      };
      const picks = [];
      let skip = null;
      if (optional) {
        /* Its own row, at the right, the same place on every step — and quiet: most steps
         * are answered, not skipped, so the answers are where the eye should land. It used
         * to be a full-width accent button above them. */
        const btn = this.bodyEl.createEl("button", { cls: "gtd-clarify-btn gtd-clarify-skip" });
        /* No aria-label or title on answer buttons: Obsidian turns an aria-label into a hover
         * tooltip, and both would only repeat what the button already shows. The key's number
         * is hidden from screen readers, which hear it from aria-keyshortcuts instead. */
        if (keys) {
          btn.createSpan({ cls: "gtd-clarify-key", text: "0" }).setAttribute("aria-hidden", "true");
          btn.setAttribute("aria-keyshortcuts", "0");
        }
        btn.createSpan({ text: "Skip step" });
        skip = () => answer(null);
        btn.addEventListener("click", skip);
      }
      let lastGroup;
      options.forEach((opt, i) => {
        if (opt.group && opt.group !== lastGroup) {
          this.bodyEl.createEl("div", { text: opt.group, cls: "gtd-clarify-group" });
          lastGroup = opt.group;
        }
        const pick = () => answer(opt.value);
        let btn;
        if (keys && i < MAX_NUMBER_KEYS) {
          btn = this.bodyEl.createEl("button", { cls: "gtd-clarify-btn gtd-clarify-numbered" });
          btn.createSpan({ cls: "gtd-clarify-key", text: String(i + 1) }).setAttribute("aria-hidden", "true");
          appendRich(btn, "span", opt.label);
          btn.setAttribute("aria-keyshortcuts", String(i + 1));
        } else {
          btn = appendRich(this.bodyEl, "button", opt.label, "gtd-clarify-btn");
        }
        if (opt.suggested) btn.createSpan({ cls: "gtd-clarify-suggested", text: "suggested" });
        btn.addEventListener("click", pick);
        picks.push(pick);
      });
      this.pendingKeys = keys ? { picks, skip } : null;
      /* Keys go to the pane, not to the note, so a digit answers rather than being typed.
       * Only what a click on an answer would do anyway; a note being edited is left alone. */
      if (keys && typeof this.bodyEl.focus === "function") {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (!isTypingTarget(active)) {
          try {
            this.bodyEl.focus({ preventScroll: true });
          } catch {
            // Focus only helps number keys reach the pane; clicking works without it.
          }
        }
      }
    });
  }
  /** A number key, while a choice is waiting. */
  onAnswerKey(e) {
    const pick = keyAnswer(e, this.pendingKeys, typeof document !== "undefined" ? document : null);
    if (!pick) return;
    e.preventDefault();
    e.stopPropagation();
    const settings = this.plugin && this.plugin.settings;
    if (settings && !settings.numberKeysUsed) {
      settings.numberKeysUsed = true;
      if (this.plugin.saveSettings) this.plugin.saveSettings();
    }
    pick();
  }
  /** Task display is two SEPARATE sections: the parent project line pinned above as
   * dimmed context, and the active subtask below it in its own scroll box. Only the
   * active line scrolls, so long tasks stay readable without the parent — the thing that
   * tells you where you are — sliding out of view. */
  /** Wire the task region's scrolling once — taskEl persists for the life of the view;
   * only its children are replaced per task. */
  setupTaskScroll() {
    this.taskFollow = true;
    this.taskExpectedTop = 0;
    this.taskEl.addEventListener("scroll", () => {
      // Distinguish our own scrolling from the user's: we record where we put the region,
      // so anything else moved it. Once the user takes over, stop repositioning until the
      // next task — being dragged back while reading the project line is the annoyance.
      if (Math.abs(this.taskEl.scrollTop - this.taskExpectedTop) <= 2) return;
      this.taskFollow = false;
    });
    if (typeof ResizeObserver === "function") {
      // The mobile keyboard opening, or the sidebar being dragged, rewraps the text and
      // moves where the active box starts. Reposition, unless the user has taken over.
      this.taskScrollObserver = new ResizeObserver(() => {
        if (this.taskFollow) this.scrollToActiveTask();
      });
      this.taskScrollObserver.observe(this.taskEl);
    }
  }
  /** Put the active subtask box at the top of the visible region, so it reads from its
   * first line and the project box sits just above, reachable by scrolling up.
   *
   * Not a plain scroll-to-bottom: with a subtask longer than the region that would show
   * the END of the task text. Clamped to the maximum scroll, so a short subtask simply
   * lands at the bottom with the project box visible above it. */
  scrollToActiveTask() {
    const el = this.taskEl;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    const active = this.activeTaskEl;
    const activeTop = active ? Math.max(0, el.scrollHeight - active.offsetHeight) : max;
    this.taskExpectedTop = Math.min(activeTop, max);
    el.scrollTop = this.taskExpectedTop;
  }
  addTaskLine(parent, text, cls, file) {
    const line = parent.createDiv({ cls });
    renderTaskText(line, text, file ? this.internalLinksFor(file) : void 0);
    return line;
  }
  /** Internal links resolve relative to the note the task lives in, as they would there. */
  internalLinksFor(file) {
    const sourcePath = file.path;
    return {
      open: (linktext) => this.openInternalLink(linktext, sourcePath),
      exists: (linkpath) => this.linkResolves(linkpath, sourcePath)
    };
  }
  /** Open a linked note in a NEW tab. The review edits and highlights the note it is
   * working through by finding whichever editor shows it; replacing that editor would pull
   * the note out from under the review. A new tab leaves it where it is. */
  openInternalLink(linktext, sourcePath) {
    try {
      const result = this.app.workspace.openLinkText(linktext, sourcePath, "tab");
      if (result && typeof result.catch === "function") result.catch(() => {
      });
    } catch {
      new obsidian.Notice(`${PLUGIN_NAME}: couldn't open that link.`);
    }
  }
  linkResolves(linkpath, sourcePath) {
    if (!linkpath) return true;
    try {
      return !!this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    } catch {
      return true;
    }
  }
  /** Open the note a task lives in, scrolled to the task.
   *
   * The line is found again by the task's text first: an earlier step of this same task
   * may have written above it since it was shown. An editor already showing the note is
   * reused rather than opening a second copy; otherwise the note opens in the main editor,
   * which is the same leaf the review itself would use to edit it. */
  async revealTaskInSource(file, line, endLine, raw) {
    try {
      let at = line;
      try {
        const lines = (await this.app.vault.read(file)).split("\n");
        // reanchorLine returns the shown line unchanged when the text can't be found, so a
        // task edited since falls back to where it was rather than to a guess.
        const found = reanchorLine(lines, line, raw);
        if (found >= 0 && found < lines.length) at = found;
      } catch {
        // The note couldn't be read: open it at the line that was shown.
      }
      const end = Math.max(at, endLine + (at - line));
      const workspace = this.app.workspace;
      const showing = workspace.getLeavesOfType("markdown").find((l) => {
        var _a;
        return ((_a = l.view.file) == null ? void 0 : _a.path) === file.path;
      });
      const leaf = showing || workspace.getLeaf(false);
      if (showing) {
        if (typeof workspace.setActiveLeaf === "function") workspace.setActiveLeaf(leaf, { focus: true });
      } else {
        await leaf.openFile(file, { active: true });
      }
      const place = () => {
        const editor = leaf.view && leaf.view.editor;
        if (!editor) return;
        try {
          editor.setCursor({ line: at, ch: 0 });
          editor.scrollIntoView({ from: { line: at, ch: 0 }, to: { line: end, ch: 0 } }, true);
        } catch {
          // The editor may not be laid out yet; the second attempt below tries again.
        }
      };
      place();
      // A freshly opened editor may not have laid out its content on the first pass.
      await nextFrame();
      place();
    } catch {
      new obsidian.Notice(`${PLUGIN_NAME}: couldn't open ${file.path}.`);
    }
  }
  renderNav() {
    this.navEl.empty();
    // Sweep has its own ways on, beside the field: Next, Skip the rest, Finish.
    if (this.reviewMode === "sweep") return;
    // Restart comes first and reads as the primary recovery action: mistakes are far more
    // often about the task in front of you than a realisation about the one before it.
    // Revert is the rarer, wider-reaching action, so it sits second and is styled quietly.
    if (this.canGoBack) {
      const back = this.navEl.createEl("button", {
        text: "Restart task",
        cls: "gtd-clarify-btn gtd-clarify-restart"
      });
      back.setAttribute("aria-label", "Undo everything this task has changed and start it again");
      back.addEventListener("click", () => this.rejectPending(new ReviewControl("back")));
    }
    if (this.canGoBack) {
      // Always rendered once a review is running, disabled rather than removed: a button
      // that appears and disappears shifts everything beside it, so a restart mid-review
      // moves Skip and Exit out from under the finger.
      const prev = this.navEl.createEl("button", {
        text: "Revert last",
        cls: "gtd-clarify-btn gtd-clarify-revert"
      });
      if (this.canGoPrev) {
        prev.setAttribute("aria-label", "Undo this task and the previous one, then reopen the previous task");
        prev.addEventListener("click", () => this.rejectPending(new ReviewControl("prev")));
      } else {
        prev.disabled = true;
        prev.addClass("gtd-clarify-btn-disabled");
        prev.setAttribute("aria-label", "No previous task to revert to");
      }
    }
    if (this.canGoBack && this.reviewMode === "organise") {
      // Organise only: Process already is the place to change these things.
      const again = this.navEl.createEl("button", {
        text: "Re-process",
        cls: "gtd-clarify-btn gtd-clarify-reprocess"
      });
      again.setAttribute("aria-label", "Undo this task's organising so far, then fix its wording or process it again");
      again.addEventListener("click", () => this.rejectPending(new ReviewControl("reprocess")));
    }
    const skip = this.navEl.createEl("button", { text: "Skip task", cls: "gtd-clarify-btn" });
    skip.addEventListener("click", () => this.rejectPending(new ReviewControl("skip")));
    // NOT `mod-warning`: that is an Obsidian core class, and on desktop the app
    // stylesheet gives it a solid red FILL. Only the text colour was being overridden
    // here, so the button came out pure red on desktop while mobile (which styles
    // mod-warning differently) looked right. Own class, styled explicitly, both agree.
    const exit = this.navEl.createEl("button", { text: "Exit", cls: "gtd-clarify-btn gtd-clarify-exit" });
    exit.addEventListener("click", () => {
      this.exiting = true;
      this.rejectPending(new ReviewControl("exit"));
    });
  }
  renderProgress(mode, index, total) {
    const label = mode === "process" ? "Process" : "Organise";
    this.headerEl.setText(`${label} \u2014 task ${index + 1} of ${total}`);
  }
  renderDone(message, summary = []) {
    this.revealSelf();
    this.bodyEl.empty();
    this.taskEl.empty();
    this.headerEl.setText("Done");
    this.bodyEl.createEl("p", { text: message });
    if (!summary.length) return;
    const list = this.bodyEl.createEl("ul", { cls: "gtd-clarify-summary" });
    for (const line of summary) list.createEl("li", { text: line });
  }
  /** Spec: GEN-7 — scroll to and highlight the current top-level task in the source note. */
  async highlightInSource(item) {
    var _a;
    var _b;
    this.focusOnLine(
      item.file,
      item.startLine,
      item.endLine,
      item.raw,
      (_a = item.parentRaw) != null ? _a : null,
      (_b = item.sourceLabel) != null ? _b : null
    );
  }
  /** Spec: GEN-7 / ORG-9b — while organising a project's children, focus the active
   * subtask: highlight its line in the source and show it in the pane WITH the parent
   * project line above it as context (rather than only ever showing the project line). */
  focusSubtask(parent, childLine, childRaw) {
    this.focusOnLine(parent.file, childLine, childLine, childRaw, parent.raw);
  }
  /** Ask, at the start of every review, whether to work through the current note or a
   * Tasks query. Offered for BOTH Process and Organise, and skipped entirely when the
   * installed Tasks version cannot supply a task list — in which case the current-file
   * behaviour is the only one available and asking would be noise. */
  async chooseSource(file, projectTag, mode) {
    const settings = this.plugin.settings;
    /* Deferral keeps work out of PROCESS — it has already been clarified, and comes back
     * to be dealt with on its date. It must not keep work out of ORGANISE: a deferred task
     * still needs a home. Hiding it there meant anything deferred during Process was never
     * organised at all, and came back on its date to wherever it had been captured. */
    const hideTickled = mode !== "organise" && settings.hideTickledTasks !== false;
    if (!this.plugin.tasksApi.canQuery()) {
      // On a Tasks version without query support this is the only path, so it must
      // respect deferral too — otherwise tickled tasks reappear on older installs.
      return new ActiveFileTopLevelTaskSource(this.app, file, projectTag, hideTickled);
    }
    // choice, not optionalChoice: "Skip step" here silently means "current file", which
    // is a decision disguised as a non-decision.
    // The first question of a review is the natural place to say which GTD stage this is.
    const where = await this.choice("**Which tasks** do you want to work through?", [
      { label: `This **note** (${file.basename})`, value: "__file__" },
      { label: "A Tasks **query**\u2026", value: "__query__" }
    ], mode === "organise" ? GUIDANCE.reviewOrganise : GUIDANCE.reviewProcess);
    if (where === "__file__") {
      return new ActiveFileTopLevelTaskSource(this.app, file, projectTag, hideTickled);
    }
    const saved = (settings.savedQueries || []).filter((q) => q && q.name && q.query);
    const options = saved.map((q, i) => ({ label: q.name, value: `saved:${i}` }));
    options.push({ label: "**Custom** query\u2026", value: "__custom__" });
    const pick = await this.choice("Which **query**?", options);
    let queryText;
    if (pick === "__custom__") {
      queryText = await this.text("**Query** (one filter per line)", {
        placeholder: settings.lastCustomQuery || "not done"
      });
      settings.lastCustomQuery = queryText;
      await this.plugin.saveSettings();
    } else {
      queryText = saved[Number(String(pick).slice(6))].query;
    }
    return new TasksQueryTaskSource(this.app, this.plugin.tasksApi, queryText, projectTag, hideTickled);
  }
  /** Update the pane's task display and (if enabled) the source-editor highlight.
   * The pane is updated FIRST and unconditionally, so the active task always advances
   * even if the editor isn't ready or throws. When `parentRaw` is non-null it is shown
   * above the active line as dimmed context. */
  focusOnLine(file, line, endLine, raw, parentRaw, sourceLabel) {
    this.taskEl.empty();
    if (sourceLabel) {
      /* Where a query found this task. A link, so you can go and see it in context —
       * surrounding notes, the heading it sits under — without leaving the review. */
      const source = this.taskEl.createDiv({ cls: "gtd-clarify-tasksource" });
      const link = source.createEl("a", { cls: "gtd-clarify-sourcelink", text: sourceLabel });
      link.setAttribute("href", file.path);
      // One tooltip, Obsidian's: a title as well put a second, different one on top of it.
      link.setAttribute("aria-label", `Open ${file.path} at line ${line + 1}`);
      link.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        void this.revealTaskInSource(file, line, endLine, raw);
      });
    }
    if (parentRaw !== null) {
      this.addTaskLine(this.taskEl, parentRaw.trim(), "gtd-clarify-taskline gtd-clarify-taskparent", file);
    }
    // Both boxes are plain children of ONE scroller (.gtd-clarify-task). Each box keeps its
    // natural height and its own border, so nothing is clipped; the region as a whole
    // scrolls. Pinned to the bottom, so the active subtask is what you see and the
    // project box is reached by scrolling up — rather than each box scrolling its own
    // text independently, which meant two scrollbars and no way to see both at once.
    this.activeTaskEl = this.addTaskLine(
      this.taskEl,
      raw.trim(),
      "gtd-clarify-taskline gtd-clarify-taskactive",
      file
    );
    this.taskFollow = true;
    window.requestAnimationFrame(() => this.scrollToActiveTask());
    if (!this.plugin.settings.highlightSourceLine) {
      this.activeSource = void 0;
      return;
    }
    this.activeSource = { path: file.path, line, endLine };
    this.applySourceHighlight();
  }
  /** Move the source editor's cursor/scroll to the active line. Applied immediately and
   * again on the next frame: when stepping between subtasks, Obsidian may re-sync the
   * previously-edited line into the editor a tick later and move the cursor, which made the
   * highlight appear one subtask behind. Re-asserting on rAF lands us on the right line. */
  applySourceHighlight() {
    const target = this.activeSource;
    if (!target) return;
    const apply = () => {
      if (this.activeSource !== target) return;
      try {
        const mdLeaf = this.app.workspace.getLeavesOfType("markdown").find((l) => {
          var _a;
          return ((_a = l.view.file) == null ? void 0 : _a.path) === target.path;
        });
        const view = mdLeaf == null ? void 0 : mdLeaf.view;
        if (view == null ? void 0 : view.editor) {
          view.editor.setCursor({ line: target.line, ch: 0 });
          view.editor.scrollIntoView(
            { from: { line: target.line, ch: 0 }, to: { line: target.endLine, ch: 0 } },
            true
          );
        }
      } catch {
        // Highlighting is cosmetic; a failure must not interrupt the review.
      }
    };
    apply();
    window.requestAnimationFrame(apply);
  }
  /* ----------------------------- prompt control ----------------------------- */
  settlePrompt() {
    this.pendingReject = void 0;
    this.pendingKeys = null;
  }
  rejectPending(reason) {
    const reject = this.pendingReject;
    this.pendingReject = void 0;
    this.pendingKeys = null;
    if (reject) reject(reason);
  }
  /** Await something this pane does not own — a Tasks plugin modal — without going deaf.
   *
   * `pendingReject` is only set while one of OUR prompts is on screen. Between settling a
   * prompt and the Tasks modal resolving, it is undefined, so Skip, Restart, Revert and
   * Exit all silently did nothing: the buttons were there, the clicks landed, and
   * rejectPending had nobody to reject. If the modal then failed to resolve at all — a
   * dialogue dismissed in a way the Tasks API does not report — the review simply stopped,
   * with no way out short of reloading.
   *
   * Racing the external promise against a control promise fixes both halves: the nav keeps
   * working throughout, and a modal that never answers is no longer a dead end. */
  /** Resolves with null once a modal has been SEEN and then absent for `goneMs`.
   *
   * Deliberately never resolves if no modal is ever seen. A selector that fails to match
   * a live dialogue would otherwise cancel the user mid-edit, which is worse than the
   * hang it guards against; and if the modal never opened at all, the nav buttons are
   * already a way out. This targets the case actually observed: the dialogue is dismissed
   * and disappears, but its promise never settles, so the review waits on something that
   * no longer exists. */
  watchAbandonedModal(goneMs = 1200) {
    let timer = null;
    const promise = new Promise((resolve) => {
      if (typeof document === "undefined") return;
      let seen = false;
      let goneSince = null;
      timer = window.setInterval(() => {
        let open = false;
        try {
          open = !!(typeof document !== "undefined" && document.querySelector(".modal-container, .modal"));
        } catch {
          // The document can go away underneath us if the plugin is unloaded mid-wait.
          window.clearInterval(timer);
          timer = null;
          return;
        }
        if (open) {
          seen = true;
          goneSince = null;
          return;
        }
        if (!seen) return;
        if (goneSince === null) {
          goneSince = Date.now();
          return;
        }
        if (Date.now() - goneSince >= goneMs) {
          window.clearInterval(timer);
          timer = null;
          resolve(null);
        }
      }, 200);
    });
    return {
      promise,
      cancel: () => {
        if (timer !== null) {
          window.clearInterval(timer);
          timer = null;
        }
      }
    };
  }
  async withControls(promise) {
    let rejectControl;
    const control = new Promise((_, reject) => {
      // Interrupting leaves the Tasks modal on screen, and a stray dialogue whose edit
      // would land on a line the restart has already rolled back is worse than the
      // interruption it came from. Best-effort dismissal: click the close button if
      // Obsidian rendered one, otherwise send Escape as a user would.
      rejectControl = (reason) => {
        dismissOpenModal();
        reject(reason);
      };
    });
    const previous = this.pendingReject;
    this.pendingReject = rejectControl;
    const watch = typeof this.watchAbandonedModal === "function" ? this.watchAbandonedModal() : null;
    try {
      /* Three ways out: the modal answers, the user presses a nav button, or the modal
       * turns out to have been abandoned. Every caller treats a null as a cancellation,
       * so the third resolves to null rather than needing its own signal. */
      return await Promise.race(watch ? [promise, control, watch.promise] : [promise, control]);
    } finally {
      if (watch) watch.cancel();
      // Only hand the channel back if it is still ours; a prompt rendered in the meantime
      // owns it now and must not be clobbered.
      if (this.pendingReject === rejectControl) this.pendingReject = previous;
    }
  }
};

// ----------------------------------------------------------------------
// src/main.ts
// ----------------------------------------------------------------------
var BUILD_VERSION = "1.26.2";
/* The name shown in the ribbon, the pane's tab and notices. It must match manifest.json's
 * "name"; a test checks that they agree. */
var PLUGIN_NAME = "GTD Clarify";
var GtdFlowPlugin = class extends obsidian.Plugin {
  async onload() {
    // Build marker: which code is actually loaded, rather than which is on disk. Read it from
    // the plugin instance in the developer console; nothing is logged at load.
    this.build = BUILD_VERSION;
    await this.loadSettings();
    this.tasksApi = new TasksApiAdapter(this.app);
    this.registerView(VIEW_TYPE_REVIEW, (leaf) => new ReviewView(leaf, this));
    this.addCommand({
      id: "gtd-process",
      name: "Process tasks in current note",
      callback: () => this.startReview("process")
    });
    this.addCommand({
      id: "gtd-organise",
      name: "Organise tasks in current note",
      callback: () => this.startReview("organise")
    });
    this.addCommand({
      id: "gtd-sweep",
      name: "Sweep your mind into the inbox",
      callback: () => this.startSweep()
    });
    this.addRibbonIcon("list-checks", PLUGIN_NAME, (evt) => {
      const menu = new obsidian.Menu();
      menu.addItem((i) => i.setTitle("Process").setIcon("inbox").onClick(() => this.startReview("process")));
      menu.addItem((i) => i.setTitle("Organise").setIcon("tags").onClick(() => this.startReview("organise")));
      // Last, so Process and Organise stay where they were.
      menu.addItem((i) => i.setTitle("Sweep").setIcon("brain").onClick(() => this.startSweep()));
      menu.showAtMouseEvent(evt);
    });
    this.addSettingTab(new GtdFlowSettingTab(this.app, this));
  }
  onunload() {
  }
  /** Capture the active file BEFORE the pane takes focus, then run the review. */
  async startReview(mode) {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new obsidian.Notice("Open a note with tasks first.");
      return;
    }
    const view = await this.activateReviewView();
    await view.start(mode, file);
  }
  /** Sweep needs no note open: what it captures goes to the inbox note. */
  async startSweep() {
    const view = await this.activateReviewView();
    await view.startSweep();
  }
  /** Open (or reveal) the review pane. Works on desktop (right split) and mobile. */
  async activateReviewView() {
    var _a;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_REVIEW)[0];
    if (!leaf) {
      leaf = (_a = workspace.getRightLeaf(false)) != null ? _a : workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_REVIEW, active: true });
    }
    workspace.revealLeaf(leaf);
    return leaf.view;
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};

// ----------------------------------------------------------------------
// Exports
// ----------------------------------------------------------------------
/* Obsidian loads a plugin from its module's `default` export. */
export default GtdFlowPlugin;

/* Internals exposed for the test suite only. Obsidian ignores extra exports; nothing in
 * the plugin reads this. Keeping it explicit is what lets tests/ exercise the real code
 * rather than a copy of it. */
export const __testables = {
  // search + ranking
  RANK,
  SUGGEST_LIMIT,
  rankCandidates,
  scoreCandidate,
  buildCandidates,
  compareScored,
  substringMatch,
  isSubsequence,
  countSlashes,
  fileAliases,
  makeIgnoreMatcher,
  clipMatches,
  // link display
  LINK_MAX,
  wikiLabel,
  trimAutolink,
  URL_SCHEME_RE,
  compactUrl,
  openExternalUrl,
  renderTaskText,
  // tasks query
  QUERY_FILTER_HELP,
  parseTasksQuery,
  runTasksQuery,
  compileSingleFilter,
  compileBooleanLine,
  tokenizeBoolean,
  hasBooleanOperator,
  hasLowercaseOperator,
  normaliseQueryText,
  joinLineContinuations,
  BOOLEAN_DELIMITERS,
  isTaskBlocked,
  isTaskDone,
  normaliseTag,
  resolveQueryDate,
  shiftDate,
  taskDateString,
  todayString,
  TasksQueryTaskSource,
  ActiveFileTopLevelTaskSource,
  restoreOffsets,
  lineStartDate,
  isTickled,
  setLineStartDate,
  addMonths,
  tickleSubtree,
  pickTickleDate,
  moveSubtreeToNote,
  queryMentionsStartDates,
  reanchorLine,
  linesLookLikeSameTask,
  taskSourceLabel,
  // undo journal
  VaultJournal,
  journalledApp,
  // task-line helpers
  COMPLETED_STATUSES,
  deTaskLine,
  lineHasTag,
  indentOf,
  computeSubtreeEnd,
  computeAncestorLines,
  isTaskLine,
  VAGUE_OPENERS,
  VAGUE_OPENERS_OPTIONAL,
  FILLER_PREFIXES,
  normaliseForMatch,
  parsePhraseList,
  defaultVagueText,
  defaultFillerText,
  vaguePhrases,
  fillerPhrases,
  stripFiller,
  GUIDANCE,
  PLUGIN_NAME,
  actionText,
  assessNextAction,
  confirmNextAction,
  clarifyFiledAction,
  guide,
  dimensionGuidance,
  GUIDANCE_MODES,
  guidanceMode,
  taskStatusOf,
  processProjectChildren,
  findProjectLines,
  projectPickerLabel,
  moveSubtreeUnderProject,
  MAX_PROJECT_DEPTH,
  MAX_SUBTASK_RETRIES,
  sanitizeName,
  escapeRegExp,
  insertBeforeTasksMetadata,
  setTaskStatus,
  completedLines,
  completeSubtree,
  queueQuickAction,
  canBatch,
  addSubtasks,
  taskIdOf,
  dependsOnOf,
  setDependsOn,
  ensureTaskId,
  removeMadeAction,
  showMadeAction,
  showFiledAction,
  fixMadeAction,
  HEADING_RE,
  noteHeadings,
  headingAbove,
  moveSubtreeUnderHeading,
  runOrganise,
  organiseTask,
  organiseProject,
  withReprocess,
  richRuns,
  plainText,
  parsePlainDate,
  formatLongDate,
  askForDate,
  isTypingTarget,
  keyAnswer,
  numberKeysEnabled,
  MAX_NUMBER_KEYS,
  appendRich,
  dimensionQuestion,
  reprocessWholeProject,
  askHowToReprocess,
  reprocessTask,
  reprocessNextAction,
  refreshUnit,
  organiseAfterProcess,
  organiseNextActions,
  DefaultFilingStrategy,
  askAfterAction,
  attemptSubItem,
  MAX_SPLIT_PIECES,
  cleanPieceText,
  replaceWithPieces,
  processSplitPieces,
  splitCapture,
  runProcess,
  locateQueuedAction,
  locateByText,
  lineCount,
  cancelSubtree,
  FINISHED_DATE_FORMS,
  hasFinishedDate,
  setFinishedDate,
  datedByTasks,
  finishedDateSettings,
  TasksApiAdapter,
  DISPOSE_ACTIONS,
  disposeOptions,
  disposeActionFor,
  settleNotActionable,
  editTaskLineTagged,
  editTaskLineOrRestart,
  awaitTasksModal,
  dismissOpenModal,
  readLineAfterEdit,
  getIndentUnit,
  formatToken,
  // labels already on a task
  PRIORITY_SIGNIFIERS,
  descriptionEnd,
  hasExactTag,
  trailingLabels,
  dimensionAlreadySet,
  textLabelWords,
  organiseLine,
  // sweep
  DEFAULT_TRIGGERS,
  defaultTriggerText,
  parseTriggerList,
  triggerSections,
  sweepInboxPath,
  folderSetting,
  sweepPrompts,
  SWEEP_GROUP_NAMES,
  cleanCapture,
  appendCapture,
  removeCapture,
  runSweep,
  // a suggested context
  CONTEXT_HINTS,
  suggestContext,
  // recent destinations
  MAX_RECENT_DESTINATIONS,
  recentDestinationOptions,
  rememberDestination,
  // the summary
  SUMMARY_WORDS,
  LEAVING_OUTCOMES,
  outcomesOf,
  sessionSummary,
  // a project's last next action
  projectAbove,
  openTasksUnder,
  EMPTY_PROJECT_ANSWERS,
  askEmptyProject,
  settleEmptyProject,
  resolveEmptyProject,
  settleProjectLeft,
  somedayLastOfProject,
  settleProjectAfterWalk,
  // waiting-for
  waitingForTag,
  isWaitingFor,
  pickChaseDate,
  delegateTask,
  // projects in other notes
  findProjectsElsewhere,
  moveSubtreeToProjectIn,
  chooseStepProject,
  fileStepElsewhere,
  ProjectSuggestModal,
  // control flow
  ReviewControl,
  DEFAULT_SETTINGS
};
