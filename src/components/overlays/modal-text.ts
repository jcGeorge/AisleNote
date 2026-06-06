import type { AppState, ModalState } from '../../types/app'
import { noteLocationHasContent } from '../../notes/note-locations'
import { getNoteCopyModeLabel } from '../../notes/copy-reference-labels'

export type ModalText = {
  title: string
  body: string
  action: string
}

export function getModalText(modal: ModalState | null, state: AppState): ModalText {
  if (!modal) return { title: '', body: '', action: 'confirm' }

  if (modal.type === 'trash-delete-all') {
    return {
      title: 'Delete all trash?',
      body: 'This permanently removes every deleted domain, space, tab, and sub-tab.',
      action: 'delete all',
    }
  }

  if (modal.type === 'trash-restore-all') {
    return {
      title: 'Restore all trash?',
      body: 'This restores every deleted domain, space, tab, and sub-tab that can return to its original hierarchy.',
      action: 'restore all',
    }
  }

  if (modal.type === 'export-space') {
    return {
      title: 'export space',
      body: 'Choose the space to export. The current space is selected by default.',
      action: 'export',
    }
  }

  if (modal.type === 'create-notebook') {
    return {
      title: 'new notebook',
      body: '',
      action: 'create',
    }
  }

  if (modal.type === 'rename-notebook') {
    return {
      title: 'rename notebook',
      body: '',
      action: 'rename',
    }
  }

  if (modal.type === 'scratchpad-about') {
    return {
      title: 'about scratchpad',
      body: '',
      action: 'return',
    }
  }

  if (modal.type === 'copy-note') {
    const hasExistingContent = noteLocationHasContent(state, modal.source)
    const selectedAisles = Boolean(modal.target.aisleIds && modal.target.aisleIds.length > 0)
    const appendAisles = modal.destinationMode === 'append'
    if (modal.mode === 'linked') {
      const linkedAisleCopy = selectedAisles || appendAisles
      const copyModeLabel = getNoteCopyModeLabel(modal.mode)
      return {
        title: 'make copy',
        body: linkedAisleCopy
          ? appendAisles
            ? `This note will receive ${copyModeLabel} copies of the target aisles. Edits in any ${copyModeLabel} aisle will affect each copy.`
            : `This note will be replaced with ${copyModeLabel} copies of the selected target aisles. Edits in any ${copyModeLabel} aisle will affect each copy.`
          : hasExistingContent
            ? `This note will be replaced with a ${copyModeLabel} copy of the target note. Edits in either location will affect both.`
            : `This note will become a ${copyModeLabel} copy of the target note. Edits in either location will affect both.`,
        action: 'make copy',
      }
    }

    return {
      title: 'make copy',
      body: appendAisles
        ? 'This note will receive independent text copies of the target aisles.'
        : selectedAisles
          ? 'This note will be replaced with independent text copies of the selected target aisles.'
        : hasExistingContent
          ? 'This note will be replaced with an independent copy of the target note, including all aisles.'
          : 'This note will receive an independent copy of the target note, including all aisles.',
      action: 'make copy',
    }
  }

  if (modal.type === 'confirm-synced-note-paste') {
    return {
      title: 'Paste synced note?',
      body: modal.sourceAisleId
        ? 'This will replace this note and all of its aisles with the synced note copy. Because the copied note has one aisle, you can paste that synced aisle into the current aisle instead.'
        : 'This will replace this note and all of its aisles with the synced note copy. If you meant to keep this note and add one synced aisle, copy and paste a synced aisle instead.',
      action: 'paste synced note',
    }
  }

  if (modal.type === 'deduplicate-note') {
    return {
      title: 'de-couple',
      body: 'Select items to de-couple.',
      action: 'apply',
    }
  }

  if (modal.type === 'linked-aisle') {
    if (modal.reason === 'note-body') {
      return {
        title: 'linked note',
        body: 'Select items to de-couple.',
        action: 'apply',
      }
    }

    return {
      title: 'linked aisle',
      body: 'Select aisles to de-couple.',
      action: 'apply',
    }
  }

  if (modal.type === 'insert-note-reference') {
    return {
      title: modal.modeLocked ? 'edit link' : 'insert link',
      body: '',
      action: modal.urlEditRange || modal.internalEdit ? 'done' : 'insert',
    }
  }

  if (modal.type === 'frontmatter-note') {
    return {
      title: 'frontmatter',
      body: 'Edit metadata rows for this note.',
      action: modal.isTemplateSuggestionDraft && modal.selectedTemplateId ? 'add frontmatter' : 'save',
    }
  }

  if (modal.type === 'shortcut-menu-settings') {
    return {
      title: 'shortcut menu',
      body: 'Drag operations into the numbered slots.',
      action: 'done',
    }
  }

  if (modal.type === 'sort-tabs') {
    const title =
      modal.target === 'parents'
        ? 'sort parents'
        : modal.target === 'subtabs'
          ? 'sort sub-tabs'
          : modal.target === 'spaces'
            ? 'sort spaces'
            : 'sort domains'
    return {
      title,
      body: '',
      action: '',
    }
  }

  if (modal.type !== 'delete-target') return { title: '', body: '', action: 'confirm' }

  if (modal.target.type === 'space') {
    if (modal.permanent) {
      return {
        title: 'Delete space for real?',
        body: 'This permanently deletes the space and everything inside it, skipping trash.',
        action: 'delete for real',
      }
    }
    return {
      title: 'Move space to trash?',
      body: 'This moves the space and everything inside it into trash.',
      action: 'delete space',
    }
  }

  if (modal.target.type === 'domain') {
    if (modal.permanent) {
      return {
        title: 'Delete domain for real?',
        body: 'This permanently deletes the domain and everything inside it, skipping trash.',
        action: 'delete for real',
      }
    }
    return {
      title: 'Move domain to trash?',
      body: 'This moves the domain and everything inside it into trash.',
      action: 'delete domain',
    }
  }

  if (modal.target.type === 'trash-domain') {
    return {
      title: 'Delete domain for real?',
      body: 'This permanently deletes the trashed domain and everything inside it.',
      action: 'delete for real',
    }
  }

  if (modal.target.type === 'trash-space') {
    return {
      title: 'Delete space for real?',
      body: 'This permanently deletes the trashed space and everything inside it.',
      action: 'delete for real',
    }
  }

  if (modal.target.type === 'trash-tab' && modal.target.source === 'subtabs-only') {
    return {
      title: 'Delete sub-tabs for real?',
      body: 'This permanently deletes the trashed sub-tabs under this tab. The parent tab (and its other sub-tabs) will remain.',
      action: 'delete for real',
    }
  }

  return modal.permanent
    ? {
        title: 'Delete for real?',
        body: 'This permanently deletes the selected item and skips trash.',
        action: 'delete for real',
      }
    : {
        title: 'Move to trash?',
        body: 'This moves the selected item into trash.',
        action: 'delete',
      }
}
