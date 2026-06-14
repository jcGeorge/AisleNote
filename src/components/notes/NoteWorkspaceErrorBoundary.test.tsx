import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  NoteWorkspaceErrorBoundary,
  NoteWorkspaceRecoveryFallback,
  type NoteWorkspaceRecoveryDetails,
} from './NoteWorkspaceErrorBoundary'

const recoveryDetails: NoteWorkspaceRecoveryDetails = {
  noteBodyId: 'note-body-1',
  activeAisleId: 'aisle-1',
  location: {
    domainId: 'domain-1',
    spaceId: 'space-1',
    tabId: 'tab-1',
    subTabId: null,
  },
  scratchpadActive: false,
}

describe('NoteWorkspaceErrorBoundary', () => {
  it('derives fallback state from render errors', () => {
    const error = new Error('render failed')

    expect(NoteWorkspaceErrorBoundary.getDerivedStateFromError(error)).toEqual({ error })
  })

  it('renders the recovery fallback without rendering note content', () => {
    const html = renderToStaticMarkup(
      <NoteWorkspaceRecoveryFallback
        message="This note editor could not be opened."
        details={recoveryDetails}
        onRecover={vi.fn()}
      />,
    )

    expect(html).toContain('This note editor could not be opened.')
    expect(html).toContain('note-body-1')
    expect(html).toContain('open safe note')
  })
})
