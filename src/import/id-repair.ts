import type { IdGenerator } from '../state/navigation-ids'
import { projectActiveDomainState } from '../state/domains'
import { createId } from '../state/workspace'
import type {
  AppState,
  DeletedDomainEntry,
  DeletedSpaceEntry,
  DeletedSubTabEntry,
  DeletedTabEntry,
  Domain,
  FrontmatterComputedFieldMap,
  FrontmatterFieldOriginMap,
  FrontmatterMeta,
  FrontmatterSettings,
  FrontmatterTemplate,
  HeadingCollapseState,
  NoteAisle,
  NoteAisleBody,
  NoteBody,
  NoteCursorLocation,
  ScratchpadState,
  Space,
  SubTab,
  Tab,
  ToolbarLayout,
  ToolbarLayoutItem,
  WorkspaceData,
} from '../types/app'

export type IdRepairSummary = {
  repairedIds: number
  warnings: string[]
}

export type AppStateIdRepairResult = {
  state: AppState
  summary: IdRepairSummary
}

type IdMap = Map<string, string>

const MAX_WARNING_COUNT = 20
const MAX_GENERATE_ATTEMPTS = 100

function cloneIdMap(source: IdMap): IdMap {
  return new Map(source)
}

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function mapId(map: IdMap, value: unknown): string {
  const id = nonEmptyString(value)
  return id ? map.get(id) ?? id : ''
}

function mapOptionalId(map: IdMap, value: unknown): string | null {
  const id = nonEmptyString(value)
  return id ? map.get(id) ?? id : null
}

function appendWarning(summary: IdRepairSummary, warning: string) {
  if (summary.warnings.length >= MAX_WARNING_COUNT) return
  summary.warnings.push(warning)
}

function createIdClaimer(generateId: IdGenerator, summary: IdRepairSummary) {
  const usedIds = new Set<string>()
  let fallbackCounter = 0

  const generateUniqueId = () => {
    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
      const id = nonEmptyString(generateId())
      if (id && !usedIds.has(id)) return id
    }

    while (true) {
      fallbackCounter += 1
      const fallback = `repaired-${fallbackCounter}`
      if (!usedIds.has(fallback)) return fallback
    }
  }

  return (requestedId: unknown, label: string): string => {
    const requested = nonEmptyString(requestedId)
    if (requested && !usedIds.has(requested)) {
      usedIds.add(requested)
      return requested
    }

    const repaired = generateUniqueId()
    usedIds.add(repaired)
    summary.repairedIds += 1
    appendWarning(
      summary,
      requested
        ? `${label} used duplicate id "${requested}" and was reassigned.`
        : `${label} was missing an id and was assigned one.`,
    )
    return repaired
  }
}

function claimMappedId(
  claimId: (requestedId: unknown, label: string) => string,
  map: IdMap,
  requestedId: unknown,
  label: string,
): string {
  const requested = nonEmptyString(requestedId)
  const repaired = claimId(requested, label)
  if (requested && !map.has(requested)) {
    map.set(requested, repaired)
  }
  return repaired
}

function mapFrontmatterFieldOrigins(origins: FrontmatterFieldOriginMap | undefined, templateIdMap: IdMap, fieldIdMap: IdMap) {
  if (!origins) return undefined
  const nextOrigins: FrontmatterFieldOriginMap = {}
  Object.entries(origins).forEach(([key, origin]) => {
    const templateId = mapId(templateIdMap, origin.templateId)
    const fieldId = mapId(fieldIdMap, origin.fieldId)
    if (!templateId || !fieldId) return
    nextOrigins[key] = { templateId, fieldId }
  })
  return Object.keys(nextOrigins).length > 0 ? nextOrigins : undefined
}

function mapComputedFields(computedFields: FrontmatterComputedFieldMap | undefined) {
  return computedFields ? { ...computedFields } : undefined
}

function mapFrontmatterMeta(meta: FrontmatterMeta | undefined, templateIdMap: IdMap, fieldIdMap: IdMap): FrontmatterMeta | undefined {
  if (!meta) return undefined
  const templateFieldOrigins = mapFrontmatterFieldOrigins(meta.templateFieldOrigins, templateIdMap, fieldIdMap)
  const templateRemovedFieldIds = meta.templateRemovedFieldIds
    ?.map((fieldId) => mapId(fieldIdMap, fieldId))
    .filter(Boolean)
  const nextMeta: FrontmatterMeta = {
    ...(meta.templateId ? { templateId: mapId(templateIdMap, meta.templateId) } : {}),
    ...(typeof meta.templateDerived === 'boolean' ? { templateDerived: meta.templateDerived } : {}),
    ...(templateFieldOrigins ? { templateFieldOrigins } : {}),
    ...(templateRemovedFieldIds && templateRemovedFieldIds.length > 0 ? { templateRemovedFieldIds } : {}),
    ...(meta.computedFields ? { computedFields: mapComputedFields(meta.computedFields) } : {}),
  }
  if (nextMeta.templateId === '') delete nextMeta.templateId
  return Object.keys(nextMeta).length > 0 ? nextMeta : undefined
}

function repairFrontmatterSettings(
  frontmatter: FrontmatterSettings,
  claimId: (requestedId: unknown, label: string) => string,
): { frontmatter: FrontmatterSettings; templateIdMap: IdMap; fieldIdMap: IdMap } {
  const templateIdMap: IdMap = new Map()
  const fieldIdMap: IdMap = new Map()
  const templates = frontmatter.templates.map((template): FrontmatterTemplate => {
    const templateId = claimMappedId(claimId, templateIdMap, template.id, `frontmatter template "${template.name}"`)
    const fields = template.fields.map((field) => ({
      ...field,
      id: claimMappedId(claimId, fieldIdMap, field.id, `frontmatter field "${field.key}"`),
    }))
    return { ...template, id: templateId, fields }
  })
  const templateIds = new Set(templates.map((template) => template.id))
  const settingsTemplateId = mapId(templateIdMap, frontmatter.settingsTemplateId)
  const lastAppliedTemplateId = mapId(templateIdMap, frontmatter.lastAppliedTemplateId)
  return {
    frontmatter: {
      templates,
      settingsTemplateId: templateIds.has(settingsTemplateId) ? settingsTemplateId : '',
      lastAppliedTemplateId: templateIds.has(lastAppliedTemplateId) ? lastAppliedTemplateId : '',
    },
    templateIdMap,
    fieldIdMap,
  }
}

function repairNoteAisleBodies(
  bodies: readonly NoteAisleBody[],
  claimId: (requestedId: unknown, label: string) => string,
  templateIdMap: IdMap,
  fieldIdMap: IdMap,
): { bodies: NoteAisleBody[]; aisleBodyIdMap: IdMap } {
  const aisleBodyIdMap: IdMap = new Map()
  return {
    bodies: bodies.map((body, index) => ({
      ...body,
      id: claimMappedId(claimId, aisleBodyIdMap, body.id, `aisle body ${index + 1}`),
      frontmatterMeta: mapFrontmatterMeta(body.frontmatterMeta, templateIdMap, fieldIdMap),
    })),
    aisleBodyIdMap,
  }
}

function repairNoteBodies(
  bodies: readonly NoteBody[],
  claimId: (requestedId: unknown, label: string) => string,
  aisleBodyIdMap: IdMap,
): { bodies: NoteBody[]; noteBodyIdMap: IdMap; aisleIdMap: IdMap } {
  const noteBodyIdMap: IdMap = new Map()
  const aisleIdMap: IdMap = new Map()
  return {
    bodies: bodies.map((body, bodyIndex) => ({
      ...body,
      id: claimMappedId(claimId, noteBodyIdMap, body.id, `note body ${bodyIndex + 1}`),
      aisles: body.aisles.map((aisle, aisleIndex): NoteAisle => ({
        id: claimMappedId(claimId, aisleIdMap, aisle.id, `note body ${bodyIndex + 1} aisle ${aisleIndex + 1}`),
        aisleBodyId: mapId(aisleBodyIdMap, aisle.aisleBodyId) || nonEmptyString(aisle.aisleBodyId),
      })),
    })),
    noteBodyIdMap,
    aisleIdMap,
  }
}

function repairSubTab(
  subTab: SubTab,
  claimId: (requestedId: unknown, label: string) => string,
  subTabIdMap: IdMap,
  noteBodyIdMap: IdMap,
  label: string,
): SubTab {
  return {
    ...subTab,
    id: claimMappedId(claimId, subTabIdMap, subTab.id, label),
    noteBodyId: mapId(noteBodyIdMap, subTab.noteBodyId) || nonEmptyString(subTab.noteBodyId),
  }
}

function repairTab(
  tab: Tab,
  claimId: (requestedId: unknown, label: string) => string,
  tabIdMap: IdMap,
  subTabIdMap: IdMap,
  noteBodyIdMap: IdMap,
  label: string,
): Tab {
  const id = claimMappedId(claimId, tabIdMap, tab.id, label)
  const subTabs = tab.subTabs.map((subTab, index) =>
    repairSubTab(subTab, claimId, subTabIdMap, noteBodyIdMap, `${label} sub-tab ${index + 1}`),
  )
  const activeSubTabId = mapOptionalId(subTabIdMap, tab.activeSubTabId)
  return {
    ...tab,
    id,
    noteBodyId: mapId(noteBodyIdMap, tab.noteBodyId) || nonEmptyString(tab.noteBodyId),
    activeSubTabId: activeSubTabId && subTabs.some((subTab) => subTab.id === activeSubTabId) ? activeSubTabId : null,
    subTabs,
  }
}

function repairWorkspaceData(
  data: WorkspaceData,
  claimId: (requestedId: unknown, label: string) => string,
  noteBodyIdMap: IdMap,
  inheritedTabIdMap: IdMap,
  label: string,
): { data: WorkspaceData; tabIdMap: IdMap; subTabIdMap: IdMap; deletedTabIdMap: IdMap; deletedSubTabIdMap: IdMap } {
  const tabIdMap = cloneIdMap(inheritedTabIdMap)
  const subTabIdMap: IdMap = new Map()
  const deletedTabIdMap: IdMap = new Map()
  const deletedSubTabIdMap: IdMap = new Map()
  const tabs = data.tabs.map((tab, index) =>
    repairTab(tab, claimId, tabIdMap, subTabIdMap, noteBodyIdMap, `${label} tab ${index + 1}`),
  )
  const deletedTabs = data.deletedTabs.map((entry, index): DeletedTabEntry => ({
    ...entry,
    id: claimMappedId(claimId, deletedTabIdMap, entry.id, `${label} deleted tab ${index + 1}`),
    tab: repairTab(entry.tab, claimId, tabIdMap, subTabIdMap, noteBodyIdMap, `${label} deleted tab ${index + 1} note`),
  }))
  const deletedSubTabs = data.deletedSubTabs.map((entry, index): DeletedSubTabEntry => ({
    ...entry,
    id: claimMappedId(claimId, deletedSubTabIdMap, entry.id, `${label} deleted sub-tab ${index + 1}`),
    parentTabId: mapId(tabIdMap, entry.parentTabId) || nonEmptyString(entry.parentTabId),
    subTab: repairSubTab(
      entry.subTab,
      claimId,
      subTabIdMap,
      noteBodyIdMap,
      `${label} deleted sub-tab ${index + 1} note`,
    ),
  }))
  const activeTabId = mapId(tabIdMap, data.activeTabId)
  return {
    data: {
      activeTabId: activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0]?.id ?? '',
      tabs,
      deletedTabs,
      deletedSubTabs,
    },
    tabIdMap,
    subTabIdMap,
    deletedTabIdMap,
    deletedSubTabIdMap,
  }
}

function repairSpace(
  space: Space,
  claimId: (requestedId: unknown, label: string) => string,
  spaceIdMap: IdMap,
  noteBodyIdMap: IdMap,
  tabIdMap: IdMap,
  label: string,
): { space: Space; tabIdMap: IdMap } {
  const id = claimMappedId(claimId, spaceIdMap, space.id, label)
  const repairedWorkspace = repairWorkspaceData(space.data, claimId, noteBodyIdMap, tabIdMap, label)
  return {
    space: {
      ...space,
      id,
      data: repairedWorkspace.data,
    },
    tabIdMap: repairedWorkspace.tabIdMap,
  }
}

function repairDomain(
  domain: Domain,
  claimId: (requestedId: unknown, label: string) => string,
  domainIdMap: IdMap,
  spaceIdMap: IdMap,
  noteBodyIdMap: IdMap,
  label: string,
): { domain: Domain; tabIdMap: IdMap } {
  const id = claimMappedId(claimId, domainIdMap, domain.id, label)
  let tabIdMap: IdMap = new Map()
  const spaces = domain.spaces.map((space, index) => {
    const repaired = repairSpace(space, claimId, spaceIdMap, noteBodyIdMap, tabIdMap, `${label} space ${index + 1}`)
    tabIdMap = repaired.tabIdMap
    return repaired.space
  })
  const activeSpaceId = mapId(spaceIdMap, domain.activeSpaceId)
  return {
    domain: {
      ...domain,
      id,
      activeSpaceId: activeSpaceId && spaces.some((space) => space.id === activeSpaceId) ? activeSpaceId : spaces[0]?.id ?? '',
      spaces,
    },
    tabIdMap,
  }
}

function repairDeletedSpace(
  entry: DeletedSpaceEntry,
  claimId: (requestedId: unknown, label: string) => string,
  deletedSpaceIdMap: IdMap,
  domainIdMap: IdMap,
  spaceIdMap: IdMap,
  noteBodyIdMap: IdMap,
  tabIdMap: IdMap,
  label: string,
): DeletedSpaceEntry {
  const repairedSpace = repairSpace(entry.space, claimId, spaceIdMap, noteBodyIdMap, tabIdMap, `${label} space`)
  return {
    ...entry,
    id: claimMappedId(claimId, deletedSpaceIdMap, entry.id, label),
    domainId: mapId(domainIdMap, entry.domainId) || nonEmptyString(entry.domainId),
    space: repairedSpace.space,
  }
}

function repairDeletedDomain(
  entry: DeletedDomainEntry,
  claimId: (requestedId: unknown, label: string) => string,
  deletedDomainIdMap: IdMap,
  deletedSpaceIdMap: IdMap,
  domainIdMap: IdMap,
  spaceIdMap: IdMap,
  noteBodyIdMap: IdMap,
  label: string,
): DeletedDomainEntry {
  const repairedDomain = repairDomain(entry.domain, claimId, domainIdMap, spaceIdMap, noteBodyIdMap, `${label} domain`)
  const deletedSpaces = entry.deletedSpaces.map((deletedSpace, index) =>
    repairDeletedSpace(
      deletedSpace,
      claimId,
      deletedSpaceIdMap,
      domainIdMap,
      spaceIdMap,
      noteBodyIdMap,
      repairedDomain.tabIdMap,
      `${label} deleted space ${index + 1}`,
    ),
  )
  return {
    ...entry,
    id: claimMappedId(claimId, deletedDomainIdMap, entry.id, label),
    domain: repairedDomain.domain,
    deletedSpaces,
  }
}

function repairScratchpad(
  scratchpad: ScratchpadState | undefined,
  noteBodyIdMap: IdMap,
  aisleIdMap: IdMap,
): ScratchpadState | undefined {
  if (!scratchpad) return scratchpad
  const noteBodyId = mapId(noteBodyIdMap, scratchpad.noteBodyId) || nonEmptyString(scratchpad.noteBodyId)
  if (!noteBodyId) return scratchpad
  const activeAisleId = mapOptionalId(aisleIdMap, scratchpad.activeAisleId)
  return {
    noteBodyId,
    ...(activeAisleId ? { activeAisleId } : {}),
  }
}

function repairNoteCursorLocations(
  locations: Record<string, NoteCursorLocation>,
  noteBodyIdMap: IdMap,
  aisleIdMap: IdMap,
): Record<string, NoteCursorLocation> {
  const nextLocations: Record<string, NoteCursorLocation> = {}
  Object.entries(locations).forEach(([bodyId, location]) => {
    const nextBodyId = mapId(noteBodyIdMap, bodyId)
    const activeAisleId = mapId(aisleIdMap, location.activeAisleId)
    if (!nextBodyId || !activeAisleId) return
    const aisles: NoteCursorLocation['aisles'] = {}
    Object.entries(location.aisles ?? {}).forEach(([aisleId, selection]) => {
      const nextAisleId = mapId(aisleIdMap, aisleId)
      if (nextAisleId) aisles[nextAisleId] = selection
    })
    nextLocations[nextBodyId] = {
      ...location,
      activeAisleId,
      aisles,
    }
  })
  return nextLocations
}

function repairHeadingCollapseState(state: HeadingCollapseState, noteBodyIdMap: IdMap, aisleIdMap: IdMap): HeadingCollapseState {
  const nextState: HeadingCollapseState = {}
  Object.entries(state ?? {}).forEach(([bodyId, entries]) => {
    const nextBodyId = mapId(noteBodyIdMap, bodyId)
    if (!nextBodyId) return
    nextState[nextBodyId] = {}
    Object.entries(entries ?? {}).forEach(([aisleId, headingKeys]) => {
      const nextAisleId = mapId(aisleIdMap, aisleId)
      if (nextAisleId) nextState[nextBodyId][nextAisleId] = headingKeys
    })
  })
  return nextState
}

function repairToolbarLayouts(
  layouts: ToolbarLayout[] | undefined,
  claimId: (requestedId: unknown, label: string) => string,
): ToolbarLayout[] | undefined {
  if (!layouts) return layouts
  const layoutIdMap: IdMap = new Map()
  const itemIdMap: IdMap = new Map()
  return layouts.map((layout, layoutIndex): ToolbarLayout => ({
    ...layout,
    id: claimMappedId(claimId, layoutIdMap, layout.id, `toolbar layout ${layoutIndex + 1}`),
    items: layout.items.map((item, itemIndex): ToolbarLayoutItem => ({
      ...item,
      id: claimMappedId(claimId, itemIdMap, item.id, `toolbar layout ${layoutIndex + 1} item ${itemIndex + 1}`),
    })),
  }))
}

export function repairAppStateEntityIds(
  state: AppState,
  generateId: IdGenerator = createId,
): AppStateIdRepairResult {
  const summary: IdRepairSummary = { repairedIds: 0, warnings: [] }
  const claimId = createIdClaimer(generateId, summary)
  const projected = projectActiveDomainState(state)
  const repairedFrontmatter = repairFrontmatterSettings(projected.frontmatter, claimId)
  const repairedAisleBodies = repairNoteAisleBodies(
    projected.noteAisleBodies ?? [],
    claimId,
    repairedFrontmatter.templateIdMap,
    repairedFrontmatter.fieldIdMap,
  )
  const repairedNoteBodies = repairNoteBodies(projected.noteBodies, claimId, repairedAisleBodies.aisleBodyIdMap)
  const domainIdMap: IdMap = new Map()
  const spaceIdMap: IdMap = new Map()
  let tabIdMap: IdMap = new Map()
  const domains = projected.domains.map((domain, index) => {
    const repaired = repairDomain(
      domain,
      claimId,
      domainIdMap,
      spaceIdMap,
      repairedNoteBodies.noteBodyIdMap,
      `domain ${index + 1}`,
    )
    tabIdMap = repaired.tabIdMap
    return repaired.domain
  })
  const deletedSpaceIdMap: IdMap = new Map()
  const deletedDomainIdMap: IdMap = new Map()
  const deletedSpaces = (projected.deletedSpaces ?? []).map((entry, index) =>
    repairDeletedSpace(
      entry,
      claimId,
      deletedSpaceIdMap,
      domainIdMap,
      spaceIdMap,
      repairedNoteBodies.noteBodyIdMap,
      tabIdMap,
      `deleted space ${index + 1}`,
    ),
  )
  const deletedDomains = (projected.deletedDomains ?? []).map((entry, index) =>
    repairDeletedDomain(
      entry,
      claimId,
      deletedDomainIdMap,
      deletedSpaceIdMap,
      domainIdMap,
      spaceIdMap,
      repairedNoteBodies.noteBodyIdMap,
      `deleted domain ${index + 1}`,
    ),
  )
  const activeDomainId = mapId(domainIdMap, projected.activeDomainId)
  const activeDomain =
    (activeDomainId ? domains.find((domain) => domain.id === activeDomainId) : null) ?? domains[0]
  const activeSpaceId = activeDomain
    ? activeDomain.spaces.some((space) => space.id === mapId(spaceIdMap, projected.activeSpaceId))
      ? mapId(spaceIdMap, projected.activeSpaceId)
      : activeDomain.activeSpaceId
    : ''
  const activeSpaces = activeDomain?.spaces ?? []
  const repairedState = projectActiveDomainState({
    ...projected,
    activeDomainId: activeDomain?.id ?? '',
    domains,
    deletedDomains,
    deletedSpaces,
    scratchpad: repairScratchpad(projected.scratchpad, repairedNoteBodies.noteBodyIdMap, repairedNoteBodies.aisleIdMap),
    noteBodies: repairedNoteBodies.bodies,
    noteAisleBodies: repairedAisleBodies.bodies,
    activeSpaceId,
    spaces: activeSpaces,
    frontmatter: repairedFrontmatter.frontmatter,
    ui: {
      ...projected.ui,
      noteCursorLocations: repairNoteCursorLocations(
        projected.ui.noteCursorLocations,
        repairedNoteBodies.noteBodyIdMap,
        repairedNoteBodies.aisleIdMap,
      ),
      headingCollapseState: repairHeadingCollapseState(
        projected.ui.headingCollapseState,
        repairedNoteBodies.noteBodyIdMap,
        repairedNoteBodies.aisleIdMap,
      ),
      toolbarLayouts: repairToolbarLayouts(projected.ui.toolbarLayouts, claimId),
    },
  })

  return {
    state: repairedState,
    summary,
  }
}
