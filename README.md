# Maker File Previewer

Preview DXF & STL files in your browser — layers, measure, and a units check. Your files never leave your computer.

Right-click any `.dxf` / `.stl` link → **Preview with Maker File Previewer**, or drop a local file onto the viewer tab. No account, no upload, no install required to try it: the viewer also runs as a plain web page.

![DXF preview — bracket drawing with the layers panel](https://github.com/eslam-tohamy2026/maker-file-previewer/releases/download/v2.0.0/screenshot-dxf.png)

![STL preview — 3D box with size, volume and watertight check](https://github.com/eslam-tohamy2026/maker-file-previewer/releases/download/v2.0.0/screenshot-stl.png)

![Measure — distance between two hole centres, snapped](https://github.com/eslam-tohamy2026/maker-file-previewer/releases/download/v2.0.0/screenshot-measure.png)

## What it does (v2.0.0)

- **DXF 2D view** — pan, zoom, fit; layers panel (on/off, DXF colours, entity count per layer); entity counts; blocks are expanded, so a drawing built from blocks reports its real size.
- **STL 3D view** — orbit, pan, zoom, fit; Top / Front / Side view buttons; wireframe toggle.
- **Info panel** — file name and size, format, DXF version, `$INSUNITS`, size in file units **and** mm **and** inches, entity / triangle counts, STL volume and surface area, and a list of anything that wasn't drawn.
- **Measure** — press Measure, click two points: distance plus ΔX/ΔY (+ΔZ for STL), in mm and inches. Snaps to endpoints, midpoints, circle/arc centres and polyline vertices (DXF), and to triangle vertices (STL). Esc cancels, F fits, M toggles measure.
- **Radius** — press Radius (or R), click a circle or an arc — its centre or its edge — and get R and Ø. Hole sizes, without opening CAD.
- **Units check** — when a file has no units (every STL, and DXF files with `$INSUNITS = 0`), a banner says so plainly and lets you pick what one file unit means (mm / inch / cm / feet / metre). The tool never silently guesses: if the size looks 25.4× wrong, the banner tells you how to fix it. Files that do state their units show them as-is.
- **Watertight check (STL)** — every edge is counted: a closed mesh reports "Yes — closed mesh"; a mesh with holes reports how many open and non-manifold edges it has, and the volume is flagged as approximate instead of shown as a confident number.
- **Samples** — no file at hand? The empty viewer offers a sample DXF and a sample STL to try it with.
- **Save PNG** — save the current view as an image, for a quote, a ticket or a forum post.
- **Error states** — binary DXF, corrupt or empty files, a DWG renamed to `.dxf`, a declined link permission and a missing file-URL permission each get a specific message and a next step, never a crash — and a link-preview error is no longer lost when the viewer tab is still loading.

## How it compares

There are good viewers out there; this one is built for a narrower job — a quick, private look at a DXF or STL, with the numbers a maker or a laser shop actually checks before cutting or printing.

| Tool | Runs on | Account | File leaves your PC | Formats | Measure | Units / checks |
| --- | --- | --- | --- | --- | --- | --- |
| **Maker File Previewer** | Browser (extension or web page) | No | No | DXF, STL | Distance + radius, with snap | Units check, watertight check |
| Autodesk Viewer | Browser | Yes | Yes — uploaded | 80+, incl. DWG | Distance, markup | Shared links, markups |
| ShareCAD | Browser | Optional | Yes — uploaded | 25+, incl. DWG | View only | — |
| Solidise DXF viewer | Browser | No | No | DXF | Distance + radius, with snap | Units from `$INSUNITS` |
| STL viewers (e.g. stlvieweronline, convertico) | Browser | No | No | STL, OBJ, 3MF, … | Distance | Watertight, section, filament estimates |
| DWG TrueView / LibreCAD / QCAD | Desktop | No | No | DWG, DXF | Full CAD measure | Editing, plotting |

Pick Autodesk Viewer when you need DWG, markups or a shareable link and uploading the file is acceptable. Pick a desktop CAD program when you need to edit, plot to scale, or open paper-space layouts. Pick this tool when the file is confidential, you want it opened from a link in one click, and you mainly need to check size, layers, holes and whether an STL will slice cleanly.

## Privacy

- Files are processed entirely in the browser. No server, no account, no tracking.
- Install-time permissions are only `contextMenus`, `activeTab` and `storage` — all warning-free.
- Link preview asks once, per site, at the moment you use it (optional host permission). Decline it and the extension still works: drop the file in instead.
- The only network call in the shipped code fetches a URL you right-clicked (or a built-in sample you asked for). Nothing else ever leaves the device.

## Install (load unpacked)

1. Download the latest release ZIP and unpack it.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and choose the unpacked folder.
4. Click the extension icon to open the viewer tab.

No install needed to try it: open the [web viewer](https://eslam-tohamy2026.github.io/maker-file-previewer/viewer/index.html) and drop a file in, or try a sample.

## Use

- **Open a file:** drag it onto the viewer, click **Choose a file**, or right-click a `.dxf` / `.stl` link and choose **Preview with Maker File Previewer**.
- **Look around:** drag to pan (DXF) or orbit (STL), scroll to zoom, **F** to fit. STL has Top / Front / Side buttons and a wireframe toggle.
- **Measure:** **M**, click two points. **R** measures a circle's radius. **Esc** cancels.
- **Units:** if the banner says the file has no units, pick what one file unit means from the Unit dropdown and watch the sizes update. Your choice is remembered.
- **Background:** the **Light bg** / **Dark bg** button switches the drawing background; your choice is remembered.
- **Save PNG:** saves the current view as an image named after the file.

## When a file looks wrong

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| "Could not read this as a DXF" | Binary DXF, or a DWG renamed to `.dxf` | Re-save as ASCII DXF in your CAD program |
| Drawing is tiny, huge or 25.4× off | Unitless file (`$INSUNITS = 0`) or inches read as millimetres | Check the units in the info panel; pick the right unit from the dropdown |
| Only part of the drawing appears | Content sits in a paper-space layout | Export model space, or explode the layout into model space |
| Something is listed under "Not drawn" | `3DSOLID` (ACIS solids) and similar types have no 2D drawing | Export a mesh (polyface) or a STEP file instead |
| Link preview shows an error | Permission declined, or the file is over the 8 MB link-preview limit | Download the file and drop it in — drag-and-drop takes up to 50 MB (DXF) / 150 MB (STL) |
| STL volume looks wrong | The mesh has holes, so the volume is approximate | Check the "Watertight" line; repair the mesh in your CAD program or slicer |

## Limits

- DXF and STL only — no DWG, STEP, OBJ or 3MF. DXF is shown flat (2D); there is no 3D/perspective DXF view and no paper-space layouts.
- Binary DXF files are refused with a message (save as ASCII DXF).
- No editing: this is a viewer, not a CAD program.
- Size caps: 50 MB for DXF, 150 MB for STL; link preview is capped at 8 MB (drag-and-drop for larger files).
- The watertight check is skipped for meshes over 200,000 triangles.

## Test

```sh
npm install
npm test
```

33 tests run in Node: `tests/test_dxfinfo.mjs` parses a hand-made DXF and three real DXFs (vendored copies of the LaserCut DXF Generator examples, in `tests/fixtures/`) with the real vendored parser; `tests/test_stlops.mjs` parses a binary and an ASCII STL box with the real three.js STLLoader; `tests/test_v2.mjs` covers the v2 fixes and features (ellipse boxes, block expansion, snap radii, ft/m units, surface area, watertight check, viewer wiring); `tests/test_dxf_load.mjs` pins the real worker load path; `tests/test_vendored_modules.mjs` proves every import in the shipped code resolves to a file that actually ships.

## Credits

- DXF rendering: [dxf-viewer](https://github.com/vagran/dxf-viewer) (MPL-2.0), vendored unchanged in `viewer/vendor/dxf-viewer/` with its licence.
- 3D: [three.js](https://threejs.org) (MIT) and its STLLoader / OrbitControls.
- Triangulation: [earcut](https://github.com/mapbox/earcut) (ISC). Font rendering: [opentype.js](https://github.com/opentypejs/opentype.js) (MIT).
- Sample bracket DXF: an example from the [LaserCut DXF Generator](https://github.com/eslam-tohamy2026/lasercut-dxf-generator).

Made a DXF? Generate one with the [LaserCut DXF Generator](https://github.com/eslam-tohamy2026/lasercut-dxf-generator). Need it cut or modelled? [CNC / laser DXF files on Fiverr](https://www.fiverr.com/eslam_engineer/create-cnc-and-laser-cut-dxf-files-ready-for-production).

## Licence

MIT — see `LICENSE`.
