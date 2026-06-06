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
    expect(html).toContain('media')
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

  it('renders media filter rows with image previews and text-only audio/video options', () => {
    const html = renderToStaticMarkup(
      <NoteFilterControl
        open
        kind="media"
        options={[
          {
            key: 'media:image:tabs-asset:///assets/photo.png',
            label: 'Hero',
            count: 2,
            type: 'media-image',
            mediaKind: 'image',
            source: 'tabs-asset:///assets/photo.png',
            previewUrl: 'tabs-asset:///assets/photo.png',
          },
          {
            key: 'media:audio:tabs-asset:///assets/song.mp3',
            label: 'Theme Song',
            count: 1,
            type: 'media-audio',
            mediaKind: 'audio',
            source: 'tabs-asset:///assets/song.mp3',
          },
          {
            key: 'media:video:https://cdn.example.com/clip.mp4',
            label: 'Clip',
            count: 3,
            type: 'media-video',
            mediaKind: 'video',
            source: 'https://cdn.example.com/clip.mp4',
          },
        ]}
        selectedKeys={['media:image:tabs-asset:///assets/photo.png']}
        sortMode="az"
        onToggleOpen={noop}
        onClose={noop}
        onKindChange={noop}
        onClear={noop}
        onToggleOption={noop}
        onSortModeChange={noop}
      />,
    )

    expect(html).toContain('media filter')
    expect(html).toContain('note-filter-media-grid')
    expect(html).toContain('<img src="tabs-asset:///assets/photo.png"')
    expect(html).toContain('Hero')
    expect(html).toContain('2 matches')
    expect(html).toContain('audio')
    expect(html).toContain('Theme Song')
    expect(html).toContain('1 match')
    expect(html).toContain('video')
    expect(html).toContain('Clip')
    expect(html).toContain('3 matches')
    expect(html).not.toContain('<audio')
    expect(html).not.toContain('<video')
  })
})
