/**
 * Browser globals the plugin expects, for tests running in Node.
 *
 * Obsidian runs plugins in a browser window, where timers live on `window` (and must be
 * called through it to work in popout windows). Node has the same timers as globals, so
 * `window` is simply Node's global object here. Loaded for every test file by `npm test`.
 */
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
/* Obsidian's activeDocument is the document of the window in use: the main window's, or a
 * pop-out's. Tests have one window, so it is whatever `document` stands for at the moment —
 * tests that fake a document still reach the code through it. */
if (!Object.getOwnPropertyDescriptor(globalThis, "activeDocument")) {
  Object.defineProperty(globalThis, "activeDocument", { get: () => globalThis.document, configurable: true });
}
