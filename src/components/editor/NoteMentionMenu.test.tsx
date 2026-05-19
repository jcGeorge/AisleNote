import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NoteMentionMenu } from './NoteMentionMenu'

describe('NoteMentionMenu', () => {
  it('renders full breadcrumb search results', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        type="search"
        top={10}
        left={12}
        activeIndex={0}
        entries={[
          {
            domainId: 'domain',
            spaceId: 'space',
            tabId: 'tab',
            subTabId: 'sub',
            noteBodyId: 'body',
            domainName: 'Domain',
            spaceName: 'Space',
            parentName: 'Parent',
            noteName: 'Sub',
            label: 'Domain > Space > Parent > Sub',
            searchText: 'domain space parent sub',
          },
        ]}
        onHighlight={vi.fn()}
        onChoose={vi.fn()}
      />,
    )

    expect(html).toContain('Domain &gt; Space &gt; Parent &gt; Sub')
    expect(html).toContain('aria-label="Note search"')
  })

  it('renders link and preview action choices', () => {
    const html = renderToStaticMarkup(
      <NoteMentionMenu
        type="action"
        top={10}
        left={12}
        activeIndex={1}
        onHighlight={vi.fn()}
        onChoose={vi.fn()}
      />,
    )

    expect(html).toContain('>link</span>')
    expect(html).toContain('>preview</span>')
    expect(html).toContain('aria-current="true"')
  })
})
