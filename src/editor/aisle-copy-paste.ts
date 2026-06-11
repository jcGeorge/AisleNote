import type { AppState, NoteAisleBody, ResolvedNoteAisle } from '../types/app'
import { cloneAisles } from '../notes/aisle-body-state'
import type { CopyAsClipboardPayload } from '../notes/copy-as-clipboard'
import { materializeStructuralAisleCopiesForInsertion } from '../notes/note-copy-service'
import type { AisleStructuralSnapshot } from './aisle-structural-history'
import { isEmptyAisleMarkdown } from './aisle-edit-draft'
import { replaceFocusedAisleWithNewAisles } from './aisle-insertion'

export type FocusedAisleStructuralPasteMode = 'blank-only' | 'always'

export type FocusedAisleStructuralPasteResult =
  | { status: 'not-applicable' }
  | { status: 'blocked'; message: string }
  | {
      status: 'applied'
      aisles: ResolvedNoteAisle[]
      aisleBodies: NoteAisleBody[]
      activeAisleId: string
    }

export function getCopyAsPasteHereFocusedAisleReplacementMode(
  payload: CopyAsClipboardPayload,
): FocusedAisleStructuralPasteMode | null {
  if (payload.scope !== 'aisle') return null
  if (payload.action === 'duplicate') return 'always'
  if (payload.action === 'copy') return 'blank-only'
  return null
}

export function getCopyAsNewAislePasteFocusedAisleReplacementMode(
  payload: CopyAsClipboardPayload,
): FocusedAisleStructuralPasteMode | null {
  return payload.scope === 'aisle' && (payload.action === 'copy' || payload.action === 'duplicate') ? 'blank-only' : null
}

export function buildFocusedAisleStructuralPasteReplacement({
  appState,
  payload,
  beforeSnapshot,
  mode,
  maxAisles,
}: {
  appState: AppState
  payload: CopyAsClipboardPayload
  beforeSnapshot: AisleStructuralSnapshot | null
  mode: FocusedAisleStructuralPasteMode
  maxAisles: number
}): FocusedAisleStructuralPasteResult {
  if (payload.scope !== 'aisle' || (payload.action !== 'copy' && payload.action !== 'duplicate')) {
    return { status: 'not-applicable' }
  }
  if (!beforeSnapshot) {
    return mode === 'always' ? { status: 'blocked', message: 'Open a note before pasting.' } : { status: 'not-applicable' }
  }

  const materialized = materializeStructuralAisleCopiesForInsertion(appState, {
    scope: payload.scope,
    action: payload.action,
    source: payload.source,
    aisleId: payload.aisleId,
  })
  if (materialized.status !== 'applied') {
    return mode === 'always' ? { status: 'blocked', message: materialized.message } : { status: 'not-applicable' }
  }

  const body = appState.noteBodies.find((candidate) => candidate.id === beforeSnapshot.noteBodyId)
  if (!body) {
    return mode === 'always' ? { status: 'blocked', message: 'Open a note before pasting.' } : { status: 'not-applicable' }
  }

  const baseAisles = cloneAisles(body.aisles, appState.noteAisleBodies)
  const nextAisles = replaceFocusedAisleWithNewAisles(
    baseAisles,
    materialized.aisles,
    beforeSnapshot.activeAisleId,
    mode === 'always' ? () => true : (aisle) => isEmptyAisleMarkdown(aisle.markdown),
  )
  if (!nextAisles) {
    return mode === 'always'
      ? { status: 'blocked', message: 'Destination aisle no longer exists.' }
      : { status: 'not-applicable' }
  }

  if (nextAisles.length > maxAisles) {
    return { status: 'blocked', message: 'Maximum aisle count reached.' }
  }

  return {
    status: 'applied',
    aisles: nextAisles,
    aisleBodies: materialized.aisleBodies,
    activeAisleId: materialized.aisles[0]?.id ?? '',
  }
}
