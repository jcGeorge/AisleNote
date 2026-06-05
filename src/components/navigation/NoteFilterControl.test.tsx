import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NoteFilterControl } from './NoteFilterControl'

const noop = () => undefined

describe('NoteFilterControl', () => {
  it('renders the open tag filter menu with mode choices and clear action', () => {
    const html = renderToStaticMarkup(
      <NoteFilterControl
        open
        kind="tags"
        options={[
          { key: 'alpha', label: 'Alpha', count: 4, type: 'tag' },
          { key: 'beta', label: 'beta', count: 12, type: 'tag' },
        ]}
        selectedKeys={['beta']}
        sortMode="occurrences"
        onToggleOpen={noop}
        onClose={noop}
        onKindChange={noop}
        onClear={noop}
        onToggleOption={noop}
        onSortModeChange={noop}
      />,
    )

    expect(html).toContain('tag filter')
    expect(html).toContain('tags')
    expect(html).toContain('synced copies')
    expect(html).toContain('frontmatter')
    expect(html).toContain('clear filter')
    expect(html).toContain('A-Z')
    expect(html).toContain('occurrences')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('data-app-tooltip="4 matches"')
    expect(html).toContain('#Alpha')
    expect(html).toContain('#beta')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('note-filter-option-btn tabs-tag-token is-selected')
  })

  it('uses synced and frontmatter button labels', () => {
    const syncedHtml = renderToStaticMarkup(
      <NoteFilterControl
        open={false}
        kind="synced"
        options={[]}
        selectedKeys={[]}
        sortMode="az"
        onToggleOpen={vi.fn()}
        onClose={vi.fn()}
        onKindChange={vi.fn()}
        onClear={vi.fn()}
        onToggleOption={vi.fn()}
        onSortModeChange={vi.fn()}
      />,
    )
    const frontmatterHtml = renderToStaticMarkup(
      <NoteFilterControl
        open={false}
        kind="frontmatter"
        options={[]}
        selectedKeys={[]}
        sortMode="az"
        onToggleOpen={vi.fn()}
        onClose={vi.fn()}
        onKindChange={vi.fn()}
        onClear={vi.fn()}
        onToggleOption={vi.fn()}
        onSortModeChange={vi.fn()}
      />,
    )

    expect(syncedHtml).toContain('synced filter')
    expect(frontmatterHtml).toContain('fm filter')
    expect(syncedHtml).not.toContain('note-filter-dropdown')
  })
})
