function createDefaultId() {
  const randomUuid = globalThis.crypto?.randomUUID
  if (typeof randomUuid === 'function') return randomUuid.call(globalThis.crypto)
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function nowIso() {
  return new Date().toISOString()
}

function createNoteBodyWithAisle(markdown = '', idGenerator = createDefaultId) {
  const createdAt = nowIso()
  const noteBodyId = idGenerator()
  const aisleBodyId = idGenerator()
  const aisleId = idGenerator()
  return {
    noteBody: {
      id: noteBodyId,
      createdAt,
      updatedAt: createdAt,
      aisles: [{ id: aisleId, aisleBodyId }],
    },
    aisleBody: {
      id: aisleBodyId,
      createdAt,
      updatedAt: createdAt,
      markdown,
      tags: [],
      frontmatter: null,
      frontmatterStatus: 'none',
    },
    aisleId,
  }
}

export const DEFAULT_SCRATCHPAD_MARKDOWN = `## About Scratchpad

Scratchpad is a quick place to capture temporary notes, loose thoughts, and anything you want close at hand before deciding where it belongs. Keep it messy, clear it out, or move pieces into your vault when they become permanent.`

export const DEFAULT_SHORTCUTS = {
  openSettings: 'mod+,',
  toggleNotesTrash: 'mod+shift+backspace',
  toggleNotesScratchpad: 'mod+s',
  newNote: 'mod+n',
  newFolder: 'mod+shift+n',
  closeCurrentNote: 'mod+w',
  cyclePinnedNoteTabNext: 'ctrl+tab',
  cyclePinnedNoteTabPrev: 'ctrl+shift+tab',
  reopenClosedNoteTab: 'mod+shift+t',
  formatStrikethrough: 'mod+shift+x',
  formatHighlight: 'mod+shift+h',
  pastePlainText: 'mod+shift+v',
  cycleAislePrev: 'mod+alt+arrowleft',
  cycleAisleNext: 'mod+alt+arrowright',
}

export const DEFAULT_NEWLINE_SHORTCUT_SETTINGS = {
  shortcuts: {
    controlEnter: 'operationsMenu',
    shiftEnter: 'task',
    commandEnter: 'aisleRight',
  },
  menuOperations: [
    'task',
    'aisleLeft',
    'aisleRight',
    'horizontalLine',
    'codeBlock',
    'inlineCode',
    'blockQuote',
    'strikethrough',
  ],
}

export function createDefaultAppState(options = {}) {
  const idGenerator = typeof options.idGenerator === 'function' ? options.idGenerator : createDefaultId
  const welcome = createNoteBodyWithAisle('', idGenerator)
  const scratchpad = createNoteBodyWithAisle(DEFAULT_SCRATCHPAD_MARKDOWN, idGenerator)
  const welcomeNote = {
    type: 'note',
    id: idGenerator(),
    title: 'Welcome',
    noteBodyId: welcome.noteBody.id,
  }

  return {
    theme: 'dark',
    vault: {
      activeNoteId: welcomeNote.id,
      openTabs: [{ noteId: welcomeNote.id, status: 'temporary' }],
      items: [welcomeNote],
      deletedItems: [],
      settings: {
        autoRemoveDeletedDays: 7,
      },
    },
    scratchpad: {
      noteBodyId: scratchpad.noteBody.id,
      activeAisleId: scratchpad.aisleId,
    },
    messages: Array.isArray(options.messages) ? options.messages : [],
    toastHistory: [],
    noteBodies: [welcome.noteBody, scratchpad.noteBody],
    noteAisleBodies: [welcome.aisleBody, scratchpad.aisleBody],
    hotkeys: {
      shortcuts: { ...DEFAULT_SHORTCUTS },
      newlineShortcuts: {
        shortcuts: { ...DEFAULT_NEWLINE_SHORTCUT_SETTINGS.shortcuts },
        menuOperations: [...DEFAULT_NEWLINE_SHORTCUT_SETTINGS.menuOperations],
      },
    },
    frontmatter: {
      templates: [],
      settingsTemplateId: '',
      lastAppliedTemplateId: '',
    },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 212,
      collapsedFolderIds: [],
      findCaseSensitive: false,
      findWholeWord: false,
      findRegex: false,
      findReplaceMode: 'find',
      findReplaceScope: 'note',
      removeNoteReferencesOnTrash: false,
      noteMentionCopyRequiresConfirmation: true,
      scratchpadNewAisleSide: 'right',
      decoupledItemsKeepData: true,
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      tableOfContentsScope: 'all-aisles',
      tabColorIndicatorPlacement: 'bottom',
      noteFontScale: 1,
      toolbarButtonScale: 1.2,
      settingsSection: 'data',
      dataSettingsSection: 'storage',
      visualsSettingsSection: 'theming',
      selectedCustomTheme: 'custom1',
      themePalettes: {},
      noteCursorLocations: {},
      headingCollapseState: {},
      aisleWidths: {},
      toolbarLayouts: [],
      toolbarEditorShowNames: false,
      noteDropAutoExpandsFolders: false,
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}
