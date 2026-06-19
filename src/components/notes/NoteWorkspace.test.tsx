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
  getAisleActivationPointerFromNoteWorkspaceEvent,
  getAisleEditorKeyFromNoteWorkspacePointerTarget,
  shouldExitArrangeModeFromNoteWorkspacePointer,
} from './note-workspace-events'
import type { AppState, NoteLocation, ResolvedNoteAisle } from '../../types/app'
import { buildInternalNoteLinkToken, buildPreviewToken } from '../../notes/note-references'

const noteWorkspaceSource = readFileSync(fileURLToPath(new URL('./NoteWorkspace.tsx', import.meta.url)), 'utf8')
const notebookAppSource = readFileSync(fileURLToPath(new URL('../../app/NotebookApp.tsx', import.meta.url)), 'utf8')

const aisles: ResolvedNoteAisle[] = [
  { id: 'a', aisleBodyId: 'a', markdown: 'active' },
  { id: 'b', aisleBodyId: 'b', markdown: 'fallback **preview**' },
  { id: 'c', aisleBodyId: 'c', markdown: 'far' },
]

function createPreviewState(): AppState {
  return {
    theme: 'dark',
    notebook: {
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
    appState?: AppState | null
    onOpenNoteReference?: (target: NoteLocation) => void
    scratchpadAisleControls?: {
      showAddButtons?: boolean
      showDeleteButton?: boolean
      onAddAisleLeft: () => void
      onAddAisleRight: () => void
      onDeleteActiveAisle: () => void
    }
    regularNoteAisleControls?: {
      showAddButtons?: boolean
      showDeleteButton?: boolean
      onAddAisleLeft: () => void
      onAddAisleRight: () => void
      onDeleteActiveAisle: () => void
    }
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
      scratchpadAisleControls={options.scratchpadAisleControls}
      regularNoteAisleControls={options.regularNoteAisleControls}
      aisleScrollRef={{ current: null }}
      toolbar={null}
      headingPopover={null}
      imageToolsOverlay={null}
      tableControlsOverlay={null}
      mountedAisleIds={mountedAisleIds}
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
    />,
  )
}

const scratchpadAisleControls = (showDeleteButton: boolean) => ({
  showDeleteButton,
  onAddAisleLeft: () => undefined,
  onAddAisleRight: () => undefined,
  onDeleteActiveAisle: () => undefined,
})

describe('NoteWorkspace aisle mounting', () => {
  it('wires editable image and video selection through the notebook workspace', () => {
    expect(noteWorkspaceSource).toContain('onSelectEditableAsset')
    expect(noteWorkspaceSource).toContain('onPointerDownCapture')
    expect(noteWorkspaceSource).toContain('onSelectEditableAsset(event.target)')
    expect(notebookAppSource).toContain('const imageToolsController = useImageTools')
    expect(notebookAppSource).toContain('const mediaToolsController = useMediaTools')
    expect(notebookAppSource).toContain('<ImageToolsOverlay')
    expect(notebookAppSource).toContain('<MediaToolsOverlay')
    expect(notebookAppSource).toContain('imageToolsOverlay={imageToolsOverlay}')
    expect(notebookAppSource).toContain('onSelectEditableAsset={selectEditableAssetFromWorkspace}')
    expect(notebookAppSource).not.toContain('imageToolsOverlay={null}')
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

  it('does not render markdown fallback for the active aisle while its editor mount is pending', () => {
    const html = renderWorkspace(new Set(['b']), {
      activeAisleId: 'a',
      suppressActiveAislePreviewFallback: true,
    })

    expect(html).toContain('is-editor-mount-pending')
    expect(html).not.toContain('>active</')
    expect(html).toContain('<p class="tabs-rendered-markdown-paragraph">far</p>')
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
    expect(html).toContain('tabs-rendered-markdown-surface')
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
    expect(html).toContain('<th><a href="https://lucide.dev/icons/files" class="tabs-rendered-markdown-link" target="_blank" rel="noopener noreferrer">copy</a></th>')
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

  it('marks rendered internal note links so preview clicks can open notebook notes', () => {
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
    expect(html).toContain('class="tabs-rendered-markdown-link"')
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

  it('renders resize handles for split aisles', () => {
    const html = renderWorkspace(new Set(['a']))

    expect(html.match(/note-aisle-resize-btn/g) ?? []).toHaveLength(3)
    expect(html).toContain('Resize aisle 1')
    expect(html).toContain('Drag to resize. Double click to reset.')
    expect(html.match(/data-note-workspace-skip-aisle-activation="true"/g) ?? []).toHaveLength(3)
    expect(html.match(/note-aisle-resize-capsule/g) ?? []).toHaveLength(3)
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
          '[Song](tabs-asset:///assets/song.mp3)',
          '[Voice](tabs-asset:///assets/voice.wav)',
          '[Movie](tabs-asset:///assets/movie.mp4)',
          '[Clip](tabs-asset:///assets/clip.webm)',
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

    expect(html.match(/tabs-media-player/g) ?? []).toHaveLength(4)
    expect(html.match(/data-media-kind="audio"/g) ?? []).toHaveLength(2)
    expect(html.match(/data-media-kind="video"/g) ?? []).toHaveLength(2)
    expect(html).toContain('aria-label="Song player"')
    expect(html).toContain('<a href="https://example.com" class="tabs-rendered-markdown-link" target="_blank" rel="noopener noreferrer">Site</a>')
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
    expect(html).toContain('class="tabs-rendered-markdown-heading tabs-rendered-markdown-heading-1"')
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

    expect(html).toContain('style="--tabs-block-indent-level:2"')
    expect(html).toContain('class="tabs-rendered-markdown-paragraph tabs-block-indent"')
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
    expect(html).toContain('preview content')
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
  })

  it('renders scratchpad controls only for the active aisle', () => {
    const html = renderWorkspace(new Set(['b']), {
      activeAisleId: 'b',
      scratchpadAisleControls: scratchpadAisleControls(true),
    })

    expect(html.match(/note-scratchpad-aisle-controls/g) ?? []).toHaveLength(1)
    expect(html).toContain('Scratchpad aisle 2 controls')
    expect(html).not.toContain('Scratchpad aisle 1 controls')
    expect(html).not.toContain('Scratchpad aisle 3 controls')
    expect(html).toContain('Add aisle to left of aisle 2')
    expect(html).toContain('Add aisle to right of aisle 2')
    expect(html.match(/note-scratchpad-aisle-add-icon/g) ?? []).toHaveLength(2)
    expect(html).toContain('data-app-icon="aisleRight"')
    expect(html).toContain('transform="translate(24 0) scale(-1 1)"')
    expect(html).not.toContain('note-scratchpad-aisle-plus-icon')
    expect(html).toContain('Delete aisle 2')
    expect(html).toContain('aisle-edit-delete-icon note-scratchpad-aisle-delete-icon')
  })

  it('hides scratchpad delete when only one aisle remains', () => {
    const singleAisle: ResolvedNoteAisle[] = [{ id: 'solo', aisleBodyId: 'solo', markdown: 'single' }]
    const html = renderWorkspace(new Set(['solo']), {
      aisles: singleAisle,
      activeAisleId: 'solo',
      scratchpadAisleControls: scratchpadAisleControls(false),
    })

    expect(html).toContain('Scratchpad aisle 1 controls')
    expect(html.match(/note-scratchpad-aisle-add-btn/g) ?? []).toHaveLength(2)
    expect(html).toContain('Add aisle to left of aisle 1')
    expect(html).toContain('Add aisle to right of aisle 1')
    expect(html.match(/note-scratchpad-aisle-add-icon/g) ?? []).toHaveLength(2)
    expect(html).not.toContain('Delete aisle 1')
    expect(html).not.toContain('note-scratchpad-aisle-delete-btn')
    expect(html).not.toContain('aisle-edit-delete-icon note-scratchpad-aisle-delete-icon')
  })

  it('renders regular note add controls only for the active aisle', () => {
    const html = renderWorkspace(new Set(['b']), {
      activeAisleId: 'b',
      regularNoteAisleControls: {
        showAddButtons: true,
        showDeleteButton: false,
        onAddAisleLeft: () => undefined,
        onAddAisleRight: () => undefined,
        onDeleteActiveAisle: () => undefined,
      },
    })

    expect(html.match(/note-scratchpad-aisle-controls/g) ?? []).toHaveLength(1)
    expect(html).toContain('Aisle 2 controls')
    expect(html).not.toContain('Aisle 1 controls')
    expect(html).toContain('Add aisle to left of aisle 2')
    expect(html).toContain('Add aisle to right of aisle 2')
    expect(html.match(/note-scratchpad-aisle-add-btn/g) ?? []).toHaveLength(2)
    expect(html).not.toContain('Delete aisle 2')
  })

  it('renders the regular note delete control without add buttons', () => {
    const singleAisle: ResolvedNoteAisle[] = [{ id: 'solo', aisleBodyId: 'solo', markdown: 'single' }]
    const html = renderWorkspace(new Set(['solo']), {
      aisles: singleAisle,
      activeAisleId: 'solo',
      regularNoteAisleControls: {
        showAddButtons: false,
        showDeleteButton: true,
        onAddAisleLeft: () => undefined,
        onAddAisleRight: () => undefined,
        onDeleteActiveAisle: () => undefined,
      },
    })

    expect(html).toContain('Aisle 1 controls')
    expect(html).toContain('Delete aisle 1')
    expect(html).toContain('note-scratchpad-aisle-delete-btn')
    expect(html).not.toContain('note-scratchpad-aisle-add-btn')
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

    expect(html.match(/class="aisle-toc-panel"/g) ?? []).toHaveLength(1)
    expect(html).toContain('class="aisle-toc-panel-layer"')
    expect(html).toContain('Alpha')
    expect(html).toContain('Nested')
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

    expect(html).toContain('class="aisle-toc-panel"')
    expect(html).toContain('>links</div>')
    expect(html).toContain('Example')
    expect(html).toContain('aisle-toc-link-open-btn')
    expect(html).not.toContain('>table of contents</div>')
    expect(html).not.toContain('--toc-heading-indent')
  })

  it('only exits arrangement mode for primary note workspace clicks while arranging', () => {
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 0)).toBe(true)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 1)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(true, 2)).toBe(false)
    expect(shouldExitArrangeModeFromNoteWorkspacePointer(false, 0)).toBe(false)
  })

  it('captures first-click coordinates only for primary aisle activation pointers', () => {
    expect(getAisleActivationPointerFromNoteWorkspaceEvent({
      button: 0,
      clientX: 24,
      clientY: 48,
    } as PointerEvent)).toEqual({ clientX: 24, clientY: 48 })
    expect(getAisleActivationPointerFromNoteWorkspaceEvent({
      button: 2,
      clientX: 24,
      clientY: 48,
    } as PointerEvent)).toBeUndefined()
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
