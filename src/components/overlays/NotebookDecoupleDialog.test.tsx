import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NotebookDecoupleDialog } from './NotebookDecoupleDialog'

describe('NotebookDecoupleDialog', () => {
  it('renders vertical notebook-only decouple rows', () => {
    const html = renderToStaticMarkup(
      <NotebookDecoupleDialog
        title="De-couple aisle"
        description="This aisle currently shares content."
        rows={[
          {
            key: 'note-1:aisle-1',
            label: 'Work/Specs / aisle 1',
            noteId: 'note-1',
            noteBodyId: 'body-1',
            aisleId: 'aisle-1',
            aisleBodyId: 'aisle-body-1',
          },
        ]}
        onCancel={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(html).toContain('De-couple aisle')
    expect(html).toContain('Work/Specs / aisle 1')
    expect(html).toContain('aisle body aisle-body-1')
    expect(html).not.toContain('domain')
    expect(html).not.toContain('space')
  })
})
