import { klona } from "klona"
import { METRIC_DATA, STATE, TEST_FILE_WITH_PATHS } from "../../../../mocks/dataMocks"
import { CcState, CodeMapNode, Node, NodeMetricData, NodeType } from "../../../../model/codeCharta.model"
import { createTreemapNodes } from "../treeMapLayout/treeMapGenerator"
import { createAreaTrueTreemapNodes, layoutDefaults } from "./areaTrueTreemapGenerator"

function buildFolder(name: string, path: string, children: CodeMapNode[]): CodeMapNode {
    return { name, path, type: NodeType.FOLDER, attributes: {}, isExcluded: false, isFlattened: false, children }
}

function areaOfRoot(nodes: Node[]): number {
    const root = nodes.find(node => node.mapNodeDepth === 0)
    return root.width * root.length
}

function buildDeepFolderChain(): CodeMapNode {
    const deepLeaf: CodeMapNode = {
        name: "deep leaf",
        path: "/root/one/two/three/deep leaf",
        type: NodeType.FILE,
        attributes: { rloc: 100, mcc: 10, functions: 1 },
        isExcluded: false,
        isFlattened: false
    }
    return buildFolder("root", "/root", [
        buildFolder("one", "/root/one", [buildFolder("two", "/root/one/two", [buildFolder("three", "/root/one/two/three", [deepLeaf])])])
    ])
}

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
        it("should create positive rectangles within the root for a known test tree", () => {
            // Act
            const nodes: Node[] = createAreaTrueTreemapNodes(map, state, metricData, false)

            // Assert
            const rootNode = nodes.find(node => node.mapNodeDepth === 0)
            expect(rootNode).toBeDefined()
            expect(nodes.length).toBeGreaterThan(0)

            for (const node of nodes) {
                expect(node.width).toBeGreaterThan(0)
                expect(node.length).toBeGreaterThan(0)
                expect(node.x0).toBeGreaterThanOrEqual(0)
                expect(node.y0).toBeGreaterThanOrEqual(0)
                expect(node.x0 + node.width).toBeLessThanOrEqual(rootNode.x0 + rootNode.width + 0.001)
                expect(node.y0 + node.length).toBeLessThanOrEqual(rootNode.y0 + rootNode.length + 0.001)
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
            expect(rootNode.width).toBeGreaterThan(0)
            expect(rootNode.width).toBe(rootNode.length)
            // The root covers the whole map: no node may stick out of it.
            for (const node of nodes) {
                expect(node.x0 + node.width).toBeLessThanOrEqual(rootNode.width + 0.001)
                expect(node.y0 + node.length).toBeLessThanOrEqual(rootNode.length + 0.001)
            }
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
            const stateWithLabels = klona(state)
            stateWithLabels.mapState.enableFloorLabels = true
            state.mapState.enableFloorLabels = false

            // Act
            const nodesWithLabels: Node[] = createAreaTrueTreemapNodes(map, stateWithLabels, metricData, false)
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
            // The canvas reserves the strips, so the labelled map spans more than the unlabelled one.
            expect(areaOfRoot(nodesWithLabels)).toBeGreaterThan(areaOfRoot(nodesWithoutLabels))
        })

        it("should separate sibling leaves by a gap because sibling margins are on", () => {
            // Arrange
            // Both sibling leaves of "Parent Leaf" must not share an edge: the layout insets every
            // node by half the margin, so the leaves are separated by the full margin.

            // Act
            const nodes: Node[] = createAreaTrueTreemapNodes(map, state, metricData, false)

            // Assert
            const smallLeaf = nodes.find(node => node.name === "small leaf")
            const otherSmallLeaf = nodes.find(node => node.name === "other small leaf")

            expect(smallLeaf).toBeDefined()
            expect(otherSmallLeaf).toBeDefined()
            // The gap is the distance the two rectangles keep apart on the axis they are separated on.
            const horizontalGap = Math.max(
                smallLeaf.x0 - (otherSmallLeaf.x0 + otherSmallLeaf.width),
                otherSmallLeaf.x0 - (smallLeaf.x0 + smallLeaf.width)
            )
            const verticalGap = Math.max(
                smallLeaf.y0 - (otherSmallLeaf.y0 + otherSmallLeaf.length),
                otherSmallLeaf.y0 - (smallLeaf.y0 + smallLeaf.length)
            )
            expect(Math.max(horizontalGap, verticalGap)).toBeGreaterThan(0)
        })

        it("should span the same canvas as the squarified treemap for deep folder chains", () => {
            // Arrange
            // Only the top levels carry floor labels, so the canvas must not grow with the folders
            // below them. A larger canvas would make every building look flatter, because building
            // heights do not depend on the layout.
            const deepMap = buildDeepFolderChain()
            const squarifiedRoot = createTreemapNodes(deepMap, state, metricData, false).find(node => node.mapNodeDepth === 0)

            // Act
            const areaTrueRoot = createAreaTrueTreemapNodes(deepMap, state, metricData, false).find(node => node.mapNodeDepth === 0)

            // Assert
            expect(squarifiedRoot).toBeDefined()
            expect(areaTrueRoot).toBeDefined()
            expect(areaTrueRoot.width / squarifiedRoot.width).toBeCloseTo(1, 1)
            expect(areaTrueRoot.length / squarifiedRoot.length).toBeCloseTo(1, 1)
        })
    })

    describe("layoutDefaults", () => {
        it("should use the improved two-pass algorithm", () => {
            // Assert
            expect(layoutDefaults.numberOfPasses).toBe(2)
            expect(layoutDefaults.scale).toBe(true)
        })

        it("should place siblings in descending order and re-sort in the second pass", () => {
            // Assert
            expect(layoutDefaults.sorting).toBe("descending")
            expect(layoutDefaults.order).toBe("newOrder")
        })

        it("should keep the remaining layout defaults stable", () => {
            // Assert
            expect(layoutDefaults.incrementMargin).toBe(false)
            expect(layoutDefaults.applySiblingMargin).toBe(true)
            expect(layoutDefaults.siblingMarginLeavesOnly).toBe(false)
            expect(layoutDefaults.collapseFolders).toBe(false)
            expect(layoutDefaults.round).toBe(false)
        })
    })
})
