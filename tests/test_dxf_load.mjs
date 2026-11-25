/* Maker File Previewer — Node tests for the DXF load contract.
   Regression test for a real bug caught by the visual review (2026-11-25):
   DxfWorker._Load returns `dxf: undefined` unless the viewer option
   `retainParsedDxf` is exactly `true` — so GetDxf() was null and the
   viewer's first use of the parsed model (`dxf.header`) threw
   "Cannot read properties of undefined (reading 'header')" even though
   the drawing itself had rendered. This test exercises the REAL worker
   load path (fetch + parse + scene build, no WebGL renderer) and pins
   the contract both ways.
   Run: node --test tests/test_dxf_load.mjs
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DxfWorker } from "../viewer/vendor/dxf-viewer/DxfWorker.js";
import { DxfViewer } from "../viewer/vendor/dxf-viewer/index.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.join(HERE, "..", "..", "dxf-generator-work", "examples");

function optionsWith(retain) {
  const opts = Object.create(DxfViewer.DefaultOptions);
  opts.retainParsedDxf = retain;
  return opts;
}

async function loadGear(retain) {
  const text = fs.readFileSync(path.join(EXAMPLES, "gear_m2_z20.dxf"), "utf8");
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  try {
    const worker = new DxfWorker(null); // main-thread load, as in v1
    const { scene, dxf } = await worker.Load(url, null, optionsWith(retain), null);
    return { scene, dxf };
  } finally {
    URL.revokeObjectURL(url);
  }
}

test("retainParsedDxf: true — the worker returns the parsed DXF with header", async () => {
  const { scene, dxf } = await loadGear(true);
  assert.ok(dxf, "dxf must be returned when retainParsedDxf is true");
  assert.equal(dxf.header.$ACADVER, "AC1015");
  assert.ok(scene.bounds, "scene must have bounds");
  assert.ok(Math.abs((scene.bounds.maxX - scene.bounds.minX) - 44) < 0.01,
    `gear width should be 44, got ${scene.bounds.maxX - scene.bounds.minX}`);
});

test("retainParsedDxf omitted — the worker returns dxf: undefined (the trap)", async () => {
  const { dxf } = await loadGear(false);
  assert.equal(dxf, undefined,
    "without retainParsedDxf the parsed document is dropped — the viewer must set it");
});

test("the viewer is constructed with retainParsedDxf, autoResize and the current theme", () => {
  const src = fs.readFileSync(path.join(HERE, "..", "viewer", "viewer.js"), "utf8");
  assert.match(src, /new DxfViewer\(wrap,\s*\{[^}]*retainParsedDxf:\s*true[^}]*autoResize:\s*true[^}]*clearColor:/s,
    "DxfViewer must be constructed with retainParsedDxf: true (else GetDxf() is null), autoResize: true (else the canvas stays at the 400x300 default) and clearColor from the current theme (else a toggle before the first load desyncs the button from the canvas)");
  assert.match(src, /scene\.background = new THREE\.Color\(state\.darkBg \? 0x111827 : 0xffffff\)/,
    "the STL scene background must follow the theme, not stay hardcoded light");
  assert.match(src, /applyBackground\(\); \/\/ a fresh Load must not revert the canvas to black/,
    "loadDxf must re-apply the theme after Load");
});
