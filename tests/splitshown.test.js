/**
 * Organising the pieces of a split: each piece is on screen while its own questions are asked.
 *
 * Reported as "only the last piece is organised". Every piece was in fact tagged and moved,
 * but the pane was left showing the last piece processed, so the questions for the earlier
 * pieces looked as if they were about the last one. The guard is what the pane shows at the
 * moment each question is asked.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const L = require("./helpers/load.js");
const { runOrganise, ReviewControl, DefaultFilingStrategy, DEFAULT_SETTINGS } = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const strip = (q) => String(q).replace(/\*\*/g, "");

function scripted(answers) {
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, [...v]]));
  const asked = [];
  let showing = null;
  const answer = (raw) => {
    const q = strip(raw);
    asked.push({ q, showing });
    const key = Object.keys(queues).find((k) => String(q).replace(/\*\*/g, "").includes(k));
    if (!key || !queues[key].length) throw new Error(`no scripted answer for: ${q}`);
    const a = queues[key].shift();
    if (a instanceof Error) throw a;
    return a;
  };
  return {
    asked,
    prompter: {
      choice: async (q) => answer(q), optionalChoice: async (q) => answer(q),
      confirm: async (q) => answer(q), text: async (q) => answer(q), info: () => {},
      highlightInSource: async (it) => { showing = it.raw.trim(); },
      focusSubtask: (p, l, raw) => { showing = raw.trim(); },
      suggestFile: async () => ({ path: "Areas/Health.md" })
    }
  };
}

test("each piece of a split is on screen while it is organised", async () => {
  const content = "# Inbox\n- [ ] Call Sam, email Priya, book dentist";
  const vault = makeVault({ "Inbox.md": content, "Areas/Health.md": "" });
  const reworded = ["- [ ] Call Sam about dates", "- [ ] Email Priya the agenda", "- [ ] Book dentist check-up"];
  let n = 0;
  const s = scripted({
    "Physical context": [new ReviewControl("reprocess"), "home", "office", "errands"],
    "Re-process this task": ["process"],
    "Actionable this week?": ["split", true, true, true],
    "Split it": ["Call Sam"],
    "Next item": ["Email Priya", "Book dentist", ""],
    "Does this need more than one step?": ["no", "no", "no"],
    "Is this a clear next action?": ["keep", "keep", "keep"],
    "may not be a next action": ["keep", "keep", "keep"],
    "Move to": ["__search__", "__search__", "__search__"]
  });
  const ctx = {
    app: makeApp(vault), mode: "organise", quickBatch: [], sourceKind: "file", prompter: s.prompter,
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      dimensions: [DEFAULT_SETTINGS.dimensions[0]], enablePriorityStep: false, enableCustomTagStep: false
    }),
    tasks: { canEditViaApi: () => true, editTaskLine: async () => reworded[n++] }
  };
  ctx.filing = new DefaultFilingStrategy();
  const lines = content.split("\n");
  await runOrganise(ctx, { file: new TFile("Inbox.md"), startLine: 1, endLine: 1, raw: lines[1], isProject: false }, ctx.filing);

  assert.deepStrictEqual(vault.store.get("Areas/Health.md").split("\n").filter(Boolean), [
    "- [ ] Call Sam about dates #home",
    "- [ ] Email Priya the agenda #office",
    "- [ ] Book dentist check-up #errands"
  ], "every piece tagged and moved, each with its own answers");
  const organising = s.asked.filter((a) => a.q.startsWith("Physical context")).slice(1);
  assert.deepStrictEqual(organising.map((a) => a.showing), reworded,
    "and each piece is the one on screen when its questions are asked");
  const filing = s.asked.filter((a) => a.q.startsWith("Move to"));
  assert.deepStrictEqual(filing.map((a) => a.showing), reworded);
});

test("a project is on screen when it is filed, not its last next action", async () => {
  // Labelling its next actions, or processing it again, leaves the last action on screen.
  const content = "- [ ] Berlin trip #project\n    - [ ] Email hotel for rates";
  const vault = makeVault({ "Inbox.md": content, "Areas/Health.md": "" });
  const s = scripted({
    "Physical context": [new ReviewControl("reprocess"), "home"],
    "Re-process this next action": ["project"],
    "Actionable this week?": [true, true],
    "Does this need more than one step?": ["no"],
    "Is this a clear next action?": ["keep"],
    "may not be a next action": ["keep"],
    "Add another next action to this project?": ["no"],
    "Move to": ["__search__"]
  });
  const ctx = {
    app: makeApp(vault), mode: "organise", quickBatch: [], sourceKind: "file", prompter: s.prompter,
    settings: Object.assign({}, DEFAULT_SETTINGS, {
      dimensions: [DEFAULT_SETTINGS.dimensions[0]], enablePriorityStep: false, enableCustomTagStep: false
    }),
    tasks: { canEditViaApi: () => true, editTaskLine: async (l) => l }
  };
  ctx.filing = new DefaultFilingStrategy();
  const lines = content.split("\n");
  await runOrganise(ctx, { file: new TFile("Inbox.md"), startLine: 0, endLine: 1, raw: lines[0], isProject: true }, ctx.filing);
  const filing = s.asked.find((a) => a.q.startsWith("Move to"));
  assert.strictEqual(filing.showing, "- [ ] Berlin trip #project", "the project, not its last next action");
  const labelling = s.asked.filter((a) => a.q.startsWith("Physical context")).pop();
  assert.strictEqual(labelling.showing, "- [ ] Email hotel for rates", "while each action is labelled, that action");
});
