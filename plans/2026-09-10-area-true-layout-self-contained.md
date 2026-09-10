---
name: Keep the Area-True treemap layout independent of the Squarified tree map
issue: (none)
state: complete
version: 1
---

## Goal

The Area-True layout carries its own copy of the tree-map rules it needs, so this branch adds code
next to its feature instead of changing the shared tree-map code, and the merge stays small.

## Tasks

### 1. Copy the needed rules into the layout folder
- `areaTrueTreemapLayout/treeMapRules.ts` holds copies of `calculateAreaValue`,
  `getAddedFloorLabelSpace`, `getEstimatedNodesPerSide`, `HIERARCHY_LEVELS_WITH_LABLES_UPPER_BOUNDARY`,
  `treeMapSize`, `FOLDER_HEIGHT`, `getHeightValue`, `resolveHeightValue`, `isVisible`, `isNodeFlat`,
  `getBuildingColor` and `getIncomingEdgePoint`.
- Copied verbatim from `treeMapLayout/treeMapGenerator.ts` and `treeMapLayout/treeMapHelper.ts`;
  only the visibility of the copied symbols is adjusted to what the layout imports.

### 2. Point the layout at the copy
- `areaTrueTreemapGenerator.ts` and `areaTrueTreemapHelper.ts` import from `./treeMapRules`.
- Nothing else changes: `treeMapLayout/`, `streetLayout/`, `floorLabels/`, `rendering/` and the
  facade stay untouched.

## Steps

- [x] Copy the rules into `treeMapRules.ts`
- [x] Rewire the two layout files
- [x] Full suite, coverage gate, type check and lints
- [x] Commit and push

## Notes

- The layout folder is self-contained: it no longer imports from `treeMapLayout/`. The two specs
  still call `createTreemapNodes` to compare both layouts; that is test-only and stays as it is.
- Verification: 428 suites / 2972 tests / 45 snapshots green with the coverage gate met, `tsc`
  unchanged (2 pre-existing errors in the area-true generator), `depcruise` clean.
- Accepted trade-off: the copied rules have to be kept in sync with `treeMapLayout/` by hand.
- The unused `AreaTrueTreemapLayoutDefaults` type is gone, so the branch no longer ships a dead
  export of its own.
- `treeMapLayout/treeMapGenerator.ts` is back to its `main` content: the layout no longer needs
  the helpers that commit `2bcf41ba6` had exported for it, so the shared tree-map code is untouched
  and `npm run lint:deadcode` (knip, a CI gate) reports nothing. The canvas the Squarified tree map
  computes is the same as before, because the extracted helper and the inline code it replaced
  produce the same value.
