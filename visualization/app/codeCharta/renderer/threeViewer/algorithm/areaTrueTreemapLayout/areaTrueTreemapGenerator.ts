import { DEFAULT_FLOOR_LABEL_CONFIG, getFloorLabelPadding, hierarchy, OrderOption, SortingOption, treemap } from "area-true-treemap"
import { CcState, CodeMapNode, Node, NodeMetricData } from "../../../../model/codeCharta.model"
import { getMapResolutionScaleFactor, isLeaf } from "../../../../util/codeMapHelper"
import {
    calculateAreaValue,
    DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_1,
    DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_2,
    HIERARCHY_LEVELS_WITH_LABLES_UPPER_BOUNDARY
} from "../treeMapLayout/treeMapGenerator"
import { treeMapSize } from "../treeMapLayout/treeMapHelper"
import { buildNodeFrom } from "./areaTrueTreemapHelper"

/**
 * CodeCharta's margin is a pixel value (UI range 1..100, default 50). The layout expects a gap as a
 * fraction of the map, so one margin step is mapped to 0.05% of the map: the default of 50 becomes
 * 0.025 (2.5%), a margin of 100 becomes 5%.
 */
const MARGIN_SCALING_FACTOR = 0.0005

/**
 * Configuration of the improved squarify algorithm following the thesis findings: two layout
 * passes with margin compensation, children scaled into the folder content, descending order and
 * re-sorting in the second pass. Sibling gaps follow the margin setting; folder chains stay
 * unfolded, so every folder remains selectable in CodeCharta.
 */
export const layoutDefaults = {
    numberOfPasses: 2,
    scale: true,
    sorting: SortingOption.DESCENDING,
    order: OrderOption.NEW_ORDER,
    incrementMargin: false,
    applySiblingMargin: true,
    siblingMarginLeavesOnly: false,
    collapseFolders: false,
    round: false
} as const

export type AreaTrueTreemapLayoutDefaults = typeof layoutDefaults

/**
 * The layout reserves its floor-label strip on the top edge of every labelled folder, while
 * CodeCharta's FloorLabelDrawer paints labels into a strip on the right edge (the side the
 * Squarified TreeMap reserves via paddingRight). The laid-out rectangles are therefore rotated by
 * 90 degrees and mirrored, which moves the reserved strip to the right edge without changing the
 * layout itself.
 */
function rotateRectToRightEdge(x0: number, y0: number, x1: number, y1: number, layoutWidth: number) {
    const rightEdge = layoutWidth - y0
    return { x: rightEdge - (y1 - y0), y: x0, width: y1 - y0, height: x1 - x0 }
}

/**
 * The canvas is sized exactly like the Squarified TreeMap's (see getSquarifiedTreeMap): the base
 * map is inflated by the estimated margin room and, with floor labels enabled, by the label strips
 * of the top levels. The layout normalizes its result onto this canvas, which keeps margins, label
 * strips and building footprints on the same scale the renderer and the label drawer expect.
 */
function getLayoutCanvasSize(map: CodeMapNode, state: CcState, enableFloorLabels: boolean, mapSizeResolutionScaling: number) {
    const { margin } = state.mapState
    const nodesPerSide = 2 * Math.sqrt(countNodesWithoutBlacklisted(map))
    const addedLabelSpace = enableFloorLabels ? getAddedFloorLabelSpace(map) : 0
    return (treeMapSize * 2 + nodesPerSide * margin + addedLabelSpace) * mapSizeResolutionScaling
}

function countNodesWithoutBlacklisted(map: CodeMapNode) {
    let nodeCount = 0
    const visit = (node: CodeMapNode) => {
        if (!node.isExcluded && !node.isFlattened) {
            nodeCount++
        }
        for (const child of node.children ?? []) {
            visit(child)
        }
    }
    visit(map)
    return nodeCount
}

function getAddedFloorLabelSpace(map: CodeMapNode) {
    let addedSpace = 0
    const visit = (node: CodeMapNode, depth: number) => {
        if (!isLeaf(node)) {
            addedSpace += depth === 0 ? DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_1 : DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_2
            for (const child of node.children ?? []) {
                visit(child, depth + 1)
            }
        }
    }
    visit(map, 0)
    return addedSpace
}

export function createAreaTrueTreemapNodes(map: CodeMapNode, state: CcState, metricData: NodeMetricData[], isDeltaState: boolean): Node[] {
    const mapSizeResolutionScaling = getMapResolutionScaleFactor(state.files)
    const maxHeight = metricData.find(x => x.name === state.mapState.heightMetric)?.maxValue * mapSizeResolutionScaling
    const maxWidth = metricData.find(x => x.name === state.mapState.areaMetric)?.maxValue * mapSizeResolutionScaling
    const heightScale = (treeMapSize * 2) / maxHeight

    const { enableFloorLabels } = state.mapState
    const canvasSize = getLayoutCanvasSize(map, state, enableFloorLabels, mapSizeResolutionScaling)

    const layoutTree = layoutAreaTrueTreemap(map, state, maxWidth, canvasSize, enableFloorLabels)
    const root = layoutTree.root
    const layoutWidth = layoutTree.layoutWidth
    if (layoutWidth <= 0) {
        return []
    }

    // Rotate the laid-out rectangles onto the CodeCharta orientation (label strip on the right) and
    // scale them onto the canvas.
    const layoutToCanvasScale = canvasSize / layoutWidth
    const nodes: Node[] = []
    for (const hierarchyNode of root.descendants()) {
        const { x0, y0, x1, y1 } = hierarchyNode
        if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) {
            continue
        }
        const rotated = rotateRectToRightEdge(x0, y0, x1, y1, layoutWidth)
        nodes.push(
            buildNodeFrom(
                {
                    x: rotated.x * layoutToCanvasScale,
                    y: rotated.y * layoutToCanvasScale,
                    width: rotated.width * layoutToCanvasScale,
                    height: rotated.height * layoutToCanvasScale,
                    depth: hierarchyNode.depth
                },
                hierarchyNode.data,
                heightScale,
                maxHeight,
                state,
                isDeltaState
            )
        )
    }

    return nodes
}

function layoutAreaTrueTreemap(map: CodeMapNode, state: CcState, maxWidth: number, canvasSize: number, enableFloorLabels: boolean) {
    const { experimentalFeaturesEnabled } = state.preferences
    const labelLength = (node: { y0: number; y1: number; depth: number }) =>
        getFloorLabelPadding(node.y1 - node.y0, node.depth, DEFAULT_FLOOR_LABEL_CONFIG)

    // The layout reads the margin as a fraction of the map, while CodeCharta's margin is a pixel
    // value: the fraction is derived from the intended gap (0.25 map units per UI step).
    const marginFraction = Math.min(1, (state.mapState.margin * MARGIN_SCALING_FACTOR * treeMapSize * 2) / canvasSize)

    const layout = treemap<CodeMapNode>()
        .size([canvasSize, canvasSize])
        .margin(marginFraction)
        .numberOfPasses(layoutDefaults.numberOfPasses)
        .scale(layoutDefaults.scale)
        .sorting(layoutDefaults.sorting)
        .order(layoutDefaults.order)
        .incrementMargin(layoutDefaults.incrementMargin)
        .applySiblingMargin(layoutDefaults.applySiblingMargin)
        .siblingMarginLeavesOnly(layoutDefaults.siblingMarginLeavesOnly)
        .collapseFolders(layoutDefaults.collapseFolders)
        .round(layoutDefaults.round)
        .floorLabels(enableFloorLabels ? HIERARCHY_LEVELS_WITH_LABLES_UPPER_BOUNDARY : 0)
        .labelLength(enableFloorLabels ? labelLength : 0)
        .value(node => (isLeaf(node) ? calculateAreaValue(node, state, maxWidth, experimentalFeaturesEnabled) : 0))

    const root = layout(hierarchy(map))
    // The layout normalizes onto the requested size; the actual extent can exceed it by a hair
    // (the margin compensation is approximate), so rotation and scaling use the real extent.
    let layoutWidth = 0
    if (Number.isFinite(root.x1)) {
        for (const node of root.descendants()) {
            layoutWidth = Math.max(layoutWidth, node.y1 ?? 0)
        }
    }

    return { root, layoutWidth }
}
