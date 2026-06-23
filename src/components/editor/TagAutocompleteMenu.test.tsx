import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { TagAutocompleteMenu } from './TagAutocompleteMenu'

describe('TagAutocompleteMenu', () => {
  it('renders selectable tag suggestions with the active row state', () => {
    const html = renderToStaticMarkup(
      <TagAutocompleteMenu
        top={10}
        left={12}
        suggestions={[
          { key: 'asdf', label: 'asdf', count: 4 },
          { key: 'nested/tag', label: 'Nested/Tag', count: 1 },
        ]}
        activeIndex={1}
        onHighlight={vi.fn()}
        onChoose={vi.fn()}
      />,
    )

    expect(html).toContain('class="tag-autocomplete-menu"')
    expect(html).toContain('role="listbox"')
    expect(html).toContain('aria-label="Tag suggestions"')
    expect(html).toContain('class="tag-autocomplete-item"')
    expect(html).toContain('class="tag-autocomplete-item is-active"')
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('class="tag-autocomplete-token tabs-tag-token"')
    expect(html).toContain('#asdf')
    expect(html).toContain('#Nested/Tag')
  })
})
