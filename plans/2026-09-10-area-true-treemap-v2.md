---
name: Area-True Treemap layout on area-true-treemap 4.0.0, aligned with CodeCharta's Squarified TreeMap
issue: (none)
state: complete
version: 4
---

## Goal

The "Area-True Treemap" map layout uses the current area-true-treemap release and looks like CodeCharta's Squarified TreeMap: sibling buildings get gaps from the margin setting, each folder reserves a per-folder floor-label strip on its right edge, and the canvas is sized like the Squarified layout so buildings keep the familiar height-to-footprint ratio.

## Tasks

### 1. Dependency
- visualization/package.json: "area-true-treemap": "^4.0.0" (v4 exposes only the d3-style hierarchy()/treemap() API; v2's TreemapLayout and v3's AreaTrueTreemapLayout are gone).

### 2. Integration (areaTrueTreemapGenerator.ts)
- Layout via treemap<CodeMapNode>().size([canvas, canvas]).value(area accessor) on hierarchy(map); coordinates are read back from the hierarchy nodes (node.data is the CodeMapNode, so no path mapping is needed).
- Canvas sizing mirrors getSquarifiedTreeMap (base + estimated margin room + floor-label room).
- Margin: UI value -> gap of 0.25 map units per step, expressed as the fraction of the map the layout expects (UI 50 = the usual 2.5% of the base map).
- Floor labels: floorLabels(HIERARCHY_LEVELS_WITH_LABLES_UPPER_BOUNDARY) and labelLength = getFloorLabelPadding(folder span, depth) per folder, matching the FloorLabelDrawer.
- Label strips are reserved on the top edge by the algorithm, so rectangles are rotated 90 degrees + mirrored onto CodeCharta's right-edge convention.
- Thesis defaults: 2 passes, scale on, descending, new order, sibling margins on, folder chains unfolded, no rounding.

### 3. Tests
- areaTrueTreemapGenerator.spec.ts: geometry invariants, leaf coverage, sibling gap, label reservation, layout defaults.
- areaTrueTreemapLargeMaps.spec.ts (opt-in, describe.skip): runs the real showcase maps up to 130k nodes.

### 4. Changelog
- Unreleased entry names the 4.0.0 integration.

## Steps

- [x] Analyse v4 API (d3-style entry points, margin fraction, floor labels, scale/order options)
- [x] Bump dependency + lockfile to ^4.0.0
- [x] Rewrite generator on the v4 API incl. rotation to right-edge labels
- [x] Fix margin mapping (fraction of the map) and large-map recursion (no spread over 130k nodes)
- [x] Update specs + changelog
- [x] Verify on the showcase maps (0 vanished nodes on aoo/netbeans, 0 zero-area rects, <=5 on old httpd)
- [x] Full unit suite + type check green
- [x] Rebuild app and refresh screenshots
