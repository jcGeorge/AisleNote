import type { AppState, ModalState } from '../../types/app'
import { noteLocationHasContent } from '../../notes/note-locations'

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
      body: 'this permanently removes every deleted tab and sub-tab in this space.',
      action: 'delete all',
    }
  }

  if (modal.type === 'trash-restore-all') {
    return {
      title: 'restore all trash?',
      body: 'this restores every deleted tab and sub-tab in this space.',
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

  if (modal.type === 'copy-note') {
    const hasExistingContent = noteLocationHasContent(state, modal.source)
    if (modal.mode === 'linked') {
      return {
        title: 'make copy',
        body: hasExistingContent
          ? 'the selected note will be replaced with a linked copy of the target note. edits in either location will affect both.'
          : 'the selected note will become a linked copy of the target note. edits in either location will affect both.',
        action: 'make copy',
      }
    }

    return {
      title: 'make copy',
      body: hasExistingContent
        ? 'the selected note will be replaced with an independent copy of the target note, including all aisles.'
        : 'the selected note will receive an independent copy of the target note, including all aisles.',
      action: 'make copy',
    }
  }

  if (modal.type === 'deduplicate-note') {
    return {
      title: 'de-duplicate',
      body: 'checked notes remain linked. Unchecked notes become empty independent notes.',
      action: 'apply',
    }
  }

  if (modal.type === 'insert-note-reference') {
    return {
      title: 'insert note link or preview',
      body: 'choose a target note and insert it as a link or note preview.',
      action: 'insert',
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

  if (modal.target.type === 'space') {
    if (state.spaces.length <= 1) {
      return {
        title: 'cannot delete space',
        body: 'at least one space must remain.',
        action: 'ok',
      }
    }
    return {
      title: 'delete space?',
      body: 'deleted spaces cannot be recovered, are you sure you want to do this?',
      action: 'delete space',
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
