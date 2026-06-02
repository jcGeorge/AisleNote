import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TagFilterControl } from './TagFilterControl'

const tags = [
  { key: 'alpha', label: 'Alpha', count: 4 },
  { key: 'beta', label: 'beta', count: 12 },
]

const noop = () => undefined

describe('TagFilterControl', () => {
  it('renders the open tag menu with selected tags and sort state', () => {
    const html = renderToStaticMarkup(
      <TagFilterControl
        open
        tags={tags}
        selectedTagKeys={['beta']}
        sortMode="occurrences"
        onToggleOpen={noop}
        onClose={noop}
        onSelectAll={noop}
        onDeselectAll={noop}
        onToggleTag={noop}
        onSortModeChange={noop}
      />,
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('select all')
    expect(html).toContain('deselect all')
    expect(html).toContain('A-Z')
    expect(html).toContain('occurrences')
    expect(html).toContain('aria-pressed="true"')
    expect(html).toContain('title="4 occurrences"')
    expect(html).toContain('title="12 occurrences"')
    expect(html).toContain('#Alpha')
    expect(html).toContain('#beta')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('tag-filter-tag-btn tabs-tag-token is-selected')
  })

  it('keeps the dropdown hidden when closed', () => {
    const html = renderToStaticMarkup(
      <TagFilterControl
        open={false}
        tags={tags}
        selectedTagKeys={[]}
        sortMode="az"
        onToggleOpen={vi.fn()}
        onClose={vi.fn()}
        onSelectAll={vi.fn()}
        onDeselectAll={vi.fn()}
        onToggleTag={vi.fn()}
        onSortModeChange={vi.fn()}
      />,
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('tag-filter-dropdown')
  })
})
