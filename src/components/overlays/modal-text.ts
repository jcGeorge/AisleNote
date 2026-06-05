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
      title: 'delete all trash?',
      body: 'this permanently removes every deleted domain, space, tab, and sub-tab.',
      action: 'delete all',
    }
  }

  if (modal.type === 'trash-restore-all') {
    return {
      title: 'restore all trash?',
      body: 'this restores every deleted domain, space, tab, and sub-tab that can return to its original hierarchy.',
      action: 'restore all',
    }
  }

  if (modal.type === 'export-space') {
    return {
      title: 'export space',
      body: 'choose the space to export. the current space is selected by default.',
      action: 'export',
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
            ? `this note will receive ${copyModeLabel} copies of the target aisles. edits in any ${copyModeLabel} aisle will affect each copy.`
            : `this note will be replaced with ${copyModeLabel} copies of the selected target aisles. edits in any ${copyModeLabel} aisle will affect each copy.`
          : hasExistingContent
            ? `this note will be replaced with a ${copyModeLabel} copy of the target note. edits in either location will affect both.`
            : `this note will become a ${copyModeLabel} copy of the target note. edits in either location will affect both.`,
        action: 'make copy',
      }
    }

    return {
      title: 'make copy',
      body: appendAisles
        ? 'this note will receive independent text copies of the target aisles.'
        : selectedAisles
          ? 'this note will be replaced with independent text copies of the selected target aisles.'
        : hasExistingContent
          ? 'this note will be replaced with an independent copy of the target note, including all aisles.'
          : 'this note will receive an independent copy of the target note, including all aisles.',
      action: 'make copy',
    }
  }

  if (modal.type === 'confirm-synced-note-paste') {
    return {
      title: 'paste synced note?',
      body: modal.sourceAisleId
        ? 'this will replace this note and all of its aisles with the synced note copy. because the copied note has one aisle, you can paste that synced aisle into the current aisle instead.'
        : 'this will replace this note and all of its aisles with the synced note copy. if you meant to keep this note and add one synced aisle, copy and paste a synced aisle instead.',
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
      body: 'edit metadata rows for this note.',
      action: modal.isTemplateSuggestionDraft && modal.selectedTemplateId ? 'add frontmatter' : 'save',
    }
  }

  if (modal.type === 'shortcut-menu-settings') {
    return {
      title: 'shortcut menu',
      body: 'drag operations into the numbered slots.',
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
        title: 'delete space for real?',
        body: 'this permanently deletes the space and everything inside it, skipping trash.',
        action: 'delete for real',
      }
    }
    return {
      title: 'move space to trash?',
      body: 'this moves the space and everything inside it into trash.',
      action: 'delete space',
    }
  }

  if (modal.target.type === 'domain') {
    if (modal.permanent) {
      return {
        title: 'delete domain for real?',
        body: 'this permanently deletes the domain and everything inside it, skipping trash.',
        action: 'delete for real',
      }
    }
    return {
      title: 'move domain to trash?',
      body: 'this moves the domain and everything inside it into trash.',
      action: 'delete domain',
    }
  }

  if (modal.target.type === 'trash-domain') {
    return {
      title: 'delete domain for real?',
      body: 'this permanently deletes the trashed domain and everything inside it.',
      action: 'delete for real',
    }
  }

  if (modal.target.type === 'trash-space') {
    return {
      title: 'delete space for real?',
      body: 'this permanently deletes the trashed space and everything inside it.',
      action: 'delete for real',
    }
  }

  if (modal.target.type === 'trash-tab' && modal.target.source === 'subtabs-only') {
    return {
      title: 'delete sub-tabs for real?',
      body: 'this permanently deletes the trashed sub-tabs under this tab. The parent tab (and its other sub-tabs) will remain.',
      action: 'delete for real',
    }
  }

  return modal.permanent
    ? {
        title: 'delete for real?',
        body: 'this permanently deletes the selected item and skips trash.',
        action: 'delete for real',
      }
    : {
        title: 'move to trash?',
        body: 'this moves the selected item into trash.',
        action: 'delete',
      }
}
