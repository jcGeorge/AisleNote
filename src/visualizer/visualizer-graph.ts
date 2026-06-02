import { buildTagFilterIndex, normalizeTagKey, sortTagFilterTags, type TagFilterSortMode, type TagFilterTagSummary } from '../tags/tag-filter'
import { getAisleBodyTags } from '../tags/tags.js'
import { getAisleBodyId, getAisleMarkdown } from '../notes/note-markdown'
import { buildNoteLocationKey, getNoteLocationBreadcrumbLabel } from '../notes/note-locations'
import type {
  AppState,
  Domain,
  FrontmatterFieldType,
  FrontmatterTemplate,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NoteLocation,
  Tab,
  VisualizerLayoutMode,
} from '../types/app'

export type VisualizerMode = 'overview' | 'duplicates' | 'tags' | 'frontmatter'

export type VisualizerNodeKind =
  | 'domain'
  | 'space'
  | 'parent'
  | 'note'
  | 'subtab'
  | 'aisle'
  | 'tag'
  | 'duplicate-group'
  | 'frontmatter-template'
  | 'frontmatter-field'
  | 'frontmatter-type'

export type VisualizerHierarchyChipKind = 'domain' | 'space' | 'parent' | 'note' | 'subtab' | 'aisle'

export type VisualizerHierarchyChip = {
  kind: VisualizerHierarchyChipKind
  label: string
}

export type VisualizerEdgeKind =
  | 'hierarchy'
  | 'duplicate-note'
  | 'duplicate-aisle'
  | 'tag'
  | 'frontmatter-template'
  | 'frontmatter-field'
  | 'frontmatter-type'
  | 'aisle-slot'

export type VisualizerFrontmatterFilter = {
  templateQuery: string
  selectedTemplateId: string
  includeMatchingFields: boolean
  fieldQuery: string
  selectedFieldType: FrontmatterFieldType | ''
  showAllUsage: boolean
}

export type VisualizerFilterState = {
  mode: VisualizerMode
  selectedTagKeys: string[]
  tagSortMode: TagFilterSortMode
  duplicateGroupId: string
  frontmatter: VisualizerFrontmatterFilter
  focusedNodeId: string
}

export type VisualizerNodePreview = {
  title: string
  breadcrumb: string
  hierarchyChips: VisualizerHierarchyChip[]
  kind: VisualizerNodeKind
  location?: NoteLocation
  noteBodyId?: string
  aisleId?: string
  aisleBodyId?: string
  tags: string[]
  frontmatterTemplateName: string
  frontmatterFields: string[]
  duplicateSummary: string
  aisleCount: number
  markdownExcerpt: string
  canOpen: boolean
}

export type VisualizerGraphNode = {
  id: string
  kind: VisualizerNodeKind
  label: string
  detailLabel: string
  hierarchyPath: string
  hierarchyChips?: VisualizerHierarchyChip[]
  previewHierarchyChips?: VisualizerHierarchyChip[]
  count: number
  location?: NoteLocation
  noteBodyId?: string
  aisleId?: string
  aisleBodyId?: string
  tagKey?: string
  templateId?: string
  fieldKey?: string
  fieldType?: FrontmatterFieldType
  preview?: VisualizerNodePreview
  position: { x: number; y: number }
}

export type VisualizerGraphEdge = {
  id: string
  source: string
  target: string
  kind: VisualizerEdgeKind
  label?: string
  count?: number
  sourceHandle?: VisualizerEdgeHandleId
  targetHandle?: VisualizerEdgeHandleId
}

export type VisualizerEdgeHandleId =
  | 'visualizer-source-top'
  | 'visualizer-source-bottom'
  | 'visualizer-target-top'
  | 'visualizer-target-bottom'

export type VisualizerDuplicateGroup = {
  id: string
  kind: 'note' | 'aisle'
  label: string
  count: number
  noteBodyId?: string
  aisleBodyId?: string
  nodeIds: string[]
}

export type VisualizerFrontmatterFieldSummary = {
  key: string
  label: string
  count: number
  types: FrontmatterFieldType[]
}

export type VisualizerFieldTypeSummary = {
  type: FrontmatterFieldType
  count: number
}

export type VisualizerGraph = {
  nodes: VisualizerGraphNode[]
  edges: VisualizerGraphEdge[]
  availableTags: TagFilterTagSummary[]
  duplicateGroups: VisualizerDuplicateGroup[]
  frontmatterTemplates: FrontmatterTemplate[]
  frontmatterFields: VisualizerFrontmatterFieldSummary[]
  frontmatterFieldTypes: VisualizerFieldTypeSummary[]
  selectedNodeIds: Set<string>
  highlightedNodeIds: Set<string>
  overflowNotice: string
}

export type VisualizerGraphOptions = {
  homeNodesResideInParent: boolean
  layoutMode: VisualizerLayoutMode
}

type LocationEntry = {
  key: string
  location: NoteLocation
  noteBodyId: string
  title: string
  breadcrumb: string
  domainId: string
  domainName: string
  spaceId: string
  spaceName: string
  parentId: string
  parentName: string
  subTabId: string | null
  isSubtab: boolean
  body: NoteBody | null
}

type AisleEntry = {
  id: string
  locationEntry: LocationEntry
  aisle: NoteAisle
  aisleBody: NoteAisleBody | null
  aisleBodyId: string
  markdown: string
}

type GraphBuildContext = {
  state: AppState
  options: VisualizerGraphOptions
  aisleBodyById: Map<string, NoteAisleBody>
  locationEntries: LocationEntry[]
  aisleEntries: AisleEntry[]
  nodes: Map<string, VisualizerGraphNode>
  edges: Map<string, VisualizerGraphEdge>
  duplicateGroups: VisualizerDuplicateGroup[]
  fieldSummariesByKey: Map<string, VisualizerFrontmatterFieldSummary>
  fieldTypeCounts: Map<FrontmatterFieldType, number>
}

type ParentFlowConstraint = {
  origin: { x: number; y: number }
  flow: { x: number; y: number }
  tangent: { x: number; y: number }
  minDepth: number
  maxDepth: number
  halfWidth: number
}

type ParentClusterMetrics = {
  columns: number
  centerHalfWidth: number
  reservationWidth: number
  childColumnSpacing: number
  baseDepth: number
  rowSpacing: number
  maxDepth: number
  rowStagger: number
}

type RadialDensityBand = 'compact' | 'normal' | 'expanded'

type RadialLayoutProfile = {
  density: RadialDensityBand
  domainRadius: number
  spaceRadius: number
  parentRadius: number
  maxParentRowWidth: number
  parentRowSpacing: number
  parentClusterGap: number
  childColumnSpacing: number
  childSiblingGap: number
  childBaseDepth: number
  childRowSpacing: number
  maxColumns: number
  rowStaggerRatio: number
  reservationDepthFactor: number
  clusterPadding: number
}

const OVERVIEW_RELATION_LIMIT = 450
const OUTER_RADIUS = 620
const SPACE_RADIUS = 450
const VISUALIZER_LAYOUT_NODE_MIN_WIDTH = 76
const VISUALIZER_LAYOUT_NODE_MAX_WIDTH = 132
const VISUALIZER_LAYOUT_NODE_WIDTH = VISUALIZER_LAYOUT_NODE_MAX_WIDTH + 16
const VISUALIZER_LAYOUT_NODE_HEIGHT = 52
const VISUALIZER_LAYOUT_NODE_TEXT_WIDTH = 8.1
const VISUALIZER_LAYOUT_NODE_CHROME_WIDTH = 22
const VISUALIZER_LAYOUT_NODE_COLLISION_PADDING = 10
const VISUALIZER_RADIAL_LOCAL_RELAXATION_STEPS = 32
const VISUALIZER_COLLISION_ITERATIONS = 384
const VISUALIZER_COLLISION_EPSILON = 0.01
const VISUALIZER_LINK_TREE_PARENT_MIN_WIDTH = 190
const VISUALIZER_LINK_TREE_PARENT_GAP = 44
const VISUALIZER_LINK_TREE_CHILD_X_SPACING = 142
const VISUALIZER_LINK_TREE_CHILD_ROW_SPACING = 84
const VISUALIZER_LINK_TREE_CHILD_ROW_STAGGER = 34
const VISUALIZER_LINK_TREE_Y_SPACING = 175
const VISUALIZER_SOURCE_TOP_HANDLE: VisualizerEdgeHandleId = 'visualizer-source-top'
const VISUALIZER_SOURCE_BOTTOM_HANDLE: VisualizerEdgeHandleId = 'visualizer-source-bottom'
const VISUALIZER_TARGET_TOP_HANDLE: VisualizerEdgeHandleId = 'visualizer-target-top'
const VISUALIZER_TARGET_BOTTOM_HANDLE: VisualizerEdgeHandleId = 'visualizer-target-bottom'
const VISUALIZER_LAYOUT_MODES: VisualizerLayoutMode[] = ['wedge-fan', 'strict-rings', 'compact-cluster', 'link-tree']

export const DEFAULT_VISUALIZER_GRAPH_OPTIONS: VisualizerGraphOptions = {
  homeNodesResideInParent: false,
  layoutMode: 'wedge-fan',
}

export const DEFAULT_VISUALIZER_FILTER: VisualizerFilterState = {
  mode: 'overview',
  selectedTagKeys: [],
  tagSortMode: 'az',
  duplicateGroupId: '',
  frontmatter: {
    templateQuery: '',
    selectedTemplateId: '',
    includeMatchingFields: false,
    fieldQuery: '',
    selectedFieldType: '',
    showAllUsage: false,
  },
  focusedNodeId: '',
}

export function normalizeVisualizerFilter(
  filter: Partial<VisualizerFilterState> = {},
): VisualizerFilterState {
  return {
    ...DEFAULT_VISUALIZER_FILTER,
    ...filter,
    frontmatter: {
      ...DEFAULT_VISUALIZER_FILTER.frontmatter,
      ...(filter.frontmatter ?? {}),
    },
  }
}

function getDomainsWithActiveProjection(sourceState: AppState): Domain[] {
  return sourceState.domains.map((domain) =>
    domain.id === sourceState.activeDomainId
      ? { ...domain, activeSpaceId: sourceState.activeSpaceId, spaces: sourceState.spaces }
      : domain,
  )
}

export function getVisualizerLocationNodeId(location: NoteLocation): string {
  const key = buildNoteLocationKey(location)
  return location.subTabId ? `subtab:${key}` : `note:${key}`
}

export function getVisualizerAisleNodeId(location: NoteLocation, aisleId: string): string {
  return `aisle:${buildNoteLocationKey(location)}:${aisleId}`
}

export function getVisualizerDuplicateGroupId(kind: 'note' | 'aisle', id: string): string {
  return `duplicate:${kind}:${id}`
}

function normalizeVisualizerGraphOptions(options: Partial<VisualizerGraphOptions> = {}): VisualizerGraphOptions {
  return {
    ...DEFAULT_VISUALIZER_GRAPH_OPTIONS,
    ...options,
    layoutMode: VISUALIZER_LAYOUT_MODES.includes(options.layoutMode as VisualizerLayoutMode)
      ? (options.layoutMode as VisualizerLayoutMode)
      : DEFAULT_VISUALIZER_GRAPH_OPTIONS.layoutMode,
  }
}

function normalizeFieldKey(key: string): string {
  return key.trim().toLocaleLowerCase()
}

function edgeId(kind: VisualizerEdgeKind, source: string, target: string): string {
  return `${kind}:${source}->${target}`
}

function addEdge(ctx: GraphBuildContext, source: string, target: string, kind: VisualizerEdgeKind, label = '', count = 0) {
  if (source === target) return
  const id = edgeId(kind, source, target)
  if (ctx.edges.has(id)) return
  ctx.edges.set(id, { id, source, target, kind, label, count })
}

function addNode(ctx: GraphBuildContext, node: Omit<VisualizerGraphNode, 'position'>) {
  if (ctx.nodes.has(node.id)) return
  ctx.nodes.set(node.id, { ...node, position: { x: 0, y: 0 } })
}

function getLocationEntryNodeLabel(entry: LocationEntry): string {
  return entry.isSubtab ? entry.title : 'home'
}

function getLocationHierarchyChips(entry: LocationEntry): VisualizerHierarchyChip[] {
  return [
    { kind: 'domain', label: entry.domainName },
    { kind: 'space', label: entry.spaceName },
    { kind: 'parent', label: entry.parentName },
    { kind: entry.isSubtab ? 'subtab' : 'note', label: getLocationEntryNodeLabel(entry) },
  ]
}

function getLocationAncestorChips(entry: LocationEntry): VisualizerHierarchyChip[] {
  return [
    { kind: 'domain', label: entry.domainName },
    { kind: 'space', label: entry.spaceName },
    { kind: 'parent', label: entry.parentName },
  ]
}

function getVisualizerParentNodeId(entry: LocationEntry): string {
  return `parent:${entry.domainId}:${entry.spaceId}:${entry.parentId}`
}

function shouldMergeHomeLocationIntoParent(ctx: GraphBuildContext, entry: LocationEntry): boolean {
  return ctx.options.homeNodesResideInParent && !entry.isSubtab
}

function getVisualizerEntryNodeId(ctx: GraphBuildContext, entry: LocationEntry): string {
  return shouldMergeHomeLocationIntoParent(ctx, entry)
    ? getVisualizerParentNodeId(entry)
    : getVisualizerLocationNodeId(entry.location)
}

function getAisleLabel(entry: AisleEntry): string {
  const aisleIndex = entry.locationEntry.body?.aisles.findIndex((candidate) => candidate.id === entry.aisle.id) ?? -1
  return aisleIndex >= 0 ? `aisle ${aisleIndex + 1}` : 'aisle'
}

function getAisleHierarchyChips(entry: AisleEntry): VisualizerHierarchyChip[] {
  return [...getLocationHierarchyChips(entry.locationEntry), { kind: 'aisle', label: getAisleLabel(entry) }]
}

function getMarkdownExcerpt(markdown: string): string {
  const normalized = markdown
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!normalized) return 'no markdown content.'
  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}...` : normalized
}

function getAisleFrontmatterFields(aisleBody: NoteAisleBody | null): string[] {
  const frontmatter = aisleBody?.frontmatter
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return []
  return Object.keys(frontmatter).sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

function getTemplateName(state: AppState, templateId: string | undefined): string {
  if (!templateId) return ''
  return state.frontmatter.templates.find((template) => template.id === templateId)?.name ?? templateId
}

function getNoteTags(body: NoteBody | null, aisleBodyById: Map<string, NoteAisleBody>): string[] {
  if (!body) return []
  const tags: string[] = []
  const seen = new Set<string>()
  body.aisles.forEach((aisle) => {
    const aisleTags = getAisleBodyTags(aisleBodyById.get(getAisleBodyId(aisle)))
    aisleTags.forEach((tag: string) => {
      const key = normalizeTagKey(tag)
      if (!key || seen.has(key)) return
      seen.add(key)
      tags.push(tag)
    })
  })
  return tags
}

function getDuplicateSummary(ctx: GraphBuildContext, entry: LocationEntry): string {
  const noteCopies = ctx.locationEntries.filter((candidate) => candidate.noteBodyId === entry.noteBodyId).length
  const linkedAisleCount = (entry.body?.aisles ?? []).filter((aisle) => {
    const aisleBodyId = getAisleBodyId(aisle)
    return ctx.aisleEntries.filter((candidate) => candidate.aisleBodyId === aisleBodyId).length > 1
  }).length
  const parts: string[] = []
  if (noteCopies > 1) parts.push(`${noteCopies} linked note copies`)
  if (linkedAisleCount > 0) parts.push(`${linkedAisleCount} linked aisles`)
  return parts.join(', ') || 'no linked duplicate relationships'
}

function buildLocationPreview(ctx: GraphBuildContext, entry: LocationEntry): VisualizerNodePreview {
  const primaryAisle = entry.body?.aisles[0] ?? null
  const primaryAisleBody = primaryAisle ? ctx.aisleBodyById.get(getAisleBodyId(primaryAisle)) ?? null : null
  return {
    title: entry.title,
    breadcrumb: entry.breadcrumb,
    hierarchyChips: getLocationHierarchyChips(entry),
    kind: entry.isSubtab ? 'subtab' : 'note',
    location: entry.location,
    noteBodyId: entry.noteBodyId,
    tags: getNoteTags(entry.body, ctx.aisleBodyById),
    frontmatterTemplateName: getTemplateName(ctx.state, primaryAisleBody?.frontmatterMeta?.templateId),
    frontmatterFields: getAisleFrontmatterFields(primaryAisleBody),
    duplicateSummary: getDuplicateSummary(ctx, entry),
    aisleCount: entry.body?.aisles.length ?? 0,
    markdownExcerpt: getMarkdownExcerpt(primaryAisle ? getAisleMarkdown(primaryAisle, ctx.aisleBodyById) : ''),
    canOpen: true,
  }
}

function attachHomePreviewToParent(ctx: GraphBuildContext, entry: LocationEntry) {
  const parentId = getVisualizerParentNodeId(entry)
  const parentNode = ctx.nodes.get(parentId)
  if (!parentNode) return
  ctx.nodes.set(parentId, {
    ...parentNode,
    location: entry.location,
    noteBodyId: entry.noteBodyId,
    preview: buildLocationPreview(ctx, entry),
  })
}

function attachParentHomePreviewIfNeeded(ctx: GraphBuildContext, entry: LocationEntry) {
  if (!ctx.options.homeNodesResideInParent) return
  const homeEntry = ctx.locationEntries.find(
    (candidate) =>
      !candidate.isSubtab &&
      candidate.domainId === entry.domainId &&
      candidate.spaceId === entry.spaceId &&
      candidate.parentId === entry.parentId,
  )
  if (homeEntry) attachHomePreviewToParent(ctx, homeEntry)
}

function buildAislePreview(ctx: GraphBuildContext, entry: AisleEntry): VisualizerNodePreview {
  return {
    title: getAisleLabel(entry),
    breadcrumb: entry.locationEntry.breadcrumb,
    hierarchyChips: getAisleHierarchyChips(entry),
    kind: 'aisle',
    location: entry.locationEntry.location,
    noteBodyId: entry.locationEntry.noteBodyId,
    aisleId: entry.aisle.id,
    aisleBodyId: entry.aisleBodyId,
    tags: getAisleBodyTags(entry.aisleBody ?? undefined),
    frontmatterTemplateName: getTemplateName(ctx.state, entry.aisleBody?.frontmatterMeta?.templateId),
    frontmatterFields: getAisleFrontmatterFields(entry.aisleBody),
    duplicateSummary:
      ctx.aisleEntries.filter((candidate) => candidate.aisleBodyId === entry.aisleBodyId).length > 1
        ? 'linked aisle body'
        : 'independent aisle',
    aisleCount: 1,
    markdownExcerpt: getMarkdownExcerpt(entry.markdown),
    canOpen: true,
  }
}

function addHierarchyContext(ctx: GraphBuildContext, entry: LocationEntry, includeSubtab: boolean) {
  const domainId = `domain:${entry.domainId}`
  const spaceId = `space:${entry.domainId}:${entry.spaceId}`
  const parentId = getVisualizerParentNodeId(entry)
  const domainChip: VisualizerHierarchyChip = { kind: 'domain', label: entry.domainName }
  const spaceChip: VisualizerHierarchyChip = { kind: 'space', label: entry.spaceName }
  const parentChip: VisualizerHierarchyChip = { kind: 'parent', label: entry.parentName }

  addNode(ctx, {
    id: domainId,
    kind: 'domain',
    label: entry.domainName,
    detailLabel: entry.domainName,
    hierarchyPath: entry.domainName,
    hierarchyChips: [],
    previewHierarchyChips: [domainChip],
    count: 0,
  })
  addNode(ctx, {
    id: spaceId,
    kind: 'space',
    label: entry.spaceName,
    detailLabel: `${entry.domainName} / ${entry.spaceName}`,
    hierarchyPath: `${entry.domainName} / ${entry.spaceName}`,
    hierarchyChips: [domainChip],
    previewHierarchyChips: [domainChip, spaceChip],
    count: 0,
  })
  addNode(ctx, {
    id: parentId,
    kind: 'parent',
    label: entry.parentName,
    detailLabel: `${entry.domainName} / ${entry.spaceName} / ${entry.parentName}`,
    hierarchyPath: `${entry.domainName} / ${entry.spaceName} / ${entry.parentName}`,
    hierarchyChips: [domainChip, spaceChip],
    previewHierarchyChips: [domainChip, spaceChip, parentChip],
    count: 0,
  })
  attachParentHomePreviewIfNeeded(ctx, entry)
  addEdge(ctx, domainId, spaceId, 'hierarchy')
  addEdge(ctx, spaceId, parentId, 'hierarchy')

  if (entry.isSubtab && !includeSubtab) return
  if (shouldMergeHomeLocationIntoParent(ctx, entry)) {
    return
  }

  const locationNodeId = getVisualizerLocationNodeId(entry.location)
  addNode(ctx, {
    id: locationNodeId,
    kind: entry.isSubtab ? 'subtab' : 'note',
    label: getLocationEntryNodeLabel(entry),
    detailLabel: entry.breadcrumb,
    hierarchyPath: entry.breadcrumb,
    hierarchyChips: getLocationAncestorChips(entry),
    previewHierarchyChips: getLocationHierarchyChips(entry),
    count: 0,
    location: entry.location,
    noteBodyId: entry.noteBodyId,
    preview: buildLocationPreview(ctx, entry),
  })
  addEdge(ctx, parentId, locationNodeId, 'hierarchy')
}

function addAisleNode(ctx: GraphBuildContext, aisleEntry: AisleEntry) {
  const locationNodeId = getVisualizerEntryNodeId(ctx, aisleEntry.locationEntry)
  const aisleNodeId = getVisualizerAisleNodeId(aisleEntry.locationEntry.location, aisleEntry.aisle.id)
  addHierarchyContext(ctx, aisleEntry.locationEntry, true)
  addNode(ctx, {
    id: aisleNodeId,
    kind: 'aisle',
    label: getAisleLabel(aisleEntry),
    detailLabel: `${aisleEntry.locationEntry.breadcrumb} / ${aisleEntry.aisle.id}`,
    hierarchyPath: aisleEntry.locationEntry.breadcrumb,
    hierarchyChips: getLocationHierarchyChips(aisleEntry.locationEntry),
    previewHierarchyChips: getAisleHierarchyChips(aisleEntry),
    count: 0,
    location: aisleEntry.locationEntry.location,
    noteBodyId: aisleEntry.locationEntry.noteBodyId,
    aisleId: aisleEntry.aisle.id,
    aisleBodyId: aisleEntry.aisleBodyId,
    preview: buildAislePreview(ctx, aisleEntry),
  })
  addEdge(ctx, locationNodeId, aisleNodeId, 'aisle-slot')
}

function collectLocationEntries(state: AppState, bodyById: Map<string, NoteBody>): LocationEntry[] {
  const entries: LocationEntry[] = []
  getDomainsWithActiveProjection(state).forEach((domain) => {
    domain.spaces.forEach((space) => {
      space.data.tabs.forEach((tab) => {
        const homeLocation = { domainId: domain.id, spaceId: space.id, tabId: tab.id, subTabId: null }
        const homeBody = bodyById.get(tab.noteBodyId) ?? null
        entries.push({
          key: buildNoteLocationKey(homeLocation),
          location: homeLocation,
          noteBodyId: tab.noteBodyId,
          title: tab.title,
          breadcrumb: getNoteLocationBreadcrumbLabel(state, homeLocation),
          domainId: domain.id,
          domainName: domain.name,
          spaceId: space.id,
          spaceName: space.name,
          parentId: tab.id,
          parentName: tab.title,
          subTabId: null,
          isSubtab: false,
          body: homeBody,
        })

        tab.subTabs.forEach((subTab) => {
          const location = { domainId: domain.id, spaceId: space.id, tabId: tab.id, subTabId: subTab.id }
          entries.push({
            key: buildNoteLocationKey(location),
            location,
            noteBodyId: subTab.noteBodyId,
            title: subTab.title,
            breadcrumb: getNoteLocationBreadcrumbLabel(state, location),
            domainId: domain.id,
            domainName: domain.name,
            spaceId: space.id,
            spaceName: space.name,
            parentId: tab.id,
            parentName: tab.title,
            subTabId: subTab.id,
            isSubtab: true,
            body: bodyById.get(subTab.noteBodyId) ?? null,
          })
        })
      })
    })
  })
  return entries
}

function collectAisleEntries(
  locationEntries: LocationEntry[],
  aisleBodyById: Map<string, NoteAisleBody>,
): AisleEntry[] {
  return locationEntries.flatMap((locationEntry) =>
    (locationEntry.body?.aisles ?? []).map((aisle) => {
      const aisleBodyId = getAisleBodyId(aisle)
      const aisleBody = aisleBodyById.get(aisleBodyId) ?? null
      return {
        id: getVisualizerAisleNodeId(locationEntry.location, aisle.id),
        locationEntry,
        aisle,
        aisleBody,
        aisleBodyId,
        markdown: getAisleMarkdown(aisle, aisleBodyById),
      }
    }),
  )
}

function createBuildContext(state: AppState, options: VisualizerGraphOptions): GraphBuildContext {
  const bodyById = new Map(state.noteBodies.map((body) => [body.id, body]))
  const aisleBodyById = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const locationEntries = collectLocationEntries(state, bodyById)
  const aisleEntries = collectAisleEntries(locationEntries, aisleBodyById)
  return {
    state,
    options,
    aisleBodyById,
    locationEntries,
    aisleEntries,
    nodes: new Map(),
    edges: new Map(),
    duplicateGroups: [],
    fieldSummariesByKey: new Map(),
    fieldTypeCounts: new Map(),
  }
}

function addOverview(ctx: GraphBuildContext) {
  ctx.locationEntries.forEach((entry) => addHierarchyContext(ctx, entry, true))
}

function getDuplicateGroups(ctx: GraphBuildContext): VisualizerDuplicateGroup[] {
  const byNoteBodyId = new Map<string, LocationEntry[]>()
  ctx.locationEntries.forEach((entry) => {
    byNoteBodyId.set(entry.noteBodyId, [...(byNoteBodyId.get(entry.noteBodyId) ?? []), entry])
  })

  const byAisleBodyId = new Map<string, AisleEntry[]>()
  ctx.aisleEntries.forEach((entry) => {
    byAisleBodyId.set(entry.aisleBodyId, [...(byAisleBodyId.get(entry.aisleBodyId) ?? []), entry])
  })

  const noteGroups = [...byNoteBodyId.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([noteBodyId, entries]) => ({
      id: getVisualizerDuplicateGroupId('note', noteBodyId),
      kind: 'note' as const,
      label: `note copies (${entries.length})`,
      count: entries.length,
      noteBodyId,
      nodeIds: [...new Set(entries.map((entry) => getVisualizerEntryNodeId(ctx, entry)))],
    }))

  const aisleGroups = [...byAisleBodyId.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([aisleBodyId, entries]) => ({
      id: getVisualizerDuplicateGroupId('aisle', aisleBodyId),
      kind: 'aisle' as const,
      label: `aisle copies (${entries.length})`,
      count: entries.length,
      aisleBodyId,
      nodeIds: entries.map((entry) => getVisualizerAisleNodeId(entry.locationEntry.location, entry.aisle.id)),
    }))

  return [...noteGroups, ...aisleGroups].sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
  )
}

function addDuplicateRelationships(ctx: GraphBuildContext, filter: VisualizerFilterState) {
  const groups = getDuplicateGroups(ctx)
  ctx.duplicateGroups = groups
  const visibleGroups = filter.duplicateGroupId ? groups.filter((group) => group.id === filter.duplicateGroupId) : groups
  visibleGroups.forEach((group) => {
    addNode(ctx, {
      id: group.id,
      kind: 'duplicate-group',
      label: group.kind === 'note' ? `note group (${group.count})` : `aisle group (${group.count})`,
      detailLabel: group.label,
      hierarchyPath: 'duplicates',
      count: group.count,
      noteBodyId: group.noteBodyId,
      aisleBodyId: group.aisleBodyId,
    })

    if (group.kind === 'note') {
      ctx.locationEntries
        .filter((entry) => entry.noteBodyId === group.noteBodyId)
        .forEach((entry) => {
          addHierarchyContext(ctx, entry, true)
          addEdge(ctx, group.id, getVisualizerEntryNodeId(ctx, entry), 'duplicate-note', 'duplicate note', group.count)
        })
      return
    }

    ctx.aisleEntries
      .filter((entry) => entry.aisleBodyId === group.aisleBodyId)
      .forEach((entry) => {
        addAisleNode(ctx, entry)
        addEdge(ctx, group.id, getVisualizerAisleNodeId(entry.locationEntry.location, entry.aisle.id), 'duplicate-aisle', 'duplicate aisle', group.count)
      })
  })
}

function addTagRelationships(ctx: GraphBuildContext, filter: VisualizerFilterState) {
  const tagIndex = buildTagFilterIndex(ctx.state, filter.selectedTagKeys)
  if (tagIndex.selectedTagKeys.length === 0) return

  tagIndex.selectedTagKeys.forEach((key) => {
    const summary = tagIndex.availableTags.find((tag) => tag.key === key)
    addNode(ctx, {
      id: `tag:${key}`,
      kind: 'tag',
      label: `#${summary?.label ?? key}`,
      detailLabel: `${summary?.count ?? 0} occurrences`,
      hierarchyPath: 'tags',
      count: summary?.count ?? 0,
      tagKey: key,
    })
  })

  tagIndex.selectedOccurrences.forEach((occurrence) => {
    const locationEntry = ctx.locationEntries.find((entry) => entry.key === buildNoteLocationKey(occurrence.location))
    if (!locationEntry) return
    const aisleEntry = ctx.aisleEntries.find(
      (entry) =>
        entry.locationEntry.key === locationEntry.key &&
        entry.aisle.id === occurrence.aisleId &&
        entry.aisleBodyId === occurrence.aisleBodyId,
    )
    if (!aisleEntry) return
    addAisleNode(ctx, aisleEntry)
    addEdge(ctx, `tag:${occurrence.key}`, getVisualizerAisleNodeId(locationEntry.location, aisleEntry.aisle.id), 'tag', `#${occurrence.label}`, 1)
  })
}

function inferFrontmatterFieldType(value: unknown): FrontmatterFieldType {
  if (Array.isArray(value)) return 'list'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'datetime'
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'date'
  }
  return 'text'
}

function getTemplateFieldTypesByKey(templates: FrontmatterTemplate[]) {
  const fieldTypesByKey = new Map<string, Set<FrontmatterFieldType>>()
  templates.forEach((template) => {
    template.fields.forEach((field) => {
      const key = normalizeFieldKey(field.key)
      if (!key) return
      const types = fieldTypesByKey.get(key) ?? new Set<FrontmatterFieldType>()
      types.add(field.type)
      fieldTypesByKey.set(key, types)
    })
  })
  return fieldTypesByKey
}

function collectFrontmatterSummaries(ctx: GraphBuildContext) {
  const templateFieldTypesByKey = getTemplateFieldTypesByKey(ctx.state.frontmatter.templates)
  ctx.aisleEntries.forEach((entry) => {
    const frontmatter = entry.aisleBody?.frontmatter
    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return
    Object.entries(frontmatter).forEach(([fieldKey, value]) => {
      const normalizedKey = normalizeFieldKey(fieldKey)
      if (!normalizedKey) return
      const inferredTypes = templateFieldTypesByKey.get(normalizedKey) ?? new Set<FrontmatterFieldType>([inferFrontmatterFieldType(value)])
      const existing = ctx.fieldSummariesByKey.get(normalizedKey)
      if (existing) {
        existing.count += 1
        inferredTypes.forEach((type) => {
          if (!existing.types.includes(type)) existing.types.push(type)
        })
      } else {
        ctx.fieldSummariesByKey.set(normalizedKey, {
          key: normalizedKey,
          label: fieldKey,
          count: 1,
          types: [...inferredTypes],
        })
      }
      inferredTypes.forEach((type) => ctx.fieldTypeCounts.set(type, (ctx.fieldTypeCounts.get(type) ?? 0) + 1))
    })
  })
}

function getMatchingTemplates(state: AppState, query: string): FrontmatterTemplate[] {
  const normalized = query.trim().toLocaleLowerCase()
  if (!normalized) return state.frontmatter.templates
  return state.frontmatter.templates.filter((template) => {
    const templateText = `${template.name} ${template.id} ${template.fields.map((field) => field.key).join(' ')}`.toLocaleLowerCase()
    return templateText.includes(normalized)
  })
}

function addFrontmatterRelationships(ctx: GraphBuildContext, filter: VisualizerFilterState) {
  collectFrontmatterSummaries(ctx)
  const fmFilter = filter.frontmatter
  const matchingTemplates = getMatchingTemplates(ctx.state, fmFilter.templateQuery)
  const selectedTemplateIds = new Set(
    fmFilter.selectedTemplateId
      ? matchingTemplates.filter((template) => template.id === fmFilter.selectedTemplateId).map((template) => template.id)
      : matchingTemplates.map((template) => template.id),
  )
  const selectedFieldQuery = normalizeFieldKey(fmFilter.fieldQuery)
  const templateFields = new Map<string, Set<string>>()
  matchingTemplates.forEach((template) => {
    template.fields.forEach((field) => {
      const key = normalizeFieldKey(field.key)
      if (!key) return
      const keys = templateFields.get(template.id) ?? new Set<string>()
      keys.add(key)
      templateFields.set(template.id, keys)
    })
  })

  const includeAllUsage = fmFilter.showAllUsage || (!fmFilter.templateQuery.trim() && !fmFilter.selectedTemplateId && !selectedFieldQuery && !fmFilter.selectedFieldType)

  ctx.aisleEntries.forEach((entry) => {
    const body = entry.aisleBody
    const frontmatter = body?.frontmatter
    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) return
    const fieldEntries = Object.entries(frontmatter)
    const fieldKeys = new Set(fieldEntries.map(([key]) => normalizeFieldKey(key)).filter(Boolean))
    const templateId = body?.frontmatterMeta?.templateId ?? ''
    const explicitTemplateMatch = templateId ? selectedTemplateIds.has(templateId) : false
    const matchingTemplate = matchingTemplates.find((template) => template.id === templateId)
    const templateFieldMatch =
      fmFilter.includeMatchingFields &&
      matchingTemplates.some((template) => {
        const keys = templateFields.get(template.id) ?? new Set<string>()
        return [...keys].some((key) => fieldKeys.has(key))
      })
    const fieldQueryMatch = selectedFieldQuery ? [...fieldKeys].some((key) => key.includes(selectedFieldQuery)) : false
    const fieldTypeMatch = fmFilter.selectedFieldType
      ? fieldEntries.some(([, value]) => inferFrontmatterFieldType(value) === fmFilter.selectedFieldType)
      : false
    const shouldInclude =
      includeAllUsage ||
      explicitTemplateMatch ||
      templateFieldMatch ||
      fieldQueryMatch ||
      fieldTypeMatch
    if (!shouldInclude) return

    addAisleNode(ctx, entry)

    if (templateId && (includeAllUsage || explicitTemplateMatch || matchingTemplate)) {
      const template = ctx.state.frontmatter.templates.find((candidate) => candidate.id === templateId)
      const templateNodeId = `fm-template:${templateId}`
      addNode(ctx, {
        id: templateNodeId,
        kind: 'frontmatter-template',
        label: template?.name ?? templateId,
        detailLabel: `${template?.fields.length ?? 0} fields`,
        hierarchyPath: 'front matter templates',
        count: 0,
        templateId,
      })
      addEdge(ctx, templateNodeId, getVisualizerAisleNodeId(entry.locationEntry.location, entry.aisle.id), 'frontmatter-template', 'template')
    }

    fieldEntries.forEach(([fieldKey, value]) => {
      const normalizedKey = normalizeFieldKey(fieldKey)
      if (!normalizedKey) return
      const valueType = inferFrontmatterFieldType(value)
      if (selectedFieldQuery && !normalizedKey.includes(selectedFieldQuery)) return
      if (fmFilter.selectedFieldType && valueType !== fmFilter.selectedFieldType) return
      const fieldNodeId = `fm-field:${normalizedKey}`
      const typeNodeId = `fm-type:${valueType}`
      addNode(ctx, {
        id: fieldNodeId,
        kind: 'frontmatter-field',
        label: fieldKey,
        detailLabel: valueType,
        hierarchyPath: 'front matter fields',
        count: ctx.fieldSummariesByKey.get(normalizedKey)?.count ?? 0,
        fieldKey: normalizedKey,
        fieldType: valueType,
      })
      addNode(ctx, {
        id: typeNodeId,
        kind: 'frontmatter-type',
        label: valueType,
        detailLabel: `${ctx.fieldTypeCounts.get(valueType) ?? 0} fields`,
        hierarchyPath: 'front matter field types',
        count: ctx.fieldTypeCounts.get(valueType) ?? 0,
        fieldType: valueType,
      })
      addEdge(ctx, fieldNodeId, getVisualizerAisleNodeId(entry.locationEntry.location, entry.aisle.id), 'frontmatter-field', fieldKey)
      addEdge(ctx, typeNodeId, fieldNodeId, 'frontmatter-type', valueType)
    })
  })
}

function positionOnCircle(angle: number, radius: number): { x: number; y: number } {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function estimateVisualizerNodeWidth(label: string): number {
  return (
    clamp(
      label.length * VISUALIZER_LAYOUT_NODE_TEXT_WIDTH + VISUALIZER_LAYOUT_NODE_CHROME_WIDTH,
      VISUALIZER_LAYOUT_NODE_MIN_WIDTH,
      VISUALIZER_LAYOUT_NODE_MAX_WIDTH,
    ) + VISUALIZER_LAYOUT_NODE_COLLISION_PADDING
  )
}

function getVisualizerNodeWidth(node: Pick<VisualizerGraphNode, 'label'>): number {
  return estimateVisualizerNodeWidth(node.label)
}

function getVisualizerNodeLayoutRect(node: VisualizerGraphNode) {
  const width = getVisualizerNodeWidth(node)
  return {
    left: node.position.x - width / 2,
    right: node.position.x + width / 2,
    top: node.position.y - VISUALIZER_LAYOUT_NODE_HEIGHT / 2,
    bottom: node.position.y + VISUALIZER_LAYOUT_NODE_HEIGHT / 2,
  }
}

function visualizerNodeRectsOverlap(left: VisualizerGraphNode, right: VisualizerGraphNode): boolean {
  const leftRect = getVisualizerNodeLayoutRect(left)
  const rightRect = getVisualizerNodeLayoutRect(right)
  return leftRect.left < rightRect.right && leftRect.right > rightRect.left && leftRect.top < rightRect.bottom && leftRect.bottom > rightRect.top
}

function normalizeVector(vector: { x: number; y: number }): { x: number; y: number } | null {
  const length = Math.hypot(vector.x, vector.y)
  if (length < VISUALIZER_COLLISION_EPSILON) return null
  return { x: vector.x / length, y: vector.y / length }
}

function getParentFlowConstraint(
  spacePosition: { x: number; y: number } | undefined,
  parentPosition: { x: number; y: number },
  fallbackAngle: number,
  minDepth: number,
  maxDepth: number,
  halfWidth: number,
): ParentFlowConstraint {
  const flow = normalizeVector(
    spacePosition
      ? { x: parentPosition.x - spacePosition.x, y: parentPosition.y - spacePosition.y }
      : { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) },
  ) ?? { x: Math.cos(fallbackAngle), y: Math.sin(fallbackAngle) }
  return {
    origin: parentPosition,
    flow,
    tangent: { x: -flow.y, y: flow.x },
    minDepth,
    maxDepth,
    halfWidth,
  }
}

function positionInParentFlow(
  constraint: ParentFlowConstraint,
  depth: number,
  tangentOffset: number,
): { x: number; y: number } {
  const clampedDepth = clamp(depth, constraint.minDepth, constraint.maxDepth)
  const clampedOffset = clamp(tangentOffset, -constraint.halfWidth, constraint.halfWidth)
  return {
    x: constraint.origin.x + constraint.flow.x * clampedDepth + constraint.tangent.x * clampedOffset,
    y: constraint.origin.y + constraint.flow.y * clampedDepth + constraint.tangent.y * clampedOffset,
  }
}

function getParentFlowCoordinates(
  position: { x: number; y: number },
  constraint: ParentFlowConstraint,
): { depth: number; tangentOffset: number } {
  const delta = { x: position.x - constraint.origin.x, y: position.y - constraint.origin.y }
  return {
    depth: delta.x * constraint.flow.x + delta.y * constraint.flow.y,
    tangentOffset: delta.x * constraint.tangent.x + delta.y * constraint.tangent.y,
  }
}

function clampPositionToParentFlow(
  position: { x: number; y: number },
  constraint: ParentFlowConstraint,
): { x: number; y: number } {
  const coordinates = getParentFlowCoordinates(position, constraint)
  return positionInParentFlow(constraint, coordinates.depth, coordinates.tangentOffset)
}

function clampNodeToParentFlow(
  node: VisualizerGraphNode,
  flowConstraints: Map<string, ParentFlowConstraint>,
) {
  const constraint = flowConstraints.get(node.id)
  if (!constraint) return
  node.position = clampPositionToParentFlow(node.position, constraint)
}

function getAveragePosition(nodes: Map<string, VisualizerGraphNode>, nodeIds: string[]): { x: number; y: number } {
  const positions = nodeIds.map((id) => nodes.get(id)?.position).filter((position): position is { x: number; y: number } => Boolean(position))
  if (positions.length === 0) return { x: 0, y: 0 }
  return {
    x: positions.reduce((sum, position) => sum + position.x, 0) / positions.length,
    y: positions.reduce((sum, position) => sum + position.y, 0) / positions.length,
  }
}

function isHierarchyLayoutNode(node: VisualizerGraphNode): boolean {
  return node.kind === 'domain' || node.kind === 'space' || node.kind === 'parent' || node.kind === 'note' || node.kind === 'subtab' || node.kind === 'aisle'
}

function getNodeCollisionMobility(node: VisualizerGraphNode): number {
  if (node.kind === 'domain' || node.kind === 'space') return 0
  if (node.kind === 'parent') return 0.38
  if (node.kind === 'note' || node.kind === 'subtab' || node.kind === 'aisle') return 1
  return 1.35
}

function getDeterministicPairDirection(left: VisualizerGraphNode, right: VisualizerGraphNode): { x: number; y: number } {
  const seed = `${left.id}|${right.id}`
  let hash = 0
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
  }
  const angle = (hash / 0xffffffff) * Math.PI * 2
  return { x: Math.cos(angle) || 1, y: Math.sin(angle) || 0 }
}

function relaxNodeCollisions(nodes: VisualizerGraphNode[], flowConstraints: Map<string, ParentFlowConstraint> = new Map()) {
  if (nodes.length < 2) return
  for (let iteration = 0; iteration < VISUALIZER_COLLISION_ITERATIONS; iteration += 1) {
    let moved = false
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = nodes[leftIndex]
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const right = nodes[rightIndex]
        const leftMobility = getNodeCollisionMobility(left)
        const rightMobility = getNodeCollisionMobility(right)
        const totalMobility = leftMobility + rightMobility
        if (totalMobility <= 0) continue

        const deltaX = right.position.x - left.position.x
        const deltaY = right.position.y - left.position.y
        const overlapX = (getVisualizerNodeWidth(left) + getVisualizerNodeWidth(right)) / 2 - Math.abs(deltaX)
        const overlapY = VISUALIZER_LAYOUT_NODE_HEIGHT - Math.abs(deltaY)
        if (overlapX <= 0 || overlapY <= 0) continue

        const fallback = Math.abs(deltaX) < VISUALIZER_COLLISION_EPSILON && Math.abs(deltaY) < VISUALIZER_COLLISION_EPSILON
          ? getDeterministicPairDirection(left, right)
          : null
        const separateOnX = overlapX <= overlapY
        const direction = separateOnX
          ? Math.sign(deltaX) || Math.sign(fallback?.x ?? 0) || 1
          : Math.sign(deltaY) || Math.sign(fallback?.y ?? 0) || 1
        const distance = (separateOnX ? overlapX : overlapY) + 1
        const leftShift = (distance * leftMobility) / totalMobility
        const rightShift = (distance * rightMobility) / totalMobility
        const leftFlow = flowConstraints.get(left.id)
        const rightFlow = flowConstraints.get(right.id)

        if (leftFlow && rightFlow) {
          const leftCoordinates = getParentFlowCoordinates(left.position, leftFlow)
          const rightCoordinates = getParentFlowCoordinates(right.position, rightFlow)
          const depthDirection = Math.sign(rightCoordinates.depth - leftCoordinates.depth) || (left.id.localeCompare(right.id) <= 0 ? 1 : -1)
          left.position = positionInParentFlow(
            leftFlow,
            leftCoordinates.depth - depthDirection * leftShift,
            leftCoordinates.tangentOffset,
          )
          right.position = positionInParentFlow(
            rightFlow,
            rightCoordinates.depth + depthDirection * rightShift,
            rightCoordinates.tangentOffset,
          )
          moved = true
          continue
        }

        if (separateOnX) {
          left.position = { ...left.position, x: left.position.x - direction * leftShift }
          right.position = { ...right.position, x: right.position.x + direction * rightShift }
        } else {
          left.position = { ...left.position, y: left.position.y - direction * leftShift }
          right.position = { ...right.position, y: right.position.y + direction * rightShift }
        }
        clampNodeToParentFlow(left, flowConstraints)
        clampNodeToParentFlow(right, flowConstraints)
        moved = true
      }
    }
    if (!moved) return
  }
}

function pushChildNodesPastBlockers(
  blockerNodes: VisualizerGraphNode[],
  childNodes: VisualizerGraphNode[],
  flowConstraints: Map<string, ParentFlowConstraint>,
) {
  if (blockerNodes.length === 0 || childNodes.length === 0) return
  for (let iteration = 0; iteration < VISUALIZER_RADIAL_LOCAL_RELAXATION_STEPS; iteration += 1) {
    let moved = false
    childNodes.forEach((childNode) => {
      const constraint = flowConstraints.get(childNode.id)
      const blockerNode = blockerNodes.find((candidate) => candidate.id !== childNode.id && visualizerNodeRectsOverlap(candidate, childNode))
      if (!constraint || !blockerNode) {
        return
      }
      const coordinates = getParentFlowCoordinates(childNode.position, constraint)
      const nextDepth = Math.min(coordinates.depth + VISUALIZER_LAYOUT_NODE_HEIGHT / 4, constraint.maxDepth)
      if (Math.abs(nextDepth - coordinates.depth) >= VISUALIZER_COLLISION_EPSILON) {
        childNode.position = positionInParentFlow(constraint, nextDepth, coordinates.tangentOffset)
        moved = true
        return
      }
      const blockerCoordinates = getParentFlowCoordinates(blockerNode.position, constraint)
      const tangentDirection =
        Math.sign(coordinates.tangentOffset - blockerCoordinates.tangentOffset) || (childNode.id.localeCompare(blockerNode.id) <= 0 ? -1 : 1)
      const nextTangentOffset = clamp(
        coordinates.tangentOffset + tangentDirection * (VISUALIZER_LAYOUT_NODE_HEIGHT / 4),
        -constraint.halfWidth,
        constraint.halfWidth,
      )
      if (Math.abs(nextTangentOffset - coordinates.tangentOffset) < VISUALIZER_COLLISION_EPSILON) return
      childNode.position = positionInParentFlow(constraint, coordinates.depth, nextTangentOffset)
      moved = true
    })
    if (!moved) return
  }
}

function assignEdgeHandles(ctx: GraphBuildContext) {
  ;[...ctx.edges.values()].forEach((edge) => {
    const sourceNode = ctx.nodes.get(edge.source)
    const targetNode = ctx.nodes.get(edge.target)
    if (!sourceNode || !targetNode) return
    const targetIsAboveSource = targetNode.position.y < sourceNode.position.y
    edge.sourceHandle = targetIsAboveSource ? VISUALIZER_SOURCE_TOP_HANDLE : VISUALIZER_SOURCE_BOTTOM_HANDLE
    edge.targetHandle = targetIsAboveSource ? VISUALIZER_TARGET_BOTTOM_HANDLE : VISUALIZER_TARGET_TOP_HANDLE
  })
}

function getVisibleParentChildNodeIds(
  ctx: GraphBuildContext,
  domainId: string,
  spaceId: string,
  tab: Tab,
  locationByKey: Map<string, LocationEntry>,
): string[] {
  const childLocations: NoteLocation[] = [
    { domainId, spaceId, tabId: tab.id, subTabId: null },
    ...tab.subTabs.map((subTab) => ({ domainId, spaceId, tabId: tab.id, subTabId: subTab.id })),
  ]
  return childLocations.flatMap((location) => {
    const nodeIds: string[] = []
    const childNodeId = getVisualizerLocationNodeId(location)
    if (ctx.nodes.has(childNodeId)) nodeIds.push(childNodeId)

    const locationEntry = locationByKey.get(buildNoteLocationKey(location))
    const aisles = locationEntry?.body?.aisles ?? []
    aisles.forEach((aisle) => {
      const aisleNodeId = getVisualizerAisleNodeId(location, aisle.id)
      if (ctx.nodes.has(aisleNodeId)) nodeIds.push(aisleNodeId)
    })
    return nodeIds
  })
}

function placeRelationshipNodes(ctx: GraphBuildContext) {
  ;[...ctx.nodes.values()].forEach((node, index) => {
    if (isHierarchyLayoutNode(node)) return
    const connectedNodeIds = [...ctx.edges.values()]
      .filter((edge) => edge.source === node.id || edge.target === node.id)
      .map((edge) => (edge.source === node.id ? edge.target : edge.source))
    const center = getAveragePosition(ctx.nodes, connectedNodeIds)
    const angle = Math.atan2(center.y, center.x) || (index / Math.max(ctx.nodes.size, 1)) * Math.PI * 2
    const offset = node.kind === 'duplicate-group' ? 118 : node.kind === 'tag' ? 92 : 78
    node.position = {
      x: center.x + Math.cos(angle) * offset,
      y: center.y + Math.sin(angle) * offset,
    }
  })
}

function finalizeVisualizerLayout(
  ctx: GraphBuildContext,
  flowConstraints: Map<string, ParentFlowConstraint> = new Map(),
  relaxHierarchy = true,
) {
  ;[...ctx.nodes.values()].forEach((node) => clampNodeToParentFlow(node, flowConstraints))
  if (relaxHierarchy) {
    relaxNodeCollisions([...ctx.nodes.values()].filter(isHierarchyLayoutNode), flowConstraints)
    relaxNodeCollisions([...ctx.nodes.values()].filter((node) => node.kind === 'parent'))
  }
  placeRelationshipNodes(ctx)
  if (relaxHierarchy) {
    relaxNodeCollisions([...ctx.nodes.values()], flowConstraints)
    relaxNodeCollisions([...ctx.nodes.values()].filter((node) => node.kind === 'parent'))
  } else {
    relaxNodeCollisions([...ctx.nodes.values()].filter((node) => !isHierarchyLayoutNode(node)))
  }
  if (relaxHierarchy) {
    relaxNodeCollisions([...ctx.nodes.values()], flowConstraints)
  }
  assignEdgeHandles(ctx)
}

const RADIAL_LAYOUT_PROFILES: Record<
  Extract<VisualizerLayoutMode, 'wedge-fan' | 'strict-rings' | 'compact-cluster'>,
  Record<RadialDensityBand, Omit<RadialLayoutProfile, 'density'>>
> = {
  'wedge-fan': {
    compact: {
      domainRadius: 500,
      spaceRadius: 360,
      parentRadius: 235,
      maxParentRowWidth: 1250,
      parentRowSpacing: 118,
      parentClusterGap: 24,
      childColumnSpacing: 118,
      childSiblingGap: 10,
      childBaseDepth: 126,
      childRowSpacing: 132,
      maxColumns: 3,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.22,
      clusterPadding: 14,
    },
    normal: {
      domainRadius: 560,
      spaceRadius: 410,
      parentRadius: 265,
      maxParentRowWidth: 1700,
      parentRowSpacing: 136,
      parentClusterGap: 32,
      childColumnSpacing: 134,
      childSiblingGap: 12,
      childBaseDepth: 150,
      childRowSpacing: 142,
      maxColumns: 3,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.32,
      clusterPadding: 18,
    },
    expanded: {
      domainRadius: OUTER_RADIUS,
      spaceRadius: SPACE_RADIUS,
      parentRadius: 305,
      maxParentRowWidth: 2400,
      parentRowSpacing: 158,
      parentClusterGap: 42,
      childColumnSpacing: 154,
      childSiblingGap: 14,
      childBaseDepth: 180,
      childRowSpacing: 158,
      maxColumns: 4,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.42,
      clusterPadding: 22,
    },
  },
  'strict-rings': {
    compact: {
      domainRadius: 530,
      spaceRadius: 390,
      parentRadius: 255,
      maxParentRowWidth: 1100,
      parentRowSpacing: 112,
      parentClusterGap: 20,
      childColumnSpacing: 108,
      childSiblingGap: 10,
      childBaseDepth: 116,
      childRowSpacing: 94,
      maxColumns: 2,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.14,
      clusterPadding: 14,
    },
    normal: {
      domainRadius: 620,
      spaceRadius: 455,
      parentRadius: 305,
      maxParentRowWidth: 1450,
      parentRowSpacing: 130,
      parentClusterGap: 28,
      childColumnSpacing: 126,
      childSiblingGap: 12,
      childBaseDepth: 140,
      childRowSpacing: 112,
      maxColumns: 3,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.24,
      clusterPadding: 18,
    },
    expanded: {
      domainRadius: 700,
      spaceRadius: 520,
      parentRadius: 340,
      maxParentRowWidth: 2150,
      parentRowSpacing: 152,
      parentClusterGap: 38,
      childColumnSpacing: 148,
      childSiblingGap: 14,
      childBaseDepth: 170,
      childRowSpacing: 136,
      maxColumns: 3,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.34,
      clusterPadding: 22,
    },
  },
  'compact-cluster': {
    compact: {
      domainRadius: 470,
      spaceRadius: 340,
      parentRadius: 220,
      maxParentRowWidth: 980,
      parentRowSpacing: 96,
      parentClusterGap: 16,
      childColumnSpacing: 96,
      childSiblingGap: 8,
      childBaseDepth: 100,
      childRowSpacing: 124,
      maxColumns: 2,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0,
      clusterPadding: 10,
    },
    normal: {
      domainRadius: 520,
      spaceRadius: 380,
      parentRadius: 245,
      maxParentRowWidth: 1250,
      parentRowSpacing: 112,
      parentClusterGap: 22,
      childColumnSpacing: 112,
      childSiblingGap: 10,
      childBaseDepth: 124,
      childRowSpacing: 132,
      maxColumns: 3,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.08,
      clusterPadding: 14,
    },
    expanded: {
      domainRadius: 580,
      spaceRadius: 430,
      parentRadius: 280,
      maxParentRowWidth: 1850,
      parentRowSpacing: 136,
      parentClusterGap: 30,
      childColumnSpacing: 132,
      childSiblingGap: 12,
      childBaseDepth: 150,
      childRowSpacing: 148,
      maxColumns: 4,
      rowStaggerRatio: 0,
      reservationDepthFactor: 0.18,
      clusterPadding: 18,
    },
  },
}

function getRadialLayoutProfile(
  layoutMode: Extract<VisualizerLayoutMode, 'wedge-fan' | 'strict-rings' | 'compact-cluster'>,
  density: RadialDensityBand,
): RadialLayoutProfile {
  return { density, ...RADIAL_LAYOUT_PROFILES[layoutMode][density] }
}

function getRadialDensityBand(visibleHierarchyNodeCount: number, maxParentChildCount: number): RadialDensityBand {
  if (visibleHierarchyNodeCount <= 45 && maxParentChildCount <= 8) return 'compact'
  if (visibleHierarchyNodeCount <= 140 && maxParentChildCount <= 18) return 'normal'
  return 'expanded'
}

function getRadialParentClusterMetrics(
  ctx: GraphBuildContext,
  parentId: string,
  childNodeIds: string[],
  profile: RadialLayoutProfile,
): ParentClusterMetrics {
  const visibleChildCount = Math.max(childNodeIds.length, 1)
  const maxChildWidth = Math.max(
    VISUALIZER_LAYOUT_NODE_MIN_WIDTH,
    ...childNodeIds.map((nodeId) => {
      const node = ctx.nodes.get(nodeId)
      return node ? getVisualizerNodeWidth(node) : VISUALIZER_LAYOUT_NODE_MIN_WIDTH
    }),
  )
  const childColumnSpacing = Math.max(profile.childColumnSpacing, maxChildWidth + profile.childSiblingGap)
  const columns =
    profile.density === 'expanded'
      ? Math.max(1, Math.min(profile.maxColumns, visibleChildCount))
      : Math.max(1, Math.min(profile.maxColumns, Math.ceil(visibleChildCount / 2), visibleChildCount))
  const rows = Math.max(1, Math.ceil(visibleChildCount / columns))
  const rowStagger = childColumnSpacing * profile.rowStaggerRatio
  const centerHalfWidth = Math.max(0, ((columns - 1) * childColumnSpacing) / 2 + Math.abs(rowStagger))
  const childClusterWidth = centerHalfWidth * 2 + maxChildWidth
  const parentNode = ctx.nodes.get(parentId)
  const parentWidth = parentNode ? getVisualizerNodeWidth(parentNode) : VISUALIZER_LAYOUT_NODE_WIDTH
  const baseDepth = Math.max(
    profile.childBaseDepth,
    (parentWidth + maxChildWidth) / 2 + profile.clusterPadding + VISUALIZER_LAYOUT_NODE_COLLISION_PADDING,
  )
  const maxDepth = baseDepth + (rows - 1) * profile.childRowSpacing

  return {
    columns,
    centerHalfWidth,
    reservationWidth:
      Math.max(parentWidth, childClusterWidth) +
      maxDepth * profile.reservationDepthFactor +
      profile.clusterPadding * 2 +
      profile.parentClusterGap,
    childColumnSpacing,
    baseDepth,
    rowSpacing: profile.childRowSpacing,
    maxDepth,
    rowStagger,
  }
}

function getRadialParentSlotWidth(metrics: ParentClusterMetrics, profile: RadialLayoutProfile): number {
  return Math.max(0, metrics.reservationWidth - profile.parentClusterGap)
}

function packRadialParentRows<T extends { metrics: ParentClusterMetrics }>(
  parentSlots: T[],
  profile: RadialLayoutProfile,
): T[][] {
  const rows: T[][] = []
  let currentRow: T[] = []
  let currentWidth = 0
  parentSlots.forEach((slot) => {
    const slotWidth = getRadialParentSlotWidth(slot.metrics, profile)
    const nextWidth = currentRow.length === 0 ? slotWidth : currentWidth + profile.parentClusterGap + slotWidth
    if (currentRow.length > 0 && nextWidth > profile.maxParentRowWidth) {
      rows.push(currentRow)
      currentRow = [slot]
      currentWidth = slotWidth
      return
    }
    currentRow.push(slot)
    currentWidth = nextWidth
  })
  if (currentRow.length > 0) rows.push(currentRow)
  return rows
}

function getRadialParentRowWidth<T extends { metrics: ParentClusterMetrics }>(
  parentSlots: T[],
  profile: RadialLayoutProfile,
): number {
  return (
    parentSlots.reduce((sum, slot) => sum + getRadialParentSlotWidth(slot.metrics, profile), 0) +
    Math.max(parentSlots.length - 1, 0) * profile.parentClusterGap
  )
}

function getParentClusterSlotPosition(
  lane: ParentFlowConstraint,
  childIndex: number,
  childCount: number,
  metrics: ParentClusterMetrics,
): { x: number; y: number } {
  const row = Math.floor(childIndex / metrics.columns)
  const indexInRow = childIndex % metrics.columns
  const remaining = childCount - row * metrics.columns
  const countInRow = Math.max(1, Math.min(metrics.columns, remaining))
  const tangentOffset =
    countInRow <= 1
      ? 0
      : (indexInRow - (countInRow - 1) / 2) * metrics.childColumnSpacing +
        (row % 2 === 1 ? metrics.rowStagger : 0)
  return positionInParentFlow(lane, metrics.baseDepth + row * metrics.rowSpacing, tangentOffset)
}

function assignRadialClusterPositions(
  ctx: GraphBuildContext,
  layoutMode: Extract<VisualizerLayoutMode, 'wedge-fan' | 'strict-rings' | 'compact-cluster'>,
) {
  const domains = getDomainsWithActiveProjection(ctx.state)
  const locationByKey = new Map(ctx.locationEntries.map((entry) => [entry.key, entry]))
  const flowConstraints = new Map<string, ParentFlowConstraint>()
  let maxParentChildCount = 0
  domains.forEach((domain) => {
    domain.spaces.forEach((space) => {
      space.data.tabs.forEach((tab) => {
        maxParentChildCount = Math.max(maxParentChildCount, getVisibleParentChildNodeIds(ctx, domain.id, space.id, tab, locationByKey).length)
      })
    })
  })
  const density = getRadialDensityBand([...ctx.nodes.values()].filter(isHierarchyLayoutNode).length, maxParentChildCount)
  const profile = getRadialLayoutProfile(layoutMode, density)
  const domainCount = Math.max(domains.length, 1)
  domains.forEach((domain, domainIndex) => {
    const domainAngle = -Math.PI / 2 + (domainIndex / domainCount) * Math.PI * 2
    const domainNode = ctx.nodes.get(`domain:${domain.id}`)
    if (domainNode) {
      domainNode.position = positionOnCircle(domainAngle, profile.domainRadius)
    }

    const spaceCount = Math.max(domain.spaces.length, 1)
    const domainSpan =
      layoutMode === 'strict-rings'
        ? Math.min(Math.PI * 1.35 / domainCount, Math.PI / 1.85)
        : Math.min(Math.PI * 1.3 / domainCount, Math.PI / 2)
    domain.spaces.forEach((space, spaceIndex) => {
      const spaceAngle = domainAngle + ((spaceIndex + 0.5) / spaceCount - 0.5) * domainSpan
      const spaceNode = ctx.nodes.get(`space:${domain.id}:${space.id}`)
      if (spaceNode) {
        spaceNode.position = positionOnCircle(spaceAngle, profile.spaceRadius)
      }

      const baseParentPosition = positionOnCircle(spaceAngle, profile.parentRadius)
      const baseFlow = normalizeVector(
        spaceNode
          ? { x: baseParentPosition.x - spaceNode.position.x, y: baseParentPosition.y - spaceNode.position.y }
          : { x: Math.cos(spaceAngle), y: Math.sin(spaceAngle) },
      ) ?? { x: Math.cos(spaceAngle), y: Math.sin(spaceAngle) }
      const baseTangent = { x: -baseFlow.y, y: baseFlow.x }
      const parentSlots = space.data.tabs.map((tab) => {
        const laneNodeIds = getVisibleParentChildNodeIds(ctx, domain.id, space.id, tab, locationByKey)
        return {
          parentId: `parent:${domain.id}:${space.id}:${tab.id}`,
          laneNodeIds,
          metrics: getRadialParentClusterMetrics(ctx, `parent:${domain.id}:${space.id}:${tab.id}`, laneNodeIds, profile),
        }
      })
      packRadialParentRows(parentSlots, profile).forEach((parentRow, rowIndex) => {
        const rowWidth = getRadialParentRowWidth(parentRow, profile)
        const rowBasePosition = {
          x: baseParentPosition.x + baseFlow.x * rowIndex * profile.parentRowSpacing,
          y: baseParentPosition.y + baseFlow.y * rowIndex * profile.parentRowSpacing,
        }
        let nextLeft = -rowWidth / 2

        parentRow.forEach((slot) => {
          const slotWidth = getRadialParentSlotWidth(slot.metrics, profile)
          const centerOffset = nextLeft + slotWidth / 2
          nextLeft += slotWidth + profile.parentClusterGap
          const parentNode = ctx.nodes.get(slot.parentId)
          if (parentNode) {
            parentNode.position = {
              x: rowBasePosition.x + baseTangent.x * centerOffset,
              y: rowBasePosition.y + baseTangent.y * centerOffset,
            }
          }
          const parentFlow = getParentFlowConstraint(
            spaceNode?.position,
            parentNode?.position ?? rowBasePosition,
            spaceAngle,
            slot.metrics.baseDepth,
            slot.metrics.maxDepth + Math.max(slot.metrics.rowSpacing * 4, VISUALIZER_LAYOUT_NODE_HEIGHT * 5),
            slot.metrics.centerHalfWidth,
          )

          slot.laneNodeIds.forEach((nodeId, nodeIndex) => {
            const node = ctx.nodes.get(nodeId)
            if (!node) return
            node.position = getParentClusterSlotPosition(parentFlow, nodeIndex, Math.max(slot.laneNodeIds.length, 1), slot.metrics)
            flowConstraints.set(node.id, parentFlow)
          })
          const childNodes = slot.laneNodeIds
            .map((nodeId) => ctx.nodes.get(nodeId))
            .filter((node): node is VisualizerGraphNode => Boolean(node))
          relaxNodeCollisions(childNodes, flowConstraints)
          pushChildNodesPastBlockers(parentNode ? [parentNode] : [], childNodes, flowConstraints)
          relaxNodeCollisions(childNodes, flowConstraints)
          pushChildNodesPastBlockers(parentNode ? [parentNode] : [], childNodes, flowConstraints)
        })
      })
    })
  })

  const constrainedChildNodes = [...flowConstraints.keys()]
    .map((nodeId) => ctx.nodes.get(nodeId))
    .filter((node): node is VisualizerGraphNode => Boolean(node))
  const parentNodes = [...ctx.nodes.values()].filter((node) => node.kind === 'parent')
  for (let iteration = 0; iteration < 4; iteration += 1) {
    relaxNodeCollisions(constrainedChildNodes, flowConstraints)
    pushChildNodesPastBlockers(parentNodes, constrainedChildNodes, flowConstraints)
  }

  finalizeVisualizerLayout(ctx, flowConstraints, false)
}

function assignWedgeFanPositions(ctx: GraphBuildContext) {
  assignRadialClusterPositions(ctx, 'wedge-fan')
}

function assignStrictRingPositions(ctx: GraphBuildContext) {
  assignRadialClusterPositions(ctx, 'strict-rings')
}

function assignCompactClusterPositions(ctx: GraphBuildContext) {
  assignRadialClusterPositions(ctx, 'compact-cluster')
}

function assignLinkTreePositions(ctx: GraphBuildContext) {
  const domains = getDomainsWithActiveProjection(ctx.state)
  const locationByKey = new Map(ctx.locationEntries.map((entry) => [entry.key, entry]))
  const parentSlots: Array<{
    domainId: string
    spaceId: string
    tab: Tab
    parentId: string
    childNodeIds: string[]
    subtreeWidth: number
    x: number
  }> = []
  domains.forEach((domain) => {
    domain.spaces.forEach((space) => {
      space.data.tabs.forEach((tab) => {
        const childNodeIds = getVisibleParentChildNodeIds(ctx, domain.id, space.id, tab, locationByKey)
        const columns = Math.max(1, Math.ceil(childNodeIds.length / 2))
        parentSlots.push({
          domainId: domain.id,
          spaceId: space.id,
          tab,
          parentId: `parent:${domain.id}:${space.id}:${tab.id}`,
          childNodeIds,
          subtreeWidth: Math.max(
            VISUALIZER_LINK_TREE_PARENT_MIN_WIDTH,
            VISUALIZER_LAYOUT_NODE_WIDTH + (columns - 1) * VISUALIZER_LINK_TREE_CHILD_X_SPACING,
          ),
          x: 0,
        })
      })
    })
  })

  const totalWidth =
    parentSlots.reduce((sum, slot) => sum + slot.subtreeWidth, 0) +
    Math.max(parentSlots.length - 1, 0) * VISUALIZER_LINK_TREE_PARENT_GAP
  let nextLeft = -totalWidth / 2
  parentSlots.forEach((slot) => {
    slot.x = nextLeft + slot.subtreeWidth / 2
    nextLeft += slot.subtreeWidth + VISUALIZER_LINK_TREE_PARENT_GAP
    const parentNode = ctx.nodes.get(slot.parentId)
    if (parentNode) parentNode.position = { x: slot.x, y: VISUALIZER_LINK_TREE_Y_SPACING * 2 }

    const columns = Math.max(1, Math.ceil(slot.childNodeIds.length / 2))
    slot.childNodeIds.forEach((nodeId, nodeIndex) => {
      const node = ctx.nodes.get(nodeId)
      if (!node) return
      const column = Math.floor(nodeIndex / 2)
      const row = nodeIndex % 2
      const offset =
        (column - (columns - 1) / 2) * VISUALIZER_LINK_TREE_CHILD_X_SPACING +
        (row === 0 ? 0 : VISUALIZER_LINK_TREE_CHILD_ROW_STAGGER)
      const aisleOffset = node.kind === 'aisle' ? VISUALIZER_LINK_TREE_CHILD_ROW_SPACING * 0.72 : 0
      node.position = {
        x: slot.x + offset,
        y: VISUALIZER_LINK_TREE_Y_SPACING * 3 + row * VISUALIZER_LINK_TREE_CHILD_ROW_SPACING + aisleOffset,
      }
    })
  })

  domains.forEach((domain) => {
    const domainSlots = parentSlots.filter((slot) => slot.domainId === domain.id)
    const domainNode = ctx.nodes.get(`domain:${domain.id}`)
    if (domainNode) {
      domainNode.position = {
        x: domainSlots.length ? domainSlots.reduce((sum, slot) => sum + slot.x, 0) / domainSlots.length : 0,
        y: 0,
      }
    }

    domain.spaces.forEach((space) => {
      const spaceSlots = parentSlots.filter((slot) => slot.domainId === domain.id && slot.spaceId === space.id)
      const spaceNode = ctx.nodes.get(`space:${domain.id}:${space.id}`)
      if (spaceNode) {
        spaceNode.position = {
          x: spaceSlots.length ? spaceSlots.reduce((sum, slot) => sum + slot.x, 0) / spaceSlots.length : domainNode?.position.x ?? 0,
          y: VISUALIZER_LINK_TREE_Y_SPACING,
        }
      }
    })
  })

  finalizeVisualizerLayout(ctx, new Map(), false)
}

function assignHierarchyPositions(ctx: GraphBuildContext) {
  if (ctx.options.layoutMode === 'strict-rings') {
    assignStrictRingPositions(ctx)
  } else if (ctx.options.layoutMode === 'compact-cluster') {
    assignCompactClusterPositions(ctx)
  } else if (ctx.options.layoutMode === 'link-tree') {
    assignLinkTreePositions(ctx)
  } else {
    assignWedgeFanPositions(ctx)
  }
}

function getConnectedNodeIds(edges: Iterable<VisualizerGraphEdge>, nodeId: string): Set<string> {
  const connected = new Set<string>([nodeId])
  ;[...edges].forEach((edge) => {
    if (edge.source === nodeId) connected.add(edge.target)
    if (edge.target === nodeId) connected.add(edge.source)
  })
  return connected
}

function findAncestors(edges: Iterable<VisualizerGraphEdge>, seedIds: Set<string>): Set<string> {
  const ancestors = new Set<string>(seedIds)
  let changed = true
  while (changed) {
    changed = false
    ;[...edges].forEach((edge) => {
      if (edge.kind !== 'hierarchy' && edge.kind !== 'aisle-slot') return
      if (!ancestors.has(edge.target) || ancestors.has(edge.source)) return
      ancestors.add(edge.source)
      changed = true
    })
  }
  return ancestors
}

function applyFocus(ctx: GraphBuildContext, focusedNodeId: string): { selectedNodeIds: Set<string>; highlightedNodeIds: Set<string> } {
  if (!focusedNodeId || !ctx.nodes.has(focusedNodeId)) return { selectedNodeIds: new Set(), highlightedNodeIds: new Set() }
  const edges = [...ctx.edges.values()]
  const selectedNodeIds = new Set([focusedNodeId])
  const direct = getConnectedNodeIds(edges, focusedNodeId)
  return {
    selectedNodeIds,
    highlightedNodeIds: findAncestors(edges, direct),
  }
}

function getOverflowNotice(nodes: Map<string, VisualizerGraphNode>, filter: VisualizerFilterState): string {
  if (nodes.size <= OVERVIEW_RELATION_LIMIT) return ''
  if (filter.mode === 'overview') return ''
  return `showing ${nodes.size} graph nodes; narrow the filter or focus a relationship for better performance.`
}

export function buildVisualizerGraph(
  state: AppState,
  filter: VisualizerFilterState = DEFAULT_VISUALIZER_FILTER,
  options: Partial<VisualizerGraphOptions> = DEFAULT_VISUALIZER_GRAPH_OPTIONS,
): VisualizerGraph {
  const normalizedFilter = normalizeVisualizerFilter(filter)
  const ctx = createBuildContext(state, normalizeVisualizerGraphOptions(options))
  const tagIndex = buildTagFilterIndex(state)
  collectFrontmatterSummaries(ctx)
  ctx.duplicateGroups = getDuplicateGroups(ctx)

  if (normalizedFilter.mode === 'duplicates') {
    addDuplicateRelationships(ctx, normalizedFilter)
  } else if (normalizedFilter.mode === 'tags') {
    addTagRelationships(ctx, normalizedFilter)
  } else if (normalizedFilter.mode === 'frontmatter') {
    addFrontmatterRelationships(ctx, normalizedFilter)
  } else {
    addOverview(ctx)
  }

  assignHierarchyPositions(ctx)
  const focus = applyFocus(ctx, normalizedFilter.focusedNodeId || normalizedFilter.duplicateGroupId)
  return {
    nodes: [...ctx.nodes.values()],
    edges: [...ctx.edges.values()],
    availableTags: sortTagFilterTags(tagIndex.availableTags, normalizedFilter.tagSortMode),
    duplicateGroups: ctx.duplicateGroups,
    frontmatterTemplates: ctx.state.frontmatter.templates,
    frontmatterFields: [...ctx.fieldSummariesByKey.values()].sort(
      (left, right) => right.count - left.count || left.label.localeCompare(right.label, undefined, { sensitivity: 'base' }),
    ),
    frontmatterFieldTypes: [...ctx.fieldTypeCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type)),
    selectedNodeIds: focus.selectedNodeIds,
    highlightedNodeIds: focus.highlightedNodeIds,
    overflowNotice: getOverflowNotice(ctx.nodes, normalizedFilter),
  }
}
