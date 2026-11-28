# Changelog

## 2.0.0 — 2026-11-28

- **Radius tool** — click a circle or an arc (centre or edge) and get R and Ø. Button, `R` shortcut, DXF only.
- **Watertight check (STL)** — open and non-manifold edges are counted; a mesh with holes says so and its volume is flagged approximate. Skipped (not guessed) for meshes over 200,000 triangles.
- **Surface area (STL)** — shown in file units² and cm².
- **Save PNG** — saves the current view as an image named after the file.
- **Built-in samples** — a sample DXF (bracket) and sample STL (box) in the empty viewer, so the web demo works with no file at hand.
- **Wireframe toggle (STL)**.
- **Measure readout keeps its deltas** — distance plus ΔX/ΔY (+ΔZ for STL). v1 computed the deltas and then dropped them from the label.
- **Fixed: ellipse bounding box** — the major-axis endpoint is relative to the centre; v1 treated it as absolute and could report a 50 × 25 mm ellipse as 111.8 × 111.8.
- **Fixed: INSERT blocks** — the size now expands block contents (position + scale) instead of counting only the insertion point.
- **Fixed: unit dropdown** — a file drawn in feet or metres now shows its real unit; v1 silently fell back to "mm". Feet and metres added as assumed units for unitless files.
- **Fixed: volume in cm³** — now converts from the assumed unit; v1 divided by 1000 unconditionally, which is only right for millimetres.
- **Fixed: link-preview errors** — an error that arrived while the viewer tab was still loading used to vanish; it is now also stashed in session storage and shown on startup.
- **Fixed: units banner** — it now names the current assumption instead of always saying "millimetres".
- **Fixed: STL measure performance** — the snap threshold is cached at load instead of recomputing the whole-mesh bounding box on every mouse move.
- **Fixed: empty files** — a 0-byte file and a triangle-less STL get a plain message instead of a raw parser error or a bare TypeError; a non-DXF file gets a plain explanation.
- **File size** shown in the info panel for both formats; theme choice (dark/light background) is now remembered like the unit choice.
- **Tests are hermetic** — the three example DXFs are vendored into `tests/fixtures/`; the suite no longer reads the LaserCut DXF Generator's working directory (its v2 rebuild regenerated those files mid-flight and broke these tests from outside). 33 tests, all passing.
- **Fixed: Fit** — the Fit button (and `F`) now subtracts the scene origin before fitting; it used to shift the drawing whenever the first vertex was not at (0,0).
- Visual-review fixes: the STL Top/Front/Side buttons no longer show on DXF files; size lines no longer repeat the same value in different words ("60 millimetres · 60 mm"); the STL grid now fits the part instead of dwarfing it; the viewer tab has a favicon (no more 404 in the console).
- README rewritten: real screenshots, an honest comparison with other viewers, a troubleshooting table, and a limits section.

## 1.0.0 — 2026-11-25

- First release.
- DXF 2D preview: pan/zoom/fit, layers panel, entity counts, units check.
- STL 3D preview: orbit/pan/zoom, Top/Front/Side views, volume.
- Measure with snap (DXF endpoints/midpoints/centres/vertices, STL vertices).
- Right-click link preview with per-site one-time permission; drag-and-drop and file picker.
- 100% offline processing; zero install-time host permissions.
