/* Maker File Previewer — Node tests for viewer/dxfinfo.js.
   Parses a hand-made DXF and the 3 real example DXFs from the
   LaserCut DXF Generator with the REAL vendored parser, then checks
   the pure model functions.
   Run: node --test tests/test_dxfinfo.mjs
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import DxfParser from "../viewer/vendor/dxf-viewer/parser/DxfParser.js";

const require = createRequire(import.meta.url);
const DxfInfo = require("../viewer/dxfinfo.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXAMPLES = path.join(HERE, "..", "..", "dxf-generator-work", "examples");

const HANDMADE_DXF = [
  "  0", "SECTION", "  2", "HEADER",
  "  9", "$ACADVER", "  1", "AC1009",
  "  9", "$INSUNITS", " 70", "     1",
  "  0", "ENDSEC",
  "  0", "SECTION", "  2", "TABLES",
  "  0", "TABLE", "  2", "LAYER",
  "  0", "LAYER", "  2", "LayerA", " 70", "     0", " 62", "     7", "  6", "Continuous",
  "  0", "LAYER", "  2", "LayerB", " 70", "     0", " 62", "     7", "  6", "Continuous",
  "  0", "ENDTAB", "  0", "ENDSEC",
  "  0", "SECTION", "  2", "ENTITIES",
  "  0", "LINE", "  8", "LayerA",
  " 10", "0.0", " 20", "0.0", " 11", "100.0", " 21", "0.0",
  "  0", "CIRCLE", "  8", "LayerB",
  " 10", "50.0", " 20", "50.0", " 40", "25.0",
  "  0", "ENDSEC", "  0", "EOF",
].join("\n");

function parseText(text) {
  return new DxfParser().parseSync(text);
}

test("hand-made DXF: units, bbox, layers, counts, snap points", () => {
  const dxf = parseText(HANDMADE_DXF);
  const units = DxfInfo.getUnits(dxf);
  assert.equal(units.code, 1);
  assert.equal(units.name, "inches");
  assert.equal(units.mmPerUnit, 25.4);

  const bbox = DxfInfo.computeBBox(dxf);
  assert.deepEqual(
    [bbox.minX, bbox.minY, bbox.maxX, bbox.maxY], [0, 0, 100, 75]);

  assert.deepEqual(DxfInfo.getLayers(dxf), [
    { name: "LayerA", count: 1 },
    { name: "LayerB", count: 1 },
  ]);
  assert.deepEqual(DxfInfo.getEntityCounts(dxf), { LINE: 1, CIRCLE: 1 });

  const snaps = DxfInfo.getSnapPoints(dxf);
  assert.equal(snaps.length, 4); // 2 line endpoints + midpoint + circle centre
  assert.ok(snaps.some((p) => p.kind === "midpoint" && p.x === 50 && p.y === 0));
  assert.ok(snaps.some((p) => p.kind === "center" && p.x === 50 && p.y === 50));

  assert.deepEqual(DxfInfo.getUnsupported(dxf), {});
});

test("generator gear DXF: bbox is the 44 mm tip circle", () => {
  const dxf = parseText(fs.readFileSync(path.join(EXAMPLES, "gear_m2_z20.dxf"), "utf8"));
  const bbox = DxfInfo.computeBBox(dxf);
  assert.ok(Math.abs(bbox.width - 44) < 0.01, `width ${bbox.width}`);
  assert.ok(Math.abs(bbox.height - 44) < 0.01, `height ${bbox.height}`);
  const counts = DxfInfo.getEntityCounts(dxf);
  assert.ok(counts.LWPOLYLINE >= 1);
  assert.ok(DxfInfo.getSnapPoints(dxf).length > 100);
  assert.deepEqual(DxfInfo.getUnsupported(dxf), {});
});

test("generator box DXF: 610 x 80 layout, 6 panels", () => {
  const dxf = parseText(fs.readFileSync(path.join(EXAMPLES, "box_100x80x60_t3.dxf"), "utf8"));
  const bbox = DxfInfo.computeBBox(dxf);
  assert.ok(Math.abs(bbox.width - 610) < 0.01, `width ${bbox.width}`);
  assert.ok(Math.abs(bbox.height - 80) < 0.01, `height ${bbox.height}`);
});

test("generator bracket DXF: 60 x 40 with 4 circles", () => {
  const dxf = parseText(fs.readFileSync(path.join(EXAMPLES, "bracket_60x40.dxf"), "utf8"));
  const bbox = DxfInfo.computeBBox(dxf);
  assert.ok(Math.abs(bbox.width - 60) < 0.01, `width ${bbox.width}`);
  assert.ok(Math.abs(bbox.height - 40) < 0.01, `height ${bbox.height}`);
  assert.equal(DxfInfo.getEntityCounts(dxf).CIRCLE, 4);
});

test("generator files are unitless ($INSUNITS unset) — honest warning case", () => {
  for (const name of ["gear_m2_z20.dxf", "box_100x80x60_t3.dxf", "bracket_60x40.dxf"]) {
    const dxf = parseText(fs.readFileSync(path.join(EXAMPLES, name), "utf8"));
    assert.equal(DxfInfo.getUnits(dxf).code, 0, name);
  }
});

test("binary DXF sentinel is detected", () => {
  const head = Buffer.from("AutoCAD Binary DXF", "ascii");
  const bytes = new Uint8Array(64);
  bytes.set(head, 0);
  assert.equal(DxfInfo.isBinaryDxf(bytes), true);
  const text = new TextEncoder().encode("  0\nSECTION\n");
  assert.equal(DxfInfo.isBinaryDxf(text), false);
});

test("formatSize never repeats the same value twice", () => {
  // Unitless file assumed in mm (the gear case): was "44 mm · 44 mm · 1.73 in".
  assert.equal(DxfInfo.formatSize(44, null, null, "mm"), "44 mm  ·  1.73 in");
  // A file actually in mm: same output, no duplicate.
  assert.equal(DxfInfo.formatSize(44, 1, "mm", "mm"), "44 mm  ·  1.73 in");
  // Inch file: the inch conversion would repeat the file value, so it is dropped.
  assert.equal(DxfInfo.formatSize(10, 25.4, "in", "mm"), "10 in  ·  254 mm");
  // Centimetre file: all three values differ, all three are shown.
  assert.equal(DxfInfo.formatSize(10, 10, "cm", "mm"), "10 cm  ·  100 mm  ·  3.94 in");
  // Unitless file with the inch assumption.
  assert.equal(DxfInfo.formatSize(44, null, null, "in"), "44 in  ·  1117.6 mm");
});
