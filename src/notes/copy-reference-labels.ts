import type { NoteCopyMode } from '../types/app'
import type { CopyAsAction, CopyAsScope } from './copy-as-clipboard'
import type { NoteMentionAction } from './note-mention-picker'

export type ReferenceAction = 'link' | 'preview'

export function getCopyAsActionLabel(action: CopyAsAction): string {
  if (action === 'copy') return 'independent copy'
  if (action === 'duplicate') return 'synced copy'
  if (action === 'link') return 'note link'
  return 'note preview'
}

export function getNoteCopyModeLabel(mode: NoteCopyMode): string {
  return mode === 'linked' ? 'synced' : 'independent'
}

export function getReferenceActionLabel(action: ReferenceAction): string {
  return action === 'preview' ? 'note preview' : 'note link'
}

export function getNoteMentionActionLabel(action: NoteMentionAction): string {
  if (action === 'independent-copy') return 'independent copy'
  if (action === 'synced-copy') return 'synced copy'
  return getReferenceActionLabel(action)
}

export function getCopyAsSubjectLabel(scope: CopyAsScope): string {
  return scope === 'aisle' ? 'aisle' : 'note'
}

function getCopyAsStructuralSubjectLabel(scope: CopyAsScope, action: Extract<CopyAsAction, 'copy' | 'duplicate'>): string {
  const mode = action === 'duplicate' ? 'synced' : 'independent'
  return `${mode} ${getCopyAsSubjectLabel(scope)} copy`
}

export function getCopyAsCopiedToast(scope: CopyAsScope, action: CopyAsAction): string {
  const subject = getCopyAsSubjectLabel(scope)
  if (action === 'copy' || action === 'duplicate') return `${getCopyAsStructuralSubjectLabel(scope, action)} copied.`
  return `${subject} ${action === 'link' ? 'link' : 'preview'} copied.`
}

export function getCopyAsPastedToast(scope: CopyAsScope, action: CopyAsAction): string {
  const subject = getCopyAsSubjectLabel(scope)
  if (action === 'copy' || action === 'duplicate') return `${getCopyAsStructuralSubjectLabel(scope, action)} created.`
  return `${subject} ${action === 'link' ? 'link' : 'preview'} pasted.`
}

export function getCopyAsStructuralNoun(action: Extract<CopyAsAction, 'copy' | 'duplicate'>): string {
  return getCopyAsActionLabel(action)
}

export function getCopyAsStructuralFailureMessage(scope: CopyAsScope, action: Extract<CopyAsAction, 'copy' | 'duplicate'>): string {
  return `${getCopyAsStructuralSubjectLabel(scope, action)} could not be created.`
}

export function getNoteCopyCreatedToast(mode: NoteCopyMode): string {
  return `${getNoteCopyModeLabel(mode)} copy created.`
}
