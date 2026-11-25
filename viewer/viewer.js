/* Maker File Previewer — viewer page logic.
   DXF via the vendored dxf-viewer (main-thread parse in v1 — no worker
   indirection to debug under MV3 CSP); STL via three.js STLLoader.
   All processing happens in this tab; nothing is uploaded anywhere.
   The only fetch() in the shipped code is the one below, for a link the
   user right-clicked (or a file:// URL the user asked to preview).
*/

import { DxfViewer } from "dxf-viewer";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DxfInfo = window.DxfInfo;
const StlOps = window.StlOps;

const MAX_DXF_BYTES = 50 * 1024 * 1024;
const MAX_STL_BYTES = 150 * 1024 * 1024;
const ACADVER_NAMES = {
  AC1009: "R11/R12", AC1012: "R13", AC1014: "R14", AC1015: "R2000",
  AC1018: "R2004", AC1021: "R2007", AC1024: "R2010", AC1027: "R2013",
  AC1032: "R2018",
};
const MM_PER_UNIT = { mm: 1, in: 25.4, cm: 10 };

const $ = (id) => document.getElementById(id);
const wrap = $("canvas-wrap");
const dropzone = $("dropzone");
const fileNameEl = $("file-name");
const statusEl = $("status");
const errorEl = $("error");
const infoList = $("info-list");
const unitsWarning = $("units-warning");
const layersSection = $("layers-section");
const layerList = $("layer-list");
const undrawnSection = $("undrawn-section");
const undrawnList = $("undrawn-list");
const fitBtn = $("fit");
const measureBtn = $("measure");
const clearBtn = $("clear");
const themeBtn = $("theme");
const unitSelect = $("unit-select");
const stlViews = $("stl-views");
const measureOverlay = $("measure-overlay");
const measureSvg = $("measure-svg");
const measureLabel = $("measure-label");

const state = {
  kind: null, // "dxf" | "stl"
  fileName: "",
  dxfViewer: null,
  dxfModel: null,
  snapPoints: [], // scene coords (DXF) or three coords (STL)
  stl: null, // { geometry, mesh, renderer, camera, controls, positions }
  measuring: false,
  measurePoints: [],
  assumedUnit: "mm",
  darkBg: true,
  mmPerFileUnit: null, // null when unitless (assumed unit applies)
  fileUnitsName: null,
};

// ---------- small helpers ----------
function setStatus(text) { statusEl.textContent = text; }
function setError(text) { errorEl.textContent = text || ""; }
function showError(text) { setError(text); }

function fmt(n, digits = 2) {
  if (!isFinite(n)) return "—";
  return Number(n).toFixed(digits).replace(/\.00$/, "");
}

function storeGet(keys) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(keys, resolve);
      } else resolve({});
    } catch (e) { resolve({}); }
  });
}
function storeSet(obj) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(obj);
    }
  } catch (e) { /* storage is a preference, never a failure */ }
}
function sessionGet(key) {
  return new Promise((resolve) => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
        chrome.storage.session.get(key, (r) => resolve(r[key]));
      } else resolve(null);
    } catch (e) { resolve(null); }
  });
}
function sessionRemove(key) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.session) {
      chrome.storage.session.remove(key);
    }
  } catch (e) { /* ignore */ }
}
function onMessage(fn) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(fn);
    }
  } catch (e) { /* running as a plain web page */ }
}

// Sizes: show file units, mm and inches — never silently reinterpret.
function sizeText(valueInFileUnits) {
  const mm = state.mmPerFileUnit === null
    ? valueInFileUnits * MM_PER_UNIT[state.assumedUnit]
    : valueInFileUnits * state.mmPerFileUnit;
  const unitName = state.fileUnitsName || state.assumedUnit;
  return `${fmt(valueInFileUnits)} ${unitName}  ·  ${fmt(mm)} mm  ·  ${fmt(mm / 25.4)} in`;
}

function setInfoRows(rows) {
  infoList.innerHTML = "";
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    infoList.append(dt, dd);
  });
}

function renderLayers(layers) {
  layerList.innerHTML = "";
  layersSection.hidden = layers.length === 0;
  layers.forEach((layer) => {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "layer-swatch";
    swatch.style.background = layer.color;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = layer.visible !== false;
    box.title = layer.visible !== false ? "Hide layer" : "Show layer";
    box.addEventListener("change", () => {
      if (state.dxfViewer) state.dxfViewer.ShowLayer(layer.name, box.checked);
      box.title = box.checked ? "Hide layer" : "Show layer";
    });
    const name = document.createElement("span");
    name.className = "layer-name";
    name.textContent = layer.displayName || layer.name;
    const count = document.createElement("span");
    count.className = "layer-count";
    count.textContent = `${layer.count} ent.`;
    li.append(swatch, box, name, count);
    layerList.append(li);
  });
}

function renderUndrawn(unsupported) {
  const names = Object.keys(unsupported);
  undrawnSection.hidden = names.length === 0;
  undrawnList.innerHTML = "";
  names.forEach((type) => {
    const li = document.createElement("li");
    li.textContent = `${type} — ${unsupported[type]} not drawn`;
    undrawnList.append(li);
  });
}

function updateUnitsWarning(isUnitless) {
  unitsWarning.hidden = !isUnitless;
  if (isUnitless) {
    unitSelect.disabled = false;
    unitSelect.title = "This file has no units — pick what one file unit means";
  } else {
    unitSelect.disabled = true;
    unitSelect.title = "Units come from the file ($INSUNITS)";
  }
}

function setFileLoaded(name) {
  state.fileName = name;
  fileNameEl.textContent = name;
  wrap.classList.add("has-file");
  fitBtn.disabled = false;
  measureBtn.disabled = false;
  clearBtn.disabled = false;
  setError("");
}

// ---------- measure overlay (SVG, screen-space — same for DXF and STL) ----------
function clearMeasureOverlay() {
  measureSvg.innerHTML = "";
  measureLabel.hidden = true;
  state.measurePoints = [];
}
function drawMeasure(points, livePoint) {
  measureSvg.innerHTML = "";
  const all = livePoint ? [...points, livePoint] : points;
  all.forEach((p) => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", 5);
    c.setAttribute("fill", "#2563eb"); c.setAttribute("stroke", "#fff"); c.setAttribute("stroke-width", 2);
    measureSvg.append(c);
  });
  if (all.length >= 2) {
    const [a, b] = all;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.x); line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x); line.setAttribute("y2", b.y);
    line.setAttribute("stroke", "#2563eb"); line.setAttribute("stroke-width", 2);
    measureSvg.append(line);
  }
  if (points.length === 2) {
    const d = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    measureLabel.style.left = `${mid.x}px`;
    measureLabel.style.top = `${mid.y}px`;
    measureLabel.textContent = state.measureText || "";
    measureLabel.hidden = false;
  } else {
    measureLabel.hidden = true;
  }
}

// ---------- DXF ----------
function ensureDxfViewer() {
  if (!state.dxfViewer) {
    // retainParsedDxf: true is REQUIRED — without it DxfViewer.Load
    // returns dxf: undefined and GetDxf() is null, so every use of the
    // parsed model (units, version, layers, snap points) throws.
    // autoResize: true is REQUIRED — the default is a fixed 400x300
    // canvas, which renders the drawing as a small patch in the corner.
    state.dxfViewer = new DxfViewer(wrap, { retainParsedDxf: true, autoResize: true });
  }
  return state.dxfViewer;
}

async function loadDxf(name, bytes) {
  if (DxfInfo.isBinaryDxf(bytes)) {
    throw new Error("This is a binary DXF file, which v1 cannot preview. Save it as ASCII DXF in your CAD program and try again.");
  }
  const viewer = ensureDxfViewer();
  if (state.stl && state.stl.renderer) state.stl.renderer.domElement.style.display = "none";
  const text = new TextDecoder("utf-8").decode(bytes);
  const blobUrl = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  try {
    setStatus(`Parsing ${name}…`);
    await viewer.Load({
      url: blobUrl,
      progressCbk: (phase, done, total) => {
        if (total) setStatus(`Loading ${name}… ${Math.round((done / total) * 100)}%`);
      },
    });
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  const dxf = viewer.GetDxf();
  state.kind = "dxf";
  state.dxfModel = dxf;
  const units = DxfInfo.getUnits(dxf);
  state.mmPerFileUnit = units.mmPerUnit;
  state.fileUnitsName = units.code === 0 ? null : units.name;
  if (units.code !== 0) unitSelect.value = units.code === 1 ? "in" : units.code === 5 ? "cm" : "mm";
  const bounds = viewer.GetBounds() || DxfInfo.computeBBox(dxf);
  const counts = DxfInfo.getEntityCounts(dxf);
  const totalEntities = Object.values(counts).reduce((a, b) => a + b, 0);
  const origin = viewer.GetOrigin() || { x: 0, y: 0 };
  state.snapPoints = DxfInfo.getSnapPoints(dxf).map((p) => ({
    x: p.x - origin.x, y: p.y - origin.y, kind: p.kind,
  }));
  const version = dxf.header && dxf.header.$ACADVER
    ? `${ACADVER_NAMES[dxf.header.$ACADVER] || dxf.header.$ACADVER} (${dxf.header.$ACADVER})`
    : "unknown";
  const layers = viewer.GetLayers(true).map((l) => ({
    ...l,
    count: (DxfInfo.getLayers(dxf).find((x) => x.name === l.name) || { count: 0 }).count,
  }));

  setInfoRows([
    ["Format", `DXF ${version}`],
    ["Units", units.code === 0 ? "none (unitless)" : `${units.name} ($INSUNITS = ${units.code})`],
    ["Size", bounds ? sizeText(bounds.maxX - bounds.minX) + "  ×  " + sizeText(bounds.maxY - bounds.minY) : "—"],
    ["Entities", `${totalEntities} (${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ")})`],
  ]);
  renderLayers(layers);
  renderUndrawn(DxfInfo.getUnsupported(dxf));
  updateUnitsWarning(units.code === 0);
  stlViews.hidden = true;
  setFileLoaded(name);
  setStatus(`Loaded ${name} — ${totalEntities} entities${bounds ? `, ${fmt(bounds.maxX - bounds.minX)} × ${fmt(bounds.maxY - bounds.minY)} ${state.fileUnitsName || state.assumedUnit}` : ""}.`);
}

// ---------- STL ----------
function ensureStlRenderer() {
  if (state.stl && state.stl.renderer) {
    state.stl.renderer.domElement.style.display = "block";
    return state.stl;
  }
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  renderer.domElement.style.position = "absolute";
  renderer.domElement.style.inset = "0";
  wrap.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe5e7eb);
  const camera = new THREE.PerspectiveCamera(45, wrap.clientWidth / wrap.clientHeight, 0.1, 10000);
  const controls = new OrbitControls(camera, renderer.domElement);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(1, 2, 1.5);
  scene.add(dir);
  const grid = new THREE.GridHelper(100, 20, 0x9ca3af, 0xd1d5db);
  grid.name = "grid";
  scene.add(grid);
  // Assign state.stl BEFORE starting the loop: the loop's guard returns
  // (without scheduling the next frame) while state.stl is unset, so
  // starting it first meant the renderer never painted a single frame.
  state.stl = { renderer, scene, camera, controls, geometry: null, mesh: null, positions: null };
  const animate = () => {
    if (!state.stl || state.stl.renderer !== renderer) return;
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();
  new ResizeObserver(() => {
    if (!state.stl || state.stl.renderer !== renderer) return;
    camera.aspect = wrap.clientWidth / wrap.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  }).observe(wrap);
  return state.stl;
}

function loadStl(name, bytes) {
  const geometry = new STLLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const positions = geometry.getAttribute("position").array;
  const bbox = StlOps.computeBBox(positions);
  const volume = StlOps.computeVolume(positions);
  const tris = StlOps.triangleCount(positions);

  if (state.dxfViewer) {
    const canvas = state.dxfViewer.GetCanvas && state.dxfViewer.GetCanvas();
    if (canvas) canvas.style.display = "none";
  }
  const stl = ensureStlRenderer();
  if (stl.mesh) { stl.scene.remove(stl.mesh); stl.mesh.geometry.dispose(); }
  geometry.rotateX(-Math.PI / 2); // STL Z-up → three.js Y-up
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0x2563eb, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide }),
  );
  stl.scene.add(mesh);
  stl.mesh = mesh;
  stl.geometry = geometry;
  stl.positions = geometry.getAttribute("position").array;

  // Snap points: triangle vertices (strided for huge meshes).
  const verts = stl.positions;
  const stride = Math.max(1, Math.ceil((verts.length / 3) / 20000));
  state.snapPoints = [];
  for (let i = 0; i + 2 < verts.length; i += 3 * stride) {
    state.snapPoints.push({ x: verts[i], y: verts[i + 1], z: verts[i + 2], kind: "vertex" });
  }

  const center = {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.z + bbox.max.z) / 2,
    z: -(bbox.min.y + bbox.max.y) / 2,
  };
  const maxSize = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
  stl.camera.position.set(center.x + maxSize * 1.2, center.y + maxSize * 1.2, center.z + maxSize * 1.2);
  stl.controls.target.set(center.x, center.y, center.z);
  stl.controls.update();
  const grid = stl.scene.getObjectByName("grid");
  if (grid) grid.scale.setScalar(Math.max(1, maxSize / 10));

  state.kind = "stl";
  state.mmPerFileUnit = null; // STL has no units
  state.fileUnitsName = null;
  setInfoRows([
    ["Format", "STL (binary/ASCII)"],
    ["Units", "none — STL files have no units"],
    ["Size", `${sizeText(bbox.size.x)}  ×  ${sizeText(bbox.size.y)}  ×  ${sizeText(bbox.size.z)}`],
    ["Triangles", `${tris}`],
    ["Volume", `${fmt(volume)} ${state.assumedUnit}³  ·  ${fmt(volume / 1000)} cm³`],
  ]);
  renderLayers([]);
  renderUndrawn({});
  updateUnitsWarning(true);
  stlViews.hidden = false;
  setFileLoaded(name);
  setStatus(`Loaded ${name} — ${tris} triangles, ${fmt(bbox.size.x)} × ${fmt(bbox.size.y)} × ${fmt(bbox.size.z)} ${state.assumedUnit}.`);
}

// ---------- file entry ----------
async function openFile(file) {
  const name = file.name || "file";
  const lower = name.toLowerCase();
  const isDxf = lower.endsWith(".dxf");
  const isStl = lower.endsWith(".stl");
  if (!isDxf && !isStl) {
    showError("Only .dxf and .stl files are supported in v1.");
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (isDxf && bytes.length > MAX_DXF_BYTES) {
    showError("This DXF is over 50 MB — too big for v1. Split it or simplify the drawing.");
    return;
  }
  if (isStl && bytes.length > MAX_STL_BYTES) {
    showError("This STL is over 150 MB — too big for v1.");
    return;
  }
  clearMeasure();
  setError("");
  try {
    if (isDxf) await loadDxf(name, bytes);
    else loadStl(name, bytes);
  } catch (err) {
    console.error(err);
    showError(err.message || `Could not preview ${name}. The file may be corrupt or in a format v1 cannot read.`);
    setStatus("Could not preview that file.");
  }
}

// ---------- measure ----------
function setMeasuring(on) {
  state.measuring = on;
  measureBtn.classList.toggle("active", on);
  measureOverlay.hidden = !on && state.measurePoints.length === 0;
  wrap.classList.toggle("measuring", on);
  if (!on) clearMeasure();
  else { measureOverlay.hidden = false; setStatus("Measure: click two points. Esc cancels."); }
}
function clearMeasure() {
  state.measurePoints = [];
  state.measureText = "";
  clearMeasureOverlay();
  if (!state.measuring) measureOverlay.hidden = true;
}
function snapDxf(scenePoint, canvas) {
  const cam = state.dxfViewer.GetCamera();
  const viewWidth = cam.right - cam.left;
  const threshold = (viewWidth / canvas.clientWidth) * 12;
  let best = null, bestD = Infinity;
  for (const p of state.snapPoints) {
    const d = Math.hypot(p.x - scenePoint.x, p.y - scenePoint.y);
    if (d < bestD) { bestD = d; best = p; }
  }
  return bestD <= threshold ? best : scenePoint;
}
function snapStl(worldPoint) {
  if (!state.stl) return worldPoint;
  const bbox = StlOps.computeBBox(state.stl.positions);
  const diag = Math.hypot(bbox.size.x, bbox.size.y, bbox.size.z) || 1;
  const threshold = diag * 0.02;
  let best = null, bestD = Infinity;
  for (const p of state.snapPoints) {
    const d = Math.hypot(p.x - worldPoint.x, p.y - worldPoint.y, p.z - worldPoint.z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return bestD <= threshold ? best : worldPoint;
}
function stlToFilePoint(threePoint) {
  // Undo the rotateX(-90°): STL x = three x, STL y = -three z, STL z = three y.
  return { x: threePoint.x, y: -threePoint.z, z: threePoint.y };
}
function dxfSceneToCanvas(p) {
  return state.dxfViewer.SceneToCanvasCoord(p.x, p.y);
}
function stlWorldToCanvas(p) {
  const v = new THREE.Vector3(p.x, p.y, p.z).project(state.stl.camera);
  const rect = wrap.getBoundingClientRect();
  return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height };
}
function toCanvasPoint(p) {
  return state.kind === "dxf" ? dxfSceneToCanvas(p) : stlWorldToCanvas(p);
}
function measureDistance(a, b) {
  if (state.kind === "dxf") {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const dx = b.x - a.x, dy = b.y - a.y;
    return { d, text: `${fmt(d)} ${state.fileUnitsName || state.assumedUnit}  ·  ΔX ${fmt(dx)}  ·  ΔY ${fmt(dy)}`, mm: d * (state.mmPerFileUnit || MM_PER_UNIT[state.assumedUnit]) };
  }
  const fa = stlToFilePoint(a), fb = stlToFilePoint(b);
  const dx = fb.x - fa.x, dy = fb.y - fa.y, dz = fb.z - fa.z;
  const d = Math.hypot(dx, dy, dz);
  return { d, text: `${fmt(d)} ${state.assumedUnit}  ·  ΔX ${fmt(dx)}  ·  ΔY ${fmt(dy)}  ·  ΔZ ${fmt(dz)}`, mm: d * MM_PER_UNIT[state.assumedUnit] };
}
function onMeasureClick(point3d, canvasPoint) {
  const snapped = state.kind === "dxf"
    ? snapDxf(point3d, state.dxfViewer.GetCanvas())
    : snapStl(point3d);
  const canvas = toCanvasPoint(snapped);
  state.measurePoints.push({ model: snapped, canvas });
  if (state.measurePoints.length === 2) {
    const [a, b] = state.measurePoints;
    const res = measureDistance(a.model, b.model);
    const mm = res.mm;
    state.measureText = `${fmt(res.d)} ${state.fileUnitsName || state.assumedUnit} (${fmt(mm)} mm / ${fmt(mm / 25.4)} in)`;
    drawMeasure(state.measurePoints.map((p) => p.canvas));
    setStatus(`Measured: ${state.measureText}`);
  } else {
    drawMeasure(state.measurePoints.map((p) => p.canvas));
  }
}
function onMeasureMove(point3d) {
  if (state.measurePoints.length !== 1) return;
  const snapped = state.kind === "dxf"
    ? snapDxf(point3d, state.dxfViewer.GetCanvas())
    : snapStl(point3d);
  drawMeasure(state.measurePoints.map((p) => p.canvas), toCanvasPoint(snapped));
}

// Pointer handling on the canvas wrapper (works for DXF and STL).
let downPos = null;
wrap.addEventListener("pointerdown", (e) => { downPos = { x: e.clientX, y: e.clientY }; });
wrap.addEventListener("pointerup", (e) => {
  if (!downPos) return;
  const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
  downPos = null;
  if (moved > 5 || !state.measuring || !state.kind) return;
  const rect = wrap.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  if (state.kind === "dxf") {
    const scenePt = state.dxfViewer.CanvasToSceneCoord(cx, cy);
    onMeasureClick(scenePt, { x: cx, y: cy });
  } else if (state.kind === "stl" && state.stl && state.stl.mesh) {
    const ndc = new THREE.Vector2((cx / rect.width) * 2 - 1, -(cy / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, state.stl.camera);
    const hits = ray.intersectObject(state.stl.mesh);
    if (hits.length > 0) onMeasureClick(hits[0].point, { x: cx, y: cy });
  }
});
wrap.addEventListener("pointermove", (e) => {
  if (!state.measuring || state.measurePoints.length !== 1 || !state.kind) return;
  const rect = wrap.getBoundingClientRect();
  const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
  if (state.kind === "dxf") {
    onMeasureMove(state.dxfViewer.CanvasToSceneCoord(cx, cy));
  } else if (state.kind === "stl" && state.stl && state.stl.mesh) {
    const ndc = new THREE.Vector2((cx / rect.width) * 2 - 1, -(cy / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, state.stl.camera);
    const hits = ray.intersectObject(state.stl.mesh);
    if (hits.length > 0) onMeasureMove(hits[0].point);
  }
});

// ---------- toolbar ----------
fitBtn.addEventListener("click", () => {
  if (state.kind === "dxf" && state.dxfViewer) {
    const b = state.dxfViewer.GetBounds();
    if (b) state.dxfViewer.FitView(b.minX, b.maxX, b.minY, b.maxY);
  } else if (state.kind === "stl" && state.stl) {
    const bbox = StlOps.computeBBox(state.stl.positions);
    const center = {
      x: (bbox.min.x + bbox.max.x) / 2,
      y: (bbox.min.z + bbox.max.z) / 2,
      z: -(bbox.min.y + bbox.max.y) / 2,
    };
    const maxSize = Math.max(bbox.size.x, bbox.size.y, bbox.size.z);
    state.stl.camera.position.set(center.x + maxSize * 1.2, center.y + maxSize * 1.2, center.z + maxSize * 1.2);
    state.stl.controls.target.set(center.x, center.y, center.z);
    state.stl.controls.update();
  }
});
measureBtn.addEventListener("click", () => setMeasuring(!state.measuring));
clearBtn.addEventListener("click", () => {
  if (state.dxfViewer) state.dxfViewer.Clear();
  if (state.stl && state.stl.mesh) { state.stl.scene.remove(state.stl.mesh); state.stl.mesh = null; }
  if (state.stl && state.stl.renderer) state.stl.renderer.domElement.style.display = "none";
  state.kind = null; state.dxfModel = null; state.snapPoints = [];
  clearMeasure(); setMeasuring(false);
  wrap.classList.remove("has-file");
  fileNameEl.textContent = "No file yet";
  fitBtn.disabled = true; measureBtn.disabled = true; clearBtn.disabled = true;
  layersSection.hidden = true; undrawnSection.hidden = true; stlViews.hidden = true;
  unitsWarning.hidden = true;
  setInfoRows([["Nothing loaded", "Drop a .dxf or .stl file, or right-click a link to preview it."]]);
  setStatus("Ready. Drop a .dxf or .stl file to begin.");
  setError("");
});
themeBtn.addEventListener("click", () => {
  state.darkBg = !state.darkBg;
  wrap.classList.toggle("light", !state.darkBg);
  themeBtn.textContent = state.darkBg ? "Light bg" : "Dark bg";
  if (state.dxfViewer) state.dxfViewer.SetClearColor(state.darkBg ? 0x111827 : 0xffffff);
});
unitSelect.addEventListener("change", () => {
  state.assumedUnit = unitSelect.value;
  storeSet({ assumedUnit: state.assumedUnit });
  setStatus(`Unit assumption: 1 file unit = 1 ${state.assumedUnit}.`);
  // Re-render the info panel with the new assumption.
  if (state.kind === "dxf" && state.dxfModel) {
    const dxf = state.dxfModel;
    const bounds = state.dxfViewer.GetBounds() || DxfInfo.computeBBox(dxf);
    const counts = DxfInfo.getEntityCounts(dxf);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const units = DxfInfo.getUnits(dxf);
    setInfoRows([
      ["Format", `DXF ${dxf.header && dxf.header.$ACADVER ? (ACADVER_NAMES[dxf.header.$ACADVER] || dxf.header.$ACADVER) : "unknown"}`],
      ["Units", units.code === 0 ? "none (unitless)" : `${units.name} ($INSUNITS = ${units.code})`],
      ["Size", bounds ? sizeText(bounds.maxX - bounds.minX) + "  ×  " + sizeText(bounds.maxY - bounds.minY) : "—"],
      ["Entities", `${total} (${Object.entries(counts).map(([t, n]) => `${n} ${t}`).join(", ")})`],
    ]);
  } else if (state.kind === "stl" && state.stl) {
    const bbox = StlOps.computeBBox(state.stl.positions);
    const volume = StlOps.computeVolume(state.stl.positions);
    setInfoRows([
      ["Format", "STL (binary/ASCII)"],
      ["Units", "none — STL files have no units"],
      ["Size", `${sizeText(bbox.size.x)}  ×  ${sizeText(bbox.size.y)}  ×  ${sizeText(bbox.size.z)}`],
      ["Triangles", `${StlOps.triangleCount(state.stl.positions)}`],
      ["Volume", `${fmt(volume)} ${state.assumedUnit}³  ·  ${fmt(volume / 1000)} cm³`],
    ]);
  }
});
$("view-top").addEventListener("click", () => setStlView("top"));
$("view-front").addEventListener("click", () => setStlView("front"));
$("view-side").addEventListener("click", () => setStlView("side"));
function setStlView(which) {
  if (!state.stl) return;
  const bbox = StlOps.computeBBox(state.stl.positions);
  const center = {
    x: (bbox.min.x + bbox.max.x) / 2,
    y: (bbox.min.z + bbox.max.z) / 2,
    z: -(bbox.min.y + bbox.max.y) / 2,
  };
  const d = Math.max(bbox.size.x, bbox.size.y, bbox.size.z) * 1.6;
  const pos = which === "top" ? [center.x, center.y + d, center.z]
    : which === "front" ? [center.x, center.y, center.z + d]
    : [center.x + d, center.y, center.z];
  state.stl.camera.position.set(...pos);
  state.stl.controls.target.set(center.x, center.y, center.z);
  state.stl.controls.update();
}

// ---------- file input / drag-drop ----------
$("choose-file").addEventListener("click", () => $("file-input").click());
$("file-input").addEventListener("change", (e) => {
  if (e.target.files[0]) openFile(e.target.files[0]);
  e.target.value = "";
});
["dragenter", "dragover"].forEach((ev) => wrap.addEventListener(ev, (e) => {
  e.preventDefault();
  dropzone.classList.add("drag-over");
}));
["dragleave", "drop"].forEach((ev) => wrap.addEventListener(ev, (e) => {
  e.preventDefault();
  dropzone.classList.remove("drag-over");
}));
wrap.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file) openFile(file);
});

// ---------- context-menu preview (from background.js) ----------
async function checkPendingPreview() {
  const pending = await sessionGet("pendingPreview");
  if (!pending || !pending.bytes) return;
  sessionRemove("pendingPreview");
  if (Date.now() - (pending.at || 0) > 10 * 60 * 1000) return;
  const name = (pending.url || "file").split("/").pop().split("?")[0] || "file";
  openFile(new File([new Uint8Array(pending.bytes)], name));
}
async function previewUrl(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("http-" + res.status);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const name = url.split("/").pop().split("?")[0] || "file";
    openFile(new File([bytes], name));
  } catch (err) {
    showError("Could not read this file:// link. In chrome://extensions, turn on “Allow access to file URLs” for Maker File Previewer — or download the file and drop it here.");
  }
}
onMessage((msg) => {
  if (!msg) return;
  if (msg.type === "preview-pending") checkPendingPreview();
  else if (msg.type === "preview-url") previewUrl(msg.url);
  else if (msg.type === "preview-error" && msg.kind === "permission-declined") {
    showError("Link preview needs one-time access to that site — or download the file and drop it here.");
  } else if (msg.type === "preview-error" && msg.kind === "fetch-failed") {
    showError("Could not download that link. Check the link, or download the file and drop it here.");
  } else if (msg.type === "preview-error" && msg.kind === "too-big-for-link") {
    showError("That file is too big to pass through a link preview — download it and drop it here instead.");
  }
});

// ---------- keyboard ----------
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (state.measuring) setMeasuring(false); }
  else if ((e.key === "f" || e.key === "F") && state.kind) fitBtn.click();
  else if ((e.key === "m" || e.key === "M") && state.kind) setMeasuring(!state.measuring);
});

// ---------- cross-promotion (plain navigation, no network in code) ----------
$("promo-generator").addEventListener("click", () => {
  window.open("https://github.com/eslam-tohamy2026/lasercut-dxf-generator", "_blank");
});
$("promo-fiverr").addEventListener("click", () => {
  window.open("https://www.fiverr.com/eslam_engineer/create-cnc-and-laser-cut-dxf-files-ready-for-production", "_blank");
});

// ---------- startup ----------
storeGet({ assumedUnit: "mm" }).then((prefs) => {
  if (prefs.assumedUnit && MM_PER_UNIT[prefs.assumedUnit]) {
    state.assumedUnit = prefs.assumedUnit;
    unitSelect.value = prefs.assumedUnit;
  }
});
checkPendingPreview();
const fileParam = new URLSearchParams(location.search).get("file");
if (fileParam) previewUrl(fileParam);
