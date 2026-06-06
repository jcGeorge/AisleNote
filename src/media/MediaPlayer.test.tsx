import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MediaPlayer } from './MediaPlayer'

function renderMediaPlayer(kind: 'audio' | 'video') {
  return renderToStaticMarkup(
    <MediaPlayer
      src={kind === 'audio' ? 'tabs-asset:///assets/song.mp3' : 'tabs-asset:///assets/clip.mp4'}
      kind={kind}
      label={kind === 'audio' ? 'Song Title' : 'Clip Title'}
    />,
  )
}

function expectSharedMediaControls(html: string, title: string) {
  expect(html.indexOf('class="tabs-media-title"')).toBeLessThan(html.indexOf('tabs-media-play-btn'))
  expect(html).toContain(`>${title}</span>`)
  expect(html).toContain('aria-label="Play"')
  expect(html).toContain('aria-label="Loop off"')
  expect(html).toContain('aria-pressed="false"')
  expect(html).toContain('aria-label="Playback speed 1x"')
  expect(html).toContain('tabs-media-speed-btn')
  expect(html).toContain('popover="manual"')
  expect(html).toContain('>.25x</button>')
  expect(html).toContain('>.50x</button>')
  expect(html).toContain('>1x</button>')
  expect(html).toContain('>1.50x</button>')
  expect(html).toContain('>2x</button>')
  expect(html).toContain('>3x</button>')
  expect(html).toContain('aria-label="Volume 100%"')
  expect(html).toContain('tabs-media-icon tabs-media-icon-volume-full')
  expect(html).toContain('tabs-media-volume-slider')
  expect(html).toContain('max="150"')
  expect(html).toContain('aria-label="Back 10 seconds"')
  expect(html).toContain('aria-label="Forward 10 seconds"')
  expect(html).toContain('tabs-media-icon tabs-media-icon-play')
  expect(html).toContain('app-icon-play')
  expect(html).toContain('data-app-icon="play"')
  expect(html).toContain('tabs-media-icon tabs-media-icon-loop')
  expect(html).toContain('tabs-media-back-btn editor-history-toolbar-btn editor-history-toolbar-btn-undo')
  expect(html).toContain('tabs-media-forward-btn editor-history-toolbar-btn editor-history-toolbar-btn-redo')
  expect(html.match(/editor-history-toolbar-icon/g)).toHaveLength(2)
  expect(html).toContain('editor-history-toolbar-arc')
  expect(html).toContain('editor-history-toolbar-head')
  expect(html).not.toContain('>Play</button>')
  expect(html).not.toContain('>Loop</button>')
  expect(html).not.toContain('>-10</button>')
  expect(html).not.toContain('>+10</button>')
  expect(html).not.toContain('>100%</button>')
}

describe('MediaPlayer', () => {
  it('renders audio controls with a centered title row and icon-only buttons', () => {
    const html = renderMediaPlayer('audio')

    expect(html).toContain('data-media-kind="audio"')
    expectSharedMediaControls(html, 'Song Title')
  })

  it('renders video controls with the same centered title row and icon-only buttons', () => {
    const html = renderMediaPlayer('video')

    expect(html).toContain('data-media-kind="video"')
    expect(html).toContain('tabs-media-viewport')
    expectSharedMediaControls(html, 'Clip Title')
  })

  it('initializes preview controls from playback metadata without requiring persistence props', () => {
    const html = renderToStaticMarkup(
      <MediaPlayer
        src="tabs-asset:///assets/song.mp3#tabs-media=speed=1.5,volume=125"
        kind="audio"
        label="Metadata Song"
      />,
    )

    expect(html).toContain('aria-label="Playback speed 1.50x"')
    expect(html).toContain('>1.50x</button>')
    expect(html).toContain('aria-label="Volume 125%"')
    expect(html).toContain('tabs-media-icon tabs-media-icon-volume-full')
    expect(html).toContain('value="125"')
    expect(html).not.toContain('>125%</button>')
  })

  it('uses medium and muted volume icons without visible percentage text', () => {
    const medium = renderToStaticMarkup(
      <MediaPlayer src="tabs-asset:///assets/song.mp3#tabs-media=volume=50" kind="audio" label="Medium" />,
    )
    const muted = renderToStaticMarkup(
      <MediaPlayer src="tabs-asset:///assets/song.mp3#tabs-media=volume=0" kind="audio" label="Muted" />,
    )

    expect(medium).toContain('aria-label="Volume 50%"')
    expect(medium).toContain('tabs-media-icon tabs-media-icon-volume-medium')
    expect(medium).not.toContain('>50%</button>')
    expect(muted).toContain('aria-label="Volume 0%"')
    expect(muted).toContain('tabs-media-icon tabs-media-icon-volume-muted')
    expect(muted).not.toContain('>0%</button>')
  })

  it('hides media file extensions from visible player titles', () => {
    const audio = renderToStaticMarkup(
      <MediaPlayer src="tabs-asset:///assets/song.mp3" kind="audio" label="Miho Komatsu - Mystery.mp3" />,
    )
    const video = renderToStaticMarkup(
      <MediaPlayer src="tabs-asset:///assets/clip.webm" kind="video" label="Creed - One Last Breath.MP4" />,
    )

    expect(audio).toContain('>Miho Komatsu - Mystery</span>')
    expect(audio).not.toContain('>Miho Komatsu - Mystery.mp3</span>')
    expect(video).toContain('>Creed - One Last Breath</span>')
    expect(video).not.toContain('>Creed - One Last Breath.MP4</span>')
  })

  it('styles shared media layout and active loop state explicitly', () => {
    const css = readFileSync(new URL('../styles/editor-content.css', import.meta.url), 'utf8')

    expect(css).toContain('.tabs-media-controls')
    expect(css).toContain('container: tabs-media-player / inline-size;')
    expect(css).toContain("'play loop speed volume current slider duration back forward'")
    expect(css).toContain('@container tabs-media-player (max-width: 34rem)')
    expect(css).toContain('minmax(2.75rem, 1fr)')
    expect(css).toContain('width: 1.8rem;')
    expect(css).toContain('width: 1.95rem;')
    expect(css).toContain('@container tabs-media-player (max-width: 24rem)')
    expect(css).toContain("'current slider slider slider slider slider slider duration'")
    expect(css).toContain("'play loop speed volume . . back forward'")
    expect(css).toContain('@container tabs-media-player (max-width: 20rem)')
    expect(css).toContain("'current slider slider slider slider duration'")
    expect(css).toContain("'play loop speed volume back forward'")
    expect(css).toContain('@container tabs-media-player (max-width: 12rem)')
    expect(css).toContain("'slider slider slider slider slider slider'")
    expect(css).toContain('user-select: text;')
    expect(css).toContain('-webkit-user-select: text;')
    expect(css).toContain('display: none;')
    expect(css).toContain('height: 1.55rem;')
    expect(css).toContain('height: 1.45rem;')
    expect(css).toContain('width: 0.88rem;')
    expect(css).toContain('.tabs-media-volume-popup')
    expect(css).toContain("bottom: calc(100% + 0.3rem);")
    expect(css).toContain('z-index: 3300;')
    expect(css).toContain('transform: translateX(-50%);')
    expect(css).toContain(".toastui-editor .ProseMirror .tabs-media-player[data-media-kind='audio']")
    expect(css).toContain(".aisle-edit-preview .tabs-media-player[data-media-kind='audio'] {\n  overflow: visible;")
    expect(css).toContain(".tabs-media-player[data-media-kind='audio'] .tabs-media-speed-menu")
    expect(css).toContain(".tabs-media-player[data-media-kind='audio'] .tabs-media-volume-popup")
    expect(css).toContain('top: auto;')
    expect(css).toContain('left: 0;')
    expect(css).toContain(
      '.toastui-editor .ProseMirror .tabs-media-player .tabs-media-speed-menu',
    )
    expect(css).toContain(
      'background-color: color-mix(in srgb, var(--editor-bg) 96%, var(--editor-link-text)) !important;',
    )
    expect(css).toContain('background: var(--image-tool-btn-bg) !important;')
    expect(css).toContain('background: var(--image-tool-btn-hover-bg) !important;')
    expect(css).toContain('transform: rotate(-90deg);')
    expect(css).toContain('.tabs-media-player:focus')
    expect(css).toContain('.tabs-media-player .tabs-media-video:focus-visible')
    expect(css).toContain('.tabs-media-player .tabs-media-slider:focus')
    expect(css).toContain('.tabs-media-player .tabs-media-volume-slider:focus-visible')
    expect(css).toContain('outline: none !important;')
    expect(css).toContain('box-shadow: none !important;')
    expect(css).toContain('.tabs-media-player .tabs-media-slider::-moz-focus-outer')
    expect(css).not.toContain('.tabs-media-btn:hover,\n.tabs-media-btn:focus-visible')
    expect(css).not.toContain('.tabs-media-speed-option:hover,\n.tabs-media-speed-option:focus-visible')
    expect(css).toContain(".tabs-media-loop-btn[aria-pressed='true']")
    expect(css).toContain('border-radius: calc(0.42rem * var(--tab-button-scale, 1));')
    expect(css).toContain('background: var(--image-tool-btn-bg) !important;')
    expect(css).toContain('box-shadow: inset 0 0 0 1px var(--editor-link-text)')
    expect(css).not.toContain(".tabs-media-player[data-media-kind='audio'] .tabs-media-controls")
    expect(css).not.toContain(
      'background: color-mix(in srgb, var(--image-tool-btn-hover-bg) 72%, var(--editor-link-text))',
    )
  })
})
