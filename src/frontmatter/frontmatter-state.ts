import { getLocationInfo } from '../notes/note-locations'
import type {
  AppState,
  FrontmatterApplyMode,
  FrontmatterData,
  FrontmatterTemplate,
  NoteBody,
  NoteLocation,
  StageManagerSelectionSnapshot,
} from '../types/app'
import { applyFrontmatterTemplate, parseFrontmatterYaml, stringifyFrontmatterYaml } from './frontmatter'

export function getNoteBodyFrontmatterYaml(noteBody: NoteBody | null | undefined): string {
  return stringifyFrontmatterYaml(noteBody?.frontmatter ?? null)
}

export function updateNoteBodyFrontmatter(
  state: AppState,
  noteBodyId: string,
  frontmatter: FrontmatterData | null,
): AppState {
  let changed = false
  const noteBodies = state.noteBodies.map((body) => {
    if (body.id !== noteBodyId) return body
    changed = true
    return {
      ...body,
      frontmatter,
    }
  })
  return changed ? { ...state, noteBodies } : state
}

export function updateNoteBodyFrontmatterFromYaml(
  state: AppState,
  noteBodyId: string,
  rawYaml: string,
): { ok: true; state: AppState } | { ok: false; message: string } {
  const parsed = parseFrontmatterYaml(rawYaml)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    state: updateNoteBodyFrontmatter(state, noteBodyId, parsed.data),
  }
}

export function buildFrontmatterContext(state: AppState, location: NoteLocation, now = new Date()) {
  const info = getLocationInfo(state, location)
  return {
    now,
    noteTitle: info.title,
    spaceName: info.space?.name ?? '',
    domainName: info.domain?.name ?? '',
  }
}

export function buildTemplateYamlForNote(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate,
  mode: FrontmatterApplyMode,
  currentYaml: string,
  now = new Date(),
): { ok: true; yaml: string } | { ok: false; message: string } {
  const currentParsed = parseFrontmatterYaml(currentYaml)
  if (!currentParsed.ok) return currentParsed
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId)
  const existing = currentParsed.data ?? noteBody?.frontmatter ?? null
  const next = applyFrontmatterTemplate(existing, template, buildFrontmatterContext(state, location, now), mode)
  return { ok: true, yaml: stringifyFrontmatterYaml(next) }
}

export function applyTemplateToNoteBody(
  state: AppState,
  noteBodyId: string,
  location: NoteLocation,
  template: FrontmatterTemplate,
  mode: FrontmatterApplyMode,
  now = new Date(),
): AppState {
  const noteBody = state.noteBodies.find((body) => body.id === noteBodyId)
  if (!noteBody) return state
  const nextFrontmatter = applyFrontmatterTemplate(
    noteBody.frontmatter,
    template,
    buildFrontmatterContext(state, location, now),
    mode,
  )
  return updateNoteBodyFrontmatter(state, noteBodyId, nextFrontmatter)
}

export function buildSelectedStageManagerNoteTargets(
  state: AppState,
  activeSpaceId: string,
  snapshot: StageManagerSelectionSnapshot,
): NoteLocation[] {
  const targets: NoteLocation[] = []
  for (const tab of snapshot.fullParents) {
    targets.push({
      domainId: state.activeDomainId,
      spaceId: activeSpaceId,
      tabId: tab.id,
      subTabId: null,
    })
    for (const subTab of tab.subTabs) {
      targets.push({
        domainId: state.activeDomainId,
        spaceId: activeSpaceId,
        tabId: tab.id,
        subTabId: subTab.id,
      })
    }
  }
  for (const { parentTab, subTab } of snapshot.looseSubTabs) {
    targets.push({
      domainId: state.activeDomainId,
      spaceId: activeSpaceId,
      tabId: parentTab.id,
      subTabId: subTab.id,
    })
  }
  return targets
}

export function applyTemplateToStageManagerSelection(
  state: AppState,
  activeSpaceId: string,
  snapshot: StageManagerSelectionSnapshot,
  template: FrontmatterTemplate,
  mode: FrontmatterApplyMode,
  now = new Date(),
): AppState {
  let nextState = state
  const seenBodyIds = new Set<string>()
  for (const location of buildSelectedStageManagerNoteTargets(state, activeSpaceId, snapshot)) {
    const noteBodyId = getLocationInfo(nextState, location).noteBodyId
    if (!noteBodyId || seenBodyIds.has(noteBodyId)) continue
    seenBodyIds.add(noteBodyId)
    nextState = applyTemplateToNoteBody(nextState, noteBodyId, location, template, mode, now)
  }
  return nextState
}
