// Run by `npm version <x.y.z>`: copies the new version from package.json into
// manifest.json, versions.json and the build marker in src/main.js, so all four agree.
// Obsidian installs the release whose tag matches manifest.json's version exactly.
import { readFileSync, writeFileSync } from "node:fs";

const version = process.env.npm_package_version;
if (!/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error(`Not an x.y.z version: ${version}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = version;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

const source = readFileSync("src/main.js", "utf8");
const marked = source.replace(/var BUILD_VERSION = "[^"]+";/, `var BUILD_VERSION = "${version}";`);
if (marked === source && !source.includes(`BUILD_VERSION = "${version}"`)) {
  console.error("Build marker not found in src/main.js");
  process.exit(1);
}
writeFileSync("src/main.js", marked);
