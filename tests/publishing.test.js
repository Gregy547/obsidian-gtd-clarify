/**
 * What the Obsidian community directory and a public repository need to be true.
 *
 * The directory reads manifest.json from the default branch and installs from the GitHub
 * release whose tag matches its version; its automated review applies the developer
 * policies and the rules in eslint-plugin-obsidianmd (run here with `npm run lint`). These
 * tests pin the parts that need no network: the manifest's wording, versions kept in step,
 * and the release machinery.
 */
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { PLUGIN_NAME } = require("./helpers/load.js");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const source = read("src/main.js");

test("the description meets the directory's rules", () => {
  const d = manifest.description;
  assert.ok(d.length >= 10 && d.length <= 250, `${d.length} characters`);
  assert.match(d, /^[A-Z]/, "starts with a capital");
  assert.ok(d.endsWith("."), "ends with a full stop");
  assert.match(d, /^[A-Za-z0-9\s.,!?'"-]+$/, "no emoji or special characters");
  assert.ok(!/obsidian|plugin/i.test(d), "neither 'Obsidian' nor 'plugin'");
  assert.ok(!/^this /i.test(d), "starts with what it does, not 'This…'");
});

test("the id and name avoid the words the directory refuses", () => {
  assert.match(manifest.id, /^[a-z0-9-]+$/);
  assert.ok(!/obsidian|plugin/i.test(manifest.id));
  assert.ok(!/obsidian|plugin/i.test(manifest.name));
});

test("the manifest has no empty values", () => {
  for (const [k, v] of Object.entries(manifest)) {
    if (typeof v === "string") assert.ok(v.trim(), `${k} is empty`);
  }
  assert.strictEqual(typeof manifest.isDesktopOnly, "boolean");
});

test("the name shown in Obsidian is the manifest's name", () => {
  assert.strictEqual(PLUGIN_NAME, manifest.name);
});

test("package.json and manifest.json carry the same version", () => {
  assert.strictEqual(JSON.parse(read("package.json")).version, manifest.version);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, "x.y.z only: the directory accepts nothing else");
});

test("each version has its changelog section, which becomes the release notes", () => {
  assert.match(read("CHANGELOG.md"), new RegExp(`^## ${manifest.version.replace(/\./g, "\\.")} `, "m"));
  assert.ok(!/OWNER/.test(read("CHANGELOG.md")), "no placeholder links");
});

test("npm version tags without a v, as Obsidian looks the release up by the bare version", () => {
  assert.match(read(".npmrc"), /^tag-version-prefix=""$/m);
});

test("npm version keeps manifest.json, versions.json and the build marker in step", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bump-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...manifest, version: "1.0.0" }));
  fs.writeFileSync(path.join(dir, "versions.json"), JSON.stringify({ "1.0.0": manifest.minAppVersion }));
  fs.writeFileSync(path.join(dir, "src", "main.js"), 'var BUILD_VERSION = "1.0.0";\n');
  execFileSync(process.execPath, [path.join(ROOT, "version-bump.mjs")], {
    cwd: dir, env: { ...process.env, npm_package_version: "1.0.1" }
  });
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")).version, "1.0.1");
  assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "versions.json"), "utf8"))["1.0.1"], manifest.minAppVersion);
  assert.match(fs.readFileSync(path.join(dir, "src", "main.js"), "utf8"), /BUILD_VERSION = "1\.0\.1"/);
  assert.match(read("package.json"), /"version": "node version-bump\.mjs/);
});

test("a release lints, tests, checks its tag and attaches the three files Obsidian installs", () => {
  const wf = read(".github/workflows/release.yml");
  assert.match(wf, /npm run lint/);
  assert.match(wf, /npm test/);
  assert.match(wf, /does not match manifest version/);
  assert.match(wf, /main\.js manifest\.json styles\.css/);
  assert.match(read(".github/workflows/test.yml"), /npm run lint[\s\S]*npm test/);
});

test("a release can be started from the browser, and never releases a version twice", () => {
  const wf = read(".github/workflows/release.yml");
  // Actions → Release → Run workflow, for publishing without git on the command line.
  assert.match(wf, /^ {2}workflow_dispatch:/m);
  assert.match(wf, /^ {2}push:\n {4}tags:/m, "pushing a version tag still releases too");
  // Started by hand, the version comes from manifest.json, and an existing release stops it.
  assert.match(wf, /VERSION="\$MANIFEST"/);
  assert.match(wf, /gh release view "\$VERSION"[\s\S]*already exists[\s\S]*exit 1/);
  // The tag is made on the commit that was just built and tested.
  assert.match(wf, /--target "\$\{GITHUB_SHA\}"/);
  // Linted and tested before anything is released, whichever way it was started.
  assert.ok(wf.indexOf("npm test") < wf.indexOf("gh release create"));
  assert.match(read("README.md"), /Actions → Release → Run workflow/, "the README says how to release from the browser");
});

test("settings say what they do, without internal spec codes", () => {
  const strings = source.match(/"[^"\n]*"/g) || [];
  const leaked = strings.filter((s) => /\((?:SET|PROC|ORG|GEN|EXT)-\d|Spec: [A-Z]/.test(s));
  assert.deepStrictEqual(leaked, []);
});

test("nothing is logged when the plugin loads, and no style is set inline", () => {
  assert.ok(!/console\.log\(/.test(source), "only errors and warnings reach the console");
  assert.ok(!/\.style\.[a-zA-Z]+\s*=/.test(source), "styles live in styles.css, where themes can reach them");
});

test("the README states what the plugin does with your data", () => {
  assert.match(read("README.md"), /^## Privacy$/m);
  assert.match(read("README.md"), /no network requests/);
});

test("every picture the README shows is in the repo, by a relative path", () => {
  // GitHub and Obsidian's plugin browser both resolve a relative path against the repo, so
  // the picture follows the repo if it is renamed or moved to another account.
  const images = [...read("README.md").matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
  assert.ok(images.includes("assets/demo.gif"), "the demo is shown near the top");
  for (const src of images) {
    assert.ok(!/^[a-z]+:\/\//i.test(src), `${src} should be a path in the repo, not a URL`);
    assert.ok(fs.existsSync(path.join(ROOT, src)), `${src} is missing from the repo`);
  }
  // A large GIF slows the README for everyone and GitHub may not render it; keep it small.
  assert.ok(fs.statSync(path.join(ROOT, "assets/demo.gif")).size < 5 * 1024 * 1024);
});

test("the old name is gone from everything that ships", () => {
  // GTD Flow's id belongs to another published plugin. Its CSS classes and view id could be
  // the same as ours, so they were renamed too, letting the two be installed side by side.
  for (const f of ["src/main.js", "styles.css", "README.md", "manifest.json", "package.json"]) {
    assert.ok(!/gtd-flow|GTD Flow/.test(read(f)), `${f} still says gtd-flow`);
  }
  assert.match(source, /var VIEW_TYPE_REVIEW = "gtd-clarify-review";/);
});

test("you are the author and copyright holder, and the README credits how it was built", () => {
  assert.strictEqual(manifest.author, "Greg A");
  assert.match(read("LICENSE"), /^Copyright \(c\) 2026 Greg A$/m);
  assert.match(read("README.md"), /^Built by Greg A with Claude Code\./m);
  assert.strictEqual(JSON.parse(read("package.json")).author, "Greg A");
});
