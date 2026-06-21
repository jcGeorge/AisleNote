import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NotebookDecoupleDialog } from './NotebookDecoupleDialog'

describe('NotebookDecoupleDialog', () => {
  it('renders vertical notebook-only decouple rows without a default selection', () => {
    const html = renderToStaticMarkup(
      <NotebookDecoupleDialog
        title="De-couple aisle"
        description="This aisle currently shares content."
        rows={[
          {
            key: 'note-1:aisle-1',
            label: 'Work/Specs / aisle 1',
            primaryLabel: 'Work',
            secondaryLabel: 'Specs / aisle 1',
            noteId: 'note-1',
            noteBodyId: 'body-1',
            aisleId: 'aisle-1',
            aisleBodyId: 'aisle-body-1',
          },
        ]}
        keepKeys={['note-1:aisle-1']}
        currentKey="note-1:aisle-1"
        keepData
        keepDataLabel="keep text in de-coupled aisles?"
        onCancel={vi.fn()}
        onToggleKeepKey={vi.fn()}
        onKeepDataChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(html).toContain('De-couple aisle')
    expect(html).toContain('Work')
    expect(html).toContain('Specs / aisle 1')
    expect(html).not.toContain('will de-couple')
    expect(html).not.toContain('will stay synced')
    expect(html).not.toContain('decouple-caution-stripe')
    expect(html).toContain('is-keep-synced')
    expect(html).toContain('is-current')
    expect(html).toContain('keep text in de-coupled aisles?')
    expect(html).toContain('checked=""')
    expect(html).not.toContain('aisle body aisle-body-1')
    expect(html).toContain('Apply')
    expect(html).not.toContain('domain')
    expect(html).not.toContain('space')
  })

  it('renders selected rows with the decouple caution stripe and validation errors', () => {
    const html = renderToStaticMarkup(
      <NotebookDecoupleDialog
        title="De-couple note"
        description="Choose notes."
        rows={[
          {
            key: 'note-1',
            label: 'Active',
            primaryLabel: 'Notebook',
            secondaryLabel: 'Active',
            noteId: 'note-1',
            noteBodyId: 'body-1',
          },
          {
            key: 'note-2',
            label: 'Linked',
            primaryLabel: 'Work',
            secondaryLabel: 'Linked',
            noteId: 'note-2',
            noteBodyId: 'body-1',
          },
        ]}
        keepKeys={['note-2']}
        currentKey="note-1"
        keepData={false}
        error="Select at least one note to retain the information."
        onCancel={vi.fn()}
        onToggleKeepKey={vi.fn()}
        onKeepDataChange={vi.fn()}
        onApply={vi.fn()}
      />,
    )

    expect(html).toContain('Active')
    expect(html).toContain('is-will-decouple')
    expect(html).toContain('decouple-caution-stripe')
    expect(html).toContain('DE-COUPLED')
    expect(html).toContain('Linked')
    expect(html).toContain('is-keep-synced')
    expect(html).not.toContain('will de-couple')
    expect(html).not.toContain('will stay synced')
    expect(html).toContain('Select at least one note to retain the information.')
    expect(html).not.toContain('checked=""')
  })
})
