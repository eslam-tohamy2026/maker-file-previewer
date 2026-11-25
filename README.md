# Maker File Previewer

Preview DXF & STL files in your browser — layers, measure, and a units check. Your files never leave your computer.

Right-click any `.dxf` / `.stl` link → **Preview with Maker File Previewer**, or drop a local file onto the viewer tab.

## What it does (v1.0.0)

- **DXF 2D view** — pan, zoom, fit; layers panel (on/off, DXF colours, entity count per layer); entity counts.
- **STL 3D view** — orbit, pan, zoom, fit; Top / Front / Side view buttons.
- **Info panel** — file name, format, DXF version, `$INSUNITS`, size in file units **and** mm **and** inches, entity / triangle counts, STL volume, and a list of anything that wasn't drawn.
- **Measure** — press Measure, click two points: distance + ΔX/ΔY (+ΔZ for STL), in mm and inches. Snaps to endpoints, midpoints, circle/arc centres and polyline vertices (DXF), and to triangle vertices (STL). Esc cancels, F fits, M toggles measure.
- **Units check** — when a file has no units (every STL, and DXF files with `$INSUNITS = 0`), a banner says so plainly and lets you pick what one file unit means (mm / inch / cm). The tool never silently guesses: if the size looks 25.4× wrong, it tells you how to fix it.
- **Error states** — binary DXF, corrupt files, declined link permission and missing file-URL access each get a specific message and a next step, never a crash.

## Privacy

- Files are processed entirely in the browser. No server, no account, no tracking.
- Install-time permissions are only `contextMenus`, `activeTab` and `storage` — all warning-free.
- Link preview asks once, per site, at the moment you use it (optional host permission). Decline it and the extension still works: drop the file in instead.
- The only network call in the shipped code fetches a URL you right-clicked. Nothing else ever leaves the device.

## Install (load unpacked)

1. Download the latest release ZIP and unpack it.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and choose the unpacked folder.
4. Click the extension icon to open the viewer tab.

## Test

```sh
npm install
npm test
```

Tests run in Node: `tests/test_dxfinfo.mjs` parses a hand-made DXF and the three example DXFs from the LaserCut DXF Generator with the real vendored parser; `tests/test_stlops.mjs` parses a binary and an ASCII STL box with the real three.js STLLoader.

## Credits

- DXF rendering: [dxf-viewer](https://github.com/vagran/dxf-viewer) (MPL-2.0), vendored unchanged in `viewer/vendor/dxf-viewer/` with its licence.
- 3D: [three.js](https://threejs.org) (MIT) and its STLLoader / OrbitControls.
- Triangulation: [earcut](https://github.com/mapbox/earcut) (ISC). Font rendering: [opentype.js](https://github.com/opentypejs/opentype.js) (MIT).

Made a DXF? Generate one with the [LaserCut DXF Generator](https://github.com/eslam-tohamy2026/lasercut-dxf-generator). Need it cut or modelled? [CNC / laser DXF files on Fiverr](https://www.fiverr.com/eslam_engineer/create-cnc-and-laser-cut-dxf-files-ready-for-production).

## Licence

MIT — see `LICENSE`.
