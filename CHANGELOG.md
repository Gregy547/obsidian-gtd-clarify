# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/).

## 1.26.3 — 2026-11-23

### Changed
- **Obsidian's automated review has nothing left to warn about.** It type-checks the
  plugin's JavaScript, and with no types to go on it reported 3,680 warnings — every use of
  every function's arguments. The source is now typed with JSDoc comments, which change
  nothing that runs, and a reproduction of the review finds none. (The plugin's own, stricter
  lint settings still note five places where *Process*, *Organise* and *Sweep* are
  capitalised as the names of its reviews; that is deliberate.)
- **The same checks run before every release.** `npm run lint` applies the review's
  type-aware rules and type-checks the annotations, so a regression fails the build.

### Fixed
- **Pop-out windows.** Number keys are listened for in the review pane's own window, and the
  check for an open Tasks dialogue looks in the window in use, rather than always the main
  window. Nothing changes in the main window.
- Promises the plugin deliberately doesn't wait for are now marked as such, and opening the
  review pane waits for Obsidian to finish revealing it before starting.

## 1.26.2 — 2026-11-23

### Fixed
- **No more tooltips repeating what a button already says.** Hovering an answer showed its
  own words again in a tooltip, because Obsidian turns a screen-reader label into one. The
  answer buttons, *Skip step*, the Sweep buttons and the question text no longer have one.
  The Sweep field no longer shows its question again on hover either. Screen readers still
  read every answer as shown, without its key number.
- **One tooltip where there were two.** The ⓘ tip button and the link to a task's source
  note each showed a second, browser tooltip on top of Obsidian's. The ⓘ one also kept
  saying "Show tip" after the tip was open.
- Tooltips that add something stay: *Restart task*, *Revert last* and *Re-process* still
  explain what they undo, and icon-only buttons still say what they do.

## 1.26.1 — 2026-11-10

### Fixed
- **"Is this a clear next action?" now shows the step under its project.** After *One step
  in a bigger project* → *Create a new project…*, the question was asked with the step
  still shown on its own, without the project just made for it — and the same when filing
  it under a project already in the note. It is now shown under the project it is in.

## 1.26.0 — 2026-11-08

### Changed
- **A project is no longer left with nothing to do.** Reported: processing a Tasks query,
  a project's only next action went to Someday and the project stayed behind, empty. Now:
  - Someday for a project's last open task asks first: the **whole project** to Someday,
    with the task still inside it, or just this step — then add the project's next action,
    or leave it for now.
  - Any other way the last one goes — done, cancelled, deleted, moved out, filed under
    another project, done in the two-minute batch — asks what becomes of the project: add a
    next action, Someday, finished, cancel, or leave it, with the likely answer marked.
  - The same happens when a project is processed whole and its last step goes during its
    walk, in place of *Add another next action…*.
  - A deferred step or a waiting-for still counts as something to do.
  It works the same for a note or a query, so the project tag need not be in your queries.
- **Organise leaves a step a query found inside a project where it is.** It is labelled, but
  no longer offered *Move to…*, which took it out of its project; the project is filed whole
  when Organise reaches it.
- **Organise's *This project has no next action* also offers Someday and Cancel.**

## 1.25.1 — 2026-11-06

### Fixed
- **Completing or cancelling a task now records the date, as Tasks does.** *Mark as
  cancelled* only rewrote the checkbox, so no cancelled date (❌) was ever written; and
  completing fell back to a bare `[x]`, with no done date (✅), whenever Tasks' own toggle
  wasn't available or didn't reach done — as with a status order that goes from Todo to In
  Progress. Both now write the date Tasks would, following its own settings: *Set done date
  on every completed task*, *Set cancelled date on every cancelled task*, emoji or Dataview
  format (`[completion:: …]`, `[cancelled:: …]`), and its global filter. This covers
  Process, the two-minute batch, and *It's finished — mark it complete* in Organise.
- **Cancelling a task no longer marks its finished subtasks cancelled.** A subtask already
  done keeps its `[x]` and its done date.

## 1.25.0 — 2026-11-06

### Added
- **Sweep**, a third command (also in the ribbon menu, after Process and Organise), for
  getting everything out of your head before deciding anything about it. It prompts, one
  at a time: what's on your mind; each note in your areas of focus folder; each open
  project in your project folder; each of your contexts; then a trigger list — common
  commitments, calls, money, people and the like — that you can edit in settings. Prompts
  drawn from your vault all read *Anything about …?*. Type a thought and press Enter; each
  goes into your inbox note as a task as you add it, so stopping part-way loses nothing,
  and × takes one back. Pasting several lines adds one thought, joined by spaces. *Skip the
  rest of…* passes over the rest of your projects (or areas, contexts or triggers); a
  trigger named like one of your areas or contexts adds its reminders there instead of
  being asked twice. At the end it offers to Process the inbox straight away. New
  settings under *Sweep*: inbox note, areas of focus folder, whether to ask about each
  project and each context, and the trigger list.
- **Yes — someone else does it…** on *Actionable this week?*, for work you hand on. Reword
  it as what you're waiting for and who from; it is tagged `#waitingfor` (set under
  *Waiting-for tag*) and given the date you'd chase it as its start date, so it stays out
  of Process until then. Offered for a project's next actions too. Organise files a
  waiting-for without asking for labels.
- **Organise as you process** (setting, off by default): Organise's questions straight
  after Process decides each task, in one pass. A task put in the two-minute batch is
  organised after the batch, if it's still open then. Restart and Revert undo both.
- **One step in a bigger project can go to a project in another note.** *Which project*
  lists this note's projects under *In this note*, and finds projects anywhere else with
  *Search projects…* under *In other notes*, each shown with its note. A step filed in
  another note is labelled there and then, since Organise on this note won't reach it.
- **A summary at the end of each review**: what became of the tasks — next actions,
  projects, waiting-fors, Someday, cancelled, done in the two-minute batch. Anything undone
  with Restart or Revert isn't counted.
- **Recent destinations**: *Move to…* offers the last three notes you moved a task to, under
  *Recent*, after the usual answers so those keep their numbers.
- **A suggested context**: the context a next action's opening verb points to — *Call* →
  Phone, *Buy* → errands, *Ask* → agenda — is marked *suggested* on its button. Nothing is
  chosen or moved, and it only suggests a context you have.

### Changed
- On *Actionable this week?*, *It's several things — split it…* moves from the fourth answer
  to the fifth, after the new *someone else does it*, so the Yes answers sit together.

### Fixed
- **Organise added labels a task already had** — "Call Sam #home #home" — and a second
  context next to one typed at capture. A dimension whose label is on the task is no
  longer asked, nor is priority when one is set, and no tag is ever written twice.
  Plain-word labels count only at the end of the task, so "Write a long letter" is still
  asked its duration.
- **Labels went after a block id** (`^abc`) at the end of a task, breaking links to it.
  They now go before it.

## 1.24.2 — 2026-11-06

### Fixed
- **Adding a project's next actions now shows each one as it is made.** At *Next action
  saved.* the pane showed the project alone, never the action just saved. The new action
  is now shown under its project (greyed above it) for every question about it: *Must this
  wait…?*, the vague-wording check and *Next action saved.* *Fix one of these…* shows the
  one being fixed. To have it on screen for *Must this wait…?*, the action is now saved
  before that question rather than after; the result in the note is the same.

## 1.24.1 — 2026-11-04

### Fixed
- **After a project was moved out of a note, the review could show a line that isn't a
  task** — reported as "tags do not include waitingfor", from a tasks query block above
  the project. A task that Obsidian's list parser counts as top-level can still sit
  inside a project's indented block (one indented by a single space, say), so it moved
  away with the project; when the review reached it, it fell back to a predicted line
  number, which by then pointed above where the project had been. Now:
  - a task inside an earlier task's indented block is part of that task, as it already
    was for a Tasks query, not an item of its own;
  - a task no longer in its note as written is passed over, never replaced by whatever
    line is now in its place, and the count of tasks shrinks to match;
  - a line Obsidian's cache still lists as a task, but which isn't one in the note any
    more, is left out.
- **A project that gained a next action earlier in the same review now moves or defers
  whole.** Its extent was carried from the start of the review, so the new action could
  be left behind.

## 1.24.0 — 2026-10-24

Prepared for publishing on GitHub and the Obsidian community directory.

### Changed
- **Renamed from GTD Flow to GTD Clarify** (id `gtd-clarify`): another published plugin
  already has the id `gtd-flow`. Its CSS classes now start `gtd-clarify-` and its pane's
  view id is `gtd-clarify-review`, so the two can be installed side by side. To move an
  existing install, copy `data.json` from `.obsidian/plugins/gtd-flow/` into the new
  `.obsidian/plugins/gtd-clarify/` folder, then remove the old one.
- **The source now lives in `src/main.js`**, and `main.js` is built from it with
  `npm run build`. The built file is attached to each release rather than committed.
- **Settings descriptions say what each setting does**, without the internal spec codes
  such as "(SET-1, PROC-3c)" that some of them showed.
- **Undo moves notes it created to the trash your Deleted files setting chooses.** It always
  used the vault's `.trash` folder.
- The manifest description follows the directory's rules: it no longer contains the word
  "plugin", and the empty author link has been removed.
- Nothing is logged to the console when the plugin loads.

### Fixed
- **The template folder picker said "Esc = default folder".** Since 1.21.0, dismissing it
  goes back instead; the hint now just asks for a folder.

### Development
- `npm run lint` applies the rules Obsidian's automated review uses
  ([eslint-plugin-obsidianmd](https://github.com/obsidianmd/eslint-plugin)), and CI runs it
  on every push.
- `npm version x.y.z` keeps `package.json`, `manifest.json`, `versions.json` and the build
  marker in step, and tags without a "v". Pushing the tag publishes the release, with this
  file's section for that version as its notes.
- Error handlers that deliberately do nothing say why; timers run through `window`, so they
  work in popout windows; a tip is collapsed with a class rather than an inline style.

## 1.23.2 — 2026-10-23

### Fixed
- **On a phone, answers lost the spaces around their bold word** — "This **note** (Inbox)"
  read "Thisnote(Inbox)". Obsidian lays buttons out as flex boxes, which trim the spaces at
  the edges of each piece inside; the words now sit in one piece. Desktop wasn't affected,
  because the number in front already held them together.
- **The header still said "Run Process or Organise from a note to begin"** while the first
  question was on screen. It now says which review is running.

### Changed
- Bold words take their colour from your theme, so they look the way bold looks in your notes.

## 1.23.1 — 2026-10-20

### Fixed
- **Numbered answers had their label at the top of the button.** Obsidian fixes a button's
  height, and the numbered layout aligned to the text baseline, which pins it to the top of
  that box. Labels are now centred, and a long one can wrap.
- **The number boxes disappeared on dark themes.** Their border was the button's own colour;
  they now have a light tint as well, so they show on any theme.
- Answers without a number, such as *Use this date*, now start at the left like the others.

## 1.23.0 — 2026-10-20

### Added
- **Bold key words.** Every question and answer has the word that tells it apart in bold —
  **Actionable** this week?, Mark as **cancelled**, File as **reference** — so a glance down
  the bold words is enough to choose.
- **Number keys pick answers.** 1–9 for the answer with that number, shown on each button,
  and 0 to skip an optional step. Ignored while typing in a note, a field or a dialogue; not
  used on a phone. On by default, with a setting to switch it off, and a one-line hint on
  the first question of a review until you have used it.
- **Dates in words.** *Another date…* (was *Pick a date…*) takes *next Wednesday*, *Fri*,
  *3 Nov*, *in 10 days*, *end of month* and the like, or a date from a calendar, and shows the
  date it has read before you use it. Back returns to the list of dates. YYYY-MM-DD still works.
- **An example configuration**, `examples/data.json`, documented in the README.

### Changed
- **Answers are ordered by how often they are chosen, and keep their places.**
  - *Actionable this week?*: Yes, No, then *under two minutes* and *several things*.
  - Not actionable: Mark as cancelled, Someday, Mark as completed, Not yet, File as
    reference, Move, then Delete. That is also GTD's order: trash, incubate, reference. With
    cancelling switched off, Delete takes the first place.
  - *Is this a clear next action?*: Rewrite first, always. The order used to flip with the
    vague-wording check, moving both answers.
  - *Move to…*: your quick destinations, then Search, New note, a heading in this note, and
    Template. A heading in this note used to come first.
- **Wording is clarified only for what you'll meet again.** Choosing No on *Actionable this
  week?* used to open the Tasks dialogue at once, so a task about to be cancelled or ticked off
  had to be reworded on its way out. Now cancelling, completing and deleting ask for nothing;
  deferring, Someday, reference and moving ask once, and cancelling the dialogue goes back to
  *What should happen to it?*.
- **One heading per Organise dimension.** "Physical context › Context" is now "Physical
  **context**". The label is added only when the heading doesn't already say it. In settings,
  the heading comes first and can carry its own `**bold**`. The default mental-mode label is
  now "Processing mode".
- **Skip step** on optional steps is a quiet button on its own row at the right, the same
  place every time. It used to be a full-width accent button above the answers.

### Fixed
- **Organising the pieces of a split showed the last piece throughout.** Every piece was
  organised, but the pane was left on the last one processed, so the questions for the others
  looked as if they were about it. Each piece is now shown as it is organised.
- **Filing a project showed its last next action** rather than the project being moved.

## 1.22.0 — 2026-10-20

### Added
- **Process the whole project again**, from any of its next actions in Organise. Organise
  shows a project as its next actions, one at a time, so Re-process always landed on the
  action on screen; the project itself could only be re-processed once every action had been
  labelled. This starts where Process does — *Actionable this week?* about the project — so
  you can defer it, put it in Someday or cancel it, next actions and all, or keep it and take
  each next action through Process. Anything already organised for the project is undone
  first, and the question isn't asked a second time.

### Changed
- Re-process pressed at a project's own steps (*This project has no next action*, filing)
  now asks *Re-process this project* rather than *Re-process this task*.

## 1.21.0 — 2026-10-20

### Changed
- **Cancelling goes back one question, never forward.** Dismissing a picker or a Tasks
  dialogue now returns to the question that opened it, instead of moving on to the next
  task. *Skip task* remains the deliberate way to move on.
  - In Organise, dismissing the note search, the template picker or the template's folder
    picker returns to *Move to…*. The heading list has a *Back* option.
  - Cancelling *Add another* while building a project returns to *Next action saved.*,
    keeping what you've made; it used to end the project. Cancelling the first next action
    for an existing project returns to the question that offered it — in Organise, *This
    project has no next action*, which used to file the project with none.
  - Cancelling a rewrite offered by the vague-wording check, or by *Is this a clear next
    action?*, returns to that question. It used to restart the whole task, which — reached
    while adding a project's next actions — discarded every one made.
  - Cancelling *Fix the wording…* in Re-process returns to the Re-process question.
  - Unchanged: cancelling the first next action of a project created moments earlier still
    restarts the task, since it would otherwise be left with no next action.

### Added
- **Fix one of these…** on *Next action saved.* Reword or remove any next action made in
  this go, without touching the others or starting again. Removing one that others wait on
  passes its place on: whatever waited on it now waits on whatever it was waiting on, so
  `is not blocked` lists still show the right action. A fixed action that was in the
  two-minute batch is updated there too.

### Fixed
- **The template's folder picker no longer carries on when dismissed.** It used the default
  folder, created the note and moved the task.
- **Choosing *Took longer* in the two-minute batch and then cancelling a rewrite no longer
  breaks the review.** The restart signal escaped the batch entirely.
- **A next action that something already waits on is not given a second id.** Tasks allows
  one; a second could appear after removing the next action that followed it.

## 1.20.0 — 2026-10-14

### Added
- **File a task under a heading in the same note.** When Organise is working through "This
  note", the *Move to…* step offers *A heading in this note…* first, then lists the note's
  headings by their path ("Work › Calls"), leaving out the one the task is already under.
  - The task goes to the end of that heading's own content — before any subheading, so
    filing under "## Work" never lands it inside "### Calls" — keeping the blank line before
    the next heading. Its subtasks move with it.
  - Not offered for a Tasks query, which spans many notes. Because the filing step is
    shared, it is also offered when a task deferred in Process on this note asks where it
    should wait.
  - Headings in front-matter or code blocks, and `#tags` at the start of a line, are not
    treated as headings.

## 1.19.0 — 2026-10-13

### Added
- **Re-process from Organise.** A Re-process button in the Organise bar undoes what
  organising has done to the task in front of you, then offers *Fix the wording…*, *Process
  it again from the start*, or *Back to organising*. Organise then carries on with whatever
  the task has become: a project is organised as one, each piece of a split is organised in
  turn, a step filed under a project is labelled where it now lives, and a deleted,
  deferred or moved task is left where Process put it.
  - While a project's next actions are being labelled it applies to the one on screen, so
    fixing the wording edits that action rather than the project. Cancelling a dialogue
    there redoes that action only.
  - Each attempt has its own undo, nested inside the task's, so labels applied before
    pressing it are removed and never applied twice; Restart still undoes the whole task.
- **"Yes — under two minutes, batch it" on the first question.** The two-minute batch is
  now answered at *Actionable this week?* rather than after *Yes* on the next question, where
  it went unused. Not offered for projects, or in Organise, where no batch runs.
- **Editable vague-action phrases.** Settings -> GTD coaching gains two lists, one phrase
  per line: the phrases that flag a next action, and filler skipped before checking. Until
  you edit a list it follows the built-in one, so improvements in later versions reach you;
  a restore button returns to it.
  - The built-in list adds David Allen's remaining project verbs (resolve, ensure,
    implement, roll out…), intentions (see about, think through…), ongoing
    responsibilities (keep an eye on, keep on top of…) and work jargon (follow up, sync
    with, touch base, circle back…). Phrases that are vague only sometimes — fix, prepare,
    set up, update and others — are listed switched off, ready to opt into.
  - Filler such as "Need to", "Maybe" and "TODO:" is skipped before checking, so
    "Need to sort out the trip" is caught while "Need to call Sam" is not.

### Changed
- **The reason a next action was flagged is shown with the question**, rather than behind
  the ⓘ. It is about your wording, not general advice.
- The nav bar wraps onto a second row when it runs out of width.

### Fixed
- **Rewording a project's next action no longer pulls it out of the project.** Editing a
  task trimmed its indentation and never put it back, so an indented next action became a
  top-level task. Reachable since 1.10.0 for any rewording of a next action — in Process's
  walk of a project, or "Rewrite it…" just after filing a step under one — and since 1.8.0
  when turning a next action into a project.
- **New next actions are nested under their project at any depth.** They were always
  indented one level from the margin, so a nested project's new actions became its
  siblings.
- **A new project created above a nested task stays at that task's depth**, instead of
  landing at the top level and splitting the project it was in.

## 1.18.1 — 2026-10-07

### Fixed
- **URLs containing parentheses are linked whole.** A bare URL stopped at its first `)`, so
  any URL with brackets in it — a Jira `NOT IN (Done, …)` query, a Wikipedia
  `…_(book)` page — showed half as a link and half as text, and clicking it opened the
  truncated half. Bare URLs now follow GitHub-flavoured Markdown's autolink rules: a
  trailing `)` is kept only when it closes a `(` inside the URL, so `(see https://…)` still
  drops its closing bracket, and trailing sentence punctuation (`. , : ? ! * _ ~`) is not
  part of the link. Markdown link targets accept balanced parentheses too.

## 1.18.0 — 2026-10-07

### Added
- **Internal links in task text are clickable.** `[[Note]]`, `[[Note|alias]]`,
  `[[Note#Heading]]`, `[[#Heading]]` and embeds `![[file]]` open their target, as do
  markdown links to notes such as `[spec](Specs/My%20Spec.md)`. Labels follow Obsidian:
  the alias if there is one, otherwise "Note › Heading".
  - Linked notes open in a **new tab**, so the note under review stays where it is — the
    review finds and edits it through whichever editor shows it.
  - Links resolve relative to the note the task lives in. A link to a note that doesn't
    exist yet is shown faded, as Obsidian shows it, since opening it creates the note.
  - Links with a scheme (`https:`, `mailto:`, `obsidian:`) still open outside the vault.
- **Query results link to the task.** The source path shown above a task found by a Tasks
  query is now a link that opens the note scrolled to that task, so you can see it in
  context without leaving the review. An editor already showing the note is reused;
  otherwise it opens in the main editor. The task is found again by its text, in case an
  earlier step of the same task has written above it.

## 1.17.1 — 2026-08-12

### Fixed
- **Deferred tasks were never organised.** Tasks deferred during Process were hidden from
  Organise as well, so they were never given a context or filed, and came back on their date
  to wherever they had been captured. Deferral now keeps work out of Process only — it has
  already been clarified — while Organise still includes it, because deferred work still
  needs a home. This also covers tasks deferred before this fix, or by other means.

### Added
- **File a task at the moment you defer it.** After choosing a date, Process asks *"Deferred
  until … Where should it wait?"*, offering *"Leave it here — organise it later"* first, then
  the usual destinations. Filing it now means it comes back to the right list rather than to
  your inbox to be sorted again.
  - The start date is written before the task moves, so it travels with it — a deferred
    project moves whole, every next action dated. Moving first would have dated whichever
    task slid into the old position.
  - Dismissing a picker leaves the task deferred where it was.

### Changed
- "Hide deferred tasks" now reads: out of Process until that date; Organise still includes
  them.

## 1.17.0 — 2026-08-12

### Added
- **Split a compound capture.** "Actionable this week?" gains *"It's several things — split
  it…"*. Enter each item in turn (blank to finish); the capture is replaced by them and each
  is taken through Process on its own. Nothing needs special handling — a capture that hides
  a project beside loose tasks sorts itself out, because every piece gets the full flow.
  - Walked inside the current task rather than added to the review's queue, so **Restart**
    rolls back the whole split and restores the capture, **Skip** skips one piece, and a
    cancelled dialogue redoes just the piece it happened in.
  - Notes beneath the capture stay with the first piece. Offered at the top level only: a
    piece is not split again, and a project is already one outcome.
- **Batch two-minute actions found while building a project.** Wherever a next action is
  confirmed you can now batch it — after writing a new action (*"It's under two minutes —
  batch it"*, which returns you to the same question so you still decide whether to add
  more) and when filing a capture as a step in a project. Offered in Process only: the batch
  runs at the end of Process, so offering it in Organise would queue into nothing.

### Changed
- The project walk and the new split walk share one attempt helper, so the retry, rollback
  and batch rules live in one place. They had already drifted once — batch truncation had to
  be added to the project walk separately.

### Fixed
- An entry that cleans to nothing — whitespace, or a stray "- [ ]" — as the first item of a
  split asked for the *next* item rather than the first.

### Tests
- The prompt-coverage check now reads a prompt's whole question, not just a leading string:
  a computed question such as `batched ? … : …` was invisible to it.

## 1.16.0 — 2026-08-12

### Added
- **The two-minute rule, as a batch.** "Does this need more than one step?" gains
  *"No — and it takes under two minutes"*. Those tasks are decided during processing but
  done together at the end, once every item has been decided — so a quick task can't
  derail the session, and the list gets emptied. Each is offered with *Done* or *Took longer
  — keep it as a next action*, with a five-minute tripwire in the tip.
  - Queued in memory, not tagged in the file. Exiting skips the batch and leaves every
    queued task as an ordinary next action — nothing to clean up, nothing lost.
  - Restart and Revert take a task's queued entries with them, so nothing is offered twice
    or offered after being undone. The same holds for a subtask retried inside a project.
  - A queued task is found again by its text; one that has moved, changed or gone since is
    left alone rather than the wrong line being completed.

### Fixed
- **Completing a recurring task no longer ends its series.** "Mark as completed", Organise's
  "mark it complete" and the new batch all complete tasks through Tasks' own toggle, which
  records a done date and creates the next occurrence. Writing `[x]` directly, as before, is
  invisible to Tasks: no done date, and a recurring task simply stopped recurring. Falls
  back to rewriting the status when the Tasks API is unavailable, or when a custom status
  cycle would make "toggle" mean something other than done.

### Changed
- The "Actionable this week?" tip no longer says to do quick tasks immediately, which would
  have contradicted the batch.

## 1.15.0 — 2026-08-12

### Added
- **GTD tips throughout Process and Organise**, explaining each step through the method's
  principles. Behind the ⓘ by default, so they cost nothing until you want a reminder.
  - **Start of a review** names the GTD stage: Process is Clarify (deciding, not doing),
    Organise is Organize (putting work where it will find you).
  - **Clarify**: what "actionable this week" is for, including the two-minute rule;
    clarifying wording before filing; reference as information rather than action; projects
    needing only the next actions you can start now, not a full plan; sequential versus
    parallel actions.
  - **Organize**: each dimension gets its role in GTD's four criteria for choosing what to
    do — context, time, energy, then priority — matched by what the dimension is rather than
    its position, so renamed dimensions keep their tip. Priority's tip explains why it is
    the last filter, not the first. Filing explains putting work where you'll look for it.
- Confirmation and text prompts can now carry tips too.

### Changed
- Every tip now lives in one map, so they can be reviewed and edited in one place. Two had
  been written inline at their prompts.

### Tests
- A coverage check inventories every prompt in both workflows and fails if one has neither
  a tip nor a stated reason for having none, so coverage cannot quietly erode as the
  workflow grows.

## 1.14.0 — 2026-08-12

### Added
- **A tickler.** "Not yet — bring it back on a date…" in the not-actionable step defers a
  task to a date, after which it comes back by itself. "Not this week" previously had only
  Someday, so work you were committed to but couldn't start yet was filed beside things you
  never meant to do, and depended on a review to resurface. Quick picks run from tomorrow to
  three months; "Pick a date…" accepts YYYY-MM-DD or phrases like "in 10 days".
  - Uses the Tasks start date (🛫), so the task stays where it belongs and reappears in
    place. Applied to the whole subtree, since a deferred project whose next actions still
    show has not been deferred. A subtask already deferred further keeps its later date.
- **Deferred tasks are left out of reviews** until their date, in both the current-file and
  query sources (Settings -> "Hide deferred tasks", on by default). A query that filters on
  start dates itself still sees them, so you can look over what is coming back.

### Changed
- The Someday option reads **"Someday — not committed"**, making the commitment question
  explicit at the moment of filing. The not-this-week options now carry a tip explaining the
  difference between deferring and Someday.
- Default saved queries exclude `path does not include Someday`. New installs only; existing
  saved queries are kept.

### Fixed
- **Sending a task to Someday no longer deletes everything beneath it.** It copied only the
  task's own line, then removed its whole subtree — subtasks, notes and links were lost. The
  full subtree now moves, re-based to the top level.
- **A task with no start date now matches start-date filters**, as in Tasks itself. The
  engine treated undated tasks as non-matching, so `starts before tomorrow` — the native way
  to hide deferred work — silently dropped every undated task. Due, scheduled and done dates
  are unaffected.

## 1.13.1 — 2026-08-12

### Changed
- **GTD tips are now hidden behind an info button by default.** The reminders added in 1.13.0
  were shown in full on every question, which is a lot to read past once you know them. A
  ⓘ on the question line reveals the tip when you want one; it starts collapsed on every
  question, so it stays a reminder you reach for rather than drifting back to always-on.
- Settings -> GTD coaching -> "GTD tips": Tap ⓘ to show (default), Always shown, or Hidden.
  The question itself always shows — it is what is being asked, not commentary on it.
- Both places tips are rendered now go through one method, so the setting applies
  everywhere rather than at whichever sites remembered to check it.

## 1.13.0 — 2026-08-12

GTD coaching: the plugin now prompts for the parts of the method that make outcomes and
next actions effective, rather than assuming captured wording is already usable.

### Changed
- **"Is this a project?" is now asked in GTD's own terms**: "Does this need more than one
  step?", with three answers — a single next action, the project's outcome, or one step in a
  bigger project. The last replaces two separate options (one labelled Yes, one No) that
  described the same decision; it now asks which project, with "Create a new project…"
  offered alongside the existing ones.
- **Filing a capture under a project asks whether it is a clear next action**, one tap to
  skip. Captured wording is usually the first thing that came to mind rather than the next
  physical step, and this is the moment GTD says to fix it. The old version forced a full
  edit dialogue every time; this is lighter and can be switched off.
- **Prompts use GTD vocabulary.** "Subtask" was how the file stores it; "next action" is what
  it is. "Does this subtask depend on the previous one?" is now "Must this wait until the
  previous action is done?" — the sequential/parallel decision that makes `is not blocked`
  queries return true next actions.

### Added
- **Vague-action detection.** An action starting with "look into", "sort out", "plan" and
  similar, or consisting of a single word, gets an offer to rewrite. Deliberately
  high-precision: it stays silent on well-formed wording, because a prompt that nags on good
  input teaches people to dismiss it.
- **Guidance at the moment of deciding.** Questions about outcomes and next actions carry a
  short line describing what a good answer looks like, with an example. While a Tasks dialogue
  is open, the pane now shows what is being asked instead of the previous, already-answered
  question.
- **Organise catches projects with no next action**, offering to add one, mark the project
  complete, or leave it — GTD's rule that every active project has something you can do.
- Settings -> GTD coaching: "Clarify filed next actions" and "Flag vague next actions", both
  on by default.

## 1.12.1 — 2026-08-12

### Fixed
- **A Tasks dialogue that is dismissed but never reports back no longer stalls the
  review.** Reported after answering "No" to "Is this a project?" and cancelling the edit
  window. Interrupting by hand was already possible from 1.12.0, but the flow still had to
  be rescued manually; it now recovers on its own.
  - A watchdog notices when a modal has been on screen and then absent for over a second,
    and releases the wait as a cancellation — which every call site already handles.
  - It deliberately never fires unless a modal was actually seen, so a selector that fails
    to match a live dialogue cannot cancel it underneath you. A brief flicker does not
    count; the absence has to be sustained.
  - The poll also survives the document going away mid-wait, which happens if the plugin
    is unloaded while a dialogue is open.

## 1.12.0 — 2026-08-12

### Fixed
- **The review no longer gets stuck when a Tasks dialogue is dismissed in a way the API
  does not report.** Reported for the create-a-project window; the same hole existed at
  every point a Tasks modal is opened.
  - The pane's nav buttons were inert for as long as any Tasks modal was open. Its reject
    channel is only armed while one of the plugin's own prompts is on screen, so clicks on
    Skip, Restart, Revert and Exit landed and did nothing. All four now stay live
    throughout, and a modal that never answers is no longer a dead end.
  - Applied at all four Tasks-API call sites, with a test that fails if a fifth is added
    without it — fixing only the reported one would have moved the lockup rather than
    removing it.
  - Interrupting now also tries to dismiss the stray dialogue, so its edit cannot land on
    a line the restart has already rolled back.
  - `waitForModalToClose` gained a polling backstop. It relied solely on a MutationObserver,
    which never fires again if the close produces no further mutation or the selector keeps
    matching something else.

## 1.11.0 — 2026-08-12

### Changed
- **Cancelling inside a project's subtask walk now redoes only that subtask.** Previously
  it restarted the whole project, so a cancel on the sixth subtask meant redoing the first
  five.
  - Automatic restarts (a cancelled Tasks dialogue) and deliberate ones (the "Restart
    task" button) are now distinct signals. The button still restarts the entire project,
    as its label promises; Revert and Exit are unaffected.
  - Each subtask gets its own undo journal, nested inside the task's. A retry rolls back
    only that subtask, so an attempt that had already turned it into a project does not
    leave the half-made project behind — while a later "Restart task" still reaches the
    state from the beginning of the whole task.
  - Repeated cancelling is bounded; past the limit it escalates to a full restart rather
    than looping.

## 1.10.0 — 2026-08-12

### Changed
- **Cancelling the Tasks add/edit dialogue now restarts the task** instead of carrying on
  without the edit and moving to the next one. Applies everywhere the dialogue is opened
  during Process: the not-actionable edit, "Is this a project?" answered No or Yes, an
  existing project's own line, the first subtask of a new project, and creating the new
  project task itself.
  - The decision is made in one place (`editTaskLineOrRestart`) rather than at each site,
    which is why the six of them had drifted into the same wrong answer independently.
  - Restarting is safe rather than merely repetitive: the review loop restores the undo
    journal before re-running, so whatever the abandoned attempt had written is rolled
    back first and the second attempt starts from the same state as the first.

## 1.9.0 — 2026-08-12

### Added
- **"Make it a subtask of an existing project"** in the Process "Is this a project?" step.
  The task and its whole subtree move under the chosen project, re-indented to sit one
  level beneath it while keeping their own relative nesting. Candidates are the
  project-tagged, incomplete tasks in the same file, excluding the task itself and its own
  descendants; the option only appears when there is at least one.

### Fixed
- **Queued tasks are re-anchored by content.** Moving a task reorders lines without
  changing the file's length, so the per-file offsets alone could not find the remaining
  tasks afterwards. Each task's expected text is now checked before it is presented, and
  the nearest matching line used if it has moved.

### Notes
- Nesting is same-file only. Cross-file would need two writes and a second indent basis;
  the single-file version is one atomic rewrite, which is what makes the undo journal and
  the ordering correct without extra machinery.

## 1.8.0 — 2026-08-12

### Changed
- **Process now walks an existing project's subtasks before offering to append.** Meeting
  a task that is already tagged as a project, it edits the project line, then takes each
  existing subtask in turn through the full Process flow ("actionable this week?" and the
  rest), and only then asks whether to add more. Previously it skipped straight to opening
  an empty new subtask.
  - Direct children only: a subtask that is itself a project recurses and handles its own
    children, so nothing is visited twice. Completed and cancelled children are skipped.
  - "Skip task" inside a subtask skips that subtask; Exit, Restart and Revert still apply
    to the whole task.
  - Positions are re-derived before each subtask, so deleting, moving or expanding one
    does not misplace the next.
  - Declining to add subtasks to an existing project is now a valid answer. Cancelling
    still restarts the task when the project was created moments earlier and would
    otherwise be left with no children.

## 1.7.0 — 2026-08-12

### Changed
- **Mark as completed, Mark as cancelled and Delete are now three separate options**, each
  with its own toggle in Settings -> "Finishing with a task". Previously they shared one
  button whose meaning was chosen in settings, so only one of the three decisions could be
  recorded during a review. All three are on by default.

### Removed
- The `disposeAction` setting, replaced by `enableCompleteOption`, `enableCancelOption`
  and `enableDeleteOption`. A settings file without them keeps all three options.

## 1.6.0 — 2026-08-12

### Fixed
- **Long URLs no longer overflow the task box.** The link style carried
  `white-space: nowrap`, which overrode the box's own word-break, so a compacted link ran
  past the edge in a narrow sidebar instead of wrapping.

### Added
- **Links in a task are clickable** and open in the system browser. Navigation is handled
  explicitly rather than by the href, because a bare navigation in Electron would replace
  the Obsidian window. Markdown links use their target as the destination and their text
  as the label; the full URL remains on hover.

## 1.5.1 — 2026-08-12

### Fixed
- **The task counter now reflects tasks that have left the review.** Deleting a task,
  filing it as reference, sending it to Someday, moving it elsewhere, or marking it
  completed/cancelled all shrink the total, so "task 2 of 5" becomes "task 2 of 4" rather
  than counting tasks that are no longer there. Restart and Revert put a task back into
  the count along with its contents. Organise filing is deliberately not counted, since
  every task there is filed.

## 1.5.0 — 2026-08-12

### Fixed
- **`due on or before today` no longer errors.** The lowercase "or" inside a comparator was
  read as a boolean operator. That check now only applies to lines actually shaped like a
  boolean combination. A capitalised operator without delimiters is still reported.
- **Cancelling out of a subtask no longer strands the review.** Cancelling before any
  subtask is added now rolls the task back and restarts it.

### Added
- **More date filters.** Comparators `on or before` / `on or after`; the comparator is now
  optional, so `due today` works as well as `due on today`. Date words: `today`,
  `tomorrow`, `yesterday`, `in N days`, `N days ago`, `next week`, `last week`. `not due`
  is accepted alongside `no due date`.
- **Mark as completed / Mark as cancelled** as alternatives to deleting a task
  (Settings -> "Disposing of a task"). Marking applies to the task and its subtasks and
  leaves them in place. Defaults to Delete.
- **Queried tasks show their note and heading**, so two similarly worded tasks from
  different notes can be told apart.

### Changed
- **Process tolerates tasks that are already projects**: the "Is this a project?" question
  is skipped and it goes straight to editing the parent and adding subtasks.
- **The source-choice prompt no longer offers "Skip step"**, which silently meant "current
  file".
- **Revert last is greyed out rather than hidden** when there is no previous task, so the
  buttons beside it stop moving mid-review.

## 1.4.0 — 2026-08-12

### Added
- **Setting to turn off the custom tag step** in Organise (Settings -> Behaviour ->
  "Custom tag step"), alongside the existing Priority step toggle. Defaults to on, so
  upgrading changes nothing; turn it off to finish each task one prompt sooner.

## 1.3.4 — 2026-08-12

### Fixed
- **Renaming a task while marking it as a project lost either the rename or the tag.**
  In Process, "actionable this week" -> "project" -> rename applied `#project` to the OLD
  title; the rename then appeared later, with the tag gone. The Tasks edit command mutates
  the open editor, which Obsidian writes to disk on its own schedule, so reading the line
  back immediately returned the pre-edit text.
  - Where the installed Tasks version supports it (7.21.0+), editing now goes through
    `editTaskLineModal`, which returns the edited line as a string. There is no read-back
    and therefore no race, and cancelling is detectable — a cancelled edit now leaves the
    task untouched instead of tagging it.
  - On older versions, and for every other caller that reads a line back after an edit,
    `editExistingInPlace` no longer returns until the vault agrees with the editor. This
    also protects filing a renamed task and appending a dependency id to a renamed
    subtask, which had the same defect.

## 1.3.3 — 2026-08-12

### Fixed
- **A subtask surfaced by a query is now shown with its parent context.** Queries can
  match a subtask whose ancestors did not themselves match; the review pane presented it
  bare, with no sign of which project it belonged to. The dimmed context box now shows the
  full ancestor chain, outermost first, recomputed each time a task is presented so it
  stays correct after earlier tasks have shifted the file.

## 1.3.2 — 2026-08-12

### Fixed
- **Queries containing non-breaking spaces, zero-width characters or full-width brackets
  now work.** Text pasted from a web page or typed in a note can carry characters that
  look like a space or a bracket but are not; a literal space in a filter pattern does not
  match one, so the whole line failed. These are folded before parsing. Curly quotes are
  now accepted as a delimiter pair, since Obsidian's smart typography produces them.

### Changed
- **Query errors now say what is wrong.** Instead of "could not interpret as a boolean
  combination", errors name the offending sub-expression, report unbalanced delimiters,
  point out filters that are not wrapped in delimiters, and detect lowercase boolean
  operators (which Tasks requires to be capitalised).

## 1.3.1 — 2026-08-12

### Fixed
- **Boolean filter combination in queries.** Lines such as
  `(tags include home) OR (tags include phone)` were rejected as an unsupported filter.
  `AND`, `OR`, `NOT`, `AND NOT`, `OR NOT` and `XOR` are now supported, with Tasks'
  documented precedence (`NOT > XOR > AND > OR`), arbitrary nesting, all four delimiter
  pairs (one type per line, as required since Tasks 7.0.0), optional spaces around
  operators, and trailing-backslash line continuations.

## 1.3.0 — 2026-08-12

### Added
- **Query-driven reviews.** Both Process and Organise now ask, at the start of each run,
  whether to work through the current note or a Tasks query. Queries can be saved in
  settings or typed at the prompt. Undo, Restart and Revert work across file boundaries.
- Saved-query editor in settings, seeded with three defaults.

### Changed
- Line offsets are now tracked **per file** rather than as one running total, so growth in
  one file no longer shifts line numbers in another.

### Notes
- Query filters are a re-implementation of a subset of the Tasks query language; the Tasks
  API cannot run searches (issue #2459). Unrecognised filters are reported as errors.

## 1.2.0 — 2026-08-12

### Changed
- **Restart task is now the primary rewind action.** It is offered before the
  previous-task action and keeps normal button contrast, because a mistake is far more
  often about the task in front of you than a realisation about the one before it.
- **`← Previous` is renamed `Revert last`** and styled more quietly. Its behaviour is
  unchanged: it undoes the current task and the previous one, then reopens the previous
  task.

## 1.1.0 — 2026-08-12

### Changed
- **The project and subtask boxes now share one scroll region.** Previously each box
  scrolled its own text, which meant two scrollbars and no way to move between them.
  The region opens with the active subtask at the top — reading from its first line —
  and the project box sits just above it, reached by scrolling up. Once you scroll, it
  stops repositioning until the next task.
- **Prompt controls are more compact**, reclaiming vertical space in the sidebar. Option
  buttons, the text input, the question heading and the nav bar are all tighter. Sizing
  is per platform: desktop gets the compact size, mobile keeps a larger touch target.
  Task box padding is deliberately unchanged — the space freed is meant to go to the
  task text.

## 1.0.0 — 2026-08-03

First public release.

### Added
- **Guided Process and Organise workflows** for top-level Markdown tasks, driven from a
  sidebar pane rather than a modal, so the source note stays visible.
- **Undo and rewind.** `Restart task` undoes everything the current task has written and
  runs it again; `← Previous` does the same and steps back one task. Notes created during
  an undone task are moved to trash rather than deleted.
- **Quick-Switcher-style note picking.** The note and folder pickers rank by where the
  match lands — exact filename, then prefix, then substring, then alias, then path — with
  the fuzzy score only breaking ties inside a band.
- **Respects Obsidian's "Excluded files" setting.** Excluded paths sort below every other
  result and render dimmed. Uses Obsidian's own matcher, with a fallback that reads
  `userIgnoreFilters` directly.
- **Compact link display.** Raw URLs in a task line collapse to host plus a short path;
  Markdown links collapse to their link text. The full URL stays available on hover.
- **Test suite** (`npm test`) covering ranking, exclusions, the undo journal, task-line
  parsing, and regression guards for every defect fixed during development.

### Fixed
- The Tasks edit modal opened on the line *below* the intended one when a project subtask
  had just been inserted above it. The editor is now settled against the vault before the
  cursor is placed.
- Text prompts typed in reverse on mobile (`clarity` → `ytiralc`) when the field was
  focused while the sidebar was still animating.
- Pressing **OK** on a text prompt could silently also activate the third control of the
  following prompt, sending Organise straight to "create a new note".
- `← Previous` returned the same task once a project with subtasks had changed the file's
  line count, because the line offset was applied twice.
- The Exit button rendered as a solid red block on desktop.
- The task display grew without limit, pushing prompts off the bottom of the pane.
