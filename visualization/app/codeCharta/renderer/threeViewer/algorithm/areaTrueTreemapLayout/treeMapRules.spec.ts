import { hierarchy } from "area-true-treemap"
import { Vector3 } from "three"
import { edgesSelector } from "../../../../lenses/dependency/dependencyLens.facade"
import { STATE } from "../../../../mocks/dataMocks"
import { CcState, CodeMapNode, ColorMode, EdgeVisibility, NodeType } from "../../../../model/codeCharta.model"
import { clone } from "../../../../util/clone"
import { searchedNodePathsSelector } from "../../../renderModel/renderModel.facade"
import { TreeMapHelper } from "../treeMapLayout/treeMapHelper"
import {
    calculateAreaValue,
    getAddedFloorLabelSpace,
    getBuildingColor,
    getEstimatedNodesPerSide,
    getHeightValue,
    getIncomingEdgePoint,
    isNodeFlat,
    isVisible,
    resolveHeightValue
} from "./treeMapRules"

jest.mock("../../../renderModel/renderModel.facade", () => ({ searchedNodePathsSelector: jest.fn() }))
jest.mock("../../../../lenses/dependency/store/edges.selector", () => ({ edgesSelector: jest.fn() }))

const INVERTED_DIRECTION_DESCRIPTOR = {
    title: "An inverted metric",
    description: "",
    hintLowValue: "",
    hintHighValue: "",
    link: "",
    direction: 1
}

function buildLeaf(name: string, path: string, attributes: Record<string, number> = {}): CodeMapNode {
    return { name, path, type: NodeType.FILE, attributes, edgeAttributes: {}, isExcluded: false, isFlattened: false }
}

function buildFolder(name: string, path: string, children: CodeMapNode[]): CodeMapNode {
    return { name, path, type: NodeType.FOLDER, attributes: {}, edgeAttributes: {}, isExcluded: false, isFlattened: false, children }
}

describe("treeMapRules", () => {
    let state: CcState

    beforeEach(() => {
        state = clone(STATE)
        state.mapState.areaMetric = "rloc"
        state.mapState.heightMetric = "mcc"
        state.mapState.colorMetric = "rloc"
        state.mapState.invertArea = false
        state.mapState.invertHeight = false
        state.mapState.hideFlatBuildings = false
        state.mapState.showOnlyBuildingsWithEdges = false
        state.mapState.enableFloorLabels = true
        state.mapState.colorMode = ColorMode.absolute
        state.mapState.colorRange = { from: 5, to: 10 }
        state.metricsLensSource.attributeDescriptors = {}
        state.sharedView.searchPattern = ""
        state.sharedView.focusedNodePath = []
        ;(edgesSelector as unknown as jest.Mock).mockReturnValue([])
        ;(searchedNodePathsSelector as unknown as jest.Mock).mockReturnValue(new Set())
    })

    describe("getAddedFloorLabelSpace", () => {
        it("should add the strip of the root and of every labelled folder", () => {
            // Arrange
            const map = buildFolder("root", "/root", [buildFolder("one", "/root/one", [buildLeaf("leaf", "/root/one/leaf")])])

            // Act
            const addedSpace = getAddedFloorLabelSpace(hierarchy(map), true)

            // Assert
            expect(addedSpace).toBe(120 + 95)
        })

        it("should not add a strip below the labelled levels", () => {
            // Arrange
            const deepLeaf = buildLeaf("leaf", "/root/one/two/three/leaf")
            const map = buildFolder("root", "/root", [
                buildFolder("one", "/root/one", [
                    buildFolder("two", "/root/one/two", [buildFolder("three", "/root/one/two/three", [deepLeaf])])
                ])
            ])

            // Act
            const addedSpace = getAddedFloorLabelSpace(hierarchy(map), true)

            // Assert
            // "three" sits at depth 3, the first folder that draws no label.
            expect(addedSpace).toBe(120 + 95 + 95)
        })

        it("should not add any space when floor labels are disabled", () => {
            // Arrange
            const map = buildFolder("root", "/root", [buildFolder("one", "/root/one", [buildLeaf("leaf", "/root/one/leaf")])])

            // Act
            const addedSpace = getAddedFloorLabelSpace(hierarchy(map), false)

            // Assert
            expect(addedSpace).toBe(0)
        })
    })

    describe("getEstimatedNodesPerSide", () => {
        it("should estimate two nodes per side of the square root of the nodes", () => {
            // Arrange
            const map = buildFolder("root", "/root", [buildLeaf("a", "/root/a"), buildLeaf("b", "/root/b")])

            // Act
            const nodesPerSide = getEstimatedNodesPerSide(hierarchy(map))

            // Assert
            expect(nodesPerSide).toBeCloseTo(2 * Math.sqrt(3))
        })

        it("should leave excluded and flattened nodes out of the estimate", () => {
            // Arrange
            const excluded = { ...buildLeaf("a", "/root/a"), isExcluded: true }
            const flattened = { ...buildLeaf("b", "/root/b"), isFlattened: true }
            const map = buildFolder("root", "/root", [excluded, flattened, buildLeaf("c", "/root/c")])

            // Act
            const nodesPerSide = getEstimatedNodesPerSide(hierarchy(map))

            // Assert
            expect(nodesPerSide).toBeCloseTo(2 * Math.sqrt(2))
        })
    })

    describe("calculateAreaValue", () => {
        it("should give an excluded node no area", () => {
            // Arrange
            const excluded = { ...buildLeaf("a", "/root/a", { rloc: 100 }), isExcluded: true }

            // Act
            const areaValue = calculateAreaValue(excluded, state, 1000, false)

            // Assert
            expect(areaValue).toBe(0)
        })

        it("should use the area metric of a leaf", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a", { rloc: 100 })

            // Act
            const areaValue = calculateAreaValue(leaf, state, 1000, false)

            // Assert
            expect(areaValue).toBe(100)
        })

        it("should invert the area when the area is inverted", () => {
            // Arrange
            state.mapState.invertArea = true
            const leaf = buildLeaf("a", "/root/a", { rloc: 100 })

            // Act
            const areaValue = calculateAreaValue(leaf, state, 1000, false)

            // Assert
            expect(areaValue).toBe(900)
        })

        it("should fill up to the maximum when the attribute direction is inversed", () => {
            // Arrange
            state.metricsLensSource.attributeDescriptors = { rloc: INVERTED_DIRECTION_DESCRIPTOR }
            const leaf = buildLeaf("a", "/root/a", { rloc: 100 })

            // Act
            const areaValue = calculateAreaValue(leaf, state, 1000, false)

            // Assert
            expect(areaValue).toBe(900)
        })

        it("should keep the value of an inversed attribute that is inverted as well", () => {
            // Arrange
            state.mapState.invertArea = true
            state.metricsLensSource.attributeDescriptors = { rloc: INVERTED_DIRECTION_DESCRIPTOR }
            const leaf = buildLeaf("a", "/root/a", { rloc: 100 })

            // Act
            const areaValue = calculateAreaValue(leaf, state, 1000, false)

            // Assert
            expect(areaValue).toBe(100)
        })

        it("should use the drop of a comparison map node as its area", () => {
            // Arrange
            const onlyInComparisonMap: CodeMapNode = {
                ...buildLeaf("a", "/root/a", { rloc: 0 }),
                deltas: { rloc: -50, mcc: -3 }
            }

            // Act
            const areaValue = calculateAreaValue(onlyInComparisonMap, state, 1000, false)

            // Assert
            expect(areaValue).toBe(50)
        })

        it("should give a node without area a minimal share when experimental features are on", () => {
            // Arrange
            const folder = buildFolder("f", "/root/f", [buildLeaf("a", "/root/f/a", { rloc: 100 })])

            // Act
            const areaValue = calculateAreaValue(folder, state, 1000, true)

            // Assert
            expect(areaValue).toBe(0.5)
        })

        it("should give a node without area no share when experimental features are off", () => {
            // Arrange
            const folder = buildFolder("f", "/root/f", [buildLeaf("a", "/root/f/a", { rloc: 100 })])

            // Act
            const areaValue = calculateAreaValue(folder, state, 1000, false)

            // Assert
            expect(areaValue).toBe(0)
        })
    })

    describe("getHeightValue", () => {
        it("should give a flat building the minimal height", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a", { mcc: 100 })

            // Act
            const heightValue = getHeightValue(state, leaf, 2000, true)

            // Assert
            expect(heightValue).toBe(TreeMapHelper.MIN_BUILDING_HEIGHT)
        })

        it("should use the height metric of the node", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a", { mcc: 100 })

            // Act
            const heightValue = getHeightValue(state, leaf, 2000, false)

            // Assert
            expect(heightValue).toBe(100)
        })

        it("should invert the height when the height is inverted", () => {
            // Arrange
            state.mapState.invertHeight = true
            const leaf = buildLeaf("a", "/root/a", { mcc: 100 })

            // Act
            const heightValue = getHeightValue(state, leaf, 2000, false)

            // Assert
            expect(heightValue).toBe(1900)
        })

        it("should fill up to the maximum when the attribute direction is inversed", () => {
            // Arrange
            state.metricsLensSource.attributeDescriptors = { mcc: INVERTED_DIRECTION_DESCRIPTOR }
            const leaf = buildLeaf("a", "/root/a", { mcc: 100 })

            // Act
            const heightValue = getHeightValue(state, leaf, 2000, false)

            // Assert
            expect(heightValue).toBe(1900)
        })

        it("should keep the height of an inversed attribute that is inverted as well", () => {
            // Arrange
            state.mapState.invertHeight = true
            state.metricsLensSource.attributeDescriptors = { mcc: INVERTED_DIRECTION_DESCRIPTOR }
            const leaf = buildLeaf("a", "/root/a", { mcc: 100 })

            // Act
            const heightValue = getHeightValue(state, leaf, 2000, false)

            // Assert
            expect(heightValue).toBe(100)
        })

        it("should give a node without the height metric the value zero", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a", { rloc: 100 })

            // Act
            const heightValue = getHeightValue(state, leaf, 2000, false)

            // Assert
            expect(heightValue).toBe(0)
        })
    })

    describe("resolveHeightValue", () => {
        it("should use the minimal height for a node without deltas", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a")

            // Act
            const height = resolveHeightValue(1, 1, leaf, state)

            // Assert
            expect(height).toBe(TreeMapHelper.MIN_BUILDING_HEIGHT)
        })

        it("should allow a zero height for a node with a delta", () => {
            // Arrange
            const leaf: CodeMapNode = { ...buildLeaf("a", "/root/a"), deltas: { mcc: 5 } }

            // Act
            const height = resolveHeightValue(0, 1, leaf, state)

            // Assert
            expect(height).toBe(0)
        })

        it("should scale the height value", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a")

            // Act
            const height = resolveHeightValue(10, 2, leaf, state)

            // Assert
            expect(height).toBe(20)
        })
    })

    describe("isVisible", () => {
        it("should hide an excluded node", () => {
            // Arrange
            const excluded = buildLeaf("a", "/root/a")
            excluded.isExcluded = true

            // Act
            const visible = isVisible(excluded, true, state, false)

            // Assert
            expect(visible).toBe(false)
        })

        it("should hide a flat building when flat buildings are hidden", () => {
            // Arrange
            state.mapState.hideFlatBuildings = true
            const flatLeaf = buildLeaf("a", "/root/a")

            // Act
            const visible = isVisible(flatLeaf, true, state, true)

            // Assert
            expect(visible).toBe(false)
        })

        it("should keep a flat node that is no building", () => {
            // Arrange
            state.mapState.hideFlatBuildings = true
            const flatFolder = buildFolder("f", "/root/f", [buildLeaf("a", "/root/f/a")])

            // Act
            const visible = isVisible(flatFolder, false, state, true)

            // Assert
            expect(visible).toBe(true)
        })

        it("should show only the children of the focused node", () => {
            // Arrange
            state.sharedView.focusedNodePath = ["/root/one"]
            const childOfFocus = buildLeaf("leaf", "/root/one/leaf")
            const outsideOfFocus = buildLeaf("leaf", "/root/two/leaf")

            // Act
            const childVisible = isVisible(childOfFocus, true, state, false)
            const outsideVisible = isVisible(outsideOfFocus, true, state, false)

            // Assert
            expect(childVisible).toBe(true)
            expect(outsideVisible).toBe(false)
        })

        it("should show every node when nothing is focused", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a")

            // Act
            const visible = isVisible(leaf, true, state, false)

            // Assert
            expect(visible).toBe(true)
        })
    })

    describe("getIncomingEdgePoint", () => {
        it("should place the point on the middle of the long side of a wide building", () => {
            // Act
            const point = getIncomingEdgePoint(100, 10, 40, new Vector3(0, 0, 0), 250)

            // Assert
            expect(point).toEqual(new Vector3(-250 + 100 / 4, 10, -250 + 40 / 2))
        })

        it("should place the point on the middle of the long side of a tall building", () => {
            // Act
            const point = getIncomingEdgePoint(40, 10, 100, new Vector3(0, 0, 0), 250)

            // Assert
            expect(point).toEqual(new Vector3(-250 + 40 / 2, 10, -250 + 100 / 4))
        })
    })

    describe("isNodeFlat", () => {
        it("should flatten a node that is flattened in the blacklist", () => {
            // Arrange
            const flattened = buildLeaf("a", "/root/a")
            flattened.isFlattened = true

            // Act
            const flat = isNodeFlat(flattened, state)

            // Assert
            expect(flat).toBe(true)
        })

        it("should flatten every node when the search finds nothing", () => {
            // Arrange
            state.sharedView.searchPattern = "/root/a"
            ;(searchedNodePathsSelector as unknown as jest.Mock).mockReturnValue(new Set())

            // Act
            const flat = isNodeFlat(buildLeaf("a", "/root/a"), state)

            // Assert
            expect(flat).toBe(true)
        })

        it("should keep the searched node itself unfolded", () => {
            // Arrange
            state.sharedView.searchPattern = "/root/a"
            ;(searchedNodePathsSelector as unknown as jest.Mock).mockReturnValue(new Set(["/root/a"]))

            // Act
            const flat = isNodeFlat(buildLeaf("a", "/root/a"), state)

            // Assert
            expect(flat).toBe(false)
        })

        it("should flatten a node outside the search result", () => {
            // Arrange
            state.sharedView.searchPattern = "/root/a"
            ;(searchedNodePathsSelector as unknown as jest.Mock).mockReturnValue(new Set(["/root/b"]))

            // Act
            const flat = isNodeFlat(buildLeaf("a", "/root/a"), state)

            // Assert
            expect(flat).toBe(true)
        })

        it("should not flatten by search when no pattern is set", () => {
            // Arrange
            state.sharedView.searchPattern = ""
            ;(searchedNodePathsSelector as unknown as jest.Mock).mockReturnValue(new Set(["/root/b"]))

            // Act
            const flat = isNodeFlat(buildLeaf("a", "/root/a"), state)

            // Assert
            expect(flat).toBe(false)
        })

        it("should flatten a node without a visible edge when only edge buildings are shown", () => {
            // Arrange
            state.mapState.showOnlyBuildingsWithEdges = true
            state.mapState.edgeMetric = "pairingRate"
            ;(edgesSelector as unknown as jest.Mock).mockReturnValue([
                { fromNodeName: "/root/b", toNodeName: "/root/c", attributes: {}, visible: EdgeVisibility.both }
            ])

            // Act
            const flat = isNodeFlat(buildLeaf("a", "/root/a"), state)

            // Assert
            expect(flat).toBe(true)
        })

        it("should flatten a node whose edge metric no edge refers to", () => {
            // Arrange
            state.mapState.showOnlyBuildingsWithEdges = true
            state.mapState.edgeMetric = "pairingRate"
            const leaf = buildLeaf("a", "/root/a")
            leaf.edgeAttributes = { pairingRate: { incoming: 1, outgoing: 1 } }
            ;(edgesSelector as unknown as jest.Mock).mockReturnValue([
                { fromNodeName: "/root/b", toNodeName: "/root/c", attributes: {}, visible: EdgeVisibility.both }
            ])

            // Act
            const flat = isNodeFlat(leaf, state)

            // Assert
            expect(flat).toBe(true)
        })

        it("should keep a node with a visible edge unfolded", () => {
            // Arrange
            state.mapState.showOnlyBuildingsWithEdges = true
            state.mapState.edgeMetric = "pairingRate"
            const leaf = buildLeaf("a", "/root/a")
            leaf.edgeAttributes = { pairingRate: { incoming: 1, outgoing: 1 } }
            ;(edgesSelector as unknown as jest.Mock).mockReturnValue([
                { fromNodeName: "/root/a", toNodeName: "/root/c", attributes: {}, visible: EdgeVisibility.both }
            ])

            // Act
            const flat = isNodeFlat(leaf, state)

            // Assert
            expect(flat).toBe(false)
        })

        it("should keep every node unfolded when no edge is visible", () => {
            // Arrange
            state.mapState.showOnlyBuildingsWithEdges = true
            ;(edgesSelector as unknown as jest.Mock).mockReturnValue([])

            // Act
            const flat = isNodeFlat(buildLeaf("a", "/root/a"), state)

            // Assert
            expect(flat).toBe(false)
        })

        it("should keep a node unfolded by default", () => {
            // Act
            const flat = isNodeFlat(buildLeaf("a", "/root/a"), state)

            // Assert
            expect(flat).toBe(false)
        })
    })

    describe("getBuildingColor", () => {
        const colorMetricData = { minValue: 0, maxValue: 100 }

        it("should color every building the base color in a comparison map", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a", { rloc: 7 })

            // Act
            const color = getBuildingColor(leaf, state, colorMetricData, true, false)

            // Assert
            expect(color).toBe(state.mapState.mapColors.base)
        })

        it("should color a node without the color metric in the base color", () => {
            // Arrange
            state.mapState.colorMetric = "unknown"
            const leaf = buildLeaf("a", "/root/a", { rloc: 7 })

            // Act
            const color = getBuildingColor(leaf, state, colorMetricData, false, false)

            // Assert
            expect(color).toBe(state.mapState.mapColors.base)
        })

        it("should color a flat node in the flat color", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a", { rloc: 7 })

            // Act
            const color = getBuildingColor(leaf, state, colorMetricData, false, true)

            // Assert
            expect(color).toBe(state.mapState.mapColors.flat)
        })

        it("should color a unary map positive", () => {
            // Arrange
            state.mapState.colorMetric = "unary"
            const leaf = buildLeaf("a", "/root/a", { unary: 1 })

            // Act
            const color = getBuildingColor(leaf, state, colorMetricData, false, false)

            // Assert
            expect(color).toBe(state.mapState.mapColors.positive)
        })

        it("should color by the gradient", () => {
            // Arrange
            const leaf = buildLeaf("a", "/root/a", { rloc: 0 })

            // Act
            const color = getBuildingColor(leaf, state, colorMetricData, false, false)

            // Assert
            expect(color).toBe(state.mapState.mapColors.positive)
        })
    })
})
