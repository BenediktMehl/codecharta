import { mkdirSync, readFileSync, writeFileSync } from "fs"
import { klona } from "klona"
import { dirname, resolve } from "path"
import { STATE } from "../../../../mocks/dataMocks"
import { ExportCCFile } from "../../../../model/codeCharta.api.model"
import { CcState, CodeMapNode, Node, NodeMetricData } from "../../../../model/codeCharta.model"
import { isLeaf } from "../../../../util/codeMapHelper"
import { createTreemapNodes } from "../treeMapLayout/treeMapGenerator"
import { createAreaTrueTreemapNodes } from "./areaTrueTreemapGenerator"

const REPO_ROOT = resolve(__dirname, "../../../../../../..")
const REPORT_PATH = resolve(__dirname, "../../../../../../test-output/area-true-large-maps.json")

const SHOWCASE_FILES = [
    "gh-pages/public/assets/ccjson/showcase/httpd/httpd_2016-10-24.cc.json",
    "gh-pages/public/assets/ccjson/showcase/httpd/httpd_2019-10-26.cc.json",
    "gh-pages/public/assets/ccjson/showcase/junit4/junit4_2019-10-26.cc.json",
    "gh-pages/public/assets/ccjson/showcase/junit5/junit5_2019-10-26.cc.json",
    "gh-pages/public/assets/ccjson/showcase/aoo/aoo_2019-08-02.cc.json",
    "gh-pages/public/assets/ccjson/showcase/netbeans/netbeans_2019-10-19.cc.json",
    "gh-pages/public/assets/ccjson/showcase/netbeans/netbeans_2018-10-19.cc.json"
]

const PREFERRED_AREA_METRICS = ["rloc", "loc", "functions", "classes", "mcc"]
const PREFERRED_HEIGHT_METRICS = ["mcc", "functions", "classes", "rloc", "loc"]

function decoratePaths(node: CodeMapNode, parentPath = "") {
    node.path = parentPath ? `${parentPath}/${node.name}` : `/${node.name}`
    for (const child of node.children ?? []) {
        decoratePaths(child, node.path)
    }
    return node
}

function collectLeafMetrics(map: CodeMapNode) {
    const maxByMetric = new Map<string, number>()
    const visit = (node: CodeMapNode) => {
        if (isLeaf(node)) {
            for (const [name, value] of Object.entries(node.attributes ?? {})) {
                if (typeof value === "number" && Number.isFinite(value) && value > 0) {
                    maxByMetric.set(name, Math.max(maxByMetric.get(name) ?? 0, value))
                }
            }
        }
        for (const child of node.children ?? []) {
            visit(child)
        }
    }
    visit(map)
    const names = [...maxByMetric.keys()].sort()
    const pick = (preferences: string[]) => preferences.find(pref => maxByMetric.has(pref)) ?? names[0]
    const areaMetric = pick(PREFERRED_AREA_METRICS)
    const heightMetric = pick(PREFERRED_HEIGHT_METRICS.filter(name => name !== areaMetric)) ?? areaMetric
    return { names, maxByMetric, areaMetric, heightMetric }
}

function buildMetricData(names: string[], maxByMetric: Map<string, number>): NodeMetricData[] {
    return names.map(name => ({ name, maxValue: maxByMetric.get(name) ?? 0, minValue: 0, values: [] }))
}

function countPositiveAreaLeaves(map: CodeMapNode, areaMetric: string) {
    let count = 0
    const visit = (node: CodeMapNode) => {
        if (isLeaf(node) && (node.attributes?.[areaMetric] ?? 0) > 0) {
            count++
        }
        for (const child of node.children ?? []) {
            visit(child)
        }
    }
    visit(map)
    return count
}

function summarize(nodes: Node[], map: CodeMapNode) {
    const root = nodes.find(node => node.mapNodeDepth === 0)
    const leaves = nodes.filter(node => node.isLeaf)
    const folders = nodes.filter(node => !node.isLeaf)
    const zeroAreaRects = nodes.filter(node => node.width <= 0 || node.length <= 0).length
    const outOfBounds = nodes.filter(
        node =>
            node.x0 < 0 ||
            node.y0 < 0 ||
            node.x0 + node.width > (root?.width ?? 0) + 0.01 ||
            node.y0 + node.length > (root?.length ?? 0) + 0.01
    ).length
    const leafArea = leaves.reduce((sum, node) => sum + node.width * node.length, 0)
    const rootArea = (root?.width ?? 0) * (root?.length ?? 0)
    return {
        rootDims: root ? [Math.round(root.width), Math.round(root.length)] : null,
        rectCount: nodes.length,
        leafRects: leaves.length,
        folderRects: folders.length,
        zeroAreaRects,
        outOfBounds,
        leafCoverage: rootArea ? Math.round((leafArea / rootArea) * 100) : null
    }
}

function run(name: string, file: string) {
    const json = JSON.parse(readFileSync(resolve(REPO_ROOT, file), "utf8")) as ExportCCFile
    const map = decoratePaths(json.nodes[0])
    const { names, maxByMetric, areaMetric, heightMetric } = collectLeafMetrics(map)
    const metricData = buildMetricData(names, maxByMetric)
    const state = klona(STATE) as CcState
    state.sharedView.focusedNodePath = []
    state.mapState.areaMetric = areaMetric
    state.mapState.heightMetric = heightMetric
    state.mapState.colorMetric = heightMetric
    state.mapState.distributionMetric = heightMetric
    state.mapState.invertHeight = false
    state.mapState.margin = 50
    const positiveLeaves = countPositiveAreaLeaves(map, areaMetric)

    const t0 = performance.now()
    const areaTrue = createAreaTrueTreemapNodes(map, state, metricData, false)
    const areaTrueMs = performance.now() - t0

    const t1 = performance.now()
    const squarified = createTreemapNodes(map, state, metricData, false)
    const squarifiedMs = performance.now() - t1

    const areaTrueLeaves = areaTrue.filter(node => node.isLeaf).length
    const vanished = positiveLeaves - areaTrueLeaves

    return {
        name,
        api: json.apiVersion,
        nodesInFile: countNodes(map),
        positiveLeaves,
        area: { ...summarize(areaTrue, map), runtimeMs: Math.round(areaTrueMs), vanished },
        squarified: { ...summarize(squarified, map), runtimeMs: Math.round(squarifiedMs) }
    }
}

function countNodes(map: CodeMapNode) {
    let count = 0
    const visit = (node: CodeMapNode) => {
        count++
        for (const child of node.children ?? []) {
            visit(child)
        }
    }
    visit(map)
    return count
}

// A committed 1.x map keeps the real-file path of this harness in the suite: decorating the paths,
// deriving the metric data and laying the map out twice all happen on every test run.
const SAMPLE_MAP = "visualization/app/codeCharta/resources/sample1_legacy_1_2.cc.json"
const SAMPLE_MAP_LEAVES = 4

describe("area-true treemap on a real map file", () => {
    it("should lay out every leaf of the sample map with a positive area inside the map", () => {
        // Act
        const result = run("sample1_legacy_1_2", SAMPLE_MAP)

        // Assert
        expect(result.positiveLeaves).toBe(SAMPLE_MAP_LEAVES)
        expect(result.area.leafRects).toBe(SAMPLE_MAP_LEAVES)
        expect(result.area.vanished).toBe(0)
        expect(result.area.zeroAreaRects).toBe(0)
        expect(result.area.outOfBounds).toBe(0)
    })
})

// Opt-in: loading and laying out the large showcase maps (up to ~44 MB / 130k nodes) takes a
// few seconds and hundreds of MB, so this suite only runs with CC_LARGE_MAPS_FILTER set, e.g.
// CC_LARGE_MAPS_FILTER=junit5 npm test -- areaTrueTreemapLargeMaps
const LARGE_MAPS_FILTER = process.env.CC_LARGE_MAPS_FILTER ?? ""
const selectedFiles = SHOWCASE_FILES.filter(file => file.includes(LARGE_MAPS_FILTER))

;(LARGE_MAPS_FILTER.length > 0 ? describe : describe.skip)("area-true treemap on real showcase maps", () => {
    it("should lay out every showcase map without zero-area or out-of-bounds rectangles", () => {
        // Arrange
        jest.setTimeout(600_000)

        // Act
        const results = selectedFiles.map(file => run(file.split("/")[6] ?? file, file))
        mkdirSync(dirname(REPORT_PATH), { recursive: true })
        writeFileSync(REPORT_PATH, JSON.stringify(results, null, 4))

        // Assert
        expect(results.filter(result => result.area.zeroAreaRects > 0 || result.area.outOfBounds > 0)).toEqual([])
    })
})
