import { klona } from "klona"
import { METRIC_DATA, STATE, TEST_FILE_WITH_PATHS } from "../../../../mocks/dataMocks"
import { CcState, CodeMapNode, Node, NodeMetricData } from "../../../../model/codeCharta.model"
import { createAreaTrueTreemapNodes } from "./areaTrueTreemapGenerator"

describe("areaTrueTreemapGenerator", () => {
    let map: CodeMapNode
    let state: CcState
    let metricData: NodeMetricData[]

    beforeEach(() => {
        map = klona(TEST_FILE_WITH_PATHS.map)
        state = klona(STATE)
        metricData = klona(METRIC_DATA)
        state.sharedView.focusedNodePath = []
    })

    describe("createAreaTrueTreemapNodes", () => {
        it("should create positive rectangles within the canvas for a known test tree", () => {
            // Arrange
            const canvasSize = 500 // treeMapSize * 2 at the default map resolution scale

            // Act
            const nodes: Node[] = createAreaTrueTreemapNodes(map, state, metricData, false)

            // Assert
            expect(nodes.length).toBeGreaterThan(0)

            for (const node of nodes) {
                expect(node.width).toBeGreaterThan(0)
                expect(node.length).toBeGreaterThan(0)
                expect(node.x0).toBeGreaterThanOrEqual(0)
                expect(node.y0).toBeGreaterThanOrEqual(0)
                expect(node.x0 + node.width).toBeLessThanOrEqual(canvasSize)
                expect(node.y0 + node.length).toBeLessThanOrEqual(canvasSize)
            }
        })

        it("should include the root node spanning the whole canvas", () => {
            // Act
            const nodes: Node[] = createAreaTrueTreemapNodes(map, state, metricData, false)

            // Assert
            const rootNode = nodes.find(node => node.mapNodeDepth === 0)
            expect(rootNode).toBeDefined()
            expect(rootNode.name).toBe("root")
            expect(rootNode.x0).toBe(0)
            expect(rootNode.y0).toBe(0)
            expect(rootNode.width).toBe(500)
            expect(rootNode.length).toBe(500)
        })

        it("should create a node for every visible leaf of the tree", () => {
            // Act
            const nodes: Node[] = createAreaTrueTreemapNodes(map, state, metricData, false)

            // Assert
            const leafNames = nodes.filter(node => node.isLeaf).map(node => node.name)
            expect(leafNames).toEqual(expect.arrayContaining(["big leaf", "small leaf", "other small leaf"]))
            // The empty folder has no area value and is therefore omitted by the package.
            expect(leafNames).not.toContain("empty folder")
        })

        it("should reserve folder label space when enableFloorLabels is enabled", () => {
            // Arrange
            const nodesWithLabels: Node[] = createAreaTrueTreemapNodes(map, state, metricData, false)
            state.mapState.enableFloorLabels = false

            // Act
            const nodesWithoutLabels: Node[] = createAreaTrueTreemapNodes(map, state, metricData, false)

            // Assert
            const nodeWithLabel = nodesWithLabels.find(node => node.name === "small leaf")
            const nodeWithoutLabel = nodesWithoutLabels.find(node => node.name === "small leaf")

            expect(nodeWithLabel).toBeDefined()
            expect(nodeWithoutLabel).toBeDefined()
            expect(
                nodeWithLabel.x0 !== nodeWithoutLabel.x0 ||
                    nodeWithLabel.y0 !== nodeWithoutLabel.y0 ||
                    nodeWithLabel.width !== nodeWithoutLabel.width ||
                    nodeWithLabel.length !== nodeWithoutLabel.length
            ).toBe(true)
        })
    })
})
