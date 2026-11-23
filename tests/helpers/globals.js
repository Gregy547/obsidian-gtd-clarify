/**
 * Browser globals the plugin expects, for tests running in Node.
 *
 * Obsidian runs plugins in a browser window, where timers live on `window` (and must be
 * called through it to work in popout windows). Node has the same timers as globals, so
 * `window` is simply Node's global object here. Loaded for every test file by `npm test`.
 */
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
