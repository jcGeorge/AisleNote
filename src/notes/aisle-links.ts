import { getAisleBodyId, getAisleMarkdown } from './aisle-body-state'
import { buildNoteLocationKey, listSearchableNoteLocations } from './note-locations'
import { createId, createTimestamp } from '../state/workspace'
import type { AppState, FrontmatterMeta, NoteAisleBody, ResolvedNoteAisle } from '../types/app'
export { getLinkedAisleIdsForNoteBody } from './link-status'

const linkedAisleCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

export type LinkedAisleSlot = {
  key: string
  noteBodyId: string
  aisleId: string
  aisleBodyId: string
  locationKey: string
  domainName: string
  spaceName: string
  parentName: string
  noteName: string
  label: string
  aisleIndex: number
  aisleCount: number
  aisleLabel: string | null
}

export type DecoupleAisleSlotsResult =
  | { status: 'applied'; state: AppState; changedCount: number }
  | { status: 'blocked'; state: AppState; message: string }

export function buildAisleSlotKey(noteBodyId: string, aisleId: string): string {
  return `${noteBodyId}::${aisleId}`
}

function cloneFrontmatterMeta(meta: FrontmatterMeta | undefined): FrontmatterMeta | undefined {
  if (!meta) return undefined
  return {
    ...meta,
    templateFieldOrigins: meta.templateFieldOrigins
      ? Object.fromEntries(Object.entries(meta.templateFieldOrigins).map(([key, origin]) => [key, { ...origin }]))
      : undefined,
    templateRemovedFieldIds: meta.templateRemovedFieldIds ? [...meta.templateRemovedFieldIds] : undefined,
    computedFields: meta.computedFields ? { ...meta.computedFields } : undefined,
  }
}

function cloneAisleBodyForDecouple(source: NoteAisleBody | undefined, id: string, keepData: boolean): NoteAisleBody {
  const timestamp = createTimestamp()
  if (!keepData || !source) {
    return {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      markdown: '',
      tags: [],
      frontmatter: null,
      frontmatterStatus: 'none',
    }
  }
  return {
    ...source,
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: source.tags ? [...source.tags] : undefined,
    frontmatter: source.frontmatter && typeof source.frontmatter === 'object'
      ? { ...source.frontmatter }
      : source.frontmatter ?? null,
    frontmatterMeta: cloneFrontmatterMeta(source.frontmatterMeta),
  }
}

function compareLinkedAisleSlots(left: LinkedAisleSlot, right: LinkedAisleSlot) {
  return (
    linkedAisleCollator.compare(left.domainName, right.domainName) ||
    linkedAisleCollator.compare(left.spaceName, right.spaceName) ||
    linkedAisleCollator.compare(left.parentName, right.parentName) ||
    linkedAisleCollator.compare(left.noteName, right.noteName) ||
    left.aisleIndex - right.aisleIndex ||
    linkedAisleCollator.compare(left.key, right.key)
  )
}

export function listLinkedAisleSlotsForAisleBody(state: AppState, aisleBodyId: string): LinkedAisleSlot[] {
  if (!aisleBodyId) return []
  const slots = new Map<string, LinkedAisleSlot>()
  for (const location of listSearchableNoteLocations(state)) {
    const body = state.noteBodies.find((candidate) => candidate.id === location.noteBodyId) ?? null
    if (!body) continue
    body.aisles.forEach((aisle, index) => {
      if (getAisleBodyId(aisle) !== aisleBodyId) return
      const key = buildAisleSlotKey(body.id, aisle.id)
      if (slots.has(key)) return
      const aisleLabel = body.aisles.length > 1 ? `aisle ${index + 1}` : null
      slots.set(key, {
        key,
        noteBodyId: body.id,
        aisleId: aisle.id,
        aisleBodyId,
        locationKey: buildNoteLocationKey(location),
        domainName: location.domainName,
        spaceName: location.spaceName,
        parentName: location.parentName,
        noteName: location.noteName,
        label: aisleLabel ? `${location.label} / ${aisleLabel}` : location.label,
        aisleIndex: index,
        aisleCount: body.aisles.length,
        aisleLabel,
      })
    })
  }
  return Array.from(slots.values()).sort(compareLinkedAisleSlots)
}

export function decoupleAisleSlotsInState(
  sourceState: AppState,
  aisleBodyId: string,
  keepSlotKeys: Set<string>,
  keepData: boolean,
): DecoupleAisleSlotsResult {
  const linkedSlots = listLinkedAisleSlotsForAisleBody(sourceState, aisleBodyId)
  if (linkedSlots.length <= 0) {
    return { status: 'blocked', state: sourceState, message: 'linked aisle no longer exists.' }
  }
  if (!linkedSlots.some((slot) => keepSlotKeys.has(slot.key))) {
    return { status: 'blocked', state: sourceState, message: 'select at least one aisle to retain the information' }
  }

  const slotsToDecouple = linkedSlots.filter((slot) => !keepSlotKeys.has(slot.key))
  if (slotsToDecouple.length <= 0) return { status: 'applied', state: sourceState, changedCount: 0 }

  const originalAisleBody = (sourceState.noteAisleBodies ?? []).find((body) => body.id === aisleBodyId)
  const newAisleBodies: NoteAisleBody[] = []
  const replacementBodyIdsBySlotKey = new Map<string, string>()
  for (const slot of slotsToDecouple) {
    const replacementBodyId = createId()
    replacementBodyIdsBySlotKey.set(slot.key, replacementBodyId)
    newAisleBodies.push(cloneAisleBodyForDecouple(originalAisleBody, replacementBodyId, keepData))
  }

  return {
    status: 'applied',
    changedCount: slotsToDecouple.length,
    state: {
      ...sourceState,
      noteBodies: sourceState.noteBodies.map((body) => {
        let bodyChanged = false
        const nextAisles = body.aisles.map((aisle) => {
          const replacementBodyId = replacementBodyIdsBySlotKey.get(buildAisleSlotKey(body.id, aisle.id))
          if (!replacementBodyId || getAisleBodyId(aisle) !== aisleBodyId) return aisle
          bodyChanged = true
          return { ...aisle, aisleBodyId: replacementBodyId }
        })
        return bodyChanged ? { ...body, aisles: nextAisles } : body
      }),
      noteAisleBodies: [...(sourceState.noteAisleBodies ?? []), ...newAisleBodies],
    },
  }
}

export function materializeDecoupledAisleCopies(
  state: AppState,
  aisles: ResolvedNoteAisle[],
  decoupleAisleIds: Iterable<string>,
): ResolvedNoteAisle[] {
  const decoupleIds = new Set(decoupleAisleIds)
  if (decoupleIds.size === 0) return aisles
  return aisles.map((aisle) => {
    if (!decoupleIds.has(aisle.id)) return aisle
    const markdown = getAisleMarkdown(aisle, state.noteAisleBodies)
    const aisleBodyId = createId()
    return {
      ...aisle,
      aisleBodyId,
      markdown,
    }
  })
}
