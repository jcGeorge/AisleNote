import { describe, expect, it, vi } from 'vitest'
import { readClipboardMarkdown, type ClipboardItemLike } from './clipboard-paste-markdown'

function clipboardItem(values: Record<string, Blob | string>): ClipboardItemLike {
  return {
    types: Object.keys(values),
    getType: vi.fn(async (type: string) => {
      const value = values[type]
      if (value instanceof Blob) return value
      return new Blob([value ?? ''], { type })
    }),
  }
}

describe('clipboard markdown paste helpers', () => {
  it('prefers rich HTML clipboard content for rich paste', async () => {
    const convertHtmlToMarkdown = vi.fn(async (html: string) => `converted html: ${html}`)
    const convertPlainTextToMarkdown = vi.fn(async (text: string) => `converted text: ${text}`)

    const result = await readClipboardMarkdown({
      mode: 'rich',
      clipboard: {
        read: async () => [
          clipboardItem({
            'text/html': '<p><strong>Hello</strong></p>',
            'text/plain': 'Hello',
          }),
        ],
      },
      convertHtmlToMarkdown,
      convertPlainTextToMarkdown,
    })

    expect(result).toEqual({
      ok: true,
      markdown: 'converted html: <p><strong>Hello</strong></p>',
      source: 'html',
    })
    expect(convertHtmlToMarkdown).toHaveBeenCalledWith('<p><strong>Hello</strong></p>')
    expect(convertPlainTextToMarkdown).not.toHaveBeenCalled()
  })

  it('falls back to text/plain for rich paste when HTML is missing', async () => {
    const result = await readClipboardMarkdown({
      mode: 'rich',
      clipboard: {
        read: async () => [clipboardItem({ 'text/plain': '*literal*' })],
      },
      convertPlainTextToMarkdown: async (text: string) => `plain: ${text}`,
    })

    expect(result).toEqual({
      ok: true,
      markdown: 'plain: *literal*',
      source: 'plain-text',
      text: '*literal*',
    })
  })

  it('uses the plain text insertion conversion path for paste as plain text', async () => {
    const convertPlainTextToMarkdown = vi.fn(async (text: string) => `literal markdown: ${text}`)

    const result = await readClipboardMarkdown({
      mode: 'plainText',
      clipboard: {
        readText: async () => '**not bold**',
      },
      convertPlainTextToMarkdown,
    })

    expect(result).toEqual({
      ok: true,
      markdown: 'literal markdown: **not bold**',
      source: 'plain-text',
      text: '**not bold**',
    })
    expect(convertPlainTextToMarkdown).toHaveBeenCalledWith('**not bold**')
  })

  it('imports image-only clipboard items as image markdown', async () => {
    const importImageBlobAsAssetUrl = vi.fn(async () => 'tabs-image-asset:///assets/image.png')

    const result = await readClipboardMarkdown({
      mode: 'rich',
      clipboard: {
        read: async () => [
          clipboardItem({
            'image/png': new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
          }),
        ],
      },
      importImageBlobAsAssetUrl,
    })

    expect(result).toEqual({
      ok: true,
      markdown: '![clipboard-image.png](tabs-image-asset:///assets/image.png)',
      source: 'image',
    })
    expect(importImageBlobAsAssetUrl).toHaveBeenCalledWith(expect.any(Blob), 'clipboard-image.png')
  })

  it('imports media-only clipboard items as media links', async () => {
    const importBlobAsAssetUrl = vi.fn(async (_blob: Blob, fileName?: string) => `tabs-asset:///assets/${fileName}`)

    const result = await readClipboardMarkdown({
      mode: 'rich',
      clipboard: {
        read: async () => [
          clipboardItem({
            'audio/mpeg': new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }),
            'video/webm': new Blob([new Uint8Array([4, 5, 6])], { type: 'video/webm' }),
          }),
        ],
      },
      importBlobAsAssetUrl,
    })

    expect(result).toEqual({
      ok: true,
      markdown:
        '[clipboard-audio.mp3](tabs-asset:///assets/clipboard-audio.mp3)\n\n[clipboard-video-2.webm](tabs-asset:///assets/clipboard-video-2.webm)',
      source: 'media',
    })
    expect(importBlobAsAssetUrl).toHaveBeenCalledWith(expect.any(Blob), 'clipboard-audio.mp3')
    expect(importBlobAsAssetUrl).toHaveBeenCalledWith(expect.any(Blob), 'clipboard-video-2.webm')
  })

  it('keeps image clipboard items on the image import path before media', async () => {
    const importImageBlobAsAssetUrl = vi.fn(async () => 'tabs-asset:///assets/image.png')
    const importBlobAsAssetUrl = vi.fn(async () => 'tabs-asset:///assets/song.mp3')

    const result = await readClipboardMarkdown({
      mode: 'rich',
      clipboard: {
        read: async () => [
          clipboardItem({
            'image/png': new Blob([new Uint8Array([1])], { type: 'image/png' }),
            'audio/mpeg': new Blob([new Uint8Array([2])], { type: 'audio/mpeg' }),
          }),
        ],
      },
      importImageBlobAsAssetUrl,
      importBlobAsAssetUrl,
    })

    expect(result).toEqual({
      ok: true,
      markdown: '![clipboard-image.png](tabs-asset:///assets/image.png)',
      source: 'image',
    })
    expect(importImageBlobAsAssetUrl).toHaveBeenCalled()
    expect(importBlobAsAssetUrl).not.toHaveBeenCalled()
  })

  it('does not produce markdown for empty clipboard text', async () => {
    await expect(
      readClipboardMarkdown({
        mode: 'plainText',
        clipboard: {
          readText: async () => '',
        },
      }),
    ).resolves.toEqual({ ok: false, reason: 'empty' })
  })

  it('reports unavailable clipboard reads', async () => {
    await expect(readClipboardMarkdown({ mode: 'rich', clipboard: null })).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    })
    await expect(
      readClipboardMarkdown({
        mode: 'rich',
        clipboard: {
          read: async () => {
            throw new Error('blocked')
          },
          readText: async () => {
            throw new Error('blocked')
          },
        },
      }),
    ).resolves.toEqual({ ok: false, reason: 'unavailable' })
  })
})
