/* Maker File Previewer — Node tests for viewer/stlops.js.
   Builds a 10 x 20 x 30 mm box as binary and ASCII STL, parses both
   with the REAL three.js STLLoader, and checks the pure numbers.
   Run: node --test tests/test_stlops.mjs
*/

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

const require = createRequire(import.meta.url);
const StlOps = require("../viewer/stlops.js");

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

function boxBinaryStl() {
  const buf = new ArrayBuffer(84 + 4 + BOX_TRIS.length * 50);
  const view = new DataView(buf);
  view.setUint32(80, BOX_TRIS.length, true);
  let off = 84;
  for (const tri of BOX_TRIS) {
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

function boxAsciiStl() {
  const lines = ["solid box"];
  for (const tri of BOX_TRIS) {
    const n = normalOf(tri);
    lines.push(` facet normal ${n[0]} ${n[1]} ${n[2]}`);
    lines.push("  outer loop");
    for (const v of tri) lines.push(`   vertex ${v[0]} ${v[1]} ${v[2]}`);
    lines.push("  endloop");
    lines.push(" endfacet");
  }
  lines.push("endsolid box");
  return new TextEncoder().encode(lines.join("\n")).buffer;
}

function positionsOf(geometry) {
  return geometry.getAttribute("position").array;
}

test("binary STL box: 12 triangles, 10x20x30, volume 6000", () => {
  const geometry = new STLLoader().parse(boxBinaryStl());
  const pos = positionsOf(geometry);
  assert.equal(StlOps.triangleCount(pos), 12);
  const bbox = StlOps.computeBBox(pos);
  assert.deepEqual([bbox.size.x, bbox.size.y, bbox.size.z], [10, 20, 30]);
  const volume = StlOps.computeVolume(pos);
  assert.ok(Math.abs(volume - 6000) < 6, `volume ${volume}`);
});

test("ASCII STL box: same numbers", () => {
  const geometry = new STLLoader().parse(boxAsciiStl());
  const pos = positionsOf(geometry);
  assert.equal(StlOps.triangleCount(pos), 12);
  const bbox = StlOps.computeBBox(pos);
  assert.deepEqual([bbox.size.x, bbox.size.y, bbox.size.z], [10, 20, 30]);
  assert.ok(Math.abs(StlOps.computeVolume(pos) - 6000) < 6);
});

test("unit reinterpretation: 10 file units at 25.4 mm/unit = 254 mm", () => {
  const out = StlOps.convertSize(10, 25.4);
  assert.equal(out.mm, 254);
  assert.equal(out.inches, 10);
  assert.equal(StlOps.convertSize(10, null), null);
});
