import { LabelPosition, SortingOption, TreemapConfigBuilder, TreemapLayout, type TreeNode } from "area-true-treemap"
import { CcState, CodeMapNode, Node, NodeMetricData } from "../../../../model/codeCharta.model"
import { getMapResolutionScaleFactor } from "../../../../util/codeMapHelper"
import { calculateAreaValue } from "../treeMapLayout/treeMapGenerator"
import { treeMapSize } from "../treeMapLayout/treeMapHelper"
import defaultsJson from "./areaTrueTreemapDefaults.json"
import { buildNodeFrom } from "./areaTrueTreemapHelper"

/**
 * The published `area-true-treemap` package is not a d3 drop-in: instead of a `.sum()` accessor it
 * reads each leaf's area from `attributes[areaMetric]` and sums non-leaf values from its children.
 * CodeCharta's area value is therefore precomputed with the existing `calculateAreaValue` and
 * stored in the node's attributes under this internal key, which is then passed as `areaMetric`.
 */
const AREA_VALUE_KEY = "__areaValue"

/**
 * CodeCharta's `margin` is a pixel-based padding (UI range 1..100, default 50) while the package
 * expects a relative fraction (0..1) of the shorter canvas side. This factor maps the pixel value
 * into a fraction: the default of 50 becomes 0.025 (2.5%), which lies inside the 0.5%..3% relative
 * gap range recommended by the package author's thesis. A UI margin of 100 yields 5%.
 */
const MARGIN_SCALING_FACTOR = 0.0005

type AreaTrueTreemapDefaults = {
    margin: number
    aspectRatio: number
    collapseFolders: boolean
    sorting: SortingOption
    labels: {
        topLevels: number
        sizeRatio: number
        position: LabelPosition
    }
}

const areaTrueTreemapDefaults = defaultsJson as AreaTrueTreemapDefaults

// The package reserves the label strip on the side given by `labels.position`. CodeCharta draws
// its floor labels along the right edge of a folder (`x0 + width`), the same side the Squarified
// TreeMap reserves via `paddingRight`, so the defaults pin the position to "right".

export function createAreaTrueTreemapNodes(map: CodeMapNode, state: CcState, metricData: NodeMetricData[], isDeltaState: boolean): Node[] {
    const mapSizeResolutionScaling = getMapResolutionScaleFactor(state.files)
    const maxHeight = metricData.find(x => x.name === state.mapState.heightMetric)?.maxValue * mapSizeResolutionScaling
    const maxWidth = metricData.find(x => x.name === state.mapState.areaMetric)?.maxValue * mapSizeResolutionScaling
    const heightScale = (treeMapSize * 2) / maxHeight
    const canvasSize = treeMapSize * 2 * mapSizeResolutionScaling

    const pathToNode = new Map<string, CodeMapNode>()
    const tree = buildTree(map, state, maxWidth, pathToNode)

    const layout = new TreemapLayout(buildConfig(state))
    const rects = layout.compute(tree, { width: canvasSize, height: canvasSize })

    const nodes: Node[] = [
        buildNodeFrom({ x: 0, y: 0, width: canvasSize, height: canvasSize, depth: 0 }, map, heightScale, maxHeight, state, isDeltaState)
    ]

    for (const rect of rects) {
        const codeMapNode = pathToNode.get(rect.name)
        if (codeMapNode) {
            nodes.push(buildNodeFrom(rect, codeMapNode, heightScale, maxHeight, state, isDeltaState))
        }
    }

    return nodes
}

function buildTree(node: CodeMapNode, state: CcState, maxWidth: number, pathToNode: Map<string, CodeMapNode>): TreeNode {
    const { experimentalFeaturesEnabled } = state.preferences
    const areaValue = calculateAreaValue(node, state, maxWidth, experimentalFeaturesEnabled)
    const children = (node.children ?? []).map(child => buildTree(child, state, maxWidth, pathToNode))

    const treeNode: TreeNode = {
        // `path` is unique per node and is used to map laid-out rectangles back to the original
        // `CodeMapNode` (the package forwards `name` unchanged as long as `collapseFolders` is off).
        name: node.path,
        attributes: { ...(node.attributes ?? {}), [AREA_VALUE_KEY]: areaValue },
        children: children.length > 0 ? children : undefined
    }

    pathToNode.set(node.path, node)
    return treeNode
}

function buildConfig(state: CcState) {
    const { enableFloorLabels } = state.mapState
    const marginFraction = Math.min(1, state.mapState.margin * MARGIN_SCALING_FACTOR)
    const { topLevels, sizeRatio, position } = areaTrueTreemapDefaults.labels

    return new TreemapConfigBuilder()
        .areaMetric(AREA_VALUE_KEY)
        .margin(marginFraction)
        .aspectRatio(areaTrueTreemapDefaults.aspectRatio)
        .collapseFolders(areaTrueTreemapDefaults.collapseFolders)
        .sorting(areaTrueTreemapDefaults.sorting)
        .labels(enableFloorLabels ? topLevels : 0, sizeRatio)
        .labelPosition(position)
        .build()
}
