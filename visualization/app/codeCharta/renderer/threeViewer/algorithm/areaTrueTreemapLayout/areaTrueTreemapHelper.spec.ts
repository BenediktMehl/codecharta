import { klona } from "klona"
import { STATE } from "../../../../mocks/dataMocks"
import { CcState, CodeMapNode, Node, NodeType } from "../../../../model/codeCharta.model"
import { AreaTrueTreemapRect, buildNodeFrom } from "./areaTrueTreemapHelper"

jest.mock("../../../renderModel/accumulatedData/accumulatedData.selector", () => ({
    accumulatedDataSelector: () => ({
        unifiedMapNode: {
            name: "Anode",
            path: "/root/Anode",
            type: "File",
            attributes: { theHeight: 100 },
            isExcluded: false,
            isFlattened: false
        }
    })
}))
jest.mock("../../../renderModel/accumulatedData/metricData/selectedColorMetricData.selector", () => ({
    selectedColorMetricDataSelector: () => ({ minValue: 0, maxValue: 100 })
}))
jest.mock("../../../../lenses/dependency/store/edges.selector", () => ({ edgesSelector: jest.fn() }))

describe("areaTrueTreemapHelper", () => {
    let state: CcState
    let leaf: CodeMapNode

    const heightScale = 1
    const maxHeight = 2000
    const isDeltaState = false

    beforeEach(() => {
        state = klona(STATE)
        state.mapState.heightMetric = "mcc"
        state.mapState.colorMetric = "rloc"
        state.mapState.areaMetric = "rloc"
        state.sharedView.focusedNodePath = []
        state.mapState.invertHeight = false
        leaf = {
            name: "leaf",
            path: "/root/leaf",
            type: NodeType.FILE,
            attributes: { mcc: 100, rloc: 30 },
            edgeAttributes: {},
            isExcluded: false,
            isFlattened: false
        }
    })

    function buildNode(rect: AreaTrueTreemapRect, data: CodeMapNode = leaf): Node {
        return buildNodeFrom(rect, data, heightScale, maxHeight, state, isDeltaState)
    }

    it("should take width, length and depth from the laid-out rectangle", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 10, y: 20, width: 100, height: 40, depth: 2 }

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.width).toBe(100)
        expect(node.length).toBe(40)
        expect(node.x0).toBe(10)
        expect(node.y0).toBe(20)
        expect(node.mapNodeDepth).toBe(2)
        expect(node.z0).toBe(2 * 2)
        expect(node.depth).toBe(1)
        expect(node.isLeaf).toBe(true)
    })

    it("should give a building its height metric as height", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 100, height: 40, depth: 1 }

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.height).toBe(100)
    })

    it("should place the edge points on the long side of a wide building", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 100, height: 40, depth: 1 }

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.incomingEdgePoint.x).toBe(-250 + 25)
        expect(node.incomingEdgePoint.z).toBe(-250 + 20)
        expect(node.outgoingEdgePoint.x).toBe(-250 + 75)
        expect(node.outgoingEdgePoint.z).toBe(-250 + 20)
    })

    it("should place the edge points on the long side of a tall building", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 40, height: 100, depth: 1 }

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.incomingEdgePoint.x).toBe(-250 + 20)
        expect(node.incomingEdgePoint.z).toBe(-250 + 25)
        expect(node.outgoingEdgePoint.x).toBe(-250 + 20)
        expect(node.outgoingEdgePoint.z).toBe(-250 + 75)
    })

    it("should lift the edge points by the drop of a comparison map node", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 100, height: 40, depth: 1 }
        leaf.deltas = { mcc: -33 }

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.heightDelta).toBe(-33)
        expect(node.height).toBe(100)
        // The point sits on top of the building, lifted by the drop of the comparison map.
        expect(node.incomingEdgePoint.y).toBe(node.z0 + node.height + 33)
    })

    it("should give a folder the folder height", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 100, height: 40, depth: 1 }
        const folder: CodeMapNode = {
            name: "folder",
            path: "/root/folder",
            type: NodeType.FOLDER,
            attributes: { mcc: 100 },
            edgeAttributes: {},
            isExcluded: false,
            isFlattened: false,
            children: [leaf]
        }

        // Act
        const node = buildNode(rect, folder)

        // Assert
        expect(node.isLeaf).toBe(false)
        expect(node.height).toBe(2)
    })

    it("should hide an excluded node", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 100, height: 40, depth: 1 }
        leaf.isExcluded = true

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.visible).toBe(false)
    })

    it("should mark a flattened node as flat", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 100, height: 40, depth: 1 }
        leaf.isFlattened = true

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.flat).toBe(true)
    })

    it("should carry the marking color of a marked package", () => {
        // Arrange
        const rect: AreaTrueTreemapRect = { x: 0, y: 0, width: 100, height: 40, depth: 1 }
        state.sharedView.markedPackages = [{ path: "/root/leaf", color: "#FF0000" }]

        // Act
        const node = buildNode(rect)

        // Assert
        expect(node.markingColor).toBe("#FF0000")
    })
})
