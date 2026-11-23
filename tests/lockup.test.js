/**
 * Not getting stuck while a Tasks-plugin modal is open.
 *
 * `pendingReject` is only set while one of OUR prompts is on screen. Between settling a
 * prompt and the Tasks modal resolving it is undefined, so every nav button was silently
 * inert — the clicks landed and rejectPending had nobody to reject. A modal that then
 * never resolved left the review with no way out at all.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { ReviewControl, awaitTasksModal } = require("./helpers/load.js");

const main = fs.readFileSync(path.join(__dirname, "..", "src", "main.js"), "utf8");

/** The real withControls / rejectPending pair, on a minimal stand-in for the pane. */
function makePane() {
  const src = main.slice(main.indexOf("  async withControls(promise) {"));
  const body = src.slice(0, src.indexOf("\n  }") + 4);
  // withControls is lifted out of the shipped file, so its module-scope helper must be
  // supplied. Recording calls also lets the stray-modal dismissal be asserted.
  const dismissed = [];
  const Klass = new Function("dismissOpenModal", `return class {
    rejectPending(reason) {
      const reject = this.pendingReject;
      this.pendingReject = undefined;
      if (reject) reject(reason);
    }
    ${body}
  }`)(() => dismissed.push(1));
  const pane = new Klass();
  pane.__dismissed = dismissed;
  return pane;
}

const never = () => new Promise(() => {});

test("a modal that never resolves can still be escaped", async () => {
  // The reported lockup: cancelling the create-project window left the review stuck.
  const pane = makePane();
  const pending = pane.withControls(never());
  pane.rejectPending(new ReviewControl("back"));
  await assert.rejects(() => pending, (e) => e instanceof ReviewControl && e.kind === "back");
});

test("every nav action can interrupt an open modal", async () => {
  for (const kind of ["back", "prev", "skip", "exit"]) {
    const pane = makePane();
    const pending = pane.withControls(never());
    pane.rejectPending(new ReviewControl(kind));
    await assert.rejects(() => pending, (e) => e.kind === kind, kind);
  }
});

test("interrupting also tries to dismiss the stray modal", async () => {
  // Otherwise the dialogue stays on screen and its edit lands on a line the restart has
  // already rolled back.
  const pane = makePane();
  const pending = pane.withControls(never());
  pane.rejectPending(new ReviewControl("back"));
  await assert.rejects(() => pending);
  assert.strictEqual(pane.__dismissed.length, 1);
});

test("a modal that resolves normally leaves nothing to dismiss", async () => {
  const pane = makePane();
  await pane.withControls(Promise.resolve("ok"));
  assert.strictEqual(pane.__dismissed.length, 0);
});

test("a modal that resolves normally is unaffected", async () => {
  const pane = makePane();
  assert.strictEqual(await pane.withControls(Promise.resolve("- [ ] typed task")), "- [ ] typed task");
});

test("a modal that rejects propagates its own error", async () => {
  const pane = makePane();
  const boom = new Error("tasks api blew up");
  await assert.rejects(() => pane.withControls(Promise.reject(boom)), (e) => e === boom);
});

test("the control channel is restored afterwards, not left dangling", async () => {
  const pane = makePane();
  const outer = () => {};
  pane.pendingReject = outer;
  await pane.withControls(Promise.resolve(1));
  assert.strictEqual(pane.pendingReject, outer, "the prompt that was waiting keeps its channel");
});

test("a prompt rendered during the modal keeps the channel", async () => {
  // withControls must not clobber a newer owner on the way out.
  const pane = makePane();
  let resolveModal;
  const modal = new Promise((r) => { resolveModal = r; });
  const pending = pane.withControls(modal);
  const newer = () => {};
  pane.pendingReject = newer;
  resolveModal("done");
  await pending;
  assert.strictEqual(pane.pendingReject, newer);
});

test("nesting works: an inner modal does not strand the outer", async () => {
  const pane = makePane();
  const inner = await pane.withControls(Promise.resolve("inner"));
  assert.strictEqual(inner, "inner");
  const pending = pane.withControls(never());
  pane.rejectPending(new ReviewControl("exit"));
  await assert.rejects(() => pending, (e) => e.kind === "exit");
});

test("awaitTasksModal falls back cleanly when the prompter has no control channel", async () => {
  // Organise's filing strategy and the tests both pass bare prompters.
  assert.strictEqual(await awaitTasksModal({ prompter: {} }, Promise.resolve("x")), "x");
  assert.strictEqual(await awaitTasksModal({}, Promise.resolve("y")), "y");
});

test("awaitTasksModal uses the channel when there is one", async () => {
  const pane = makePane();
  const pending = awaitTasksModal({ prompter: pane }, never());
  pane.rejectPending(new ReviewControl("skip"));
  await assert.rejects(() => pending, (e) => e.kind === "skip");
});

/* ------------------------- every modal site is covered ------------------------- */

test("no Tasks-modal await bypasses the control channel", () => {
  // Applying this at only some sites just moves the lockup.
  assert.ok(!/await tasks\.(createNewTaskLine|editTaskLine|editExistingInPlace)\(/.test(main),
    "found a direct await on the Tasks API");
  assert.strictEqual((main.match(/awaitTasksModal\(/g) || []).length, 5,
    "one definition plus four call sites");
});

test("waiting for a modal to close has a backstop", () => {
  // The observer only runs on mutations; if the selector keeps matching, nothing fires it
  // again and the wait never ends.
  const fn = main.slice(main.indexOf("waitForModalToClose() {"));
  const body = fn.slice(0, fn.indexOf("\n  }"));
  assert.match(body, /setInterval/, "a poll must back up the observer");
  assert.match(body, /clearInterval/, "and be cleared");
  assert.ok(!/clearTimeout\(timer\)/.test(body), "an interval cannot be cleared as a timeout");
});

/* ------------------------- audit of every unbounded wait ------------------------- */

test("dismissOpenModal is safe without a DOM and prefers the close button", () => {
  const { dismissOpenModal } = require("./helpers/load.js");
  assert.doesNotThrow(() => dismissOpenModal(), "must tolerate no document at all");
  let clicked = false;
  global.document = {
    querySelector: () => ({ click: () => { clicked = true; } }),
    dispatchEvent: () => { throw new Error("should not reach the Escape fallback"); }
  };
  try {
    dismissOpenModal();
    assert.ok(clicked);
  } finally {
    delete global.document;
  }
});

test("dismissOpenModal falls back to Escape when there is no close button", () => {
  const { dismissOpenModal } = require("./helpers/load.js");
  let sent = null;
  global.KeyboardEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };
  global.document = { querySelector: () => null, dispatchEvent: (e) => { sent = e; } };
  try {
    dismissOpenModal();
    assert.strictEqual(sent.key, "Escape");
  } finally {
    delete global.document;
    delete global.KeyboardEvent;
  }
});

test("every wait on something external is bounded or interruptible", () => {
  // The audit behind this fix. Each of these is a place the review could otherwise stop.
  const bounded = [
    ["settleOnLine", /deadline = Date\.now\(\) \+ 1e3/],
    ["flushEditorLine", /timeoutMs = 2e3/],
    ["readLineAfterEdit", /timeoutMs = 1500/],
    ["waitForWarmCache", /timeoutMs = 3e3/],
    ["nextFrame", /maxMs = 32/],
    ["waitForModalToClose", /appearDeadline = Date\.now\(\) \+ 1500/]
  ];
  for (const [name, re] of bounded) {
    assert.match(main, re, `${name} must have a bound`);
  }
  // Our own suggest modals resolve on close (onClose calls back with null), so they are
  // not wrapped: interrupting them would leave a dangling modal for no benefit.
  assert.match(main, /if \(!this\.picked\) this\.onPick\(null\)/);
});

/* ---------------------- abandoned modal: the observed case ---------------------- */

/** The real watchAbandonedModal, against a scriptable document. */
function makeWatcher(goneMs) {
  const src = main.slice(main.indexOf("  watchAbandonedModal(goneMs = 1200) {"));
  const body = src.slice(0, src.indexOf("\n  }") + 4);
  const Klass = new Function(`return class { ${body} }`)();
  return new Klass().watchAbandonedModal(goneMs);
}
/** Install a fake document for the whole of an async test, not just its setup: the
 * watcher's interval fires later, and tearing the document down first would have it
 * polling something that no longer exists. */
async function withFakeDom(modalOpen, fn) {
  global.document = { querySelector: () => (modalOpen() ? {} : null) };
  try {
    return await fn();
  } finally {
    delete global.document;
  }
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("a modal that opens then vanishes without answering is treated as cancelled", async () => {
  // Exactly the reported case: the dialogue is dismissed and disappears, but its promise
  // never settles, so the flow waits on something that is no longer there.
  let open = true;
  await withFakeDom(() => open, async () => {
    const watch = makeWatcher(300);
    setTimeout(() => { open = false; }, 250);
    const result = await Promise.race([watch.promise, wait(3000).then(() => "TIMED OUT")]);
    watch.cancel();
    assert.strictEqual(result, null, "must release the wait as a cancellation");
  });
});

test("it does not fire while the modal is still on screen", async () => {
  await withFakeDom(() => true, async () => {
    const watch = makeWatcher(200);
    const result = await Promise.race([watch.promise, wait(900).then(() => "still waiting")]);
    watch.cancel();
    assert.strictEqual(result, "still waiting", "a live dialogue must never be cancelled underneath the user");
  });
});

test("it never fires if no modal is ever seen", async () => {
  // A selector that fails to match a real dialogue must not cancel it; the nav buttons
  // remain the way out in that case.
  await withFakeDom(() => false, async () => {
    const watch = makeWatcher(150);
    const result = await Promise.race([watch.promise, wait(800).then(() => "never fired")]);
    watch.cancel();
    assert.strictEqual(result, "never fired");
  });
});

test("a brief flicker does not count as abandonment", async () => {
  let open = true;
  await withFakeDom(() => open, async () => {
    const watch = makeWatcher(600);
    setTimeout(() => { open = false; }, 220);
    setTimeout(() => { open = true; }, 400);
    const result = await Promise.race([watch.promise, wait(1200).then(() => "still waiting")]);
    watch.cancel();
    assert.strictEqual(result, "still waiting", "the absence must be sustained");
  });
});

test("cancelling the watcher stops its timer", async () => {
  await withFakeDom(() => false, async () => {
    const watch = makeWatcher(100);
    watch.cancel();
    assert.doesNotThrow(() => watch.cancel(), "cancelling twice must be safe");
  });
});

test("withControls races the watchdog alongside the modal and the nav", () => {
  assert.match(main, /Promise\.race\(watch \? \[promise, control, watch\.promise\] : \[promise, control\]\)/);
  assert.match(main, /if \(watch\) watch\.cancel\(\);/, "the timer must be cleared on every exit");
});

test("every caller reads the watchdog's null as a cancellation", () => {
  // The watchdog resolves null rather than inventing its own signal, so each site's
  // existing cancel check already covers it.
  assert.match(main, /if \(!edited \|\| !edited\.trim\(\)\) return null;/);
  assert.match(main, /if \(!mainRaw\) throw new ReviewControl\("retry"\)/);
  assert.match(main, /if \(!newLine\) \{/);
});

test("the watcher survives the document disappearing mid-wait", async () => {
  // The plugin can be unloaded while a dialogue is open.
  global.document = { querySelector: () => { throw new Error("gone"); } };
  const watch = makeWatcher(100);
  try {
    const result = await Promise.race([watch.promise, wait(500).then(() => "no crash")]);
    assert.strictEqual(result, "no crash");
  } finally {
    watch.cancel();
    delete global.document;
  }
});
