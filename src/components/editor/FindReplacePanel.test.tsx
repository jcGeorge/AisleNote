import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { FindReplaceMatch } from '../../notes/find-replace'
import { FindReplacePanel } from './FindReplacePanel'

function match(
  id: string,
  context: FindReplaceMatch['context'],
  snippet = 'matching text',
  aisleInfo: Partial<Pick<FindReplaceMatch, 'aisleIndex' | 'aisleNumber' | 'aisleCount'>> = {},
): FindReplaceMatch {
  return {
    id,
    location: { noteId: context.noteId },
    label: context.folderPath ? `${context.folderPath} / ${context.noteName}` : context.noteName,
    context,
    noteBodyId: `body-${id}`,
    aisleId: `aisle-${id}`,
    aisleIndex: aisleInfo.aisleIndex ?? 0,
    aisleNumber: aisleInfo.aisleNumber ?? 1,
    aisleCount: aisleInfo.aisleCount ?? 1,
    aisleBodyId: `aisle-body-${id}`,
    markdownFrom: 0,
    markdownTo: 5,
    visibleFrom: 0,
    visibleTo: 5,
    snippet,
    matchedText: 'match',
  }
}

const SCRATCHPAD_CONTEXT: FindReplaceMatch['context'] = {
  folderId: null,
  folderName: '',
  folderPath: '',
  noteId: 'scratchpad',
  noteName: 'scratchpad',
  noteKind: 'scratchpad',
}

function renderPanel(overrides: Partial<Parameters<typeof FindReplacePanel>[0]> = {}) {
  const noop = vi.fn()
  return renderToStaticMarkup(
    <FindReplacePanel
      replaceMode={false}
      focusRequestId={0}
      query="bear"
      replacement="cat"
      scope="note"
      caseSensitive={false}
      wholeWord={false}
      regex={false}
      queryError={null}
      matches={[]}
      activeIndex={0}
      onReplaceModeChange={noop}
      onQueryChange={noop}
      onReplacementChange={noop}
      onScopeChange={noop}
      onCaseSensitiveChange={noop}
      onWholeWordChange={noop}
      onRegexChange={noop}
      onPrevious={noop}
      onNext={noop}
      onSelectMatch={noop}
      onReplaceCurrent={noop}
      onReplaceAll={noop}
      onClose={noop}
      {...overrides}
    />,
  )
}

describe('FindReplacePanel', () => {
  it('renders find-only mode with notebook scopes and regex option', () => {
    const html = renderPanel()

    expect(html).toContain('aria-label="Find"')
    expect(html).toContain('and replace')
    expect(html).not.toContain('<span>replace</span>')
    expect(html).toContain('search for results within this:')
    expect(html).toContain('>note</button>')
    expect(html).toContain('>folder</button>')
    expect(html).toContain('>notebook</button>')
    expect(html).toContain('>regex</span>')
  })

  it('renders replace controls only when replace mode is enabled', () => {
    const html = renderPanel({ replaceMode: true })

    expect(html).toContain('aria-label="Find and replace"')
    expect(html).toContain('<span>replace</span>')
    expect(html).toContain('>replace</button>')
    expect(html).toContain('>replace all</button>')
  })

  it('groups normal results by folder and renders note chips', () => {
    const html = renderPanel({
      matches: [
        match('one', {
          folderId: 'folder-a',
          folderName: 'Folder A',
          folderPath: 'Notebook / Folder A',
          noteId: 'note-a',
          noteName: 'Note A',
          noteKind: 'note',
        }),
      ],
    })

    expect(html).toContain('find-replace-context-chip is-folder')
    expect(html).toContain('>Notebook / Folder A</span>')
    expect(html).toContain('find-replace-context-chip is-note')
    expect(html).toContain('>Note A</span>')
  })

  it('renders scratchpad results without folder headers', () => {
    const html = renderPanel({
      matches: [match('scratch', SCRATCHPAD_CONTEXT)],
    })

    expect(html).toContain('find-replace-context-chip is-scratchpad')
    expect(html).toContain('>scratchpad</span>')
    expect(html).not.toContain('is-folder')
    expect(html).not.toContain('find-replace-result-separator')
  })

  it('separates scratchpad results from normal notebook results', () => {
    const html = renderPanel({
      matches: [
        match('normal', {
          folderId: 'folder-a',
          folderName: 'Folder A',
          folderPath: 'Notebook / Folder A',
          noteId: 'note-a',
          noteName: 'Note A',
          noteKind: 'note',
        }),
        match('scratch', SCRATCHPAD_CONTEXT),
      ],
    })

    expect(html).toContain('find-replace-result-separator')
    expect(html).toContain('>Notebook / Folder A</span>')
    expect(html).toContain('>scratchpad</span>')
  })

  it('keeps scratchpad results after normal results regardless of incoming match order', () => {
    const html = renderPanel({
      matches: [
        match('scratch', SCRATCHPAD_CONTEXT, 'scratch match'),
        match(
          'normal',
          {
            folderId: 'folder-a',
            folderName: 'Folder A',
            folderPath: 'Notebook / Folder A',
            noteId: 'note-a',
            noteName: 'Note A',
            noteKind: 'note',
          },
          'normal match',
        ),
      ],
    })

    expect(html.indexOf('normal match')).toBeLessThan(html.indexOf('scratch match'))
    expect(html.indexOf('find-replace-result-separator')).toBeGreaterThan(html.indexOf('normal match'))
    expect(html.indexOf('find-replace-result-separator')).toBeLessThan(html.indexOf('scratch match'))
  })

  it('shows aisle numbers only for multi-aisle match rows', () => {
    const html = renderPanel({
      matches: [
        match('single', SCRATCHPAD_CONTEXT),
        match('multi', { ...SCRATCHPAD_CONTEXT, noteName: 'scratchpad' }, 'multi match', {
          aisleIndex: 1,
          aisleNumber: 2,
          aisleCount: 3,
        }),
      ],
    })

    expect(html).toContain('>2</span>')
    expect(html).not.toContain('>1</span>')
    expect(html).not.toContain('>aisle 2</span>')
  })

  it('shows an inline invalid regex state', () => {
    const html = renderPanel({ regex: true, queryError: 'invalid regex' })

    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('find-replace-error')
    expect(html).toContain('invalid regex')
  })
})
