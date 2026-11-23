/**
 * Sweep: get everything out of your head and into the inbox, one prompt at a time.
 *
 * What's on your mind first, then each area of focus, project and context from the vault,
 * then a trigger list. Prompts from the vault all read "Anything about X?". Each thought is
 * written to the inbox note as a task the moment it is added, so leaving part-way loses
 * nothing; several pasted lines are one thought, not one per line.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("./helpers/load.js");
const {
  sweepPrompts, runSweep, parseTriggerList, defaultTriggerText, DEFAULT_TRIGGERS, cleanCapture, sweepInboxPath,
  removeCapture, appendCapture, DEFAULT_SETTINGS, ReviewControl, shiftDate, todayString
} = L;
const { makeVault, makeApp } = require("./helpers/fake-vault.js");
const { TFile } = require("./helpers/obsidian.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");
// The screen focuses its field on the next frame.
if (typeof window.requestAnimationFrame !== "function") window.requestAnimationFrame = (f) => setImmediate(f);
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "examples", "data.json"), "utf8"));
const plain = (q) => String(q).replace(/\*\*/g, "");
const INBOX = "- Inbox -.md";

/** Obsidian's tag index for the fake vault. */
function tagIndex(vault) {
  return (file) => {
    const text = vault.store.get(file.path);
    if (text == null) return null;
    const tags = [];
    text.split("\n").forEach((l, line) => {
      for (const m of l.matchAll(/(^|\s)(#[^\s#]+)/g)) tags.push({ tag: m[2], position: { start: { line } } });
    });
    return { tags };
  };
}
const VAULT = {
  [INBOX]: "- [ ] Already here",
  "AreasOfFocus/Health.md": "",
  "AreasOfFocus/Finances.md": "",
  "AreasOfFocus/Health/Diet.md": "",
  "Projects/Kitchen.md": "- [ ] Kitchen refit #project",
  "Projects/Berlin.md": `- [ ] Berlin trip booked #project 🛫 ${shiftDate(todayString(), 30)}`,
  "Projects/Old.md": "- [x] Old plan #project",
  "Someday/Someday.md": "- [ ] Learn the cello #project",
  "Elsewhere.md": "- [ ] Loose project #project"
};
function app(files = VAULT) {
  const vault = makeVault(Object.assign({}, files));
  return { vault, app: makeApp(vault, { getFileCache: tagIndex(vault) }) };
}
const settings = (extra = {}) => Object.assign({}, DEFAULT_SETTINGS, {
  sweepInboxPath: "- Inbox -.md", areasFolder: "AreasOfFocus", projectFolder: "Projects", dimensions: EXAMPLE.dimensions
}, extra);

/* ---------------------------------- the prompts ---------------------------------- */

test("in order: your mind, areas, projects, contexts, then the trigger list", async () => {
  const { app: a } = app();
  const prompts = await sweepPrompts(a, settings());
  const questions = prompts.map((p) => plain(p.question));
  assert.deepStrictEqual(questions.slice(0, 9), [
    "What’s on your mind?",
    "Anything about Finances?", "Anything about Health?",
    "Anything about Kitchen refit?",
    "Anything about Home?", "Anything about Outings?", "Anything about Phone?", "Anything about Agenda?",
    "Anything about Commitments?"
  ]);
  assert.strictEqual(prompts.length, 8 + DEFAULT_TRIGGERS.length - 2, "Health and Home are asked once each");
});

test("a trigger named like an area or context lends it its reminders instead of being asked twice", async () => {
  const { app: a } = app();
  const prompts = await sweepPrompts(a, settings());
  const named = (n) => prompts.filter((p) => plain(p.question) === `Anything about ${n}?`);
  assert.strictEqual(named("Health").length, 1);
  assert.strictEqual(named("Health")[0].group, "areas");
  assert.deepStrictEqual(named("Health")[0].reminders, DEFAULT_TRIGGERS.find(([h]) => h === "Health")[1]);
  assert.strictEqual(named("Home").length, 1);
  assert.strictEqual(named("Home")[0].group, "contexts");
  assert.strictEqual(named("Money").length, 1, "the rest are asked as triggers");
});

test("each says where it is from, and how far through that kind you are", async () => {
  const { app: a } = app();
  const prompts = await sweepPrompts(a, settings());
  assert.deepStrictEqual(prompts.slice(1, 4).map((p) => p.note), ["Area of focus · 1 of 2", "Area of focus · 2 of 2", "Project · 1 of 1"]);
  const commitments = prompts.find((p) => plain(p.question) === "Anything about Commitments?");
  assert.deepStrictEqual(commitments.reminders, DEFAULT_TRIGGERS[0][1]);
});

test("projects: open, not deferred, not in Someday, and in the project folder when there is one", async () => {
  const { app: a } = app();
  const inFolder = (await sweepPrompts(a, settings())).filter((p) => p.group === "projects").map((p) => plain(p.question));
  assert.deepStrictEqual(inFolder, ["Anything about Kitchen refit?"]);
  const anywhere = (await sweepPrompts(a, settings({ projectFolder: "" }))).filter((p) => p.group === "projects").map((p) => plain(p.question));
  assert.deepStrictEqual([...anywhere].sort(), ["Anything about Kitchen refit?", "Anything about Loose project?"]);
  assert.ok(!anywhere.some((q) => /cello|Berlin|Old plan/.test(q)));
});

test("each part can be left out", async () => {
  const { app: a } = app();
  const groups = async (extra) => [...new Set((await sweepPrompts(a, settings(extra))).map((p) => p.group))];
  assert.deepStrictEqual(await groups({ areasFolder: "" }), ["mind", "projects", "contexts", "triggers"]);
  assert.deepStrictEqual(await groups({ sweepProjects: false, sweepContexts: false }), ["mind", "areas", "triggers"]);
  assert.deepStrictEqual(await groups({ sweepTriggers: "" }), ["mind", "areas", "projects", "contexts"]);
});

test("the trigger list: a line ending in a colon is a prompt, the lines under it its reminders", () => {
  assert.deepStrictEqual(parseTriggerList("Loose first\n# off\nCalls:\n- Sam\nMum\n\nShops:\n:\n"), [
    { heading: "Anything else", items: ["Loose first"] },
    { heading: "Calls", items: ["Sam", "Mum"] },
    { heading: "Shops", items: [] }
  ]);
  assert.deepStrictEqual(parseTriggerList(defaultTriggerText()).map((s) => [s.heading, s.items]), DEFAULT_TRIGGERS);
});

/* ---------------------------------- capturing ---------------------------------- */

/** A scripted sweep: for each prompt, the thoughts to add, then how to move on. */
function sweeper(script, { removeLast = false } = {}) {
  const seen = [];
  return {
    seen,
    prompter: {
      sweep: async (prompt, handlers) => {
        seen.push({ q: plain(prompt.question), skip: prompt.skipLabel ? plain(prompt.skipLabel) : null });
        const step = script.length ? script.shift() : "finish";
        if (step instanceof Error) throw step;
        const [thoughts, then] = Array.isArray(step) ? step : [[], step];
        for (const t of thoughts) await handlers.add(t);
        if (removeLast && thoughts.length) await handlers.remove(L.cleanCapture(thoughts[thoughts.length - 1]));
        return then;
      }
    }
  };
}

test("each thought goes into the inbox as a task, as it is added", async () => {
  const { vault, app: a } = app();
  const s = sweeper([[["Call the dentist", "Renew passport"], "next"], [["Budget for December"], "finish"]]);
  const progress = [];
  const n = await runSweep({ app: a, settings: settings(), prompter: s.prompter }, (k) => progress.push(k));
  assert.strictEqual(n, 3);
  assert.deepStrictEqual(progress, [1, 2, 3]);
  assert.strictEqual(vault.store.get(INBOX), "- [ ] Already here\n- [ ] Call the dentist\n- [ ] Renew passport\n- [ ] Budget for December\n");
});

test("several pasted lines are one thought; a list marker typed with it is dropped", () => {
  assert.strictEqual(cleanCapture("Ask Sam about\nthe deposit\r\n  and the keys"), "Ask Sam about the deposit and the keys");
  assert.strictEqual(cleanCapture("- [ ] Buy milk"), "Buy milk");
  assert.strictEqual(cleanCapture("  * Buy   bread "), "Buy bread");
  assert.strictEqual(cleanCapture("   \n  "), "");
});

test("an empty thought adds nothing", async () => {
  const { vault, app: a } = app();
  const n = await runSweep({ app: a, settings: settings(), prompter: sweeper([[["   ", "- [ ] "], "finish"]]).prompter });
  assert.strictEqual(n, 0);
  assert.strictEqual(vault.store.get(INBOX), "- [ ] Already here");
});

test("a thought can be taken back", async () => {
  const { vault, app: a } = app();
  const n = await runSweep({ app: a, settings: settings(), prompter: sweeper([[["Call Sam", "Cal Sam"], "finish"]], { removeLast: true }).prompter });
  assert.strictEqual(n, 1);
  assert.strictEqual(vault.store.get(INBOX), "- [ ] Already here\n- [ ] Call Sam\n");
});

test("taking back removes the one just added, not an older line that reads the same", async () => {
  const { vault, app: a } = app({ [INBOX]: "- [ ] Call Sam\n- [ ] Other\n" });
  await appendCapture(a, INBOX, "Call Sam");
  assert.ok(await removeCapture(a, INBOX, "Call Sam"));
  assert.strictEqual(vault.store.get(INBOX), "- [ ] Call Sam\n- [ ] Other\n");
});

test("the inbox note is made if it isn't there", async () => {
  const { vault, app: a } = app({});
  await runSweep({ app: a, settings: settings({ sweepInboxPath: "GTD/In", areasFolder: "", sweepProjects: false, sweepContexts: false }),
    prompter: sweeper([[["First thought"], "finish"]]).prompter });
  assert.strictEqual(vault.store.get("GTD/In.md"), "- [ ] First thought\n");
  assert.strictEqual(sweepInboxPath({}), "Inbox.md");
});

/* ---------------------------------- moving on ---------------------------------- */

test("Skip the rest passes over the rest of that kind; Finish ends it", async () => {
  const { app: a } = app();
  const s = sweeper(["next", "skip", "next", "finish"]);
  await runSweep({ app: a, settings: settings(), prompter: s.prompter });
  assert.deepStrictEqual(s.seen.map((x) => x.q), [
    "What’s on your mind?", "Anything about Finances?", "Anything about Kitchen refit?", "Anything about Home?"
  ]);
});

test("Skip the rest is offered only while there is more of the same kind, and names it", async () => {
  const { app: a } = app();
  const s = sweeper(["next", "next", "next", "finish"]);
  await runSweep({ app: a, settings: settings(), prompter: s.prompter });
  assert.deepStrictEqual(s.seen.map((x) => x.skip), [null, "Skip the rest of areas of focus", null, null]);
});

test("leaving the pane part-way keeps what was captured", async () => {
  const { vault, app: a } = app();
  const s = sweeper([[["Call Sam"], "next"], new ReviewControl("exit")]);
  const n = await runSweep({ app: a, settings: settings(), prompter: s.prompter });
  assert.strictEqual(n, 1);
  assert.match(vault.store.get(INBOX), /Call Sam/);
});

/* ---------------------------------- the screen ---------------------------------- */

function el(tag, opts = {}) {
  const node = {
    tag, cls: opts.cls || "", text: opts.text || "", children: [], attrs: {}, handlers: {}, value: "", placeholder: "",
    selectionStart: 0, selectionEnd: 0, parent: null,
    createEl(t, o = {}) { const c = el(t, o); c.parent = this; this.children.push(c); return c; },
    createSpan(o = {}) { return this.createEl("span", o); },
    createDiv(o = {}) { return this.createEl("div", o); },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener(e, f) { (this.handlers[e] = this.handlers[e] || []).push(f); },
    removeEventListener() {},
    fire(e, ev = {}) { for (const f of this.handlers[e] || []) f(Object.assign({ preventDefault() { ev.prevented = true; }, stopPropagation() {} }, ev)); return ev; },
    get classList() { return { toggle() {}, remove() {}, contains: () => false }; },
    empty() { this.children = []; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); },
    focus() {},
    setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  };
  return node;
}
const all = (n) => [n, ...n.children.flatMap(all)];
const textOf = (n) => n.text + n.children.map(textOf).join("");

function screen() {
  // From the start of a line: a method, not a call of the same name inside another one.
  const pick = (name) => {
    const body = main.slice(main.indexOf(`\n  ${name}(`) + 1);
    return body.slice(0, body.indexOf("\n  }\n") + 4);
  };
  const methods = ["sweep", "swallowNextClick", "renderQuestion", "settlePrompt", "renderNav"].map(pick).join("\n");
  const deps = { guidanceMode: L.guidanceMode, appendRich: L.appendRich, plainText: L.plainText, ReviewControl };
  const Klass = new Function(...Object.keys(deps), `return class { ${methods} }`)(...Object.values(deps));
  const p = new Klass();
  p.bodyEl = el("div");
  p.navEl = el("div");
  p.rootEl = el("div");
  p.plugin = { settings: Object.assign({}, DEFAULT_SETTINGS) };
  p.revealSelf = () => {};
  const added = [], removed = [];
  const handlers = {
    add: async (t) => { const c = L.cleanCapture(t); if (!c) return null; added.push(c); return c; },
    remove: async (t) => { removed.push(t); return true; }
  };
  const prompt = { question: "Anything about **Health**?", note: "Area of focus · 1 of 2", reminders: ["Appointments"], skipLabel: "Skip the rest of **areas of focus**" };
  const result = p.sweep(prompt, handlers);
  const find = (pred) => all(p.bodyEl).find(pred);
  return {
    p, result, added, removed,
    input: find((n) => n.tag === "input"),
    button: (label) => find((n) => n.tag === "button" && textOf(n).includes(label)),
    captured: () => all(p.bodyEl).filter((n) => n.cls === "gtd-clarify-captured").flatMap((u) => u.children).map((li) => textOf(li.children[0]))
  };
}
const tick = () => new Promise((r) => setImmediate(r));

test("Enter adds the thought, clears the field and lists it; × takes it back", async () => {
  const s = screen();
  s.input.value = "Book the dentist";
  s.input.fire("keydown", { key: "Enter" });
  await tick();
  assert.deepStrictEqual(s.added, ["Book the dentist"]);
  assert.strictEqual(s.input.value, "");
  assert.deepStrictEqual(s.captured(), ["Book the dentist"]);
  s.button("×").fire("click");
  await tick();
  assert.deepStrictEqual(s.removed, ["Book the dentist"]);
  assert.deepStrictEqual(s.captured(), []);
});

test("Enter on an empty field moves on", async () => {
  const s = screen();
  s.input.fire("keydown", { key: "Enter" });
  assert.strictEqual(await s.result, "next");
});

test("pasting several lines puts them in the field as one line", () => {
  const s = screen();
  s.input.value = "Ask ";
  s.input.selectionStart = s.input.selectionEnd = 4;
  const ev = s.input.fire("paste", { clipboardData: { getData: () => "Sam about\nthe deposit\n" } });
  assert.ok(ev.prevented);
  assert.strictEqual(s.input.value, "Ask Sam about the deposit");
  const one = screen();
  const plainPaste = one.input.fire("paste", { clipboardData: { getData: () => "no breaks" } });
  assert.ok(!plainPaste.prevented, "a single line pastes as usual");
});

test("Add on an empty field does nothing; Next, Skip the rest and Finish each move on", async () => {
  const s = screen();
  s.button("Add").fire("pointerdown");
  s.button("Add").fire("click");
  await tick();
  assert.deepStrictEqual(s.added, []);
  for (const [label, action] of [["Next", "next"], ["Skip the rest", "skip"], ["Finish", "finish"]]) {
    const t = screen();
    t.button(label).fire("pointerdown");
    assert.strictEqual(await t.result, action);
  }
});

test("the reminders are shown with the prompt, and the review's buttons are not", () => {
  const s = screen();
  assert.ok(all(s.p.bodyEl).some((n) => n.cls === "gtd-clarify-reminders" && textOf(n) === "Appointments"));
  s.p.reviewMode = "sweep";
  s.p.renderNav();
  assert.deepStrictEqual(s.p.navEl.children, [], "no Skip task or Restart in a sweep");
});

/* -------------------------------- start to end -------------------------------- */

function startSweep({ captureCount, answer }) {
  const body = main.slice(main.indexOf("  async startSweep() {"));
  const method = body.slice(0, body.indexOf("\n  }\n") + 4);
  const deps = Object.assign({}, L, {
    obsidian: L.obsidian,
    runSweep: async (ctx, onProgress) => { for (let k = 1; k <= captureCount; k++) onProgress(k); return captureCount; }
  });
  const names = Object.keys(deps).filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  const Klass = new Function(...names, `return class { ${method} }`)(...names.map((k) => deps[k]));
  const p = new Klass();
  const vault = makeVault({ [INBOX]: "" });
  const log = [];
  p.app = makeApp(vault);
  p.app.workspace.getLeaf = () => ({ openFile: async (f) => log.push(`open ${f.path}`) });
  p.plugin = { settings: settings() };
  p.taskEl = el("div");
  p.headerEl = { setText: (t) => log.push(`header ${t}`) };
  p.choice = async (q) => { log.push(`ask ${plain(q)}`); return answer; };
  p.renderDone = (m) => log.push(`done ${m}`);
  p.start = async (mode, file, opts) => log.push(`start ${mode} ${file.path} ${JSON.stringify(opts)}`);
  return { p, log };
}

test("at the end: what was captured, and Process on the inbox straight away if you want", async () => {
  const s = startSweep({ captureCount: 2, answer: "process" });
  await s.p.startSweep();
  assert.deepStrictEqual(s.log.filter((l) => !l.startsWith("header")), [
    "ask Captured 2 in “- Inbox -”. Process them now?",
    `open ${INBOX}`,
    `start process ${INBOX} {"thisNote":true}`
  ]);
  assert.ok(s.log.includes("header Sweep — 2 captured"));
});

test("not now: it says where they are", async () => {
  const s = startSweep({ captureCount: 3, answer: "later" });
  await s.p.startSweep();
  assert.strictEqual(s.log[s.log.length - 1], "done Captured 3 in “- Inbox -”.");
});

test("nothing captured: nothing to process", async () => {
  const s = startSweep({ captureCount: 0, answer: "process" });
  await s.p.startSweep();
  assert.ok(!s.log.some((l) => l.startsWith("ask") || l.startsWith("start")));
  assert.match(s.log[s.log.length - 1], /^done Nothing captured/);
});

test("Process from a sweep doesn't ask which tasks: it is the inbox", () => {
  const start = main.slice(main.indexOf("  async start(mode, file"));
  const body = start.slice(0, start.indexOf("\n  }\n"));
  assert.match(body, /opts\.thisNote \? new ActiveFileTopLevelTaskSource\(/);
});

test("reachable from the command list and the ribbon menu, after Process and Organise", () => {
  assert.match(main, /id: "gtd-sweep",\s*name: "Sweep your mind into the inbox"/);
  const ribbon = main.slice(main.indexOf("this.addRibbonIcon("), main.indexOf("menu.showAtMouseEvent(evt);"));
  const order = ["\"Process\"", "\"Organise\"", "\"Sweep\""].map((t) => ribbon.indexOf(t));
  assert.ok(order.every((x, i) => x > -1 && (i === 0 || x > order[i - 1])), String(order));
});
