import { describe, expect, it } from 'vitest'
import type { Editor } from '@toast-ui/editor'
import {
  getMdxMarkdownInsertionForCommand,
  isMdxMarkdownEditor,
  type MdxMarkdownEditorHandle,
} from './mdx-markdown-editor'

describe('MDXEditor markdown adapter', () => {
  it('identifies MDXEditor handles', () => {
    const handle = { __tabsEditorCore: 'mdxeditor' } as MdxMarkdownEditorHandle

    expect(isMdxMarkdownEditor(handle as unknown as Editor)).toBe(true)
    expect(isMdxMarkdownEditor({ __tabsEditorCore: 'codemirror' } as unknown as Editor)).toBe(false)
    expect(isMdxMarkdownEditor(null)).toBe(false)
  })

  it('maps common toolbar commands to markdown insertions', () => {
    expect(getMdxMarkdownInsertionForCommand('bold', undefined, 'copy')).toBe('**copy**')
    expect(getMdxMarkdownInsertionForCommand('italic', undefined, 'copy')).toBe('*copy*')
    expect(getMdxMarkdownInsertionForCommand('strike', undefined, 'copy')).toBe('~~copy~~')
    expect(getMdxMarkdownInsertionForCommand('highlight', undefined, 'copy')).toBe('==copy==')
    expect(getMdxMarkdownInsertionForCommand('code', undefined, 'copy')).toBe('`copy`')
    expect(getMdxMarkdownInsertionForCommand('addTable', undefined, '')).toContain('| --- | --- |')
  })

  it('does not insert raw inline markers when there is no selected text', () => {
    expect(getMdxMarkdownInsertionForCommand('bold', undefined, '')).toBeNull()
    expect(getMdxMarkdownInsertionForCommand('italic', undefined, '')).toBeNull()
    expect(getMdxMarkdownInsertionForCommand('strike', undefined, '')).toBeNull()
    expect(getMdxMarkdownInsertionForCommand('highlight', undefined, '')).toBeNull()
    expect(getMdxMarkdownInsertionForCommand('code', undefined, '')).toBeNull()
  })

  it('maps link and image commands without changing persisted syntax', () => {
    expect(getMdxMarkdownInsertionForCommand('link', { linkUrl: 'https://example.com' }, 'label')).toBe(
      '[label](https://example.com)',
    )
    expect(getMdxMarkdownInsertionForCommand('link', { linkUrl: 'https://example.com' }, '')).toBe(
      '[https://example.com](https://example.com)',
    )
    expect(getMdxMarkdownInsertionForCommand('addImage', { imageUrl: 'asset://cat.png', altText: 'cat' }, '')).toBe(
      '![cat](asset://cat.png)',
    )
    expect(getMdxMarkdownInsertionForCommand('link', undefined, 'label')).toBeNull()
    expect(getMdxMarkdownInsertionForCommand('addImage', { altText: 'cat' }, '')).toBeNull()
  })

  it('no-ops unsupported commands for the replacement spike', () => {
    expect(getMdxMarkdownInsertionForCommand('outdent', undefined, 'copy')).toBeNull()
    expect(getMdxMarkdownInsertionForCommand('unknown', undefined, 'copy')).toBeNull()
  })
})
