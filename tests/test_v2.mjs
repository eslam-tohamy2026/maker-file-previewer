/* Maker File Previewer — Node tests for the v2 changes.
   Covers the defects fixed in 2.0.0 and the new behaviour: ellipse
   bounding boxes, INSERT block expansion, circle snap radii, ft/m
   units, STL surface area and the watertight check, plus static checks
   that the viewer wires up the new tools (radius, wireframe, Save PNG,
   samples, stashed link errors, theme persistence).
   Run: node --test tests/test_v2.mjs
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import DxfParser from "../viewer/vendor/dxf-viewer/parser/DxfParser.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const require = createRequire(import.meta.url);
const DxfInfo = require("../viewer/dxfinfo.js");
const StlOps = require("../viewer/stlops.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");

function parseText(text) {
  return new DxfParser().parseSync(text);
}

// ---------- ellipse bounding box ----------

test("v2 ellipse bbox: axis-aligned ellipse centred (50,50), 25 x 12.5 radii", () => {
  const dxf = parseText([
    "  0", "SECTION", "  2", "ENTITIES",
    "  0", "ELLIPSE", "  8", "0",
    " 10", "50.0", " 20", "50.0", " 30", "0.0",
    " 11", "25.0", " 21", "0.0", " 31", "0.0",
    " 40", "0.5",
    "  0", "ENDSEC", "  0", "EOF",
  ].join("\n"));
  const bb = DxfInfo.computeBBox(dxf);
  // v1 reported 111.8 x 111.8 here: it subtracted the centre from the
  // major-axis endpoint, which DXF stores RELATIVE to the centre.
  assert.ok(Math.abs(bb.width - 50) < 0.01, `width ${bb.width}`);
  assert.ok(Math.abs(bb.height - 25) < 0.01, `height ${bb.height}`);
  assert.ok(Math.abs(bb.minX - 25) < 0.01 && Math.abs(bb.maxX - 75) < 0.01);
  assert.ok(Math.abs(bb.minY - 37.5) < 0.01 && Math.abs(bb.maxY - 62.5) < 0.01);
});

test("v2 ellipse bbox: rotated major axis (18,24), ratio 0.5", () => {
  const dxf = parseText([
    "  0", "SECTION", "  2", "ENTITIES",
    "  0", "ELLIPSE", "  8", "0",
    " 10", "0.0", " 20", "0.0", " 30", "0.0",
    " 11", "18.0", " 21", "24.0", " 31", "0.0",
    " 40", "0.5",
    "  0", "ENDSEC", "  0", "EOF",
  ].join("\n"));
  const bb = DxfInfo.computeBBox(dxf);
  // Semi-axes a=(18,24) |a|=30, b=(-12,9) |b|=15:
  // extent X = sqrt(18^2+12^2)=21.633, Y = sqrt(24^2+9^2)=25.632.
  assert.ok(Math.abs(bb.width - 2 * Math.sqrt(468)) < 0.01, `width ${bb.width}`);
  assert.ok(Math.abs(bb.height - 2 * Math.sqrt(657)) < 0.01, `height ${bb.height}`);
});

// ---------- INSERT block expansion ----------

test("v2 INSERT bbox expands the block contents (position + scale)", () => {
  const dxf = parseText([
    "  0", "SECTION", "  2", "BLOCKS",
    "  0", "BLOCK", "  2", "HOLE",
    " 10", "0.0", " 20", "0.0", " 30", "0.0",
    "  0", "CIRCLE", "  8", "0",
    " 10", "5.0", " 20", "5.0", " 40", "2.0",
    "  0", "ENDBLK",
    "  0", "ENDSEC",
    "  0", "SECTION", "  2", "ENTITIES",
    "  0", "INSERT", "  8", "0", "  2", "HOLE",
    " 10", "100.0", " 20", "50.0", " 41", "2.0", " 42", "2.0",
    "  0", "ENDSEC", "  0", "EOF",
  ].join("\n"));
  // Block circle spans 3..7 in both axes; inserted at (100,50) x2:
  // 106..114 x 56..64. v1 reported a zero-size box at (100,50).
  const bb = DxfInfo.computeBBox(dxf);
  assert.deepEqual(
    [bb.minX, bb.minY, bb.maxX, bb.maxY].map((v) => Math.round(v * 100) / 100),
    [106, 56, 114, 64],
  );
});

// ---------- snap radii + ft/m units ----------

test("v2 snap points: circle/arc centres carry their radius", () => {
  const dxf = parseText([
    "  0", "SECTION", "  2", "ENTITIES",
    "  0", "CIRCLE", "  8", "0",
    " 10", "10.0", " 20", "10.0", " 40", "12.5",
    "  0", "ARC", "  8", "0",
    " 10", "30.0", " 20", "10.0", " 40", "4.0",
    " 50", "0.0", " 51", "180.0",
    "  0", "ENDSEC", "  0", "EOF",
  ].join("\n"));
  const snaps = DxfInfo.getSnapPoints(dxf);
  const centres = snaps.filter((p) => p.kind === "center");
  assert.equal(centres.length, 2);
  assert.ok(centres.some((p) => p.x === 10 && p.y === 10 && p.radius === 12.5));
  assert.ok(centres.some((p) => p.x === 30 && p.y === 10 && p.radius === 4));
});

test("v2 formatSize: feet and metres as the assumed unit", () => {
  // 10 file units assumed feet: 3048 mm, 120 in.
  assert.equal(DxfInfo.formatSize(10, null, null, "ft"), "10 ft  ·  3048 mm  ·  120 in");
  // 2 file units assumed metres: 2000 mm, 78.74 in.
  assert.equal(DxfInfo.formatSize(2, null, null, "m"), "2 m  ·  2000 mm  ·  78.74 in");
});

test("v2 formatSize: a file already in mm or inches never repeats its own value", () => {
  // Seen in the visual review: "60 millimetres · 60 mm · 2.36 in".
  assert.equal(DxfInfo.formatSize(60, 1, "millimetres", "mm"), "60 millimetres  ·  2.36 in");
  assert.equal(DxfInfo.formatSize(10, 25.4, "inches", "mm"), "10 inches  ·  254 mm");
  assert.equal(DxfInfo.formatSize(10, 304.8, "feet", "mm"), "10 feet  ·  3048 mm  ·  120 in");
});

// ---------- STL surface area + watertight check ----------

// 12 outward-wound triangles of a 10 x 20 x 30 box (origin corner).
const BOX_TRIS = [
  [[0, 0, 0], [10, 20, 0], [10, 0, 0]], [[0, 0, 0], [0, 20, 0], [10, 20, 0]],
  [[0, 0, 30], [10, 0, 30], [10, 20, 30]], [[0, 0, 30], [10, 20, 30], [0, 20, 30]],
  [[0, 0, 0], [10, 0, 0], [10, 0, 30]], [[0, 0, 0], [10, 0, 30], [0, 0, 30]],
  [[0, 20, 0], [10, 20, 30], [10, 20, 0]], [[0, 20, 0], [0, 20, 30], [10, 20, 30]],
  [[0, 0, 0], [0, 0, 30], [0, 20, 30]], [[0, 0, 0], [0, 20, 30], [0, 20, 0]],
  [[10, 0, 0], [10, 20, 0], [10, 20, 30]], [[10, 0, 0], [10, 20, 30], [10, 0, 30]],
];

function normalOf(tri) {
  const [a, b, c] = tri;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const len = Math.hypot(...n) || 1;
  return n.map((x) => x / len);
}

function boxBinaryStl(tris) {
  const buf = new ArrayBuffer(84 + 4 + tris.length * 50);
  const view = new DataView(buf);
  view.setUint32(80, tris.length, true);
  let off = 84;
  for (const tri of tris) {
    const n = normalOf(tri);
    n.forEach((x) => { view.setFloat32(off, x, true); off += 4; });
    for (const v of tri) {
      v.forEach((x) => { view.setFloat32(off, x, true); off += 4; });
    }
    view.setUint16(off, 0, true);
    off += 2;
  }
  return buf;
}

function positionsOf(tris) {
  return new STLLoader().parse(boxBinaryStl(tris)).getAttribute("position").array;
}

test("v2 STL surface area: 10x20x30 box is 2200", () => {
  const area = StlOps.computeSurfaceArea(positionsOf(BOX_TRIS));
  assert.ok(Math.abs(area - 2200) < 1, `area ${area}`);
});

test("v2 watertight check: closed box has no open or non-manifold edges", () => {
  assert.deepEqual(StlOps.checkManifold(positionsOf(BOX_TRIS)), {
    checked: true, openEdges: 0, nonManifoldEdges: 0,
  });
});

test("v2 watertight check: box missing one face has 3 open edges", () => {
  const open = StlOps.checkManifold(positionsOf(BOX_TRIS.slice(1)));
  assert.equal(open.checked, true);
  assert.equal(open.openEdges, 3);
  assert.equal(open.nonManifoldEdges, 0);
});

test("v2 watertight check: a duplicated triangle is non-manifold", () => {
  const dup = StlOps.checkManifold(positionsOf([...BOX_TRIS, BOX_TRIS[0]]));
  assert.equal(dup.checked, true);
  assert.equal(dup.openEdges, 0);
  assert.equal(dup.nonManifoldEdges, 3);
});

test("v2 watertight check: meshes over the limit report checked:false", () => {
  assert.deepEqual(StlOps.checkManifold(positionsOf(BOX_TRIS), 5), {
    checked: false, openEdges: 0, nonManifoldEdges: 0,
  });
});

// ---------- viewer wiring (static: the browser-only parts) ----------

test("v2 viewer wires up radius, wireframe, Save PNG, samples and stashed errors", () => {
  const src = fs.readFileSync(path.join(ROOT, "viewer", "viewer.js"), "utf8");
  // Radius tool: mode state, button, keyboard shortcut, circle lookup.
  assert.match(src, /measureMode: "distance"/);
  assert.match(src, /function onRadiusClick\(scenePoint\)/);
  assert.match(src, /radiusBtn\.addEventListener\("click"/);
  assert.match(src, /state\.measureMode === "radius"\) onRadiusClick\(scenePt\)/);
  // Snap points keep the circle radius through the origin shift — the
  // first version of this map dropped it, so the radius tool found no
  // circle to measure.
  assert.match(src, /x: p\.x - origin\.x, y: p\.y - origin\.y, kind: p\.kind, radius: p\.radius/);
  // Measure readout keeps the deltas (v1 computed them, then dropped them).
  assert.match(src, /state\.measureText = measureText\(res\)/);
  assert.match(src, /ΔX \$\{fmt\(res\.dx\)\}  ·  ΔY \$\{fmt\(res\.dy\)\}/);
  assert.match(src, /ΔZ \$\{fmt\(res\.dz\)\}/);
  // STL snap threshold cached at load, not recomputed per mouse move.
  assert.match(src, /stl\.snapThreshold = Math\.hypot\(bbox\.size\.x, bbox\.size\.y, bbox\.size\.z\) \* 0\.02/);
  assert.match(src, /const threshold = state\.stl\.snapThreshold \|\| 0;/);
  // Wireframe toggle and Save PNG (render + capture in the same task).
  assert.match(src, /wireframeBtn\.addEventListener\("click"/);
  assert.match(src, /mat\.wireframe = !mat\.wireframe/);
  assert.match(src, /savePngBtn\.addEventListener\("click"/);
  assert.match(src, /state\.dxfViewer\.Render\(\);/);
  // Built-in samples.
  assert.match(src, /samples\/sample-bracket\.dxf/);
  assert.match(src, /samples\/sample-box\.stl/);
  // Link-preview errors stashed in session storage, read back on startup.
  assert.match(src, /sessionGet\("pendingError"\)/);
  assert.match(src, /function showPreviewError\(kind\)/);
  // Theme choice persists like the unit choice does.
  assert.match(src, /storeSet\(\{ darkBg: state\.darkBg \}\)/);
  assert.match(src, /storeGet\(\{ assumedUnit: "mm", darkBg: true \}\)/);
  // Fit must subtract the scene origin: GetBounds() is in drawing
  // coordinates while FitView takes scene coordinates, so Fit (and F)
  // shifted the drawing whenever the first vertex was not at (0,0).
  assert.match(src, /state\.dxfViewer\.FitView\(b\.minX - o\.x, b\.maxX - o\.x, b\.minY - o\.y, b\.maxY - o\.y\)/);
  // Empty files and triangle-less STLs get a plain message, not a crash.
  assert.match(src, /This file is empty \(0 bytes\)/);
  assert.match(src, /This STL has no triangles/);
  // Volume in cm³ converts from the assumed unit (v1 divided by 1000
  // unconditionally, which is only right for millimetres).
  assert.match(src, /volume \* mmPerUnit \* mmPerUnit \* mmPerUnit \/ 1000/);
  // Units warning names the current assumption, not always millimetres.
  assert.match(src, /Assuming \$\{UNIT_NAMES\[state\.assumedUnit\]\}/);
  // File size shown in the info panel for both formats.
  assert.match(src, /\["File size", formatBytes\(bytes\.length\)\]/);
  assert.match(src, /\["File size", formatBytes\(state\.fileBytes\)\]/);
  // Watertight verdict and surface area in the STL info panel.
  assert.match(src, /\["Surface area", areaParts\.join\("  ·  "\)\]/);
  assert.match(src, /\["Watertight", watertightText\]/);
});

test("v2 background worker stashes link-preview errors for the viewer", () => {
  const src = fs.readFileSync(path.join(ROOT, "background.js"), "utf8");
  assert.match(src, /function stashError\(kind\)/);
  assert.match(src, /chrome\.storage\.session\.set\(\{ pendingError: \{ kind, at: Date\.now\(\) \} \}\)/);
  assert.match(src, /sendError\(tab\.id, "permission-declined", url\)/);
  assert.match(src, /sendError\(tab\.id, "fetch-failed", url\)/);
  assert.match(src, /sendError\(tab\.id, "too-big-for-link", url\)/);
});

test("v2 viewer HTML has the new controls and the ft/m unit options", () => {
  const html = fs.readFileSync(path.join(ROOT, "viewer", "index.html"), "utf8");
  assert.match(html, /id="radius"/);
  assert.match(html, /id="wireframe"/);
  assert.match(html, /id="save-png"/);
  assert.match(html, /id="sample-dxf"/);
  assert.match(html, /id="sample-stl"/);
  assert.match(html, /<option value="ft">feet<\/option>/);
  assert.match(html, /<option value="m">metre<\/option>/);
});

test("v2 visual-review fixes: [hidden] beats author display rules, STL grid fits the part", () => {
  const css = fs.readFileSync(path.join(ROOT, "viewer", "styles.css"), "utf8");
  // .view-buttons sets display:flex, which beat the UA [hidden] rule and
  // left the STL Top/Front/Side buttons visible on DXF files.
  assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  const viewer = fs.readFileSync(path.join(ROOT, "viewer", "viewer.js"), "utf8");
  // The old fixed 100 mm grid (at least 1x) dwarfed small parts.
  assert.match(viewer, /grid\.scale\.setScalar\(Math\.max\(0\.4, maxSize \/ 25\)\)/);
  assert.doesNotMatch(viewer, /grid\.scale\.setScalar\(Math\.max\(1, maxSize \/ 10\)\)/);
});

test("v2 samples ship and parse: bracket DXF + ASCII box STL", () => {
  const dxf = parseText(fs.readFileSync(path.join(ROOT, "viewer", "samples", "sample-bracket.dxf"), "utf8"));
  const bb = DxfInfo.computeBBox(dxf);
  assert.ok(Math.abs(bb.width - 60) < 0.01, `bracket width ${bb.width}`);
  assert.ok(Math.abs(bb.height - 40) < 0.01, `bracket height ${bb.height}`);
  const pos = new STLLoader().parse(
    fs.readFileSync(path.join(ROOT, "viewer", "samples", "sample-box.stl")).buffer,
  ).getAttribute("position").array;
  assert.equal(StlOps.triangleCount(pos), 12);
  assert.ok(Math.abs(StlOps.computeVolume(pos) - 6000) < 6);
  assert.deepEqual(StlOps.checkManifold(pos), { checked: true, openEdges: 0, nonManifoldEdges: 0 });
});

test("v2 manifest and package agree on the new version", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(manifest.version, "2.0.0");
  assert.equal(pkg.version, "2.0.0");
});
