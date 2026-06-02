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
  aisleBodyById: Map<string, NoteAisleBody>
  locationEntries: LocationEntry[]
  aisleEntries: AisleEntry[]
  nodes: Map<string, VisualizerGraphNode>
  edges: Map<string, VisualizerGraphEdge>
  duplicateGroups: VisualizerDuplicateGroup[]
  fieldSummariesByKey: Map<string, VisualizerFrontmatterFieldSummary>
  fieldTypeCounts: Map<FrontmatterFieldType, number>
}

const OVERVIEW_RELATION_LIMIT = 450
const OUTER_RADIUS = 620
const SPACE_RADIUS = 450
const PARENT_RADIUS = 290
const NOTE_RADIUS = 165
const CHILD_NODE_SPACING = 210
const AISLE_NODE_OFFSET = 135
const AISLE_NODE_SPACING = 205
const VISUALIZER_LAYOUT_NODE_WIDTH = 150
const VISUALIZER_LAYOUT_NODE_HEIGHT = 58
const VISUALIZER_COLLISION_ITERATIONS = 384
const VISUALIZER_COLLISION_EPSILON = 0.01
const VISUALIZER_SOURCE_TOP_HANDLE: VisualizerEdgeHandleId = 'visualizer-source-top'
const VISUALIZER_SOURCE_BOTTOM_HANDLE: VisualizerEdgeHandleId = 'visualizer-source-bottom'
const VISUALIZER_TARGET_TOP_HANDLE: VisualizerEdgeHandleId = 'visualizer-target-top'
const VISUALIZER_TARGET_BOTTOM_HANDLE: VisualizerEdgeHandleId = 'visualizer-target-bottom'

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
  const parentId = `parent:${entry.domainId}:${entry.spaceId}:${entry.parentId}`
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
  addEdge(ctx, domainId, spaceId, 'hierarchy')
  addEdge(ctx, spaceId, parentId, 'hierarchy')

  if (entry.isSubtab && !includeSubtab) return

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
  const locationNodeId = getVisualizerLocationNodeId(aisleEntry.locationEntry.location)
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

function createBuildContext(state: AppState): GraphBuildContext {
  const bodyById = new Map(state.noteBodies.map((body) => [body.id, body]))
  const aisleBodyById = new Map((state.noteAisleBodies ?? []).map((body) => [body.id, body]))
  const locationEntries = collectLocationEntries(state, bodyById)
  const aisleEntries = collectAisleEntries(locationEntries, aisleBodyById)
  return {
    state,
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
  ctx.locationEntries.filter((entry) => !entry.isSubtab).forEach((entry) => addHierarchyContext(ctx, entry, false))
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
      nodeIds: entries.map((entry) => getVisualizerLocationNodeId(entry.location)),
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
          addEdge(ctx, group.id, getVisualizerLocationNodeId(entry.location), 'duplicate-note', 'duplicate note', group.count)
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

function getRadialBasis(angle: number): { radial: { x: number; y: number }; tangent: { x: number; y: number } } {
  const radial = { x: Math.cos(angle), y: Math.sin(angle) }
  return {
    radial,
    tangent: { x: -radial.y, y: radial.x },
  }
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

function relaxNodeCollisions(nodes: VisualizerGraphNode[]) {
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
        const overlapX = VISUALIZER_LAYOUT_NODE_WIDTH - Math.abs(deltaX)
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

        if (separateOnX) {
          left.position = { ...left.position, x: left.position.x - direction * leftShift }
          right.position = { ...right.position, x: right.position.x + direction * rightShift }
        } else {
          left.position = { ...left.position, y: left.position.y - direction * leftShift }
          right.position = { ...right.position, y: right.position.y + direction * rightShift }
        }
        moved = true
      }
    }
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

function assignHierarchyPositions(ctx: GraphBuildContext) {
  const domains = getDomainsWithActiveProjection(ctx.state)
  const locationByKey = new Map(ctx.locationEntries.map((entry) => [entry.key, entry]))
  const domainCount = Math.max(domains.length, 1)
  domains.forEach((domain, domainIndex) => {
    const domainAngle = -Math.PI / 2 + (domainIndex / domainCount) * Math.PI * 2
    const domainNode = ctx.nodes.get(`domain:${domain.id}`)
    if (domainNode) {
      domainNode.position = positionOnCircle(domainAngle, OUTER_RADIUS)
    }

    const spaceCount = Math.max(domain.spaces.length, 1)
    const domainSpan = Math.min(Math.PI * 1.3 / domainCount, Math.PI / 2)
    domain.spaces.forEach((space, spaceIndex) => {
      const spaceAngle = domainAngle + ((spaceIndex + 0.5) / spaceCount - 0.5) * domainSpan
      const spaceNode = ctx.nodes.get(`space:${domain.id}:${space.id}`)
      if (spaceNode) {
        spaceNode.position = positionOnCircle(spaceAngle, SPACE_RADIUS)
      }

      const parentCount = Math.max(space.data.tabs.length, 1)
      const spaceSpan = Math.min(domainSpan / Math.max(spaceCount, 1), Math.PI / 3)
      space.data.tabs.forEach((tab, tabIndex) => {
        const parentAngle = spaceAngle + ((tabIndex + 0.5) / parentCount - 0.5) * spaceSpan
        const parentNode = ctx.nodes.get(`parent:${domain.id}:${space.id}:${tab.id}`)
        if (parentNode) {
          parentNode.position = positionOnCircle(parentAngle, PARENT_RADIUS)
        }

        const childLocations = [
          { domainId: domain.id, spaceId: space.id, tabId: tab.id, subTabId: null },
          ...tab.subTabs.map((subTab) => ({ domainId: domain.id, spaceId: space.id, tabId: tab.id, subTabId: subTab.id })),
        ]
        const visibleChildren = childLocations.filter((location) => ctx.nodes.has(getVisualizerLocationNodeId(location)))
        const childCount = Math.max(visibleChildren.length, 1)
        const childBasePosition = positionOnCircle(parentAngle, NOTE_RADIUS)
        const { radial, tangent } = getRadialBasis(parentAngle)
        visibleChildren.forEach((location, childIndex) => {
          const childOffset = (childIndex - (childCount - 1) / 2) * CHILD_NODE_SPACING
          const childNodeId = getVisualizerLocationNodeId(location)
          const childNode = ctx.nodes.get(childNodeId)
          if (childNode) {
            childNode.position = {
              x: childBasePosition.x + tangent.x * childOffset,
              y: childBasePosition.y + tangent.y * childOffset,
            }
          }
          const locationEntry = locationByKey.get(buildNoteLocationKey(location))
          const aisles = locationEntry?.body?.aisles ?? []
          const visibleAisles = aisles.filter((aisle) => ctx.nodes.has(getVisualizerAisleNodeId(location, aisle.id)))
          const aisleCount = Math.max(visibleAisles.length, 1)
          visibleAisles.forEach((aisle, aisleIndex) => {
            const aisleOffset = (aisleIndex - (aisleCount - 1) / 2) * AISLE_NODE_SPACING
            const aisleNode = ctx.nodes.get(getVisualizerAisleNodeId(location, aisle.id))
            if (aisleNode) {
              const sourcePosition = childNode?.position ?? childBasePosition
              aisleNode.position = {
                x: sourcePosition.x - radial.x * AISLE_NODE_OFFSET + tangent.x * aisleOffset,
                y: sourcePosition.y - radial.y * AISLE_NODE_OFFSET + tangent.y * aisleOffset,
              }
            }
          })
        })
      })
    })
  })

  relaxNodeCollisions([...ctx.nodes.values()].filter(isHierarchyLayoutNode))

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

  relaxNodeCollisions([...ctx.nodes.values()])
  assignEdgeHandles(ctx)
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

export function buildVisualizerGraph(state: AppState, filter: VisualizerFilterState = DEFAULT_VISUALIZER_FILTER): VisualizerGraph {
  const normalizedFilter = normalizeVisualizerFilter(filter)
  const ctx = createBuildContext(state)
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
