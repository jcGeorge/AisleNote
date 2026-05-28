import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BLOCK_INDENT_TOKEN } from '../../markdown/markdown-utils'
import { MAX_NOTE_AISLES } from '../../state/workspace'
import type { ResolvedNoteAisle } from '../../types/app'
import { AisleEditModal } from './AisleEditModal'

const aisle = (id: string, markdown = id): ResolvedNoteAisle => ({ id, aisleBodyId: id, markdown })
const componentDir = dirname(fileURLToPath(import.meta.url))

function renderModal(
  aisles: ResolvedNoteAisle[],
  options: { linkedAisleIds?: Set<string>; initialStagedDecoupleAisleIds?: string[] } = {},
) {
  return renderToStaticMarkup(
    <AisleEditModal
      open
      aisles={aisles}
      linkedAisleIds={options.linkedAisleIds}
      initialStagedDecoupleAisleIds={options.initialStagedDecoupleAisleIds}
      getNotePreviewLabel={() => 'Domain / Space / Parent / Child'}
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
    expect(html).toContain('class="aisle-edit-delete-icon"')
    expect(html).not.toContain('>up</button>')
    expect(html).not.toContain('>down</button>')
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
    const html = renderModal([aisle('a', `${BLOCK_INDENT_TOKEN}indented`)])

    expect(html).toContain('class="tabs-block-indent"')
    expect(html).toContain('indented')
    expect(html).not.toContain(BLOCK_INDENT_TOKEN)
  })

  it('renders note preview tokens as compact placeholders instead of raw storage tokens', () => {
    const token = '![[Child note--123abc]]'
    const html = renderModal([aisle('a', `${token}\n\nregular text`)])

    expect(html).toContain('aisle-edit-context-preview')
    expect(html).toContain('note preview')
    expect(html).toContain('Child note')
    expect(html).toContain('regular text')
    expect(html).not.toContain('![[Child note--123abc]]')
  })

  it('shows linked status and de-couple only for linked aisle cards', () => {
    const html = renderModal([aisle('a', 'first'), aisle('b', 'plain')], {
      linkedAisleIds: new Set(['a']),
    })

    expect(html).toContain('aisle-edit-status-badge">linked')
    expect(html).toContain('de-couple')
    expect(html).not.toContain('will de-couple')
  })

  it('shows staged de-couple status and undo for staged aisle cards', () => {
    const html = renderModal([aisle('a', 'linked')], {
      linkedAisleIds: new Set(['a']),
      initialStagedDecoupleAisleIds: ['a'],
    })

    expect(html).toContain('will de-couple')
    expect(html).toContain('undo')
    expect(html).not.toContain('>de-couple</button>')
  })
})
