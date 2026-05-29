import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'
import {
  WIKI_NOTE_REFERENCE_RE,
  buildInternalNoteLinkToken,
  buildPreviewToken,
  resolveWikiReferenceToken,
} from '../notes/note-references'
import { projectActiveDomainState } from '../state/domains'
import type { IdGenerator } from '../state/navigation-ids'
import { createId } from '../state/workspace'
import type {
  AppState,
  DeletedDomainEntry,
  DeletedSpaceEntry,
  DeletedSubTabEntry,
  DeletedTabEntry,
  Domain,
  FrontmatterFieldOriginMap,
  FrontmatterMeta,
  FrontmatterTemplate,
  NoteAisleBody,
  NoteBody,
  NoteHeadingAnchor,
  NoteLocation,
  NoteNavigationTarget,
  ScratchpadState,
  Space,
  SubTab,
  Tab,
  WorkspaceData,
} from '../types/app'
import { repairAppStateEntityIds } from './id-repair'

export type ImportBackupSummary = {
  domains: number
  spaces: number
  tabs: number
  notes: number
  noteBodies: number
  frontmatterTemplates: number
  deletedDomains: number
  deletedSpaces: number
  repairedIds: number
  unresolvedReferences: number
  scratchpad?: ScratchpadState
  warnings: string[]
}

export type ImportBackupMergeResult = {
  state: AppState
  summary: ImportBackupSummary
}

export type ImportBackupMergeOptions = {
  importScratchpadAsTab?: boolean
}

type IdMap = Map<string, string>

type ImportIdMaps = {
  domainIds: IdMap
  spaceIds: IdMap
  tabIds: IdMap
  subTabIds: IdMap
  deletedDomainIds: IdMap
  deletedSpaceIds: IdMap
  deletedTabIds: IdMap
  deletedSubTabIds: IdMap
  noteBodyIds: IdMap
  aisleIds: IdMap
  aisleBodyIds: IdMap
  templateIds: IdMap
  fieldIds: IdMap
}

const MAX_GENERATE_ATTEMPTS = 100
const MAX_WARNING_COUNT = 20

function nonEmptyString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function addId(ids: Set<string>, id: unknown) {
  const value = nonEmptyString(id)
  if (value) ids.add(value)
}

function collectWorkspaceIds(data: WorkspaceData, ids: Set<string>) {
  addId(ids, data.activeTabId)
  data.tabs.forEach((tab) => {
    addId(ids, tab.id)
    addId(ids, tab.noteBodyId)
    addId(ids, tab.activeSubTabId)
    tab.subTabs.forEach((subTab) => {
      addId(ids, subTab.id)
      addId(ids, subTab.noteBodyId)
    })
  })
  data.deletedTabs.forEach((entry) => {
    addId(ids, entry.id)
    addId(ids, entry.tab.id)
    addId(ids, entry.tab.noteBodyId)
    addId(ids, entry.tab.activeSubTabId)
    entry.tab.subTabs.forEach((subTab) => {
      addId(ids, subTab.id)
      addId(ids, subTab.noteBodyId)
    })
  })
  data.deletedSubTabs.forEach((entry) => {
    addId(ids, entry.id)
    addId(ids, entry.parentTabId)
    addId(ids, entry.subTab.id)
    addId(ids, entry.subTab.noteBodyId)
  })
}

function collectSpaceIds(space: Space, ids: Set<string>) {
  addId(ids, space.id)
  collectWorkspaceIds(space.data, ids)
}

function collectDomainIds(domain: Domain, ids: Set<string>) {
  addId(ids, domain.id)
  addId(ids, domain.activeSpaceId)
  domain.spaces.forEach((space) => collectSpaceIds(space, ids))
}

function collectDurableIds(state: AppState): Set<string> {
  const projected = projectActiveDomainState(state)
  const ids = new Set<string>()
  addId(ids, projected.activeDomainId)
  addId(ids, projected.activeSpaceId)
  projected.domains.forEach((domain) => collectDomainIds(domain, ids))
  ;(projected.deletedSpaces ?? []).forEach((entry) => {
    addId(ids, entry.id)
    addId(ids, entry.domainId)
    collectSpaceIds(entry.space, ids)
  })
  ;(projected.deletedDomains ?? []).forEach((entry) => {
    addId(ids, entry.id)
    collectDomainIds(entry.domain, ids)
    entry.deletedSpaces.forEach((spaceEntry) => {
      addId(ids, spaceEntry.id)
      addId(ids, spaceEntry.domainId)
      collectSpaceIds(spaceEntry.space, ids)
    })
  })
  projected.noteBodies.forEach((body) => {
    addId(ids, body.id)
    body.aisles.forEach((aisle) => {
      addId(ids, aisle.id)
      addId(ids, aisle.aisleBodyId)
    })
  })
  ;(projected.noteAisleBodies ?? []).forEach((body) => addId(ids, body.id))
  projected.frontmatter.templates.forEach((template) => {
    addId(ids, template.id)
    template.fields.forEach((field) => addId(ids, field.id))
  })
  projected.ui.toolbarLayouts?.forEach((layout) => {
    addId(ids, layout.id)
    layout.items.forEach((item) => addId(ids, item.id))
  })
  return ids
}

function createImportIdAllocator(current: AppState, generateId: IdGenerator) {
  const reserved = collectDurableIds(current)
  let fallbackCounter = 0

  return () => {
    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
      const id = nonEmptyString(generateId())
      if (id && !reserved.has(id)) {
        reserved.add(id)
        return id
      }
    }

    while (true) {
      fallbackCounter += 1
      const fallback = `imported-${fallbackCounter}`
      if (!reserved.has(fallback)) {
        reserved.add(fallback)
        return fallback
      }
    }
  }
}

function createImportIdMaps(): ImportIdMaps {
  return {
    domainIds: new Map(),
    spaceIds: new Map(),
    tabIds: new Map(),
    subTabIds: new Map(),
    deletedDomainIds: new Map(),
    deletedSpaceIds: new Map(),
    deletedTabIds: new Map(),
    deletedSubTabIds: new Map(),
    noteBodyIds: new Map(),
    aisleIds: new Map(),
    aisleBodyIds: new Map(),
    templateIds: new Map(),
    fieldIds: new Map(),
  }
}

function assignImportedId(map: IdMap, sourceId: string, allocateId: () => string): string {
  const source = nonEmptyString(sourceId)
  if (source && map.has(source)) return map.get(source) ?? ''
  const nextId = allocateId()
  if (source) map.set(source, nextId)
  return nextId
}

function remapId(map: IdMap, sourceId: string): string {
  const source = nonEmptyString(sourceId)
  return source ? map.get(source) ?? '' : ''
}

function remapOptionalId(map: IdMap, sourceId: string | null): string | null {
  if (sourceId === null) return null
  return remapId(map, sourceId) || null
}

function remapFrontmatterFieldOrigins(origins: FrontmatterFieldOriginMap | undefined, maps: ImportIdMaps) {
  if (!origins) return undefined
  const nextOrigins: FrontmatterFieldOriginMap = {}
  Object.entries(origins).forEach(([key, origin]) => {
    const templateId = remapId(maps.templateIds, origin.templateId)
    const fieldId = remapId(maps.fieldIds, origin.fieldId)
    if (templateId && fieldId) nextOrigins[key] = { templateId, fieldId }
  })
  return Object.keys(nextOrigins).length > 0 ? nextOrigins : undefined
}

function remapFrontmatterMeta(meta: FrontmatterMeta | undefined, maps: ImportIdMaps): FrontmatterMeta | undefined {
  if (!meta) return undefined
  const templateFieldOrigins = remapFrontmatterFieldOrigins(meta.templateFieldOrigins, maps)
  const templateRemovedFieldIds = meta.templateRemovedFieldIds
    ?.map((fieldId) => remapId(maps.fieldIds, fieldId))
    .filter(Boolean)
  const templateId = meta.templateId ? remapId(maps.templateIds, meta.templateId) : ''
  const nextMeta: FrontmatterMeta = {
    ...(templateId ? { templateId } : {}),
    ...(typeof meta.templateDerived === 'boolean' ? { templateDerived: meta.templateDerived } : {}),
    ...(templateFieldOrigins ? { templateFieldOrigins } : {}),
    ...(templateRemovedFieldIds && templateRemovedFieldIds.length > 0 ? { templateRemovedFieldIds } : {}),
    ...(meta.computedFields ? { computedFields: { ...meta.computedFields } } : {}),
  }
  return Object.keys(nextMeta).length > 0 ? nextMeta : undefined
}

function remapTemplates(templates: readonly FrontmatterTemplate[], maps: ImportIdMaps, allocateId: () => string) {
  return templates.map((template) => ({
    ...template,
    id: assignImportedId(maps.templateIds, template.id, allocateId),
    fields: template.fields.map((field) => ({
      ...field,
      id: assignImportedId(maps.fieldIds, field.id, allocateId),
    })),
  }))
}

function remapNoteAisleBodies(bodies: readonly NoteAisleBody[], maps: ImportIdMaps, allocateId: () => string) {
  return bodies.map((body) => ({
    ...body,
    id: assignImportedId(maps.aisleBodyIds, body.id, allocateId),
    frontmatterMeta: remapFrontmatterMeta(body.frontmatterMeta, maps),
  }))
}

function remapNoteBodies(bodies: readonly NoteBody[], maps: ImportIdMaps, allocateId: () => string) {
  return bodies.map((body) => ({
    ...body,
    id: assignImportedId(maps.noteBodyIds, body.id, allocateId),
    aisles: body.aisles.map((aisle) => ({
      id: assignImportedId(maps.aisleIds, aisle.id, allocateId),
      aisleBodyId: remapId(maps.aisleBodyIds, aisle.aisleBodyId),
    })),
  }))
}

function remapSubTab(subTab: SubTab, maps: ImportIdMaps, allocateId: () => string): SubTab {
  return {
    ...subTab,
    id: assignImportedId(maps.subTabIds, subTab.id, allocateId),
    noteBodyId: remapId(maps.noteBodyIds, subTab.noteBodyId),
  }
}

function remapTab(tab: Tab, maps: ImportIdMaps, allocateId: () => string): Tab {
  const subTabs = tab.subTabs.map((subTab) => remapSubTab(subTab, maps, allocateId))
  const activeSubTabId = remapOptionalId(maps.subTabIds, tab.activeSubTabId)
  return {
    ...tab,
    id: assignImportedId(maps.tabIds, tab.id, allocateId),
    noteBodyId: remapId(maps.noteBodyIds, tab.noteBodyId),
    activeSubTabId: activeSubTabId && subTabs.some((subTab) => subTab.id === activeSubTabId) ? activeSubTabId : null,
    subTabs,
  }
}

function remapWorkspaceData(data: WorkspaceData, maps: ImportIdMaps, allocateId: () => string): WorkspaceData {
  const tabs = data.tabs.map((tab) => remapTab(tab, maps, allocateId))
  const deletedTabs = data.deletedTabs.map((entry): DeletedTabEntry => ({
    ...entry,
    id: assignImportedId(maps.deletedTabIds, entry.id, allocateId),
    tab: remapTab(entry.tab, maps, allocateId),
  }))
  const deletedSubTabs = data.deletedSubTabs.map((entry): DeletedSubTabEntry => ({
    ...entry,
    id: assignImportedId(maps.deletedSubTabIds, entry.id, allocateId),
    parentTabId: remapId(maps.tabIds, entry.parentTabId) || entry.parentTabId,
    subTab: remapSubTab(entry.subTab, maps, allocateId),
  }))
  const activeTabId = remapId(maps.tabIds, data.activeTabId)
  return {
    activeTabId: activeTabId && tabs.some((tab) => tab.id === activeTabId) ? activeTabId : tabs[0]?.id ?? '',
    tabs,
    deletedTabs,
    deletedSubTabs,
  }
}

function remapSpace(space: Space, maps: ImportIdMaps, allocateId: () => string): Space {
  return {
    ...space,
    id: assignImportedId(maps.spaceIds, space.id, allocateId),
    data: remapWorkspaceData(space.data, maps, allocateId),
  }
}

function remapDomain(domain: Domain, maps: ImportIdMaps, allocateId: () => string): Domain {
  const spaces = domain.spaces.map((space) => remapSpace(space, maps, allocateId))
  const activeSpaceId = remapId(maps.spaceIds, domain.activeSpaceId)
  return {
    ...domain,
    id: assignImportedId(maps.domainIds, domain.id, allocateId),
    activeSpaceId: activeSpaceId && spaces.some((space) => space.id === activeSpaceId) ? activeSpaceId : spaces[0]?.id ?? '',
    spaces,
  }
}

function remapDeletedSpace(entry: DeletedSpaceEntry, maps: ImportIdMaps, allocateId: () => string): DeletedSpaceEntry {
  return {
    ...entry,
    id: assignImportedId(maps.deletedSpaceIds, entry.id, allocateId),
    domainId: remapId(maps.domainIds, entry.domainId) || entry.domainId,
    space: remapSpace(entry.space, maps, allocateId),
  }
}

function remapDeletedDomain(entry: DeletedDomainEntry, maps: ImportIdMaps, allocateId: () => string): DeletedDomainEntry {
  const domain = remapDomain(entry.domain, maps, allocateId)
  return {
    ...entry,
    id: assignImportedId(maps.deletedDomainIds, entry.id, allocateId),
    domain,
    deletedSpaces: entry.deletedSpaces.map((spaceEntry) => remapDeletedSpace(spaceEntry, maps, allocateId)),
  }
}

function addImportedScratchpadTab(importedScratchpad: ScratchpadState | undefined, domains: Domain[], maps: ImportIdMaps, allocateId: () => string) {
  const importedNoteBodyId = importedScratchpad?.noteBodyId ? remapId(maps.noteBodyIds, importedScratchpad.noteBodyId) : ''
  if (!importedNoteBodyId || domains.length === 0) return false
  const targetDomain = domains[0]
  const targetSpace = targetDomain.spaces[0]
  if (!targetSpace) return false
  const scratchpadTab: Tab = {
    id: allocateId(),
    title: 'imported scratchpad',
    noteBodyId: importedNoteBodyId,
    activeSubTabId: null,
    subTabs: [],
  }
  targetSpace.data = {
    ...targetSpace.data,
    activeTabId: targetSpace.data.tabs.length > 0 ? targetSpace.data.activeTabId : scratchpadTab.id,
    tabs: [...targetSpace.data.tabs, scratchpadTab],
  }
  return true
}

function remapScratchpad(importedScratchpad: ScratchpadState | undefined, maps: ImportIdMaps): ScratchpadState | undefined {
  const noteBodyId = importedScratchpad?.noteBodyId ? remapId(maps.noteBodyIds, importedScratchpad.noteBodyId) : ''
  if (!noteBodyId) return undefined
  const activeAisleId = importedScratchpad?.activeAisleId ? remapId(maps.aisleIds, importedScratchpad.activeAisleId) : ''
  return {
    noteBodyId,
    ...(activeAisleId ? { activeAisleId } : {}),
  }
}

function getAisleMarkdownById(state: AppState, aisleId: string): string {
  const noteBody = state.noteBodies.find((body) => body.aisles.some((aisle) => aisle.id === aisleId))
  const aisle = noteBody?.aisles.find((candidate) => candidate.id === aisleId)
  const aisleBody = (state.noteAisleBodies ?? []).find((body) => body.id === aisle?.aisleBodyId)
  return aisleBody?.markdown ?? ''
}

function buildHeadingKeyMaps(imported: AppState, remapped: AppState, maps: ImportIdMaps): Map<string, Map<string, string>> {
  const headingKeyMaps = new Map<string, Map<string, string>>()
  imported.noteBodies.forEach((oldBody) => {
    oldBody.aisles.forEach((oldAisle) => {
      const newAisleId = remapId(maps.aisleIds, oldAisle.id)
      if (!newAisleId) return
      const oldHeadings = getHeadingOutlineFromMarkdown(oldAisle.id, getAisleMarkdownById(imported, oldAisle.id))
      const newHeadings = getHeadingOutlineFromMarkdown(newAisleId, getAisleMarkdownById(remapped, newAisleId))
      const newBySignature = new Map(newHeadings.map((heading) => [`${heading.level}\n${heading.text}\n${heading.occurrence}`, heading]))
      const keyMap = new Map<string, string>()
      oldHeadings.forEach((oldHeading, index) => {
        const newHeading =
          newBySignature.get(`${oldHeading.level}\n${oldHeading.text}\n${oldHeading.occurrence}`) ?? newHeadings[index]
        if (newHeading) keyMap.set(oldHeading.key, newHeading.key)
      })
      headingKeyMaps.set(oldAisle.id, keyMap)
    })
  })
  return headingKeyMaps
}

function translateLocation(location: NoteLocation, maps: ImportIdMaps): NoteLocation | null {
  const domainId = remapId(maps.domainIds, location.domainId)
  const spaceId = remapId(maps.spaceIds, location.spaceId)
  const tabId = remapId(maps.tabIds, location.tabId)
  const subTabId = location.subTabId === null ? null : remapId(maps.subTabIds, location.subTabId)
  if (!domainId || !spaceId || !tabId || (location.subTabId !== null && !subTabId)) return null
  return { domainId, spaceId, tabId, subTabId }
}

function translateHeading(
  heading: NoteHeadingAnchor | undefined,
  maps: ImportIdMaps,
  headingKeyMaps: Map<string, Map<string, string>>,
): NoteHeadingAnchor | undefined {
  if (!heading) return undefined
  const aisleId = remapId(maps.aisleIds, heading.aisleId)
  const headingKey = headingKeyMaps.get(heading.aisleId)?.get(heading.headingKey) ?? ''
  return aisleId && headingKey ? { aisleId, headingKey } : undefined
}

function translateAisleIds(aisleIds: string[] | undefined, maps: ImportIdMaps): string[] | undefined {
  if (!aisleIds || aisleIds.length === 0) return undefined
  const translated = aisleIds.map((aisleId) => remapId(maps.aisleIds, aisleId)).filter(Boolean)
  return translated.length === aisleIds.length ? translated : undefined
}

function rewriteImportedMarkdownReferences(
  markdown: string,
  imported: AppState,
  merged: AppState,
  maps: ImportIdMaps,
  headingKeyMaps: Map<string, Map<string, string>>,
  summary: ImportBackupSummary,
): string {
  return String(markdown ?? '').replace(WIKI_NOTE_REFERENCE_RE, (token) => {
    const resolved = resolveWikiReferenceToken(imported, token)
    if (!resolved) {
      summary.unresolvedReferences += 1
      return token
    }
    const target = translateLocation(resolved.payload.target, maps)
    if (!target) {
      summary.unresolvedReferences += 1
      return token
    }

    const heading = translateHeading(resolved.payload.heading ?? resolved.target.heading, maps, headingKeyMaps)
    if ((resolved.payload.heading || resolved.target.heading) && !heading) {
      summary.unresolvedReferences += 1
      return token
    }
    const aisleIds =
      translateAisleIds(resolved.payload.aisleIds, maps) ??
      (resolved.target.aisleId ? translateAisleIds([resolved.target.aisleId], maps) : undefined)
    if ((resolved.payload.aisleIds?.length || resolved.target.aisleId) && !aisleIds) {
      summary.unresolvedReferences += 1
      return token
    }

    if (resolved.parsed.embed) {
      const nextToken = buildPreviewToken(merged, {
        id: '',
        target,
        ...(aisleIds ? { aisleIds } : {}),
        ...(heading ? { heading } : {}),
        ...(resolved.payload.previewStart ? { previewStart: resolved.payload.previewStart } : {}),
      })
      if (!nextToken) summary.unresolvedReferences += 1
      return nextToken || token
    }

    const nextTarget: NoteNavigationTarget = {
      ...target,
      ...(aisleIds ? { aisleIds } : {}),
      ...(heading ? { heading } : {}),
      ...(resolved.target.startAt ? { startAt: resolved.target.startAt } : {}),
    }
    const nextToken = buildInternalNoteLinkToken(merged, nextTarget, resolved.parsed.alias)
    if (!nextToken) summary.unresolvedReferences += 1
    return nextToken || token
  })
}

function appendWarning(summary: ImportBackupSummary, warning: string) {
  if (summary.warnings.length >= MAX_WARNING_COUNT) return
  summary.warnings.push(warning)
}

export function mergeImportedBackupState(
  current: AppState,
  imported: AppState,
  generateId: IdGenerator = createId,
  options: ImportBackupMergeOptions = {},
): ImportBackupMergeResult {
  const importScratchpadAsTab = options.importScratchpadAsTab ?? true
  const currentProjected = projectActiveDomainState(current)
  const repairedImport = repairAppStateEntityIds(imported, generateId)
  const importState = repairedImport.state
  const allocateId = createImportIdAllocator(currentProjected, generateId)
  const maps = createImportIdMaps()
  const summary: ImportBackupSummary = {
    domains: importState.domains.length,
    spaces: importState.domains.reduce((count, domain) => count + domain.spaces.length, 0),
    tabs: importState.domains.reduce(
      (count, domain) => count + domain.spaces.reduce((spaceCount, space) => spaceCount + space.data.tabs.length, 0),
      0,
    ),
    notes: importState.domains.reduce(
      (count, domain) =>
        count +
        domain.spaces.reduce(
          (spaceCount, space) =>
            spaceCount + space.data.tabs.reduce((tabCount, tab) => tabCount + 1 + tab.subTabs.length, 0),
          0,
        ),
      0,
    ),
    noteBodies: importState.noteBodies.length,
    frontmatterTemplates: importState.frontmatter.templates.length,
    deletedDomains: (importState.deletedDomains ?? []).length,
    deletedSpaces: (importState.deletedSpaces ?? []).length,
    repairedIds: repairedImport.summary.repairedIds,
    unresolvedReferences: 0,
    warnings: [...repairedImport.summary.warnings],
  }

  const importedTemplates = remapTemplates(importState.frontmatter.templates, maps, allocateId)
  const importedAisleBodies = remapNoteAisleBodies(importState.noteAisleBodies ?? [], maps, allocateId)
  const importedNoteBodies = remapNoteBodies(importState.noteBodies, maps, allocateId)
  const importedDomains = importState.domains.map((domain) => remapDomain(domain, maps, allocateId))
  const importedDeletedSpaces = (importState.deletedSpaces ?? []).map((entry) => remapDeletedSpace(entry, maps, allocateId))
  const importedDeletedDomains = (importState.deletedDomains ?? []).map((entry) => remapDeletedDomain(entry, maps, allocateId))
  const remappedScratchpad = remapScratchpad(importState.scratchpad, maps)
  if (remappedScratchpad) summary.scratchpad = remappedScratchpad

  if (importScratchpadAsTab && addImportedScratchpadTab(importState.scratchpad, importedDomains, maps, allocateId)) {
    summary.tabs += 1
    summary.notes += 1
  }

  const mergedBeforeReferenceRewrite = projectActiveDomainState({
    ...currentProjected,
    domains: [...currentProjected.domains, ...importedDomains],
    deletedDomains: [...(currentProjected.deletedDomains ?? []), ...importedDeletedDomains],
    deletedSpaces: [...(currentProjected.deletedSpaces ?? []), ...importedDeletedSpaces],
    noteBodies: [...currentProjected.noteBodies, ...importedNoteBodies],
    noteAisleBodies: [...(currentProjected.noteAisleBodies ?? []), ...importedAisleBodies],
    frontmatter: {
      ...currentProjected.frontmatter,
      templates: [...currentProjected.frontmatter.templates, ...importedTemplates],
    },
  })

  const headingKeyMaps = buildHeadingKeyMaps(importState, mergedBeforeReferenceRewrite, maps)
  const importedAisleBodyIds = new Set(importedAisleBodies.map((body) => body.id))
  const rewrittenAisleBodies = (mergedBeforeReferenceRewrite.noteAisleBodies ?? []).map((body) => {
    if (!importedAisleBodyIds.has(body.id)) return body
    return {
      ...body,
      markdown: rewriteImportedMarkdownReferences(
        body.markdown,
        importState,
        mergedBeforeReferenceRewrite,
        maps,
        headingKeyMaps,
        summary,
      ),
    }
  })
  if (summary.unresolvedReferences > 0) {
    appendWarning(summary, `${summary.unresolvedReferences} imported note reference(s) could not be remapped.`)
  }

  return {
    state: projectActiveDomainState({
      ...mergedBeforeReferenceRewrite,
      noteAisleBodies: rewrittenAisleBodies,
    }),
    summary,
  }
}
