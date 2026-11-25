/* Maker File Previewer — vendored-module integrity test.
   Regression test for a real bug caught by the visual review (2026-11-25):
   three 0.186.1 split its build into three.module.js + three.core.js, and
   only three.module.js was vendored — so the viewer module failed to load
   on GitHub Pages with a 404, while the Node tests still passed (they
   import three from node_modules, where three.core.js exists).
   This test statically walks every shipped .js file and proves that every
   import it makes resolves to a file that actually ships, and that every
   import-map entry points at a real file.
   Run: node --test tests/test_vendored_modules.mjs
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const VIEWER = path.join(ROOT, "viewer");

/* Strip // and block comments (string-aware, so "https://" inside a
 * string is not mistaken for a comment). */
function stripComments(src) {
  let out = "";
  let i = 0;
  let str = null; // "'", '"', or "`"
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (str) {
      out += c;
      if (c === "\\") { out += next || ""; i += 2; continue; }
      if (c === str) str = null;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { str = c; out += c; i += 1; continue; }
    if (c === "/" && next === "/") { while (i < src.length && src[i] !== "\n") i += 1; continue; }
    if (c === "/" && next === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function jsFiles(dir) {
  let out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out = out.concat(jsFiles(p));
    else if (p.endsWith(".js")) out.push(p);
  }
  return out;
}

test("every import in shipped JS resolves to a file that ships", () => {
  const html = fs.readFileSync(path.join(VIEWER, "index.html"), "utf8");
  const importMap = JSON.parse(
    html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  const mapKeys = Object.keys(importMap.imports);

  // Every import-map target must exist.
  for (const [spec, target] of Object.entries(importMap.imports)) {
    if (target.endsWith("/")) {
      assert.ok(fs.existsSync(path.join(VIEWER, target)),
        `import-map dir ${spec} -> ${target} is missing`);
    } else {
      assert.ok(fs.existsSync(path.join(VIEWER, target)),
        `import-map target ${spec} -> ${target} is missing`);
    }
  }

  // Every import in viewer.js and the vendor tree must resolve.
  const files = [path.join(VIEWER, "viewer.js"), ...jsFiles(path.join(VIEWER, "vendor"))];
  const problems = [];
  for (const file of files) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    const imports = [
      ...src.matchAll(/from\s+['"]([^'"]+)['"]/g),
      ...src.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g),
      ...src.matchAll(/import\s+['"]([^'"]+)['"]/g),
    ].map((m) => m[1]);
    for (const imp of imports) {
      if (imp.startsWith("./") || imp.startsWith("../")) {
        const target = path.normalize(path.join(path.dirname(file), imp));
        if (!fs.existsSync(target)) {
          problems.push(`${path.relative(ROOT, file)} -> missing ${imp}`);
        }
      } else {
        const ok = mapKeys.some((k) => (k.endsWith("/") && imp.startsWith(k)) || imp === k);
        if (!ok) problems.push(`${path.relative(ROOT, file)} -> unmapped bare import ${imp}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("the three.js build the viewer loads is self-contained", () => {
  // three.module.js re-exports three.core.js; both must ship.
  assert.ok(fs.existsSync(path.join(VIEWER, "vendor", "three.module.js")));
  assert.ok(fs.existsSync(path.join(VIEWER, "vendor", "three.core.js")),
    "three.core.js must ship next to three.module.js (0.186.x split build)");
  const core = fs.readFileSync(path.join(VIEWER, "vendor", "three.core.js"), "utf8");
  assert.ok(!/from\s+['"]/.test(stripComments(core)),
    "three.core.js must not import anything else");
});
