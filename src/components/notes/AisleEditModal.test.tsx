import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MAX_NOTE_AISLES } from '../../state/workspace'
import type { NoteAisle } from '../../types/app'
import { AisleEditModal } from './AisleEditModal'

const aisle = (id: string, markdown = id): NoteAisle => ({ id, markdown })

function renderModal(aisles: NoteAisle[]) {
  return renderToStaticMarkup(
    <AisleEditModal
      open
      aisles={aisles}
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
})
