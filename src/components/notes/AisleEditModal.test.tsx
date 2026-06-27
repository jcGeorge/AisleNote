import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'
import { MAX_NOTE_AISLES } from '../../editor/aisle-edit-draft'
import type { ResolvedNoteAisle } from '../../types/app'
import { AisleEditModal } from './AisleEditModal'

const aisle = (id: string, markdown = id): ResolvedNoteAisle => ({ id, aisleBodyId: id, markdown })
const componentDir = dirname(fileURLToPath(import.meta.url))

function renderModal(
  aisles: ResolvedNoteAisle[],
  options: {
    linkedAisleIds?: Set<string>
    frontmatterAisleIds?: Set<string>
    initialStagedDecoupleAisleIds?: string[]
    initialStagedRemoveFrontmatterAisleIds?: string[]
  } = {},
) {
  return renderToStaticMarkup(
    <AisleEditModal
      open
      aisles={aisles}
      linkedAisleIds={options.linkedAisleIds}
      frontmatterAisleIds={options.frontmatterAisleIds}
      initialStagedDecoupleAisleIds={options.initialStagedDecoupleAisleIds}
      initialStagedRemoveFrontmatterAisleIds={options.initialStagedRemoveFrontmatterAisleIds}
      getNotePreviewLabel={() => 'Vault / Folder / Note'}
      onCancel={() => undefined}
      onApply={() => undefined}
      onWarn={() => undefined}
    />,
  )
}

describe('AisleEditModal', () => {
  it('renders horizontal preview cards without visible aisle labels or count text', () => {
    const html = renderModal([
      aisle('a', '# First aisle\n\n- task'),
      aisle('b', 'Second aisle text'),
    ])

    expect(html).not.toContain('<h2')
    expect(html).not.toContain('>edit aisles<')
    expect(html).not.toContain('aisle-edit-card-title')
    expect(html).not.toContain('is-active')
    expect(html).not.toContain('active</span>')
    expect(html).not.toContain('2 / 8')
    expect(html).toContain('First aisle')
    expect(html).toContain('Second aisle text')
    expect(html).toContain('aisle-edit-horizontal-scrollbar')
    expect(html).toContain('role="scrollbar"')
    expect(html).toContain('aria-label="Scroll edit aisles horizontally"')
  })

  it('uses before and after drop-target classes for aisle drag placement', () => {
    const source = readFileSync(join(componentDir, 'AisleEditModal.tsx'), 'utf8')

    expect(source).toContain("type AisleDropTarget =")
    expect(source).toContain("position: 'before' | 'after'")
    expect(source).toContain('is-drop-target-${dropTarget.position}')
    expect(source).toContain('is-drop-neighbor-before')
    expect(source).toContain('is-drop-neighbor-after')
    expect(source).toContain('getPlacementNeighborId')
    expect(source).toContain('reorderAisleDraftByInsertion')
    expect(source).not.toContain('draggingAisleId === targetAisleId')
    expect(source).not.toContain('is-drop-target\'')
    expect(source).not.toContain('is-drop-target"')
  })

  it('uses the same contained horizontal layout for wide normal and scratchpad aisle sets', () => {
    const normalHtml = renderModal(Array.from({ length: MAX_NOTE_AISLES }, (_, index) => aisle(`normal-${index}`)))
    const scratchpadHtml = renderModal(Array.from({ length: 16 }, (_, index) => aisle(`scratchpad-${index}`)))

    for (const html of [normalHtml, scratchpadHtml]) {
      expect(html).toContain('aisle-edit-scroll-shell')
      expect(html).toContain('aisle-edit-list')
      expect(html).toContain('aisle-edit-horizontal-scrollbar')
      expect(html).toContain('aria-label="Scroll edit aisles horizontally"')
    }
  })

  it('hides delete when only one aisle remains', () => {
    const html = renderModal([aisle('a', '')])

    expect(html).toContain('empty aisle')
    expect(html).not.toContain('aria-label="Delete aisle 1"')
  })

  it('keeps add clickable at the max aisle count', () => {
    const html = renderModal(Array.from({ length: MAX_NOTE_AISLES }, (_, index) => aisle(`a${index}`)))

    expect(html).not.toContain(`${MAX_NOTE_AISLES} / ${MAX_NOTE_AISLES}`)
    expect(html).toContain('>add aisle</button>')
    expect(html).not.toContain('aisle-edit-add-btn')
    expect(html).not.toContain('>+</span>')
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>add aisle<\/button>/)
  })

  it('renders markdown images and icon-only delete controls without move buttons', () => {
    const html = renderModal([
      aisle('a', '![Diagram](data:image/png;base64,abc)'),
      aisle('b', 'text'),
    ])

    expect(html).toContain('<img')
    expect(html).toContain('alt="Diagram"')
    expect(html).toContain('draggable="false"')
    expect(html).toContain('data-app-icon="trash"')
    expect(html).toContain('app-icon-trash')
    expect(html).not.toContain('>up</button>')
    expect(html).not.toContain('>down</button>')
  })

  it('uses the shared aisle markdown preview renderer', () => {
    const source = readFileSync(join(componentDir, 'AisleEditModal.tsx'), 'utf8')

    expect(source).toContain('AisleMarkdownPreview')
    expect(source).not.toContain('ReactMarkdown')
    expect(source).not.toContain('getAislePreviewSegments')
  })

  it('renders editor-split data image previews without exposing raw markdown', () => {
    const html = renderModal([
      aisle('a', '<br> <br> ![Diagram]\n(data:image/png;base64,abc)'),
      aisle('b', 'text'),
    ])

    expect(html).toContain('<img')
    expect(html).toContain('alt="Diagram"')
    expect(html).not.toContain('![Diagram]')
    expect(html).not.toContain('&lt;br')
  })

  it('renders block indents in previews without exposing the storage marker', () => {
    const html = renderModal([aisle('a', `${BLOCK_INDENT_TOKEN.repeat(2)}indented`)])

    expect(html).toContain('style="--aislenote-block-indent-level:2"')
    expect(html).toContain('class="aislenote-rendered-markdown-paragraph aislenote-block-indent"')
    expect(html).toContain('indented')
    expect(html).not.toContain(BLOCK_INDENT_TOKEN)
  })

  it('renders tab-block storage wrappers as block indents without exposing wrapper tags', () => {
    const html = renderModal([aisle('a', [
      '<div tab-block="2">',
      '',
      'indented',
      '',
      '</div>',
    ].join('\n'))])

    expect(html).toContain('style="--aislenote-block-indent-level:2"')
    expect(html).toContain('class="aislenote-rendered-markdown-paragraph aislenote-block-indent"')
    expect(html).toContain('indented')
    expect(html).not.toContain('tab-block')
    expect(html).not.toContain('&lt;div')
  })

  it('renders note preview markdown without custom vault preview state in the edit modal', () => {
    const token = '![Child note](<Child note--123abc>)'
    const html = renderModal([aisle('a', `${token}\n\nregular text`)])

    expect(html).toContain('Child note')
    expect(html).toContain('regular text')
    expect(html).not.toContain('aisle-edit-context-preview')
  })

  it('renders linked aisles with top-right staging buttons instead of bottom status controls', () => {
    const html = renderModal([aisle('a', 'first'), aisle('b', 'plain')], {
      linkedAisleIds: new Set(['a']),
    })

    expect(html).toContain('aisle-edit-card-action-layer')
    expect(html.match(/note-aisle-action-btn note-aisle-link-btn/g) ?? []).toHaveLength(1)
    expect(html).toContain('Stage de-couple for aisle 1')
    expect(html).not.toContain('aisle-edit-status-badge')
    expect(html).not.toContain('>linked</span>')
    expect(html).not.toContain('>de-couple</button>')
    expect(html).not.toContain('will de-couple')
  })

  it('renders frontmatter aisles with a top-right fm staging button', () => {
    const html = renderModal([aisle('a', 'first'), aisle('b', 'plain')], {
      frontmatterAisleIds: new Set(['b']),
    })

    expect(html).toContain('aisle-edit-card-action-layer')
    expect(html.match(/note-aisle-action-btn note-aisle-frontmatter-btn/g) ?? []).toHaveLength(1)
    expect(html).toContain('Stage frontmatter removal for aisle 2')
    expect(html).toContain('frontmatter-toolbar-icon note-aisle-frontmatter-icon')
    expect(html).not.toContain('aisle-edit-status-badge')
  })

  it('shows staged de-couple through an unfocused top-right action and caution tape', () => {
    const html = renderModal([aisle('a', 'linked')], {
      linkedAisleIds: new Set(['a']),
      initialStagedDecoupleAisleIds: ['a'],
    })

    expect(html).toContain('is-staged-decouple')
    expect(html).toContain('is-staged-aisle-change')
    expect(html).toContain('is-staged-removal')
    expect(html).toContain('decouple-caution-stripe')
    expect(html).toContain('DE-COUPLED')
    expect(html).toContain('Undo de-couple for aisle 1')
    expect(html).not.toContain('will de-couple')
    expect(html).not.toContain('>undo</button>')
    expect(html).not.toContain('>de-couple</button>')
  })

  it('shows staged frontmatter removal and combined caution tape labels', () => {
    const fmOnlyHtml = renderModal([aisle('a', 'frontmatter')], {
      frontmatterAisleIds: new Set(['a']),
      initialStagedRemoveFrontmatterAisleIds: ['a'],
    })
    const combinedHtml = renderModal([aisle('a', 'linked fm')], {
      linkedAisleIds: new Set(['a']),
      frontmatterAisleIds: new Set(['a']),
      initialStagedDecoupleAisleIds: ['a'],
      initialStagedRemoveFrontmatterAisleIds: ['a'],
    })

    expect(fmOnlyHtml).toContain('is-staged-frontmatter-removal')
    expect(fmOnlyHtml).toContain('is-staged-aisle-change')
    expect(fmOnlyHtml).toContain('FM REMOVED')
    expect(fmOnlyHtml).toContain('Undo frontmatter removal for aisle 1')
    expect(combinedHtml).toContain('DE-COUPLED &amp; FM REMOVED')
  })
})
