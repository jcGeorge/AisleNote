import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'
import { NoteWorkspace } from './NoteWorkspace'
import {
  getAislePreviewRenderMode,
  getLightweightPreviewText,
  getMarkdownWorkloadProfile,
  isMarkdownPreviewLikelyExpensive,
} from './note-workspace-preview'
import {
  getAisleActivationPointerFromNoteWorkspaceMouseEvent,
  getAisleActivationPointerFromNoteWorkspaceEvent,
  getAisleEditorKeyFromNoteWorkspacePointerTarget,
  getRightSideBlockGutterTarget,
  shouldActivateAisleFromNoteWorkspacePointer,
  shouldExitArrangeModeFromNoteWorkspacePointer,
} from './note-workspace-events'
import type { AppState, NoteLocation, ResolvedNoteAisle } from '../../types/app'
import { buildInternalNoteLinkToken, buildPreviewToken } from '../../notes/note-references'

const noteWorkspaceSource = readFileSync(fileURLToPath(new URL('./NoteWorkspace.tsx', import.meta.url)), 'utf8')
const noteTabStripSource = readFileSync(fileURLToPath(new URL('./NoteTabStrip.tsx', import.meta.url)), 'utf8')
const vaultAppSource = readFileSync(fileURLToPath(new URL('../../app/VaultApp.tsx', import.meta.url)), 'utf8')
const editorShellCss = readFileSync(fileURLToPath(new URL('../../styles/editor-shell.css', import.meta.url)), 'utf8')
const responsiveCss = readFileSync(fileURLToPath(new URL('../../styles/responsive.css', import.meta.url)), 'utf8')

const aisles: ResolvedNoteAisle[] = [
  { id: 'a', aisleBodyId: 'a', markdown: 'active' },
  { id: 'b', aisleBodyId: 'b', markdown: 'fallback **preview**' },
  { id: 'c', aisleBodyId: 'c', markdown: 'far' },
]

function createPreviewState(): AppState {
  return {
    theme: 'dark',
    vault: {
      activeNoteId: 'note-parent',
      items: [
        { type: 'note', id: 'note-parent', title: 'Parent', noteBodyId: 'body-1' },
        { type: 'note', id: 'note-child', title: 'Child note', noteBodyId: 'body-child' },
      ],
      deletedItems: [],
      settings: { autoRemoveDeletedDays: 30 },
    },
    noteBodies: [
      { id: 'body-1', aisles: [{ id: 'preview', aisleBodyId: 'preview' }] },
      { id: 'body-child', aisles: [{ id: 'child-aisle', aisleBodyId: 'child-aisle-body' }] },
    ],
    noteAisleBodies: [
      { id: 'preview', markdown: '' },
      { id: 'child-aisle-body', markdown: '**child** preview content' },
    ],
    hotkeys: { shortcuts: {} as AppState['hotkeys']['shortcuts'], newlineShortcuts: { shortcuts: {} as never, menuOperations: [] } },
    frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
    ui: {
      sidebarCollapsed: false,
      sidebarWidth: 280,
      collapsedFolderIds: [],
      tableAddTargetMode: 'active-cell',
      tableDeleteTargetMode: 'active-cell',
      noteFontScale: 1,
      settingsSection: 'data',
      noteCursorLocations: {},
      headingCollapseState: {},
      seenTipIds: [],
      disabledTipIds: [],
    },
  }
}

function renderWorkspace(
  mountedAisleIds: Set<string>,
  options: {
    activeAisleId?: string
    aisles?: ResolvedNoteAisle[]
    frontmatterAisleIds?: Set<string>
    linkedAisleIds?: Set<string>
    wholeNoteLinked?: boolean
    aisleWidths?: Record<string, number>
    arrangeModeActive?: boolean
    suppressActiveAislePreviewFallback?: boolean
    deferInactivePreviewFallbacks?: boolean
    failedEditorMountAisleIds?: Set<string>
    appState?: AppState | null
    onOpenNoteReference?: (target: NoteLocation) => void
    tabColorIndicatorPlacement?: 'bottom' | 'top'
    noteTabs?: Array<{ noteId: string; title: string; status: 'temporary' | 'retained'; active: boolean }>
    renamingNoteTabId?: string
    noteTabRenameDraft?: string
    noteContentOverlay?: React.ReactNode
  } = {},
) {
  return renderToStaticMarkup(
    <NoteWorkspace
      noteBodyId="body-1"
      aisles={options.aisles ?? aisles}
      activeAisleId={options.activeAisleId ?? 'a'}
      editorReadOnly={false}
      arrangeModeActive={options.arrangeModeActive}
      frontmatterAisleIds={options.frontmatterAisleIds}
      linkedAisleIds={options.linkedAisleIds}
      wholeNoteLinked={options.wholeNoteLinked}
      aisleWidths={options.aisleWidths}
      aisleScrollRef={{ current: null }}
      toolbar={null}
      headingPopover={null}
      imageToolsOverlay={null}
      tableControlsOverlay={null}
      noteContentOverlay={options.noteContentOverlay}
      mountedAisleIds={mountedAisleIds}
      failedEditorMountAisleIds={options.failedEditorMountAisleIds}
      suppressActiveAislePreviewFallback={options.suppressActiveAislePreviewFallback}
      deferInactivePreviewFallbacks={options.deferInactivePreviewFallbacks}
      getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
      onRootChange={() => undefined}
      onAisleScroll={() => undefined}
      onActivateAisle={() => undefined}
      onRegisterAislePaneRoot={() => undefined}
      onRegisterAisleEditorRoot={() => undefined}
      appState={options.appState}
      onOpenNoteReference={options.onOpenNoteReference}
      tabColorIndicatorPlacement={options.tabColorIndicatorPlacement}
      noteTabs={options.noteTabs}
      renamingNoteTabId={options.renamingNoteTabId}
      noteTabRenameDraft={options.noteTabRenameDraft}
    />,
  )
}

describe('NoteWorkspace aisle mounting', () => {
  it('wires editable image and video selection through the vault workspace', () => {
    expect(noteWorkspaceSource).toContain('onSelectEditableAsset')
    expect(noteWorkspaceSource).toContain('onPointerDownCapture')
    expect(noteWorkspaceSource).toContain('onSelectEditableAsset(event.target)')
    expect(vaultAppSource).toContain('const imageToolsController = useImageTools')
    expect(vaultAppSource).toContain('const mediaToolsController = useMediaTools')
    expect(vaultAppSource).toContain('<ImageToolsOverlay')
    expect(vaultAppSource).toContain('<MediaToolsOverlay')
    expect(vaultAppSource).toContain('imageToolsOverlay={imageToolsOverlay}')
    expect(vaultAppSource).toContain('onSelectEditableAsset={selectEditableAssetFromWorkspace}')
    expect(vaultAppSource).not.toContain('imageToolsOverlay={null}')
  })

  it('keeps inactive preview hydration stable across active aisle changes', () => {
    expect(noteWorkspaceSource).toContain('activeAisleIdForHydrationDiagnosticsRef')
    expect(noteWorkspaceSource).toContain('[aisles.length, deferInactivePreviewFallbacks, inactivePreviewHydrationKey, noteBodyId]')
    expect(noteWorkspaceSource).not.toContain(
      '[activeAisleId, aisles.length, deferInactivePreviewFallbacks, inactivePreviewHydrationKey, noteBodyId]',
    )
  })

  it('keeps every aisle pane in the scroll strip while only mounted aisles get editor hosts', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html.match(/class="note-aisle-pane/g) ?? []).toHaveLength(3)
    expect(html).toContain('data-aisle-id="a"')
    expect(html).toContain('data-aisle-id="b"')
    expect(html).toContain('data-aisle-id="c"')
    expect(html.match(/data-aisle-editor-key="body-1::a"/g) ?? []).toHaveLength(2)
    expect(html).not.toContain('data-aisle-editor-key="body-1::b" class="toast-editor-host"')
    expect(html).toContain('aisle-editor-preview-fallback')
    expect(html).toContain('<strong>preview</strong>')
  })

  it('renders note overlays inside the content region before the tab strip', () => {
    const html = renderWorkspace(new Set(['a']), {
      noteContentOverlay: <div className="test-note-overlay">overlay</div>,
      noteTabs: [
        { noteId: 'note-1', title: 'One', status: 'retained', active: true },
        { noteId: 'note-2', title: 'Two', status: 'temporary', active: false },
      ],
    })

    expect(html).toContain('note-content-region')
    expect(html).toContain('note-content-overlay-region')
    expect(html).toContain('test-note-overlay')
    expect(html.indexOf('note-content-overlay-region')).toBeLessThan(html.indexOf('note-tab-strip'))
    expect(editorShellCss).toContain('.note-content-overlay-region')
    expect(editorShellCss).toContain('pointer-events: none;')
    expect(editorShellCss).toContain('.note-content-overlay-region > *')
  })

  it('does not render markdown fallback for the active aisle while its editor mount is pending', () => {
    const html = renderWorkspace(new Set(['b']), {
      activeAisleId: 'a',
      suppressActiveAislePreviewFallback: true,
    })

    expect(html).toContain('is-editor-mount-pending')
    expect(html).not.toContain('>active</')
    expect(html).toContain('<p class="aislenote-rendered-markdown-paragraph">far</p>')
  })

  it('renders markdown fallback for an active aisle after editor mount failure', () => {
    const html = renderWorkspace(new Set(['a']), {
      activeAisleId: 'a',
      failedEditorMountAisleIds: new Set(['a']),
      suppressActiveAislePreviewFallback: true,
    })

    expect(html).toContain('is-editor-mount-failed')
    expect(html).toContain('data-aisle-editor-mount-failed="true"')
    expect(html).toContain('<p class="aislenote-rendered-markdown-paragraph">active</p>')
    expect(html).not.toContain('is-editor-mount-pending')
  })

  it('renders deferred inactive link-heavy previews as markdown outside arrange mode', () => {
    const heavyMarkdown = [
      '| [copy](https://lucide.dev/icons/files) | |',
      '| --- | --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) | |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) | |',
      '| [findReplace](https://lucide.dev/icons/search) | |',
      '| [undo](https://lucide.dev/icons/undo) | |',
      '| [redo](https://lucide.dev/icons/redo) | |',
      '| [heading](https://lucide.dev/icons/heading) | |',
      '| [bold](https://lucide.dev/icons/bold) | |',
    ].join('\n')
    const html = renderWorkspace(new Set(['active']), {
      activeAisleId: 'active',
      deferInactivePreviewFallbacks: true,
      aisles: [
        { id: 'heavy', aisleBodyId: 'heavy', markdown: heavyMarkdown },
        { id: 'image', aisleBodyId: 'image', markdown: '![Diagram](data:image/png;base64,abc)' },
        { id: 'active', aisleBodyId: 'active', markdown: 'active' },
      ],
    })

    expect(html).not.toContain('is-lightweight-preview')
    expect(html).toContain('data-aisle-preview-mode="markdown-preview"')
    expect(html).toContain('<table>')
    expect(html).toContain('href="https://lucide.dev/icons/table-of-contents"')
    expect(html).toContain('src="data:image/png;base64,abc"')
    expect(html).toContain('data-aisle-host-mode="editor"')
  })

  it('hydrates inactive link-heavy aisles to normal markdown previews outside arrange mode', () => {
    const heavyMarkdown = [
      '| [copy](https://lucide.dev/icons/files) | |',
      '| --- | --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) | |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) | |',
      '| [findReplace](https://lucide.dev/icons/search) | |',
      '| [undo](https://lucide.dev/icons/undo) | |',
      '| [redo](https://lucide.dev/icons/redo) | |',
      '| [heading](https://lucide.dev/icons/heading) | |',
      '| [bold](https://lucide.dev/icons/bold) | |',
    ].join('\n')
    const html = renderWorkspace(new Set(['active']), {
      activeAisleId: 'active',
      aisles: [
        { id: 'heavy', aisleBodyId: 'heavy', markdown: heavyMarkdown },
        { id: 'active', aisleBodyId: 'active', markdown: 'active' },
      ],
    })

    expect(html).toContain('data-aisle-preview-mode="markdown-preview"')
    expect(html).not.toContain('is-lightweight-preview')
    expect(html).toContain('<table>')
    expect(html).toContain('href="https://lucide.dev/icons/table-of-contents"')
    expect(html).toContain('aislenote-rendered-markdown-surface')
  })

  it('renders one-column link-heavy table previews as formatted tables', () => {
    const tbCopyMarkdown = [
      '| [copy](https://lucide.dev/icons/files) |',
      '| ---- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) |',
    ].join('\n')
    const html = renderWorkspace(new Set(['active']), {
      activeAisleId: 'active',
      aisles: [
        { id: 'tb-copy', aisleBodyId: 'tb-copy', markdown: tbCopyMarkdown },
        { id: 'active', aisleBodyId: 'active', markdown: 'active' },
      ],
    })

    expect(html).toContain('data-aisle-preview-mode="markdown-preview"')
    expect(html).toContain('<table>')
    expect(html).toContain('<th><a href="https://lucide.dev/icons/files" class="aislenote-rendered-markdown-link" target="_blank" rel="noopener noreferrer">copy</a></th>')
    expect(html).toContain('href="https://lucide.dev/icons/table-of-contents"')
    expect(html).not.toContain('is-lightweight-preview')
  })

  it('renders only mounted Toast aisles as editors during a 1 to 2 to 3 switch state', () => {
    const html = renderWorkspace(new Set(['aisle-3']), {
      activeAisleId: 'aisle-3',
      aisles: [
        { id: 'aisle-1', aisleBodyId: 'aisle-1', markdown: '# First' },
        { id: 'aisle-2', aisleBodyId: 'aisle-2', markdown: '# Second' },
        { id: 'aisle-3', aisleBodyId: 'aisle-3', markdown: '# Third' },
      ],
    })

    expect(html.match(/data-aisle-host-mode="editor"/g) ?? []).toHaveLength(1)
    expect(html.match(/data-aisle-host-mode="preview"/g) ?? []).toHaveLength(2)
    expect(html).toContain('data-aisle-id="aisle-3"')
    expect(html).toContain('data-aisle-editor-key="body-1::aisle-3" data-aisle-host-mode="editor"')
    expect(html).not.toContain('data-aisle-editor-key="body-1::aisle-1" data-aisle-host-mode="editor"')
    expect(html).not.toContain('data-aisle-editor-key="body-1::aisle-2" data-aisle-host-mode="editor"')
  })

  it('uses lightweight previews for inactive link-heavy aisles in arrange mode without anchor DOM', () => {
    const heavyMarkdown = [
      '# Completed items',
      '',
      '| [copy](https://lucide.dev/icons/files) | |',
      '| --- | --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) | |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) | |',
      '| [findReplace](https://lucide.dev/icons/search) | |',
      '| [undo](https://lucide.dev/icons/undo) | |',
      '| [redo](https://lucide.dev/icons/redo) | |',
      '| [heading](https://lucide.dev/icons/heading) | |',
      '| [bold](https://lucide.dev/icons/bold) | |',
    ].join('\n')
    const html = renderWorkspace(new Set(['active']), {
      activeAisleId: 'active',
      arrangeModeActive: true,
      aisles: [
        { id: 'heavy', aisleBodyId: 'heavy', markdown: heavyMarkdown },
        { id: 'active', aisleBodyId: 'active', markdown: 'active' },
      ],
    })

    expect(html).toContain('data-aisle-preview-mode="lightweight-preview"')
    expect(html).toContain('Completed items')
    expect(html).toContain('| copy | |')
    expect(html).not.toContain('href="https://lucide.dev/icons/files"')
    expect(html).not.toContain('<table>')
  })

  it('renders deferred inactive link-heavy previews as markdown regardless of hydration state', () => {
    const profile = getMarkdownWorkloadProfile([
      '[one](https://example.com/one)',
      '[two](https://example.com/two)',
      '[three](https://example.com/three)',
      '[four](https://example.com/four)',
      '[five](https://example.com/five)',
    ].join('\n'))

    expect(getAislePreviewRenderMode({
      active: false,
      arrangeModeActive: false,
      deferInactivePreviewFallbacks: true,
      editorMounted: false,
      editorMountPending: false,
      inactivePreviewsHydrated: false,
      profile,
    })).toBe('markdown-preview')
    expect(getAislePreviewRenderMode({
      active: false,
      arrangeModeActive: false,
      deferInactivePreviewFallbacks: true,
      editorMounted: false,
      editorMountPending: false,
      inactivePreviewsHydrated: true,
      profile,
    })).toBe('markdown-preview')
  })

  it('marks rendered internal note links so preview clicks can open vault notes', () => {
    const appState = createPreviewState()
    const noteLink = buildInternalNoteLinkToken(appState, { noteId: 'note-child' })
    const html = renderWorkspace(new Set(['active']), {
      activeAisleId: 'active',
      appState,
      onOpenNoteReference: () => undefined,
      aisles: [
        { id: 'links', aisleBodyId: 'links', markdown: `${noteLink}\n\n[Site](https://example.com)` },
        { id: 'active', aisleBodyId: 'active', markdown: 'active' },
      ],
    })

    expect(html.match(/data-note-reference="true"/g) ?? []).toHaveLength(1)
    expect(html).toContain('class="aislenote-rendered-markdown-link"')
    expect(html).toContain('Child note')
    expect(html).toContain('href="https://example.com"')
  })

  it('renders escaped persisted markdown links as links in aisle previews', () => {
    const html = renderWorkspace(new Set(['active']), {
      activeAisleId: 'active',
      aisles: [
        {
          id: 'links',
          aisleBodyId: 'links',
          markdown: [
            'Alright',
            '',
            String.raw`\[strike\]\(https://lucide\.dev/icons/strikethrough\)`,
            String.raw`\[taskList\]\(https://lucide\.dev/icons/square\-check\-big\)`,
          ].join('\n'),
        },
        { id: 'active', aisleBodyId: 'active', markdown: 'active' },
      ],
    })

    expect(html).toContain('href="https://lucide.dev/icons/strikethrough"')
    expect(html).toContain('href="https://lucide.dev/icons/square-check-big"')
    expect(html).not.toContain('\\[strike\\]')
  })

  it('classifies link-heavy markdown previews as expensive without flagging image-only previews', () => {
    const fixture = [
      '| [copy](https://lucide.dev/icons/files) | |',
      '| --- | --- |',
      '| [tableOfContents](https://lucide.dev/icons/table-of-contents) | |',
      '| [aisles](https://lucide.dev/icons/shelving-unit) | |',
      '| [findReplace](https://lucide.dev/icons/search) | |',
      '| [undo](https://lucide.dev/icons/undo) | |',
      '| [redo](https://lucide.dev/icons/redo) | |',
      '| [heading](https://lucide.dev/icons/heading) | |',
    ].join('\n')
    const profile = getMarkdownWorkloadProfile(fixture)
    expect(profile).toMatchObject({
      externalLinkCount: 7,
      markdownLinkCount: 7,
      hasMediaCandidate: false,
      hasNotePreviewCandidate: false,
      hasInternalNoteCandidate: false,
      isLinkHeavy: true,
    })
    expect(isMarkdownPreviewLikelyExpensive(fixture)).toBe(true)
    expect(isMarkdownPreviewLikelyExpensive([
      '[one](https://example.com/one)',
      '[two](https://example.com/two)',
      '[three](https://example.com/three)',
      '[four](https://example.com/four)',
      '[five](https://example.com/five)',
    ].join('\n'))).toBe(true)
    expect(isMarkdownPreviewLikelyExpensive('![Diagram](data:image/png;base64,abc)')).toBe(false)
    expect(getLightweightPreviewText('| [copy](https://lucide.dev/icons/files) | |')).toBe('| copy | |')
  })

  it('marks editor and preview hosts as separate DOM ownership modes', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).toContain('data-aisle-editor-key="body-1::a" data-aisle-host-mode="editor"')
    expect(html.match(/data-aisle-host-mode="preview"/g) ?? []).toHaveLength(2)
  })

  it('renders the custom horizontal aisle scrollbar for split notes', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).toContain('note-aisle-horizontal-scrollbar')
    expect(html).toContain('note-aisle-horizontal-scrollbar-track')
    expect(html).toContain('note-aisle-horizontal-scrollbar-thumb')
    expect(html).toContain('role="scrollbar"')
    expect(html).toContain('aria-label="Scroll aisles horizontally"')
  })

  it('renders bottom note tabs below the split aisle scrollbar', () => {
    const html = renderWorkspace(new Set(['a']), {
      noteTabs: [
        { noteId: 'note-parent', title: 'Parent', status: 'temporary', active: true },
        { noteId: 'note-child', title: 'Child', status: 'retained', active: false },
      ],
    })
    const tabStripRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-tab-strip {'),
      editorShellCss.indexOf('.note-tab {'),
    )
    const tabRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-tab {'),
      editorShellCss.indexOf('.note-tab::before,'),
    )
    const tabDropIndicatorRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-tab::before,'),
      editorShellCss.indexOf('.note-tab::before {'),
    )
    const tabLabelRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-tab-label {'),
      editorShellCss.indexOf('.note-tab.is-temporary .note-tab-label'),
    )
    const activeTabBaseRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-tab.is-active {'),
      editorShellCss.indexOf('.note-tab.is-active > :where(.note-tab-main, .note-tab-close)'),
    )
    const activeTabControlRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-tab.is-active > :where(.note-tab-main, .note-tab-close)'),
      editorShellCss.indexOf('.note-tab-main:focus-visible,'),
    )
    const activeTabRules = editorShellCss.slice(
      editorShellCss.indexOf('.note-tab.is-active {'),
      editorShellCss.indexOf('.note-tab.is-dragging {'),
    )
    const tabHoverRuleIndex = editorShellCss.indexOf('.note-tab:hover {')

    expect(html.indexOf('note-aisle-horizontal-scrollbar')).toBeLessThan(html.indexOf('note-tab-strip'))
    expect(html).toContain('note-aisles-shell is-split is-tab-indicator-bottom')
    expect(html).toContain('aria-label="Open notes"')
    expect(html).toContain('note-tab is-active is-temporary')
    expect(html).toContain('note-tab is-retained')
    expect(html).toContain('note-tab-close')
    expect(html).toContain('data-app-icon="x"')
    expect(tabStripRule).toContain('flex: 0 0 var(--note-tab-strip-height, 45px);')
    expect(tabStripRule).toContain('min-height: var(--note-tab-strip-height, 45px);')
    expect(tabStripRule).toContain('font-size: var(--note-tab-font-size, 1rem);')
    expect(tabLabelRule).toContain('font-size: 1em;')
    expect(tabLabelRule).not.toContain('var(--ui-font-small)')
    expect(tabRule).toContain('flex: 0 1 max-content;')
    expect(tabRule).toContain('--note-tab-active-line-size: 4px;')
    expect(tabRule).toContain('--note-tab-active-line-y: calc(-1 * var(--note-tab-active-line-size));')
    expect(tabRule).toContain('--note-tab-drop-line-size: 3px;')
    expect(editorShellCss).toContain('.note-aisles-shell.is-tab-indicator-top .note-tab')
    expect(editorShellCss).toContain('--note-tab-active-line-y: var(--note-tab-active-line-size);')
    expect(editorShellCss).toContain('--note-tab-hover-bg: color-mix(in srgb, var(--app-text) 9%, var(--editor-bg));')
    expect(editorShellCss).not.toContain('--note-tab-active-bg')
    expect(tabDropIndicatorRule).toContain('top: 0;')
    expect(tabDropIndicatorRule).toContain('bottom: 0;')
    expect(tabDropIndicatorRule).toContain('z-index: 2;')
    expect(tabDropIndicatorRule).toContain('width: var(--note-tab-drop-line-size);')
    expect(activeTabBaseRule).toContain('box-shadow: inset 0 var(--note-tab-active-line-y) 0 var(--app-primary);')
    expect(activeTabBaseRule).not.toContain('background:')
    expect(activeTabControlRule).toContain('box-shadow: inset 0 var(--note-tab-active-line-y) 0 var(--app-primary);')
    expect(activeTabControlRule).not.toContain('background:')
    expect(activeTabRules).toContain('.note-tab:hover > :where(.note-tab-main, .note-tab-close)')
    expect(activeTabRules).toContain('background: var(--note-tab-hover-bg);')
    expect(tabHoverRuleIndex).toBeGreaterThan(editorShellCss.indexOf('.note-tab.is-active > :where(.note-tab-main, .note-tab-close)'))
    expect(editorShellCss).not.toContain('.note-tab-main:hover')
  })

  it('renders an inline rename input for tab-row initiated note renames', () => {
    const html = renderWorkspace(new Set(['a']), {
      noteTabs: [
        { noteId: 'note-parent', title: 'Parent', status: 'temporary', active: true },
        { noteId: 'note-child', title: 'Child', status: 'retained', active: false },
      ],
      renamingNoteTabId: 'note-parent',
      noteTabRenameDraft: 'Parent draft',
    })
    const renameInputRuleStart = editorShellCss.indexOf('.note-tab-rename-input {')
    const renameInputRule = editorShellCss.slice(
      renameInputRuleStart,
      editorShellCss.indexOf('.note-tab-close {', renameInputRuleStart),
    )

    expect(html).toContain('note-tab is-active is-temporary is-renaming')
    expect(html).toContain('class="note-tab-rename-input"')
    expect(html).toContain('value="Parent draft"')
    expect(renameInputRule).toContain('height: 2rem;')
    expect(renameInputRule).toContain('font-size: 1em;')
    expect(renameInputRule).not.toContain('var(--ui-font-small)')
  })

  it('marks the workspace when the tab color indicator is configured for the top edge', () => {
    const html = renderWorkspace(new Set(['a']), {
      tabColorIndicatorPlacement: 'top',
      noteTabs: [
        { noteId: 'note-parent', title: 'Parent', status: 'temporary', active: true },
      ],
    })

    expect(html).toContain('note-aisles-shell is-split is-tab-indicator-top')
  })

  it('wires vault tabs through the vault app while hiding them for scratchpad', () => {
    expect(vaultAppSource).toContain('noteTabs={activeModelIsScratchpad ? [] : noteTabItems}')
    expect(vaultAppSource).toContain("tabColorIndicatorPlacement={state.ui.tabColorIndicatorPlacement ?? 'bottom'}")
    expect(vaultAppSource).toContain("renamingNoteTabId={renamingItemSurface === 'tab' ? renamingTreeItemId : ''}")
    expect(vaultAppSource).toContain("applyVaultNavigationLocation({ noteId, aisleId: '' }, { tabDisposition: 'retained' })")
    expect(noteWorkspaceSource).toContain('<NoteTabStrip')
  })

  it('keeps middle-click close wired on bottom note tabs', () => {
    expect(noteTabStripSource).toContain('const closeFromMiddleClick =')
    expect(noteTabStripSource).toContain('if (event.button !== 1) return false')
    expect(noteTabStripSource).toContain('onMouseDown={(event) => {')
    expect(noteTabStripSource).toContain('closeFromMiddleClick(event, tab.noteId)')
    expect(noteTabStripSource).toContain('onAuxClick={(event) => {')
  })

  it('promotes temporary tabs on double-click and starts rename from long-press', () => {
    expect(noteTabStripSource).toContain('NOTE_TAB_RENAME_LONG_PRESS_MS = 500')
    expect(noteTabStripSource).not.toContain('NOTE_TAB_PROMOTE_LONG_PRESS_MS')
    expect(noteTabStripSource).toContain('onDoubleClick={(event) => {')
    expect(noteTabStripSource).toContain("if (tab.status !== 'temporary'")
    expect(noteTabStripSource).toContain('onPromoteTab(tab.noteId)')
    expect(noteTabStripSource).toContain('const startLongPressRename =')
    expect(noteTabStripSource).toContain('onStartRenameTab(tab.noteId, tab.title)')
    expect(noteTabStripSource).toContain('className="note-tab-rename-input"')
  })

  it('keeps split aisle alignment gutters out of the first aisle layout', () => {
    expect(editorShellCss).toContain('--note-aisle-leading-gutter: 1.5rem;')
    expect(editorShellCss).toContain('.note-aisles-shell.is-split .note-aisle-scroll')
    expect(editorShellCss).toContain('padding-inline-end: var(--note-aisle-leading-gutter);')
    expect(editorShellCss).toContain('scroll-padding-inline-start: var(--note-aisle-leading-gutter);')
    expect(editorShellCss).toContain('scroll-padding-inline-end: var(--note-aisle-leading-gutter);')
    expect(editorShellCss).not.toMatch(/^\s*padding-inline-start: var\(--note-aisle-leading-gutter\);/m)
    expect(responsiveCss).toContain('padding-inline-start: 0 !important;')
    expect(responsiveCss).toContain('padding-inline-end: 0 !important;')
    expect(responsiveCss).toContain('scroll-padding-inline-start: 0 !important;')
    expect(responsiveCss).toContain('scroll-padding-inline-end: 0 !important;')
  })

  it('renders resize handles for split aisles', () => {
    const html = renderWorkspace(new Set(['a']))
    const resizeRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-aisle-resize-btn {'),
      editorShellCss.indexOf('.note-aisle-resize-capsule {'),
    )

    expect(html.match(/note-aisle-resize-btn/g) ?? []).toHaveLength(3)
    expect(html).toContain('Resize aisle 1')
    expect(html).toContain('Drag to resize. Double click to reset.')
    expect(html.match(/data-note-workspace-skip-aisle-activation="true"/g) ?? []).toHaveLength(3)
    expect(html.match(/note-aisle-resize-capsule/g) ?? []).toHaveLength(3)
    expect(resizeRule).toContain('top: clamp(')
    expect(resizeRule).toContain('calc(var(--resize-handle-center-y) - var(--vault-topbar-height))')
    expect(resizeRule).not.toContain('top: 70%;')
  })

  it('does not render a separate derived frontmatter template filter action', () => {
    const html = renderWorkspace(new Set(['a']), {
      frontmatterAisleIds: new Set(['a']),
    })

    expect(html).toContain('Open frontmatter for aisle 1')
    expect(html).toContain('note-aisle-frontmatter-btn')
    expect(html).not.toContain('Filter by frontmatter template for aisle 1')
    expect(html).not.toContain('note-aisle-frontmatter-filter-btn')
  })

  it('styles aisle action buttons as unfocused by default and primary while active', () => {
    const defaultRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-aisle-action-btn {'),
      editorShellCss.indexOf('.note-aisle-action-btn:hover {'),
    )
    const hoverRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-aisle-action-btn:hover {'),
      editorShellCss.indexOf('.note-aisle-action-btn:focus,'),
    )
    const primaryRule = editorShellCss.slice(
      editorShellCss.indexOf('.note-aisle-action-btn:focus,'),
      editorShellCss.indexOf('.note-aisle-action-wrap {'),
    )

    expect(defaultRule).toContain('--editor-toolbar-icon-primary: currentColor;')
    expect(defaultRule).toContain('--editor-toolbar-icon-secondary: currentColor;')
    expect(defaultRule).toContain('border: 1px solid var(--rail-control-border);')
    expect(defaultRule).toContain('background: var(--rail-control-bg);')
    expect(defaultRule).toContain('color: var(--rail-control-text);')
    expect(defaultRule).not.toContain('action-chip-selected')
    expect(hoverRule).toContain('border-color: var(--rail-control-hover-border);')
    expect(hoverRule).toContain('background: var(--rail-control-hover-bg);')
    expect(hoverRule).toContain('color: var(--rail-control-hover-text);')
    expect(primaryRule).not.toContain('.note-aisle-pane.is-active .note-aisle-action-btn')
    expect(primaryRule).toContain('.note-aisle-action-btn:focus')
    expect(primaryRule).toContain('.note-aisle-action-btn:active')
    expect(primaryRule).toContain('.note-aisle-action-btn[aria-pressed="true"]')
    expect(primaryRule).toContain('.note-aisle-action-btn[aria-expanded="true"]')
    expect(primaryRule).toContain('border-color: var(--modal-primary-border);')
    expect(primaryRule).toContain('background: var(--modal-primary-bg);')
    expect(primaryRule).toContain('color: var(--modal-primary-text);')
  })

  it('applies persisted custom aisle widths to split panes', () => {
    const html = renderWorkspace(new Set(['a']), { aisleWidths: { b: 700 } })

    expect(html).toContain('has-custom-width')
    expect(html).toContain('--note-aisle-width:700px')
  })

  it('does not render resize handles for single-aisle notes', () => {
    const html = renderWorkspace(new Set(['solo']), {
      aisles: [{ id: 'solo', aisleBodyId: 'solo', markdown: 'single' }],
      activeAisleId: 'solo',
    })

    expect(html).not.toContain('note-aisle-resize-btn')
    expect(html).not.toContain('has-custom-width')
  })

  it('renders data image previews without stripping the image URL', () => {
    const imageAisles: ResolvedNoteAisle[] = [{ id: 'image', aisleBodyId: 'image', markdown: '![Diagram](data:image/png;base64,abc)' }]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={imageAisles}
        activeAisleId="image"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('src="data:image/png;base64,abc"')
    expect(html).not.toContain('note-aisle-horizontal-scrollbar')
  })

  it('renders media links as players in fallback previews while leaving normal links alone', () => {
    const mediaAisles: ResolvedNoteAisle[] = [
      {
        id: 'media',
        aisleBodyId: 'media',
        markdown: [
          '[Song](aislenote-asset:///assets/song.mp3)',
          '[Voice](aislenote-asset:///assets/voice.wav)',
          '[Movie](aislenote-asset:///assets/movie.mp4)',
          '[Clip](aislenote-asset:///assets/clip.webm)',
          '[Site](https://example.com)',
        ].join('\n\n'),
      },
    ]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={mediaAisles}
        activeAisleId="media"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html.match(/aislenote-media-player/g) ?? []).toHaveLength(4)
    expect(html.match(/data-media-kind="audio"/g) ?? []).toHaveLength(2)
    expect(html.match(/data-media-kind="video"/g) ?? []).toHaveLength(2)
    expect(html).toContain('aria-label="Song player"')
    expect(html).toContain('<a href="https://example.com" class="aislenote-rendered-markdown-link" target="_blank" rel="noopener noreferrer">Site</a>')
  })

  it('renders fallback aisles that start with a heading', () => {
    const headingAisles: ResolvedNoteAisle[] = [{ id: 'heading', aisleBodyId: 'heading', markdown: '# Top heading' }]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={headingAisles}
        activeAisleId="heading"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('aisle-editor-preview-fallback')
    expect(html).toContain('class="aislenote-rendered-markdown-heading aislenote-rendered-markdown-heading-1"')
    expect(html).toContain('Top heading</h1>')
  })

  it('renders fallback block indents without exposing the storage marker', () => {
    const blockIndentAisles: ResolvedNoteAisle[] = [{ id: 'indent', aisleBodyId: 'indent', markdown: `${BLOCK_INDENT_TOKEN.repeat(2)}indented` }]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={blockIndentAisles}
        activeAisleId="indent"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('style="--aislenote-block-indent-level:2"')
    expect(html).toContain('class="aislenote-rendered-markdown-paragraph aislenote-block-indent"')
    expect(html).toContain('indented')
    expect(html).not.toContain(BLOCK_INDENT_TOKEN)
  })

  it('renders explicit note preview tokens as rich readonly previews in workspace previews', () => {
    const appState = createPreviewState()
    const token = buildPreviewToken(appState, { id: 'preview:child', target: { noteId: 'note-child' } })
    const notePreviewAisles: ResolvedNoteAisle[] = [
      { id: 'preview', aisleBodyId: 'preview', markdown: `${token}\n\nregular text` },
    ]
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={notePreviewAisles}
        activeAisleId="preview"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        mountedAisleIds={new Set()}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        appState={appState}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('Child note')
    expect(html).toContain('child')
    expect(html).toContain('data-note-preview-readonly-viewer="true"')
    expect(html).toContain('regular text')
    expect(html).not.toContain(token)
  })

  it('does not render the retired floating link prompt overlay', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).not.toContain('class="link-prompt')
  })

  it('renders no aisle action buttons for plain aisles', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html).not.toContain('note-aisle-action-layer')
    expect(html).not.toContain('note-aisle-link-btn')
    expect(html).not.toContain('note-aisle-frontmatter-btn')
    expect(html).not.toContain('note-scratchpad-aisle-controls')
    expect(html).not.toContain('has-bottom-aisle-controls')
  })

  it('does not expose retired bottom aisle controls', () => {
    const html = renderWorkspace(new Set(['b']), { activeAisleId: 'b' })

    expect(html).not.toContain('note-scratchpad-aisle-controls')
    expect(html).not.toContain('note-scratchpad-aisle-add-btn')
    expect(html).not.toContain('note-scratchpad-aisle-delete-btn')
    expect(html).not.toContain('has-bottom-aisle-controls')
    expect(noteWorkspaceSource).not.toContain('scratchpadAisleControls')
    expect(noteWorkspaceSource).not.toContain('regularNoteAisleControls')
    expect(noteWorkspaceSource).not.toContain('onAddAisleLeft')
    expect(noteWorkspaceSource).not.toContain('onDeleteActiveAisle')
    expect(editorShellCss).not.toContain('note-scratchpad-aisle-controls')
    expect(editorShellCss).not.toContain('note-bottom-aisle')
    expect(editorShellCss).not.toContain('has-bottom-aisle-controls')
  })

  it('renders fm only for aisles with valid frontmatter', () => {
    const html = renderWorkspace(new Set(['a']), { frontmatterAisleIds: new Set(['b']) })

    expect(html.match(/note-aisle-frontmatter-btn/g) ?? []).toHaveLength(1)
    expect(html).toContain('Open frontmatter for aisle 2')
    expect(html).toContain('data-app-tooltip="Frontmatter"')
    expect(html).toContain('frontmatter-toolbar-icon note-aisle-frontmatter-icon')
    expect(html).toContain('>fm</span>')
    expect(html).not.toContain('note-aisle-action-menu')
    expect(html).not.toContain('edit frontmatter')
    expect(html).not.toContain('fm filter')
    expect(html).not.toContain('note-aisle-link-btn')
  })

  it('renders link buttons for linked aisle bodies', () => {
    const html = renderWorkspace(new Set(['a']), { linkedAisleIds: new Set(['b']) })

    expect(html.match(/note-aisle-link-btn/g) ?? []).toHaveLength(1)
    expect(html).toContain('Open de-couple for aisle 2')
    expect(html).toContain('data-app-tooltip="De-couple"')
    expect(html).toContain('toolbar-tool-icon toolbar-tool-icon-link note-aisle-link-icon')
    expect(html).not.toContain('note-aisle-action-menu')
    expect(html).not.toContain('synced filter')
    expect(html).not.toContain('note-aisle-frontmatter-btn')
  })

  it('renders link buttons on every aisle when the whole note is linked', () => {
    const html = renderWorkspace(new Set(['a']), { wholeNoteLinked: true })

    expect(html.match(/note-aisle-link-btn/g) ?? []).toHaveLength(3)
  })

  it('orders aisle action buttons as link then fm', () => {
    const html = renderWorkspace(new Set(['a']), {
      frontmatterAisleIds: new Set(['b']),
      linkedAisleIds: new Set(['b']),
    })

    expect(html.indexOf('note-aisle-link-btn')).toBeLessThan(html.indexOf('note-aisle-frontmatter-btn'))
  })

  it('renders table of contents panels only for open aisles with headings', () => {
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={aisles}
        activeAisleId="a"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        tableOfContentsHeadingsByAisle={{
          a: [
            { aisleId: 'a', key: 'heading-a', level: 1, text: 'Alpha', occurrence: 0 },
            { aisleId: 'a', key: 'heading-b', level: 3, text: 'Nested', occurrence: 0 },
          ],
          b: [],
        }}
        openTableOfContentsAisleIds={new Set(['a', 'b'])}
        mountedAisleIds={new Set(['a'])}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html.match(/class="aisle-toc-panel(?:\s|")/g) ?? []).toHaveLength(1)
    expect(html).toContain('class="aisle-toc-panel-layer"')
    expect(html).toContain('>Headers</h4>')
    expect(html).toContain('Alpha')
    expect(html).toContain('Nested')
    expect(html).toContain('aria-current="true"')
    expect(html).toContain('--toc-heading-indent:1.56rem')
    expect(html).not.toContain('delete-modal-backdrop')
    expect(html).not.toContain('modal-backdrop')
  })

  it('renders a links-only table of contents panel without the headings section', () => {
    const html = renderToStaticMarkup(
      <NoteWorkspace
        noteBodyId="body-1"
        aisles={aisles}
        activeAisleId="a"
        editorReadOnly={false}
        aisleScrollRef={{ current: null }}
        toolbar={null}
        headingPopover={null}
        imageToolsOverlay={null}
        tableControlsOverlay={null}
        tableOfContentsLinksByAisle={{
          a: [
            {
              aisleId: 'a',
              key: 'a|link|0',
              kind: 'url-link',
              label: 'Example',
              href: 'https://example.com',
            },
          ],
        }}
        openTableOfContentsAisleIds={new Set(['a'])}
        mountedAisleIds={new Set(['a'])}
        getPreviewMarkdownForAisle={(aisle) => aisle.markdown}
        onRootChange={() => undefined}
        onAisleScroll={() => undefined}
        onActivateAisle={() => undefined}
        onRegisterAislePaneRoot={() => undefined}
        onRegisterAisleEditorRoot={() => undefined}
      />,
    )

    expect(html).toContain('class="aisle-toc-panel')
    expect(html).toContain('>Links</h4>')
    expect(html).toContain('Example')
    expect(html).toContain('aisle-toc-link-list')
    expect(html).toContain('aisle-toc-link-btn')
    expect(html).toContain('aria-current="true"')
    expect(html).not.toContain('>table of contents</div>')
    expect(html).not.toContain('aisle-toc-link-open-btn')
    expect(html).not.toContain('aisle-toc-link-strip')
    expect(html).not.toContain('--toc-heading-indent')
  })

  it('only exits arrangement mode for primary note workspace clicks while arranging', () => {
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 0)).toBe(true)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 1)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 2)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(false, 0)).toBe(false)
  })

  it('only activates aisles for primary note workspace pointer buttons', () => {
    expect(shouldActivateAisleFromNoteWorkspacePointer(0)).toBe(true)
    expect(shouldActivateAisleFromNoteWorkspacePointer(1)).toBe(false)
    expect(shouldActivateAisleFromNoteWorkspacePointer(2)).toBe(false)
    expect(shouldActivateAisleFromNoteWorkspacePointer(3)).toBe(false)
    expect(shouldActivateAisleFromNoteWorkspacePointer(4)).toBe(false)
    expect(noteWorkspaceSource).toContain('shouldActivateAisleFromNoteWorkspacePointer(event.button)')
  })

  it('captures first-click coordinates only for primary mouse aisle activation', () => {
    const editableProseMirrorTarget = {
      closest: (selector: string) => selector === '.ProseMirror[contenteditable="true"]' ? {} : null,
    } as unknown as EventTarget
    const outsideEditableTarget = {
      closest: () => null,
    } as unknown as EventTarget

    expect(
      getAisleActivationPointerFromNoteWorkspaceMouseEvent({
        button: 0,
        clientX: 24,
        clientY: 48,
        detail: 1,
      } as MouseEvent, outsideEditableTarget),
    ).toEqual({ clientX: 24, clientY: 48, mode: 'coordinate' })
    expect(
      getAisleActivationPointerFromNoteWorkspaceMouseEvent({
        button: 0,
        clientX: 24,
        clientY: 48,
        detail: 1,
      } as MouseEvent, editableProseMirrorTarget),
    ).toEqual({ clientX: 24, clientY: 48, mode: 'focus-only' })
    expect(
      getAisleActivationPointerFromNoteWorkspaceMouseEvent({
        button: 0,
        clientX: 24,
        clientY: 48,
        detail: 2,
      } as MouseEvent, outsideEditableTarget),
    ).toEqual({ clientX: 24, clientY: 48, mode: 'focus-only' })
    expect(
      getAisleActivationPointerFromNoteWorkspaceMouseEvent({
        button: 0,
        clientX: 24,
        clientY: 48,
        detail: 3,
      } as MouseEvent, outsideEditableTarget),
    ).toEqual({ clientX: 24, clientY: 48, mode: 'focus-only' })
    expect(getAisleActivationPointerFromNoteWorkspaceMouseEvent({
      button: 1,
      clientX: 24,
      clientY: 48,
      detail: 1,
    } as MouseEvent)).toBeUndefined()
    expect(getAisleActivationPointerFromNoteWorkspaceMouseEvent({
      button: 2,
      clientX: 24,
      clientY: 48,
      detail: 1,
    } as MouseEvent)).toBeUndefined()
  })

  it('ignores mouse pointerdown activation while preserving non-mouse pointer coordinates', () => {
    expect(getAisleActivationPointerFromNoteWorkspaceEvent({
      button: 0,
      clientX: 24,
      clientY: 48,
      pointerType: 'mouse',
    } as PointerEvent)).toBeUndefined()
    expect(getAisleActivationPointerFromNoteWorkspaceEvent({
      button: 0,
      clientX: 24,
      clientY: 48,
      pointerType: 'touch',
    } as PointerEvent)).toEqual({ clientX: 24, clientY: 48, mode: 'coordinate' })
    expect(getAisleActivationPointerFromNoteWorkspaceEvent({
      button: 0,
      clientX: 24,
      clientY: 48,
      pointerType: 'pen',
    } as PointerEvent)).toEqual({ clientX: 24, clientY: 48, mode: 'coordinate' })
    expect(getAisleActivationPointerFromNoteWorkspaceEvent({
      button: 2,
      clientX: 24,
      clientY: 48,
      pointerType: 'touch',
    } as PointerEvent)).toBeUndefined()
    expect(noteWorkspaceSource).toContain('getAisleActivationPointerFromNoteWorkspaceMouseEvent(event.nativeEvent, event.target)')
  })

  it('detects blank gutter clicks to the right of a table', () => {
    const table = {
      matches: (selector: string) => selector === 'table',
      getBoundingClientRect: () => ({ top: 80, left: 120, right: 340, bottom: 220, width: 220, height: 140 }),
    }
    const root = {
      dataset: { aisleEditorKey: 'body-1::b' },
      closest: (selector: string) => (selector === '[data-aisle-editor-key]' ? root : null),
      contains: (target: unknown) => target === table,
      querySelectorAll: (selector: string) => (selector === 'table, img' ? [table] : []),
    } as unknown as EventTarget

    expect(getRightSideBlockGutterTarget(root, { clientX: 360, clientY: 120 })).toBe('table')
    expect(getRightSideBlockGutterTarget(root, { clientX: 330, clientY: 120 })).toBeNull()
    expect(getRightSideBlockGutterTarget(root, { clientX: 360, clientY: 70 })).toBeNull()
    expect(getRightSideBlockGutterTarget(root, { clientX: 360, clientY: 240 })).toBeNull()
    expect(noteWorkspaceSource).toContain("mode: 'focus-only'")
    expect(noteWorkspaceSource).toContain('onMouseDownCapture')
    expect(noteWorkspaceSource).toContain('event.nativeEvent.stopImmediatePropagation()')
  })

  it('detects blank gutter clicks to the right of an image-only paragraph', () => {
    const paragraph = {
      textContent: '\u200b',
    }
    const image = {
      matches: (selector: string) => selector === 'img',
      closest: (selector: string) => (selector === 'p' ? paragraph : null),
      getBoundingClientRect: () => ({ top: 80, left: 120, right: 340, bottom: 360, width: 220, height: 280 }),
    }
    const root = {
      dataset: { aisleEditorKey: 'body-1::b' },
      closest: (selector: string) => (selector === '[data-aisle-editor-key]' ? root : null),
      contains: () => true,
      querySelectorAll: (selector: string) => (selector === 'table, img' ? [image] : []),
    }
    const target = {
      closest: (selector: string) => {
        if (selector === '[data-aisle-editor-key]') return root
        if (selector.startsWith('p,')) return paragraph
        return null
      },
    } as unknown as EventTarget

    expect(getRightSideBlockGutterTarget(target, { clientX: 360, clientY: 120 })).toBe('image')
    expect(getRightSideBlockGutterTarget(target, { clientX: 330, clientY: 120 })).toBeNull()
    expect(getRightSideBlockGutterTarget(target, { clientX: 360, clientY: 70 })).toBeNull()
    expect(getRightSideBlockGutterTarget(target, { clientX: 360, clientY: 380 })).toBeNull()
  })

  it('does not treat content, controls, or captioned image rows as block gutters', () => {
    const paragraph = {
      textContent: 'caption',
    }
    const image = {
      matches: (selector: string) => selector === 'img',
      closest: (selector: string) => (selector === 'p' ? paragraph : null),
      getBoundingClientRect: () => ({ top: 80, left: 120, right: 340, bottom: 360, width: 220, height: 280 }),
    }
    const root = {
      dataset: { aisleEditorKey: 'body-1::b' },
      closest: (selector: string) => (selector === '[data-aisle-editor-key]' ? root : null),
      contains: () => true,
      querySelectorAll: (selector: string) => (selector === 'table, img' ? [image] : []),
    }
    const captionTarget = {
      closest: (selector: string) => {
        if (selector === '[data-aisle-editor-key]') return root
        if (selector.startsWith('p,')) return paragraph
        return null
      },
    } as unknown as EventTarget
    const imageTarget = {
      closest: (selector: string) => {
        if (selector === '[data-aisle-editor-key]') return root
        if (selector.includes('img')) return imageTarget
        return null
      },
      matches: (selector: string) => selector === 'img',
    } as unknown as EventTarget
    const tableCellTarget = {
      closest: (selector: string) => {
        if (selector === '[data-aisle-editor-key]') return root
        if (selector === 'table') return tableCellTarget
        return null
      },
    } as unknown as EventTarget
    const controlTarget = {
      closest: (selector: string) => {
        if (selector === '[data-aisle-editor-key]') return root
        if (selector.includes('button')) return controlTarget
        return null
      },
    } as unknown as EventTarget
    const linkTarget = {
      closest: (selector: string) => {
        if (selector === '[data-aisle-editor-key]') return root
        if (selector.includes('a')) return linkTarget
        return null
      },
    } as unknown as EventTarget

    expect(getRightSideBlockGutterTarget(captionTarget, { clientX: 360, clientY: 120 })).toBeNull()
    expect(getRightSideBlockGutterTarget(imageTarget, { clientX: 360, clientY: 120 })).toBeNull()
    expect(getRightSideBlockGutterTarget(tableCellTarget, { clientX: 360, clientY: 120 })).toBeNull()
    expect(getRightSideBlockGutterTarget(controlTarget, { clientX: 360, clientY: 120 })).toBeNull()
    expect(getRightSideBlockGutterTarget(linkTarget, { clientX: 360, clientY: 120 })).toBeNull()
  })

  it('resolves aisle activation from nested editor content before bubbling handlers can stop propagation', () => {
    const target = {
      closest: (selector: string) => {
        if (selector === '[data-note-workspace-skip-aisle-activation="true"]') return null
        expect(selector).toBe('[data-aisle-editor-key]')
        return { dataset: { aisleEditorKey: 'body-1::b' } }
      },
    } as unknown as EventTarget

    expect(getAisleEditorKeyFromNoteWorkspacePointerTarget(target)).toBe('body-1::b')
  })

  it('resolves inactive right-edge aisle activation from the containing pane', () => {
    const target = {
      closest: (selector: string) => (
        selector === '[data-aisle-editor-key]' ? { dataset: { aisleEditorKey: 'body-1::c' } } : null
      ),
    } as unknown as EventTarget

    expect(getAisleEditorKeyFromNoteWorkspacePointerTarget(target)).toBe('body-1::c')
  })

  it('ignores pointer targets outside aisle panes', () => {
    const target = {
      closest: () => null,
    } as unknown as EventTarget

    expect(getAisleEditorKeyFromNoteWorkspacePointerTarget(target)).toBe('')
    expect(getAisleEditorKeyFromNoteWorkspacePointerTarget(null)).toBe('')
  })

  it('ignores pointer targets inside controls that suppress aisle activation', () => {
    const target = {
      closest: (selector: string) => (
        selector === '[data-note-workspace-skip-aisle-activation="true"]'
          ? { dataset: {} }
          : { dataset: { aisleEditorKey: 'body-1::b' } }
      ),
    } as unknown as EventTarget

    expect(getAisleEditorKeyFromNoteWorkspacePointerTarget(target)).toBe('')
  })

  it('resolves aisle activation from text-node style targets through the parent element', () => {
    const target = {
      parentElement: {
        closest: (selector: string) => (
          selector === '[data-aisle-editor-key]' ? { dataset: { aisleEditorKey: 'body-1::a' } } : null
        ),
      },
    } as unknown as EventTarget

    expect(getAisleEditorKeyFromNoteWorkspacePointerTarget(target)).toBe('body-1::a')
  })
})
