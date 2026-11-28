/* Maker File Previewer — pure DXF model functions.
   Works on the parsed model the dxf-parser (vendored inside dxf-viewer)
   returns: { header, tables, blocks, entities }.
   Written so the SAME file runs in the browser and in Node for tests
   (UMD-style, no browser globals).
*/

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.DxfInfo = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  // $INSUNITS codes (AutoCAD): 0 = unitless, 1 = inches, 4 = mm, 5 = cm.
  const INSUNITS_NAMES = {
    0: "unitless", 1: "inches", 2: "feet", 3: "miles", 4: "millimetres",
    5: "centimetres", 6: "metres", 7: "kilometres", 8: "microinches",
    9: "mils", 10: "yards", 11: "angstroms", 12: "nanometres",
    13: "microns", 14: "decimetres", 15: "decametres", 16: "hectometres",
    17: "gigametres", 18: "astronomical units", 19: "light years",
    20: "parsecs", 21: "US survey feet", 22: "US survey inches",
    23: "US survey yards", 24: "US survey miles",
  };
  // Millimetres in one file unit (null when unitless/unknown).
  const MM_PER_UNIT = {
    1: 25.4, 2: 304.8, 3: 1609344, 4: 1, 5: 10, 6: 1000, 7: 1000000,
    8: 0.0000254, 9: 0.0254, 10: 914.4, 11: 1e-7, 12: 1e-6, 13: 0.001,
    14: 100, 15: 10000, 16: 100000, 17: 1e12, 18: 149597870700000,
    19: 9460730472580800000, 20: 30856775814913670000,
    21: 304.8006096012192, 22: 25.4000508001016, 23: 914.4018288036576,
    24: 1609347.2186944378,
  };
  // Entity types the viewer draws (dxf-viewer); anything else is listed
  // as "not drawn" in the info panel instead of failing silently.
  const DRAWN_TYPES = new Set([
    "LINE", "LWPOLYLINE", "POLYLINE", "CIRCLE", "ARC", "ELLIPSE",
    "SPLINE", "POINT", "TEXT", "MTEXT", "SOLID", "3DFACE", "HATCH",
    "INSERT", "DIMENSION",
  ]);

  function getUnits(dxf) {
    const raw = dxf && dxf.header ? dxf.header.$INSUNITS : undefined;
    const code = typeof raw === "number" && INSUNITS_NAMES[raw] ? raw : 0;
    return {
      code,
      name: INSUNITS_NAMES[code],
      mmPerUnit: code === 0 ? null : MM_PER_UNIT[code],
    };
  }

  function entitiesOf(dxf) {
    return (dxf && Array.isArray(dxf.entities)) ? dxf.entities : [];
  }

  function pt(p) {
    return p ? { x: p.x || 0, y: p.y || 0 } : null;
  }

  /** Points that bound one entity (2D). Circles/arcs contribute their
   *  full extent (centre ± radius); splines their control points.
   *  `dxf` is the parsed document (needed to resolve INSERT blocks) and
   *  `depth` caps nested-block recursion. */
  function entityExtentPoints(e, dxf, depth) {
    const out = [];
    if (!e || !e.type) return out;
    switch (e.type) {
      case "LINE":
        (e.vertices || []).forEach((v) => { const p = pt(v); if (p) out.push(p); });
        break;
      case "LWPOLYLINE":
      case "POLYLINE":
        (e.vertices || []).forEach((v) => { const p = pt(v); if (p) out.push(p); });
        break;
      case "CIRCLE": {
        const c = pt(e.center);
        if (c) {
          const r = e.radius || 0;
          out.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
        }
        break;
      }
      case "ARC": {
        const c = pt(e.center);
        if (c) {
          const r = e.radius || 0;
          out.push({ x: c.x - r, y: c.y - r }, { x: c.x + r, y: c.y + r });
        }
        break;
      }
      case "ELLIPSE": {
        const c = pt(e.center);
        if (c) {
          // Group code 11 is the major-axis endpoint RELATIVE to the
          // centre — not an absolute point. The semi-major length is
          // |major| and the semi-minor length is |major| * axisRatio.
          // For a rotated ellipse with semi-axis vectors a and b, the
          // axis-aligned extent is sqrt(ax^2 + bx^2) in X and
          // sqrt(ay^2 + by^2) in Y. (A partial ellipse still uses its
          // full extent, same as ARC below — a safe overestimate.)
          const m = pt(e.majorAxisEndPoint) || { x: 0, y: 0 };
          const aLen = Math.hypot(m.x, m.y);
          const ratio = typeof e.axisRatio === "number" ? e.axisRatio : 1;
          const bLen = aLen * ratio;
          const ux = aLen ? m.x / aLen : 1;
          const uy = aLen ? m.y / aLen : 0;
          const bx = -uy * bLen, by = ux * bLen; // minor axis, perpendicular
          const ex = Math.hypot(m.x, bx), ey = Math.hypot(m.y, by);
          out.push({ x: c.x - ex, y: c.y - ey }, { x: c.x + ex, y: c.y + ey });
        }
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const p = pt(e.startPoint);
        if (p) out.push(p);
        break;
      }
      case "POINT": {
        const p = pt(e.position);
        if (p) out.push(p);
        break;
      }
      case "SPLINE":
        (e.controlPoints || []).forEach((v) => { const p = pt(v); if (p) out.push(p); });
        break;
      case "INSERT": {
        const p = pt(e.position);
        if (!p) break;
        // Expand by the block's own geometry (translated by the insert
        // point and scaled), instead of counting only the insertion
        // point — a drawing made of blocks otherwise reports a near-zero
        // size. Rotation is ignored: the fallback box is axis-aligned
        // anyway, and the viewer's own bounds (used first) are exact.
        // Recursion is capped so a self-referencing block cannot loop.
        const block = dxf && dxf.blocks ? dxf.blocks[e.name] : null;
        const blockEnts = block && Array.isArray(block.entities) ? block.entities : null;
        if (!blockEnts || !blockEnts.length || (depth || 0) >= 3) {
          out.push(p);
          break;
        }
        const base = block.basePoint ? pt(block.basePoint) : { x: 0, y: 0 };
        const sx = typeof e.xScale === "number" ? e.xScale : 1;
        const sy = typeof e.yScale === "number" ? e.yScale : 1;
        blockEnts.forEach((be) => {
          entityExtentPoints(be, dxf, (depth || 0) + 1).forEach((bp) => {
            out.push({ x: p.x + (bp.x - base.x) * sx, y: p.y + (bp.y - base.y) * sy });
          });
        });
        break;
      }
      case "SOLID":
      case "3DFACE":
        (e.vertices || []).forEach((v) => { const p = pt(v); if (p) out.push(p); });
        break;
      default:
        break;
    }
    return out;
  }

  function computeBBox(dxf) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    entitiesOf(dxf).forEach((e) => {
      entityExtentPoints(e, dxf, 0).forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    });
    if (!isFinite(minX)) return null;
    return {
      minX, minY, maxX, maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  function getLayers(dxf) {
    const counts = {};
    entitiesOf(dxf).forEach((e) => {
      const name = e.layer || "0";
      counts[name] = (counts[name] || 0) + 1;
    });
    const defined = dxf && dxf.tables && dxf.tables.layers
      ? Object.keys(dxf.tables.layers) : [];
    const names = [...new Set([...defined, ...Object.keys(counts)])];
    return names.sort().map((name) => ({
      name,
      count: counts[name] || 0,
    }));
  }

  function getEntityCounts(dxf) {
    const counts = {};
    entitiesOf(dxf).forEach((e) => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }

  /** Snap points for measure: endpoints, vertices, centres, midpoints.
   *  Circle/arc centres also carry their radius, so the radius tool can
   *  report R and Ø from the same point. */
  function getSnapPoints(dxf) {
    const points = [];
    const push = (p, kind, extra) => {
      if (p) points.push({ x: p.x, y: p.y, kind, ...(extra || {}) });
    };
    entitiesOf(dxf).forEach((e) => {
      if (!e || !e.type) return;
      switch (e.type) {
        case "LINE": {
          const vs = (e.vertices || []).map(pt).filter(Boolean);
          vs.forEach((p) => push(p, "endpoint"));
          if (vs.length === 2) {
            push({ x: (vs[0].x + vs[1].x) / 2, y: (vs[0].y + vs[1].y) / 2 }, "midpoint");
          }
          break;
        }
        case "LWPOLYLINE":
        case "POLYLINE": {
          const vs = (e.vertices || []).map(pt).filter(Boolean);
          vs.forEach((p) => push(p, "vertex"));
          for (let i = 0; i + 1 < vs.length; i++) {
            push({ x: (vs[i].x + vs[i + 1].x) / 2, y: (vs[i].y + vs[i + 1].y) / 2 }, "midpoint");
          }
          break;
        }
        case "CIRCLE":
        case "ARC":
          push(pt(e.center), "center", { radius: e.radius || 0 });
          break;
        case "ELLIPSE":
          push(pt(e.center), "center");
          break;
        case "POINT":
          push(pt(e.position), "endpoint");
          break;
        case "TEXT":
        case "MTEXT":
          push(pt(e.startPoint), "endpoint");
          break;
        case "SPLINE":
          (e.controlPoints || []).forEach((v) => push(pt(v), "vertex"));
          break;
        default:
          break;
      }
    });
    return points;
  }

  function getUnsupported(dxf) {
    const found = {};
    entitiesOf(dxf).forEach((e) => {
      if (e.type && !DRAWN_TYPES.has(e.type)) found[e.type] = (found[e.type] || 0) + 1;
    });
    return found;
  }

  /** Binary DXF files start with the "AutoCAD Binary DXF" sentinel. */
  function isBinaryDxf(bytes) {
    if (!bytes || bytes.length < 22) return false;
    let head = "";
    for (let i = 0; i < 22; i++) head += String.fromCharCode(bytes[i]);
    return head.indexOf("AutoCAD Binary DXF") === 0;
  }

  function fmt(v) {
    return String(Math.round(v * 100) / 100);
  }

  // Millimetres in one ASSUMED unit, for unitless files (the unit select
  // offers exactly mm / in / cm / ft / m). Note this is keyed by NAME,
  // unlike MM_PER_UNIT above which is keyed by $INSUNITS code.
  const MM_PER_ASSUMED_UNIT = { mm: 1, in: 25.4, cm: 10, ft: 304.8, m: 1000 };

  /** Format one dimension as "file units \u00b7 mm \u00b7 in", dropping any part
   *  that repeats an earlier one \u2014 a unitless file assumed in mm would
   *  otherwise read "44 mm \u00b7 44 mm \u00b7 1.73 in", a millimetre file would
   *  read "60 millimetres \u00b7 60 mm", and an inch file "10 inches \u00b7
   *  10 in". The dedupe is by unit family, not by string: "60 mm" and
   *  "60 millimetres" are the same measurement in different words. */
  function formatSize(valueInFileUnits, mmPerFileUnit, fileUnitsName, assumedUnit) {
    const mm = mmPerFileUnit === null
      ? valueInFileUnits * MM_PER_ASSUMED_UNIT[assumedUnit]
      : valueInFileUnits * mmPerFileUnit;
    const unitName = fileUnitsName || assumedUnit;
    const parts = [`${fmt(valueInFileUnits)} ${unitName}`];
    if (unitName !== "mm" && unitName !== "millimetres") parts.push(`${fmt(mm)} mm`);
    if (unitName !== "in" && unitName !== "inches") parts.push(`${fmt(mm / 25.4)} in`);
    return [...new Set(parts)].join("  \u00b7  ");
  }

  return {
    getUnits,
    computeBBox,
    getLayers,
    getEntityCounts,
    getSnapPoints,
    getUnsupported,
    isBinaryDxf,
    formatSize,
    INSUNITS_NAMES,
    MM_PER_UNIT,
  };
});
