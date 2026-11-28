/* Maker File Previewer — pure STL numbers.
   Works on the flat xyz position array of a parsed STL (what
   three.js STLLoader returns as BufferGeometry position attribute):
   9 numbers per triangle, in order.
   Written so the SAME file runs in the browser and in Node for tests
   (UMD-style, no browser globals).
*/

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.StlOps = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  function triangleCount(positions) {
    return Math.floor(positions.length / 9);
  }

  function computeBBox(positions) {
    if (!positions || positions.length < 3) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i + 2 < positions.length; i += 3) {
      const x = positions[i], y = positions[i + 1], z = positions[i + 2];
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
      size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    };
  }

  /** Volume of a closed mesh: sum of signed tetrahedron volumes
   *  (origin, v0, v1, v2) over all triangles, absolute value. */
  function computeVolume(positions) {
    let sum = 0;
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
      const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
      const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
      sum += (ax * (by * cz - bz * cy)
            - ay * (bx * cz - bz * cx)
            + az * (bx * cy - by * cx)) / 6;
    }
    return Math.abs(sum);
  }

  /** Reinterpret a size measured in file units as millimetres/inches,
   *  given the file-unit-to-mm factor (null when the file is unitless
   *  and the user has not chosen a unit yet). */
  function convertSize(size, mmPerUnit) {
    if (mmPerUnit === null || mmPerUnit === undefined) return null;
    const mm = size * mmPerUnit;
    return { mm, inches: mm / 25.4 };
  }

  /** Surface area: sum of 0.5 * |(b-a) x (c-a)| over all triangles. */
  function computeSurfaceArea(positions) {
    let area = 0;
    for (let i = 0; i + 8 < positions.length; i += 9) {
      const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
      const ux = positions[i + 3] - ax, uy = positions[i + 4] - ay, uz = positions[i + 5] - az;
      const vx = positions[i + 6] - ax, vy = positions[i + 7] - ay, vz = positions[i + 8] - az;
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      area += 0.5 * Math.hypot(cx, cy, cz);
    }
    return area;
  }

  /** Watertight / manifold check: in a closed mesh every edge is shared
   *  by exactly two triangles. An edge used once is open (a hole); an
   *  edge used more than twice is non-manifold. The volume of a mesh
   *  with open edges is not a real volume, so the viewer reports this
   *  instead of silently showing a plausible-looking number.
   *  Meshes over maxTriangles (default 200,000) are skipped — the edge
   *  map costs memory in proportion to the triangle count — and report
   *  checked: false rather than a guess. */
  function checkManifold(positions, maxTriangles) {
    const tris = triangleCount(positions);
    const limit = typeof maxTriangles === "number" ? maxTriangles : 200000;
    if (tris > limit) return { checked: false, openEdges: 0, nonManifoldEdges: 0 };
    const counts = new Map();
    const edge = (ax, ay, az, bx, by, bz) => {
      // Vertices shared between triangles carry identical float32
      // values, so identical coordinates stringify identically.
      const ka = ax + "," + ay + "," + az;
      const kb = bx + "," + by + "," + bz;
      const k = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      counts.set(k, (counts.get(k) || 0) + 1);
    };
    for (let i = 0; i + 8 < positions.length; i += 9) {
      edge(positions[i], positions[i + 1], positions[i + 2],
           positions[i + 3], positions[i + 4], positions[i + 5]);
      edge(positions[i + 3], positions[i + 4], positions[i + 5],
           positions[i + 6], positions[i + 7], positions[i + 8]);
      edge(positions[i + 6], positions[i + 7], positions[i + 8],
           positions[i], positions[i + 1], positions[i + 2]);
    }
    let openEdges = 0, nonManifoldEdges = 0;
    counts.forEach((n) => {
      if (n === 1) openEdges++;
      else if (n > 2) nonManifoldEdges++;
    });
    return { checked: true, openEdges, nonManifoldEdges };
  }

  return {
    triangleCount,
    computeBBox,
    computeVolume,
    computeSurfaceArea,
    checkManifold,
    convertSize,
  };
});
