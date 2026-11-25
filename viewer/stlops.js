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

  return {
    triangleCount,
    computeBBox,
    computeVolume,
    convertSize,
  };
});
