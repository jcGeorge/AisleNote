import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE } from '../state/app-state'
import type { AppState, FrontmatterTemplate, NoteAisleBody, NoteBody, Space, Tab, VisualizerLayoutMode } from '../types/app'
import {
  buildVisualizerGraph,
  DEFAULT_VISUALIZER_FILTER,
  getVisualizerAisleNodeId,
  getVisualizerDuplicateGroupId,
  getVisualizerLocationNodeId,
  type VisualizerFilterState,
} from './visualizer-graph'

const template: FrontmatterTemplate = {
  id: 'template-project',
  name: 'project',
  fields: [
    { id: 'field-id', key: 'id', type: 'text', defaultValue: '', computed: 'none' },
    { id: 'field-status', key: 'status', type: 'text', defaultValue: '', computed: 'none' },
  ],
}

function body(id: string, aisleId: string, aisleBodyId: string): NoteBody {
  return {
    id,
    aisles: [{ id: aisleId, aisleBodyId }],
  }
}

function aisleBody(id: string, markdown: string, patch: Partial<NoteAisleBody> = {}): NoteAisleBody {
  return {
    id,
    markdown,
    tags: [],
    frontmatter: null,
    frontmatterStatus: 'none',
    ...patch,
  }
}

function createState(): AppState {
  const parentA: Tab = {
    id: 'parent-a',
    title: 'Parent A',
    noteBodyId: 'body-home',
    activeSubTabId: null,
    subTabs: [
      {
        id: 'sub-a',
        title: 'Sub A',
        noteBodyId: 'body-sub',
      },
    ],
  }
  const parentB: Tab = {
    id: 'parent-b',
    title: 'Parent B',
    noteBodyId: 'body-home',
    activeSubTabId: null,
    subTabs: [],
  }
  const space: Space = {
    id: 'space-a',
    name: 'Space A',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'parent-a',
      tabs: [parentA, parentB],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }
  return {
    ...DEFAULT_STATE,
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    domains: [
      {
        id: 'domain-a',
        name: 'Domain A',
        activeSpaceId: 'space-a',
        spaces: [space],
      },
    ],
    spaces: [space],
    frontmatter: {
      settingsTemplateId: template.id,
      lastAppliedTemplateId: template.id,
      templates: [template],
    },
    noteBodies: [
      body('body-home', 'aisle-home', 'aisle-body-home'),
      body('body-sub', 'aisle-sub', 'aisle-body-shared'),
    ],
    noteAisleBodies: [
      aisleBody('aisle-body-home', '#Cool home text', {
        tags: ['Cool'],
        frontmatter: { id: 'home-1', status: 'open' },
        frontmatterStatus: 'valid',
        frontmatterMeta: {
          templateId: template.id,
          templateDerived: true,
          templateFieldOrigins: {
            id: { templateId: template.id, fieldId: 'field-id' },
            status: { templateId: template.id, fieldId: 'field-status' },
          },
        },
      }),
      aisleBody('aisle-body-shared', '#Cool #Other sub text', { tags: ['Cool', 'Other'] }),
    ],
  }
}

function createDenseTaggedState(): AppState {
  const tabs: Tab[] = []
  const noteBodies: NoteBody[] = []
  const noteAisleBodies: NoteAisleBody[] = []

  for (let parentIndex = 0; parentIndex < 7; parentIndex += 1) {
    const parentId = `dense-parent-${parentIndex}`
    const homeBodyId = `dense-body-home-${parentIndex}`
    const homeAisleId = `dense-aisle-home-${parentIndex}`
    const homeAisleBodyId = `dense-aisle-body-home-${parentIndex}`
    noteBodies.push(body(homeBodyId, homeAisleId, homeAisleBodyId))
    noteAisleBodies.push(aisleBody(homeAisleBodyId, `#Cool parent ${parentIndex}`))

    const subTabs = [0, 1].map((subIndex) => {
      const subTabId = `dense-sub-${parentIndex}-${subIndex}`
      const subBodyId = `dense-body-sub-${parentIndex}-${subIndex}`
      const subAisleId = `dense-aisle-sub-${parentIndex}-${subIndex}`
      const subAisleBodyId = `dense-aisle-body-sub-${parentIndex}-${subIndex}`
      noteBodies.push(body(subBodyId, subAisleId, subAisleBodyId))
      noteAisleBodies.push(aisleBody(subAisleBodyId, `#Cool sub ${parentIndex} ${subIndex}`))
      return { id: subTabId, title: `Sub ${parentIndex} ${subIndex}`, noteBodyId: subBodyId }
    })

    tabs.push({
      id: parentId,
      title: `Parent ${parentIndex}`,
      noteBodyId: homeBodyId,
      activeSubTabId: subTabs[0]?.id ?? null,
      subTabs,
    })
  }

  const space: Space = {
    id: 'dense-space',
    name: 'Dense Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    ...DEFAULT_STATE,
    activeDomainId: 'dense-domain',
    activeSpaceId: space.id,
    domains: [
      {
        id: 'dense-domain',
        name: 'Dense Domain',
        activeSpaceId: space.id,
        spaces: [space],
      },
    ],
    spaces: [space],
    noteBodies,
    noteAisleBodies,
  }
}

function createAdjacentParentLaneState(): AppState {
  const tabs: Tab[] = []
  const noteBodies: NoteBody[] = []
  const noteAisleBodies: NoteAisleBody[] = []

  for (let parentIndex = 0; parentIndex < 2; parentIndex += 1) {
    const parentId = `lane-parent-${parentIndex}`
    const homeBodyId = `lane-body-home-${parentIndex}`
    const homeAisleId = `lane-aisle-home-${parentIndex}`
    const homeAisleBodyId = `lane-aisle-body-home-${parentIndex}`
    noteBodies.push(body(homeBodyId, homeAisleId, homeAisleBodyId))
    noteAisleBodies.push(aisleBody(homeAisleBodyId, `#Lane home ${parentIndex}`))

    const subTabs = [0, 1, 2].map((subIndex) => {
      const subTabId = `lane-sub-${parentIndex}-${subIndex}`
      const subBodyId = `lane-body-sub-${parentIndex}-${subIndex}`
      const subAisleId = `lane-aisle-sub-${parentIndex}-${subIndex}`
      const subAisleBodyId = `lane-aisle-body-sub-${parentIndex}-${subIndex}`
      noteBodies.push(body(subBodyId, subAisleId, subAisleBodyId))
      noteAisleBodies.push(aisleBody(subAisleBodyId, `#Lane sub ${parentIndex} ${subIndex}`))
      return { id: subTabId, title: `Lane Sub ${parentIndex} ${subIndex}`, noteBodyId: subBodyId }
    })

    tabs.push({
      id: parentId,
      title: `Lane Parent ${parentIndex}`,
      noteBodyId: homeBodyId,
      activeSubTabId: subTabs[0]?.id ?? null,
      subTabs,
    })
  }

  const space: Space = {
    id: 'lane-space',
    name: 'Lane Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    ...DEFAULT_STATE,
    activeDomainId: 'lane-domain',
    activeSpaceId: space.id,
    domains: [
      {
        id: 'lane-domain',
        name: 'Lane Domain',
        activeSpaceId: space.id,
        spaces: [space],
      },
    ],
    spaces: [space],
    noteBodies,
    noteAisleBodies,
  }
}

function createBottomFlowState(): AppState {
  const noteBodies: NoteBody[] = []
  const noteAisleBodies: NoteAisleBody[] = []

  const domains = ['top', 'right', 'bottom', 'left'].map((positionName) => {
    const domainId = positionName === 'bottom' ? 'bottom-domain' : `${positionName}-domain`
    const spaceId = positionName === 'bottom' ? 'bottom-space' : `${positionName}-space`
    const parentId = positionName === 'bottom' ? 'bottom-parent' : `${positionName}-parent`
    const homeBodyId = `${positionName}-body-home`
    const homeAisleId = `${positionName}-aisle-home`
    const homeAisleBodyId = `${positionName}-aisle-body-home`
    const subTabs =
      positionName === 'bottom'
        ? [0, 1, 2].map((subIndex) => {
            const subTabId = `bottom-sub-${subIndex}`
            const subBodyId = `bottom-body-sub-${subIndex}`
            const subAisleId = `bottom-aisle-sub-${subIndex}`
            const subAisleBodyId = `bottom-aisle-body-sub-${subIndex}`
            noteBodies.push(body(subBodyId, subAisleId, subAisleBodyId))
            noteAisleBodies.push(aisleBody(subAisleBodyId, `#Flow bottom sub ${subIndex}`))
            return { id: subTabId, title: `Bottom Sub ${subIndex}`, noteBodyId: subBodyId }
          })
        : []
    noteBodies.push(body(homeBodyId, homeAisleId, homeAisleBodyId))
    noteAisleBodies.push(aisleBody(homeAisleBodyId, `#Flow ${positionName} home`))

    const space: Space = {
      id: spaceId,
      name: `${positionName} space`,
      settings: { autoRemoveDeletedDays: 30 },
      data: {
        activeTabId: parentId,
        tabs: [
          {
            id: parentId,
            title: `${positionName} parent`,
            noteBodyId: homeBodyId,
            activeSubTabId: subTabs[0]?.id ?? null,
            subTabs,
          },
        ],
        deletedTabs: [],
        deletedSubTabs: [],
      },
    }

    return {
      id: domainId,
      name: `${positionName} domain`,
      activeSpaceId: spaceId,
      spaces: [space],
    }
  })
  const bottomSpace = domains[2].spaces[0]

  return {
    ...DEFAULT_STATE,
    activeDomainId: 'bottom-domain',
    activeSpaceId: 'bottom-space',
    domains,
    spaces: [bottomSpace],
    noteBodies,
    noteAisleBodies,
  }
}

const UNEVEN_PARENT_SUBTAB_COUNTS = [5, 1, 7, 0, 3, 2]

function createUnevenParentClusterState(): AppState {
  const tabs: Tab[] = []
  const noteBodies: NoteBody[] = []
  const noteAisleBodies: NoteAisleBody[] = []

  UNEVEN_PARENT_SUBTAB_COUNTS.forEach((subtabCount, parentIndex) => {
    const parentId = `cluster-parent-${parentIndex}`
    const homeBodyId = `cluster-body-home-${parentIndex}`
    const homeAisleId = `cluster-aisle-home-${parentIndex}`
    const homeAisleBodyId = `cluster-aisle-body-home-${parentIndex}`
    noteBodies.push(body(homeBodyId, homeAisleId, homeAisleBodyId))
    noteAisleBodies.push(aisleBody(homeAisleBodyId, `#Cluster home ${parentIndex}`))

    const subTabs = Array.from({ length: subtabCount }, (_value, subIndex) => {
      const subTabId = `cluster-sub-${parentIndex}-${subIndex}`
      const subBodyId = `cluster-body-sub-${parentIndex}-${subIndex}`
      const subAisleId = `cluster-aisle-sub-${parentIndex}-${subIndex}`
      const subAisleBodyId = `cluster-aisle-body-sub-${parentIndex}-${subIndex}`
      noteBodies.push(body(subBodyId, subAisleId, subAisleBodyId))
      noteAisleBodies.push(aisleBody(subAisleBodyId, `#Cluster sub ${parentIndex} ${subIndex}`))
      return { id: subTabId, title: `Cluster Sub ${parentIndex} ${subIndex}`, noteBodyId: subBodyId }
    })

    tabs.push({
      id: parentId,
      title: `Cluster Parent ${parentIndex}`,
      noteBodyId: homeBodyId,
      activeSubTabId: subTabs[0]?.id ?? null,
      subTabs,
    })
  })

  const space: Space = {
    id: 'cluster-space',
    name: 'Cluster Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: tabs[0]?.id ?? '',
      tabs,
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return {
    ...DEFAULT_STATE,
    activeDomainId: 'cluster-domain',
    activeSpaceId: space.id,
    domains: [
      {
        id: 'cluster-domain',
        name: 'Cluster Domain',
        activeSpaceId: space.id,
        spaces: [space],
      },
    ],
    spaces: [space],
    noteBodies,
    noteAisleBodies,
  }
}

function filter(patch: Partial<VisualizerFilterState>): VisualizerFilterState {
  return {
    ...DEFAULT_VISUALIZER_FILTER,
    ...patch,
    frontmatter: {
      ...DEFAULT_VISUALIZER_FILTER.frontmatter,
      ...(patch.frontmatter ?? {}),
    },
  }
}

const TEST_VISUALIZER_NODE_MIN_WIDTH = 76
const TEST_VISUALIZER_NODE_MAX_WIDTH = 132
const TEST_VISUALIZER_NODE_TEXT_WIDTH = 8.1
const TEST_VISUALIZER_NODE_CHROME_WIDTH = 22
const TEST_VISUALIZER_NODE_COLLISION_PADDING = 10
const TEST_VISUALIZER_NODE_HEIGHT = 52

function estimateTestNodeWidth(label: string): number {
  return (
    Math.min(
      Math.max(label.length * TEST_VISUALIZER_NODE_TEXT_WIDTH + TEST_VISUALIZER_NODE_CHROME_WIDTH, TEST_VISUALIZER_NODE_MIN_WIDTH),
      TEST_VISUALIZER_NODE_MAX_WIDTH,
    ) + TEST_VISUALIZER_NODE_COLLISION_PADDING
  )
}

function nodeCollisionRect(node: { label: string; position: { x: number; y: number } }) {
  const width = estimateTestNodeWidth(node.label)
  const height = TEST_VISUALIZER_NODE_HEIGHT
  return {
    left: node.position.x - width / 2,
    right: node.position.x + width / 2,
    top: node.position.y - height / 2,
    bottom: node.position.y + height / 2,
  }
}

function rectsOverlap(
  left: ReturnType<typeof nodeCollisionRect>,
  right: ReturnType<typeof nodeCollisionRect>,
): boolean {
  return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top
}

function nodeById(graph: ReturnType<typeof buildVisualizerGraph>, id: string) {
  const node = graph.nodes.find((candidate) => candidate.id === id)
  expect(node).toBeTruthy()
  return node!
}

function dot(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return left.x * right.x + left.y * right.y
}

function hierarchyFlowForParent(
  graph: ReturnType<typeof buildVisualizerGraph>,
  parentId: string,
  spaceId = 'space:lane-domain:lane-space',
) {
  const parent = nodeById(graph, parentId)
  const space = nodeById(graph, spaceId)
  const vector = {
    x: parent.position.x - space.position.x,
    y: parent.position.y - space.position.y,
  }
  const length = Math.hypot(vector.x, vector.y)
  expect(length).toBeGreaterThan(0)
  const flow = { x: vector.x / length, y: vector.y / length }
  return {
    parent,
    space,
    flow,
    tangent: { x: -flow.y, y: flow.x },
  }
}

function parentFlowCoordinates(
  graph: ReturnType<typeof buildVisualizerGraph>,
  parentId: string,
  childId: string,
  spaceId?: string,
) {
  const { parent, flow, tangent } = hierarchyFlowForParent(graph, parentId, spaceId)
  const child = nodeById(graph, childId)
  const childDelta = {
    x: child.position.x - parent.position.x,
    y: child.position.y - parent.position.y,
  }
  return {
    depth: dot(childDelta, flow),
    tangentOffset: dot(childDelta, tangent),
  }
}

function expectChildFollowsParentFlow(
  graph: ReturnType<typeof buildVisualizerGraph>,
  parentId: string,
  childId: string,
  maxTangentOffset = 170,
  spaceId?: string,
) {
  const coordinates = parentFlowCoordinates(graph, parentId, childId, spaceId)
  expect(coordinates.depth, childId).toBeGreaterThan(0)
  expect(Math.abs(coordinates.tangentOffset), childId).toBeLessThanOrEqual(maxTangentOffset)
}

function parentChildNodeIds(parentIndex: number): string[] {
  return [
    getVisualizerLocationNodeId({
      domainId: 'lane-domain',
      spaceId: 'lane-space',
      tabId: `lane-parent-${parentIndex}`,
      subTabId: null,
    }),
    ...[0, 1, 2].map((subIndex) =>
      getVisualizerLocationNodeId({
        domainId: 'lane-domain',
        spaceId: 'lane-space',
        tabId: `lane-parent-${parentIndex}`,
        subTabId: `lane-sub-${parentIndex}-${subIndex}`,
      }),
    ),
  ]
}

function unevenParentChildNodeIds(parentIndex: number): string[] {
  return [
    getVisualizerLocationNodeId({
      domainId: 'cluster-domain',
      spaceId: 'cluster-space',
      tabId: `cluster-parent-${parentIndex}`,
      subTabId: null,
    }),
    ...Array.from({ length: UNEVEN_PARENT_SUBTAB_COUNTS[parentIndex] }, (_value, subIndex) =>
      getVisualizerLocationNodeId({
        domainId: 'cluster-domain',
        spaceId: 'cluster-space',
        tabId: `cluster-parent-${parentIndex}`,
        subTabId: `cluster-sub-${parentIndex}-${subIndex}`,
      }),
    ),
  ]
}

function boundsForNodes(graph: ReturnType<typeof buildVisualizerGraph>, nodeIds: string[]) {
  return nodeIds.reduce(
    (bounds, nodeId) => {
      const rect = nodeCollisionRect(nodeById(graph, nodeId))
      return {
        left: Math.min(bounds.left, rect.left),
        right: Math.max(bounds.right, rect.right),
        top: Math.min(bounds.top, rect.top),
        bottom: Math.max(bounds.bottom, rect.bottom),
      }
    },
    { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity },
  )
}

function direction(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y)
}

function segmentsProperlyIntersect(
  firstStart: { x: number; y: number },
  firstEnd: { x: number; y: number },
  secondStart: { x: number; y: number },
  secondEnd: { x: number; y: number },
): boolean {
  const d1 = direction(firstStart, firstEnd, secondStart)
  const d2 = direction(firstStart, firstEnd, secondEnd)
  const d3 = direction(secondStart, secondEnd, firstStart)
  const d4 = direction(secondStart, secondEnd, firstEnd)
  return d1 * d2 < 0 && d3 * d4 < 0
}

describe('buildVisualizerGraph', () => {
  it('builds a hierarchy-first overview with home and subtab nodes but no relationship nodes', () => {
    const graph = buildVisualizerGraph(createState())
    const subtabNodeId = getVisualizerLocationNodeId({
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'parent-a',
      subTabId: 'sub-a',
    })
    const subtabEdge = graph.edges.find(
      (edge) => edge.kind === 'hierarchy' && edge.source === 'parent:domain-a:space-a:parent-a' && edge.target === subtabNodeId,
    )

    expect(graph.nodes.map((node) => node.kind)).toEqual(
      expect.arrayContaining(['domain', 'space', 'parent', 'note', 'subtab']),
    )
    expect(graph.nodes.some((node) => node.kind === 'tag')).toBe(false)
    expect(graph.edges.some((edge) => edge.kind === 'hierarchy')).toBe(true)
    expect(subtabEdge).toBeTruthy()
    expect(subtabEdge?.sourceHandle).toBeTruthy()
    expect(subtabEdge?.targetHandle).toBeTruthy()
  })

  it('keeps adjacent parent children inside their own directional lanes without crossing hierarchy edges', () => {
    const graph = buildVisualizerGraph(createAdjacentParentLaneState())
    const firstParentId = 'parent:lane-domain:lane-space:lane-parent-0'
    const secondParentId = 'parent:lane-domain:lane-space:lane-parent-1'
    const childIdsByParent = [0, 1].map((parentIndex) => [
      getVisualizerLocationNodeId({
        domainId: 'lane-domain',
        spaceId: 'lane-space',
        tabId: `lane-parent-${parentIndex}`,
        subTabId: null,
      }),
      ...[0, 1, 2].map((subIndex) =>
        getVisualizerLocationNodeId({
          domainId: 'lane-domain',
          spaceId: 'lane-space',
          tabId: `lane-parent-${parentIndex}`,
          subTabId: `lane-sub-${parentIndex}-${subIndex}`,
        }),
      ),
    ])

    childIdsByParent[0].forEach((childId) => {
      expectChildFollowsParentFlow(graph, firstParentId, childId, 220)
    })
    childIdsByParent[1].forEach((childId) => {
      expectChildFollowsParentFlow(graph, secondParentId, childId, 220)
    })

    const parentChildEdges = graph.edges.filter((edge) =>
      edge.kind === 'hierarchy' &&
      (edge.source === firstParentId || edge.source === secondParentId) &&
      edge.target.startsWith('subtab:'),
    )
    parentChildEdges.forEach((leftEdge, leftIndex) => {
      parentChildEdges.slice(leftIndex + 1).forEach((rightEdge) => {
        if (leftEdge.source === rightEdge.source) return
        expect(
          segmentsProperlyIntersect(
            nodeById(graph, leftEdge.source).position,
            nodeById(graph, leftEdge.target).position,
            nodeById(graph, rightEdge.source).position,
            nodeById(graph, rightEdge.target).position,
          ),
        ).toBe(false)
      })
    })
  })

  it('keeps wedge fan children in deterministic home-then-subtab order moving outward', () => {
    const graph = buildVisualizerGraph(createAdjacentParentLaneState())
    const parentId = 'parent:lane-domain:lane-space:lane-parent-0'
    const orderedIds = parentChildNodeIds(0)
    const visualOrder = [...orderedIds]
      .map((id) => ({ id, ...parentFlowCoordinates(graph, parentId, id) }))
      .sort((left, right) => Math.round(left.depth) - Math.round(right.depth) || left.tangentOffset - right.tangentOffset)
      .map((entry) => entry.id)

    expect(visualOrder).toEqual(orderedIds)
    orderedIds.forEach((nodeId) => {
      expectChildFollowsParentFlow(graph, parentId, nodeId, 220)
    })
    expect(buildVisualizerGraph(createAdjacentParentLaneState()).nodes.map((node) => [node.id, node.position])).toEqual(
      graph.nodes.map((node) => [node.id, node.position]),
    )
  })

  it('uses wedge fan as the default layout mode', () => {
    const defaultGraph = buildVisualizerGraph(createAdjacentParentLaneState())
    const explicitGraph = buildVisualizerGraph(createAdjacentParentLaneState(), DEFAULT_VISUALIZER_FILTER, {
      layoutMode: 'wedge-fan',
    })

    expect(defaultGraph.nodes.map((node) => [node.id, node.position])).toEqual(
      explicitGraph.nodes.map((node) => [node.id, node.position]),
    )
  })

  it('supports strict ring layout with parent-local child rings', () => {
    const graph = buildVisualizerGraph(createAdjacentParentLaneState(), DEFAULT_VISUALIZER_FILTER, {
      layoutMode: 'strict-rings',
    })
    const domainNode = nodeById(graph, 'domain:lane-domain')
    const spaceNode = nodeById(graph, 'space:lane-domain:lane-space')
    const parentId = 'parent:lane-domain:lane-space:lane-parent-0'
    const parentNode = nodeById(graph, parentId)
    const childIds = parentChildNodeIds(0)
    const childDepths = childIds.map((childId) => parentFlowCoordinates(graph, parentId, childId).depth)

    expect(Math.hypot(domainNode.position.x, domainNode.position.y)).toBeGreaterThan(Math.hypot(spaceNode.position.x, spaceNode.position.y))
    expect(Math.hypot(spaceNode.position.x, spaceNode.position.y)).toBeGreaterThan(Math.hypot(parentNode.position.x, parentNode.position.y))
    childIds.forEach((childId) => {
      expectChildFollowsParentFlow(graph, parentId, childId, 220)
    })
    expect(new Set(childDepths.map((depth) => Math.round(depth))).size).toBeGreaterThan(1)
  })

  it('supports compact cluster layout with parent-owned two-row child grids', () => {
    const graph = buildVisualizerGraph(createAdjacentParentLaneState(), DEFAULT_VISUALIZER_FILTER, {
      layoutMode: 'compact-cluster',
    })

    ;[0, 1].forEach((parentIndex) => {
      const parentId = `parent:lane-domain:lane-space:lane-parent-${parentIndex}`
      const childIds = parentChildNodeIds(parentIndex)
      const childDepths = childIds.map((childId) => parentFlowCoordinates(graph, parentId, childId).depth)
      childIds.forEach((childId) => {
        expectChildFollowsParentFlow(graph, parentId, childId, 220)
        expect(parentFlowCoordinates(graph, parentId, childId).depth).toBeLessThan(520)
      })
      expect(new Set(childDepths.map((depth) => Math.round(depth))).size).toBeLessThanOrEqual(2)
    })
  })

  it.each(['wedge-fan', 'strict-rings', 'compact-cluster'] as VisualizerLayoutMode[])(
    'keeps uneven parent clusters separated in %s',
    (layoutMode) => {
      const graph = buildVisualizerGraph(createUnevenParentClusterState(), DEFAULT_VISUALIZER_FILTER, { layoutMode })
      const collisionNodes = graph.nodes.filter((node) => node.kind === 'parent' || node.kind === 'note' || node.kind === 'subtab')
      const parentNodeIds = UNEVEN_PARENT_SUBTAB_COUNTS.map(
        (_count, parentIndex) => `parent:cluster-domain:cluster-space:cluster-parent-${parentIndex}`,
      )

      for (let leftIndex = 0; leftIndex < collisionNodes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < collisionNodes.length; rightIndex += 1) {
          expect(
            rectsOverlap(nodeCollisionRect(collisionNodes[leftIndex]), nodeCollisionRect(collisionNodes[rightIndex])),
            `${collisionNodes[leftIndex].id} overlaps ${collisionNodes[rightIndex].id}`,
          ).toBe(false)
        }
      }

      parentNodeIds.forEach((parentId, parentIndex) => {
        unevenParentChildNodeIds(parentIndex).forEach((childId) => {
          expectChildFollowsParentFlow(graph, parentId, childId, 360, 'space:cluster-domain:cluster-space')
        })
      })
    },
  )

  it('keeps adaptive radial layouts distinct and compact for small uneven notebooks', () => {
    const modes = ['wedge-fan', 'strict-rings', 'compact-cluster'] as const
    const graphs = modes.map((layoutMode) => ({
      layoutMode,
      graph: buildVisualizerGraph(createUnevenParentClusterState(), DEFAULT_VISUALIZER_FILTER, { layoutMode }),
    }))
    const dimensions = new Map(
      graphs.map(({ layoutMode, graph }) => {
        const hierarchyIds = graph.nodes
          .filter((node) => node.kind === 'parent' || node.kind === 'note' || node.kind === 'subtab')
          .map((node) => node.id)
        const bounds = boundsForNodes(graph, hierarchyIds)
        return [layoutMode, { width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }]
      }),
    )
    const signatures = graphs.map(({ graph }) =>
      graph.nodes
        .map((node) => `${node.id}:${Math.round(node.position.x)}:${Math.round(node.position.y)}`)
        .sort()
        .join('|'),
    )

    expect(new Set(signatures).size).toBe(3)
    expect(dimensions.get('wedge-fan')?.width).toBeLessThan(1850)
    expect(dimensions.get('strict-rings')?.width).toBeLessThan(2000)
    expect(dimensions.get('compact-cluster')?.width).toBeLessThan(1800)
    expect(dimensions.get('compact-cluster')?.width ?? Infinity).toBeLessThan(dimensions.get('strict-rings')?.width ?? 0)
    expect(dimensions.get('compact-cluster')?.height).toBeLessThan(dimensions.get('wedge-fan')?.height ?? 0)
  })

  it('caps wedge fan child depth by wrapping crowded parent children into rows', () => {
    const graph = buildVisualizerGraph(createUnevenParentClusterState(), DEFAULT_VISUALIZER_FILTER, { layoutMode: 'wedge-fan' })
    const parentId = 'parent:cluster-domain:cluster-space:cluster-parent-2'
    const depths = unevenParentChildNodeIds(2).map((childId) =>
      parentFlowCoordinates(graph, parentId, childId, 'space:cluster-domain:cluster-space').depth,
    )

    expect(Math.max(...depths) - Math.min(...depths)).toBeLessThanOrEqual(320)
  })

  it.each(['wedge-fan', 'strict-rings', 'compact-cluster'] as VisualizerLayoutMode[])(
    'keeps bottom-of-graph children moving upward in %s',
    (layoutMode) => {
      const graph = buildVisualizerGraph(createBottomFlowState(), DEFAULT_VISUALIZER_FILTER, { layoutMode })
      const parentId = 'parent:bottom-domain:bottom-space:bottom-parent'
      const spaceId = 'space:bottom-domain:bottom-space'
      const { parent, flow } = hierarchyFlowForParent(graph, parentId, spaceId)
      const childIds = [
        getVisualizerLocationNodeId({
          domainId: 'bottom-domain',
          spaceId: 'bottom-space',
          tabId: 'bottom-parent',
          subTabId: null,
        }),
        ...[0, 1, 2].map((subIndex) =>
          getVisualizerLocationNodeId({
            domainId: 'bottom-domain',
            spaceId: 'bottom-space',
            tabId: 'bottom-parent',
            subTabId: `bottom-sub-${subIndex}`,
          }),
        ),
      ]

      expect(flow.y).toBeLessThan(0)
      childIds.forEach((childId) => {
        expectChildFollowsParentFlow(graph, parentId, childId, 220, spaceId)
        expect(nodeById(graph, childId).position.y).toBeLessThan(parent.position.y)
      })
    },
  )

  it('supports link tree layout with top-down hierarchy ranks', () => {
    const graph = buildVisualizerGraph(createAdjacentParentLaneState(), DEFAULT_VISUALIZER_FILTER, {
      layoutMode: 'link-tree',
    })
    const domainNode = nodeById(graph, 'domain:lane-domain')
    const spaceNode = nodeById(graph, 'space:lane-domain:lane-space')
    const parentNode = nodeById(graph, 'parent:lane-domain:lane-space:lane-parent-0')
    const subtabNode = nodeById(
      graph,
      getVisualizerLocationNodeId({
        domainId: 'lane-domain',
        spaceId: 'lane-space',
        tabId: 'lane-parent-0',
        subTabId: 'lane-sub-0-0',
      }),
    )

    expect(domainNode.position.y).toBeLessThan(spaceNode.position.y)
    expect(spaceNode.position.y).toBeLessThan(parentNode.position.y)
    expect(parentNode.position.y).toBeLessThan(subtabNode.position.y)

    const firstBounds = boundsForNodes(graph, parentChildNodeIds(0))
    const secondBounds = boundsForNodes(graph, parentChildNodeIds(1))
    expect(firstBounds.right).toBeLessThanOrEqual(secondBounds.left)
    expect(new Set(parentChildNodeIds(0).map((childId) => Math.round(nodeById(graph, childId).position.y))).size).toBeLessThanOrEqual(2)
  })

  it('keeps home-node merge and subtab visibility across all layout modes', () => {
    const modes: VisualizerLayoutMode[] = ['wedge-fan', 'strict-rings', 'compact-cluster', 'link-tree']
    modes.forEach((layoutMode) => {
      const graph = buildVisualizerGraph(createState(), DEFAULT_VISUALIZER_FILTER, {
        homeNodesResideInParent: true,
        layoutMode,
      })
      const homeNodeId = getVisualizerLocationNodeId({
        domainId: 'domain-a',
        spaceId: 'space-a',
        tabId: 'parent-a',
        subTabId: null,
      })
      const subtabNodeId = getVisualizerLocationNodeId({
        domainId: 'domain-a',
        spaceId: 'space-a',
        tabId: 'parent-a',
        subTabId: 'sub-a',
      })

      expect(graph.nodes.some((node) => node.id === homeNodeId), layoutMode).toBe(false)
      expect(graph.nodes.some((node) => node.id === subtabNodeId), layoutMode).toBe(true)
      expect(nodeById(graph, 'parent:domain-a:space-a:parent-a').preview?.canOpen, layoutMode).toBe(true)
    })
  })

  it('merges home note nodes into parent nodes when enabled', () => {
    const graph = buildVisualizerGraph(createState(), DEFAULT_VISUALIZER_FILTER, {
      homeNodesResideInParent: true,
    })
    const homeNodeId = getVisualizerLocationNodeId({
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'parent-a',
      subTabId: null,
    })
    const parentNode = graph.nodes.find((node) => node.id === 'parent:domain-a:space-a:parent-a')

    expect(graph.nodes.some((node) => node.id === homeNodeId)).toBe(false)
    expect(graph.nodes.some((node) => node.kind === 'note')).toBe(false)
    expect(graph.nodes.some((node) => node.kind === 'subtab')).toBe(true)
    expect(parentNode?.location).toEqual({
      domainId: 'domain-a',
      spaceId: 'space-a',
      tabId: 'parent-a',
      subTabId: null,
    })
    expect(parentNode?.noteBodyId).toBe('body-home')
    expect(parentNode?.preview?.canOpen).toBe(true)
    expect(parentNode?.preview?.kind).toBe('note')
    expect(parentNode?.preview?.tags).toContain('Cool')
  })

  it('routes home note duplicate relationships to parent nodes when home nodes are merged', () => {
    const graph = buildVisualizerGraph(createState(), filter({ mode: 'duplicates' }), {
      homeNodesResideInParent: true,
    })
    const groupId = getVisualizerDuplicateGroupId('note', 'body-home')
    const duplicateEdges = graph.edges.filter((edge) => edge.kind === 'duplicate-note' && edge.source === groupId)

    expect(graph.duplicateGroups.find((group) => group.id === groupId)?.nodeIds).toEqual([
      'parent:domain-a:space-a:parent-a',
      'parent:domain-a:space-a:parent-b',
    ])
    expect(duplicateEdges.map((edge) => edge.target).sort()).toEqual([
      'parent:domain-a:space-a:parent-a',
      'parent:domain-a:space-a:parent-b',
    ])
    expect(graph.nodes.some((node) => node.kind === 'note')).toBe(false)
  })

  it('routes home note aisle relationships through parent nodes when home nodes are merged', () => {
    const state = createState()
    const options = { homeNodesResideInParent: true }
    const tagGraph = buildVisualizerGraph(state, filter({ mode: 'tags', selectedTagKeys: ['cool'] }), options)
    const frontmatterGraph = buildVisualizerGraph(
      state,
      filter({
        mode: 'frontmatter',
        frontmatter: { ...DEFAULT_VISUALIZER_FILTER.frontmatter, selectedTemplateId: template.id },
      }),
      options,
    )
    const homeAisleId = getVisualizerAisleNodeId(
      { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null },
      'aisle-home',
    )

    expect(tagGraph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'aisle-slot',
        source: 'parent:domain-a:space-a:parent-a',
        target: homeAisleId,
      }),
    )
    expect(tagGraph.edges).toContainEqual(expect.objectContaining({ kind: 'tag', target: homeAisleId }))
    expect(frontmatterGraph.edges).toContainEqual(
      expect.objectContaining({
        kind: 'aisle-slot',
        source: 'parent:domain-a:space-a:parent-a',
        target: homeAisleId,
      }),
    )
    expect(frontmatterGraph.edges).toContainEqual(expect.objectContaining({ kind: 'frontmatter-template', target: homeAisleId }))
  })

  it('builds non-redundant graph hierarchy chips and full preview hierarchy chips', () => {
    const overviewGraph = buildVisualizerGraph(createState())
    const domainNode = overviewGraph.nodes.find((node) => node.id === 'domain:domain-a')
    const spaceNode = overviewGraph.nodes.find((node) => node.id === 'space:domain-a:space-a')
    const parentNode = overviewGraph.nodes.find((node) => node.id === 'parent:domain-a:space-a:parent-a')
    const homeNode = overviewGraph.nodes.find((node) =>
      node.id === getVisualizerLocationNodeId({ domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null }),
    )

    expect(domainNode?.hierarchyChips).toEqual([])
    expect(domainNode?.previewHierarchyChips).toEqual([{ kind: 'domain', label: 'Domain A' }])
    expect(spaceNode?.hierarchyChips).toEqual([{ kind: 'domain', label: 'Domain A' }])
    expect(spaceNode?.previewHierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
    ])
    expect(parentNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
    ])
    expect(parentNode?.previewHierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
    ])
    expect(homeNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
    ])
    expect(homeNode?.preview?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'note', label: 'home' },
    ])

    const tagGraph = buildVisualizerGraph(createState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const subtabLocation = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: 'sub-a' }
    const subtabNode = tagGraph.nodes.find((node) => node.id === getVisualizerLocationNodeId(subtabLocation))
    const aisleNode = tagGraph.nodes.find((node) => node.id === getVisualizerAisleNodeId(subtabLocation, 'aisle-sub'))

    expect(subtabNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
    ])
    expect(subtabNode?.preview?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'subtab', label: 'Sub A' },
    ])
    expect(aisleNode?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'subtab', label: 'Sub A' },
    ])
    expect(aisleNode?.preview?.hierarchyChips).toEqual([
      { kind: 'domain', label: 'Domain A' },
      { kind: 'space', label: 'Space A' },
      { kind: 'parent', label: 'Parent A' },
      { kind: 'subtab', label: 'Sub A' },
      { kind: 'aisle', label: 'aisle 1' },
    ])
  })

  it('expands selected tag occurrences into tag aisle and subtab context', () => {
    const graph = buildVisualizerGraph(createState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))

    expect(graph.nodes.some((node) => node.id === 'tag:cool')).toBe(true)
    expect(graph.nodes.some((node) => node.kind === 'aisle')).toBe(true)
    expect(graph.nodes.some((node) => node.kind === 'subtab')).toBe(true)
    expect(graph.edges.filter((edge) => edge.kind === 'tag')).toHaveLength(3)
  })

  it('creates duplicate groups for linked note bodies', () => {
    const state = createState()
    const graph = buildVisualizerGraph(state, filter({ mode: 'duplicates' }))
    const noteGroupId = getVisualizerDuplicateGroupId('note', 'body-home')

    expect(graph.duplicateGroups.some((group) => group.id === noteGroupId && group.count === 2)).toBe(true)
    expect(graph.nodes.some((node) => node.id === noteGroupId && node.kind === 'duplicate-group')).toBe(true)
    expect(graph.edges.filter((edge) => edge.kind === 'duplicate-note')).toHaveLength(2)
  })

  it('creates duplicate groups for linked aisle bodies across visible locations', () => {
    const state = createState()
    state.noteBodies.push(body('body-extra', 'aisle-extra', 'aisle-body-shared'))
    state.domains[0].spaces[0].data.tabs.push({
      id: 'parent-c',
      title: 'Parent C',
      noteBodyId: 'body-extra',
      activeSubTabId: null,
      subTabs: [],
    })
    state.spaces = state.domains[0].spaces

    const graph = buildVisualizerGraph(state, filter({ mode: 'duplicates' }))
    const aisleGroupId = getVisualizerDuplicateGroupId('aisle', 'aisle-body-shared')

    expect(graph.duplicateGroups.some((group) => group.id === aisleGroupId && group.kind === 'aisle')).toBe(true)
    expect(graph.edges.filter((edge) => edge.kind === 'duplicate-aisle' && edge.source === aisleGroupId)).toHaveLength(2)
  })

  it('filters front matter by explicit template and includes field/type relationships', () => {
    const graph = buildVisualizerGraph(
      createState(),
      filter({
        mode: 'frontmatter',
        frontmatter: {
          ...DEFAULT_VISUALIZER_FILTER.frontmatter,
          selectedTemplateId: template.id,
        },
      }),
    )

    expect(graph.nodes.some((node) => node.id === `fm-template:${template.id}`)).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'fm-field:id')).toBe(true)
    expect(graph.nodes.some((node) => node.id === 'fm-type:text')).toBe(true)
    expect(graph.edges.some((edge) => edge.kind === 'frontmatter-template')).toBe(true)
    expect(graph.edges.some((edge) => edge.kind === 'frontmatter-field')).toBe(true)
  })

  it('marks focused relationship nodes and their connected hierarchy for highlighting', () => {
    const state = createState()
    const location = { domainId: 'domain-a', spaceId: 'space-a', tabId: 'parent-a', subTabId: null }
    const noteNodeId = getVisualizerLocationNodeId(location)
    const graph = buildVisualizerGraph(state, filter({ focusedNodeId: noteNodeId }))

    expect(graph.selectedNodeIds.has(noteNodeId)).toBe(true)
    expect(graph.highlightedNodeIds.has('domain:domain-a')).toBe(true)
    expect(graph.highlightedNodeIds.has(noteNodeId)).toBe(true)
  })

  it('separates dense parent note subtab and aisle nodes without visible box collisions', () => {
    const graph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const collisionNodes = graph.nodes.filter((node) =>
      node.kind === 'parent' || node.kind === 'note' || node.kind === 'subtab' || node.kind === 'aisle',
    )

    for (let leftIndex = 0; leftIndex < collisionNodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < collisionNodes.length; rightIndex += 1) {
        expect(
          rectsOverlap(nodeCollisionRect(collisionNodes[leftIndex]), nodeCollisionRect(collisionNodes[rightIndex])),
          `${collisionNodes[leftIndex].id} overlaps ${collisionNodes[rightIndex].id}`,
        ).toBe(false)
      }
    }
  })

  it('keeps collision-relaxed visualizer layout deterministic', () => {
    const firstGraph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const secondGraph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const getPositions = (graph: typeof firstGraph) =>
      graph.nodes
        .map((node) => [node.id, Number(node.position.x.toFixed(4)), Number(node.position.y.toFixed(4))])
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])))

    expect(getPositions(firstGraph)).toEqual(getPositions(secondGraph))
  })

  it('routes hierarchy and aisle edges through top and bottom handles based on node positions', () => {
    const graph = buildVisualizerGraph(createDenseTaggedState(), filter({ mode: 'tags', selectedTagKeys: ['cool'] }))
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
    const routedEdges = graph.edges.filter((edge) => edge.kind === 'hierarchy' || edge.kind === 'aisle-slot')

    expect(routedEdges.length).toBeGreaterThan(0)
    routedEdges.forEach((edge) => {
      const source = nodeById.get(edge.source)
      const target = nodeById.get(edge.target)
      expect(source).toBeTruthy()
      expect(target).toBeTruthy()
      if (!source || !target) return
      const targetAboveSource = target.position.y < source.position.y
      expect(edge.sourceHandle).toBe(targetAboveSource ? 'visualizer-source-top' : 'visualizer-source-bottom')
      expect(edge.targetHandle).toBe(targetAboveSource ? 'visualizer-target-bottom' : 'visualizer-target-top')
    })
  })
})
