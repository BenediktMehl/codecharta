import { Vector3 } from "three"
import { CcState, CodeMapNode, Node } from "../../../../model/codeCharta.model"
import { getMapResolutionScaleFactor, getMarkingColor, isLeaf } from "../../../../util/codeMapHelper"
import { selectedColorMetricDataSelector } from "../../../renderModel/renderModel.facade"
import { getBuildingColor, getIncomingEdgePoint, isNodeFlat, isVisible, TreeMapHelper, treeMapSize } from "../treeMapLayout/treeMapHelper"

/**
 * Minimal rectangle shape produced by the area-true-treemap package (and synthesised for the
 * root node, which the package does not emit). It is deliberately decoupled from the package's
 * `TreemapRect` type so the helper can also build the root node and be tested in isolation.
 */
export interface AreaTrueTreemapRect {
    x: number
    y: number
    width: number
    height: number
    depth: number
}

/**
 * Translates a laid-out rectangle into the same `Node` shape used by the existing TreeMap
 * builder (`TreeMapHelper.buildNodeFrom`), reusing its height/color/edge-point logic. The only
 * difference is the input: instead of a d3 `HierarchyRectangularNode` this takes a plain
 * rectangle plus the original `CodeMapNode`.
 */
export function buildNodeFrom(
    rect: AreaTrueTreemapRect,
    data: CodeMapNode,
    heightScale: number,
    maxHeight: number,
    state: CcState,
    isDeltaState: boolean
): Node {
    const mapSizeResolutionScaling = getMapResolutionScaleFactor(state.files)
    const isNodeLeaf = isLeaf(data)
    const flattened = isNodeFlat(data, state)
    const heightValue = TreeMapHelper.getHeightValue(state, data, maxHeight, flattened)
    const depth = data.path.split("/").length - 2
    const height = isNodeLeaf
        ? TreeMapHelper.resolveHeightValue(heightValue, heightScale, data, state) * mapSizeResolutionScaling
        : TreeMapHelper.FOLDER_HEIGHT
    const width = rect.width
    const length = rect.height
    const x0 = rect.x
    const y0 = rect.y
    const z0 = rect.depth * TreeMapHelper.FOLDER_HEIGHT
    const heightDelta = (data.deltas?.[state.mapState.heightMetric] ?? 0) * heightScale * mapSizeResolutionScaling
    const edgePointHeight = height + (heightDelta < 0 ? Math.abs(heightDelta) : 0)

    return {
        name: data.name,
        id: data.id,
        width,
        height,
        length,
        depth,
        mapNodeDepth: rect.depth,
        x0,
        z0,
        y0,
        isLeaf: isNodeLeaf,
        attributes: data.attributes,
        edgeAttributes: data.edgeAttributes,
        deltas: data.deltas,
        heightDelta,
        visible: isVisible(data, isNodeLeaf, state, flattened),
        path: data.path,
        link: data.link,
        markingColor: getMarkingColor(data, state.sharedView.markedPackages),
        flat: flattened,
        color: getBuildingColor(data, state, selectedColorMetricDataSelector(state), isDeltaState, flattened),
        incomingEdgePoint: getIncomingEdgePoint(width, edgePointHeight, length, new Vector3(x0, z0, y0), treeMapSize),
        outgoingEdgePoint: getOutgoingEdgePoint(width, edgePointHeight, length, new Vector3(x0, z0, y0), treeMapSize)
    }
}

// Mirrors treeMapHelper's `getOutgoingEdgePoint`, which is not exported there.
function getOutgoingEdgePoint(width: number, height: number, length: number, vector: Vector3, mapSize: number) {
    if (width > length) {
        return new Vector3(vector.x - mapSize + 0.75 * width, vector.y + height, vector.z - mapSize + length / 2)
    }
    return new Vector3(vector.x - mapSize + width / 2, vector.y + height, vector.z - mapSize + 0.75 * length)
}
