/**
 * The tree-map rules this layout needs: the canvas and area-value helpers of the Squarified
 * TreeMap and the building rules of its node builder, copied from
 * `treeMapLayout/treeMapGenerator.ts` and `treeMapLayout/treeMapHelper.ts`.
 *
 * The copy is deliberate: the Area-True layout must stay independent of the Squarified layout so it
 * can be reviewed and merged on its own. When the originals change, this file has to change too.
 */
import type { HierarchyNode } from "area-true-treemap"
import { Vector3 } from "three"
import { edgesSelector } from "../../../../lenses/dependency/dependencyLens.facade"
import { CcState, CodeMapNode, MapState } from "../../../../model/codeCharta.model"
import { getMapResolutionScaleFactor, isLeaf } from "../../../../util/codeMapHelper"
import { getColorByMetricValue } from "../../../../util/color/gradientCalculator"
import { MetricMinMax } from "../../../../util/metric/metricRange"
import { searchedNodePathsSelector } from "../../../renderModel/renderModel.facade"

export const treeMapSize = 250

const DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_1 = 120
const DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_2 = 95
export const HIERARCHY_LEVELS_WITH_LABLES_UPPER_BOUNDARY = 3

/**
 * Room the map has to reserve for the floor-label strips of the labelled levels. Both layout
 * algorithms size their canvas with it, so switching layouts keeps the map on the same scale.
 */
export function getAddedFloorLabelSpace(hierarchyNode: HierarchyNode<CodeMapNode>, enableFloorLabels: boolean) {
    let addedSpace = 0
    hierarchyNode.eachAfter(node => {
        if (enableFloorLabels && !isLeaf(node) && node.depth < HIERARCHY_LEVELS_WITH_LABLES_UPPER_BOUNDARY) {
            addedSpace += node.depth === 0 ? DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_1 : DEFAULT_PADDING_FLOOR_LABEL_FROM_LEVEL_2
        }
    })
    return addedSpace
}

export function getEstimatedNodesPerSide(hierarchyNode: HierarchyNode<CodeMapNode>) {
    let totalNodes = 0
    let blacklistedNodes = 0
    hierarchyNode.each(({ data }) => {
        if (data.isExcluded || data.isFlattened) {
            blacklistedNodes++
        }
        totalNodes++
    })

    return 2 * Math.sqrt(totalNodes - blacklistedNodes)
}

function isOnlyVisibleInComparisonMap(node: CodeMapNode, mapState: MapState) {
    return node.attributes[mapState.areaMetric] === 0 && node.deltas[mapState.heightMetric] < 0
}

export function calculateAreaValue(
    node: CodeMapNode,
    { mapState, metricsLensSource }: CcState,
    maxWidth: number,
    experimentalFeaturesEnabled: boolean
) {
    if (node.isExcluded) {
        return 0
    }

    if (node.deltas && isOnlyVisibleInComparisonMap(node, mapState)) {
        return Math.abs(node.deltas[mapState.areaMetric])
    }

    if (isLeaf(node) && node.attributes?.[mapState.areaMetric]) {
        const areaMetric = mapState.areaMetric
        const attributeDescriptors = metricsLensSource.attributeDescriptors
        const isAttributeDirectionInversed = attributeDescriptors[areaMetric]?.direction === 1

        if (isAttributeDirectionInversed) {
            return mapState.invertArea ? node.attributes[mapState.areaMetric] : maxWidth - node.attributes[mapState.areaMetric]
        }
        return mapState.invertArea ? maxWidth - node.attributes[mapState.areaMetric] : node.attributes[mapState.areaMetric]
    }
    return experimentalFeaturesEnabled ? 0.5 : 0
}

export const FOLDER_HEIGHT = 2
const MIN_BUILDING_HEIGHT = 2
const HEIGHT_VALUE_WHEN_METRIC_NOT_FOUND = 0

export function getHeightValue(state: CcState, squaredNode: CodeMapNode, maxHeight: number, flattened: boolean) {
    const mapSizeResolutionScaling = getMapResolutionScaleFactor(state.files)

    if (flattened) {
        return MIN_BUILDING_HEIGHT
    }

    let heightValue = squaredNode.attributes[state.mapState.heightMetric] || HEIGHT_VALUE_WHEN_METRIC_NOT_FOUND
    heightValue *= mapSizeResolutionScaling

    const heightMetric = state.mapState.heightMetric
    const attributeDescriptors = state.metricsLensSource.attributeDescriptors
    const isAttributeDirectionInversed = attributeDescriptors[heightMetric]?.direction === 1

    if (isAttributeDirectionInversed) {
        if (state.mapState.invertHeight) {
            return heightValue
        }
        return maxHeight - heightValue
    }
    if (state.mapState.invertHeight) {
        return maxHeight - heightValue
    }
    return heightValue
}

export function resolveHeightValue(heightValue: number, heightScale: number, data: CodeMapNode, state: CcState): number {
    const minimalHeight = data.deltas?.[state.mapState.heightMetric] ? 0 : MIN_BUILDING_HEIGHT
    return Math.max(Math.abs(heightScale * heightValue), minimalHeight)
}

export function isVisible(squaredNode: CodeMapNode, isNodeLeaf: boolean, state: CcState, flattened: boolean) {
    if (squaredNode.isExcluded || (isNodeLeaf && state.mapState.hideFlatBuildings && flattened)) {
        return false
    }

    if (state.sharedView.focusedNodePath.length > 0) {
        return squaredNode.path.startsWith(state.sharedView.focusedNodePath[0])
    }

    return true
}

export function getIncomingEdgePoint(width: number, height: number, length: number, vector: Vector3, mapSize: number) {
    if (width > length) {
        return new Vector3(vector.x - mapSize + width / 4, vector.y + height, vector.z - mapSize + length / 2)
    }
    return new Vector3(vector.x - mapSize + width / 2, vector.y + height, vector.z - mapSize + length / 4)
}

export function isNodeFlat(codeMapNode: CodeMapNode, state: CcState) {
    if (codeMapNode.isFlattened) {
        return true
    }

    const searchedNodePaths = searchedNodePathsSelector(state)

    if (searchedNodePaths && state.sharedView.searchPattern?.length > 0) {
        return searchedNodePaths.size === 0 || isNodeNonSearched(codeMapNode, state)
    }

    if (state.mapState.showOnlyBuildingsWithEdges && edgesSelector(state).some(edge => edge.visible)) {
        return nodeHasNoVisibleEdges(codeMapNode, state)
    }

    return false
}

function nodeHasNoVisibleEdges(codeMapNode: CodeMapNode, state: CcState) {
    return (
        codeMapNode.edgeAttributes[state.mapState.edgeMetric] === undefined ||
        !edgesSelector(state).some(edge => codeMapNode.path === edge.fromNodeName || codeMapNode.path === edge.toNodeName)
    )
}

function isNodeNonSearched(squaredNode: CodeMapNode, state: CcState) {
    const searchedNodePaths = searchedNodePathsSelector(state)
    return !searchedNodePaths.has(squaredNode.path)
}

export function getBuildingColor(
    node: CodeMapNode,
    { mapState }: CcState,
    nodeMetricDataRange: MetricMinMax,
    isDeltaState: boolean,
    flattened: boolean
) {
    const { mapColors } = mapState

    if (isDeltaState) {
        return mapColors.base
    }
    const metricValue = node.attributes[mapState.colorMetric]

    if (metricValue === undefined) {
        return mapColors.base
    }
    if (flattened) {
        return mapColors.flat
    }

    const { colorRange, colorMode } = mapState

    if (mapState["colorMetric"] === "unary") {
        return mapColors.positive
    }

    return getColorByMetricValue(mapColors, colorRange, colorMode, nodeMetricDataRange, metricValue)
}
