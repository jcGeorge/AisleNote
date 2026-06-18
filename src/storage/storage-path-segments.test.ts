import { describe, expect, it } from 'vitest'
import {
  STORAGE_PATH_SEGMENT_MAX_BYTES,
  STORAGE_PATH_SEGMENT_MAX_LENGTH,
  buildStoragePathFileName,
  buildStoragePathSegment,
  createStoragePathAllocator,
  createStoragePathFileNameAllocator,
  sanitizeStoragePathName,
} from './storage-path-segments.js'

function encodedByteLength(value: string) {
  return new TextEncoder().encode(value).length
}

function visibleLength(value: string) {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(value)).length
}

describe('storage path segments', () => {
  it('sanitizes invalid filesystem characters before truncating', () => {
    const segment = buildStoragePathSegment(
      '<Invalid>: Name / With * Bad ? Characters '.repeat(4),
      'notebook-1',
      'notebook',
    )

    expect(segment).toHaveLength(STORAGE_PATH_SEGMENT_MAX_LENGTH)
    expect(segment).toMatch(/--[a-f0-9]{6}$/)
    expect(segment).not.toMatch(/[<>:"/\\|?*]/)
    expect(segment.endsWith(' ')).toBe(false)
    expect(segment.endsWith('.')).toBe(false)
    expect(sanitizeStoragePathName('...', 'notebook')).toBe('notebook')
  })

  it('keeps the short id suffix and collision suffix inside the 48 character budget', () => {
    const allocatePath = createStoragePathAllocator()
    const first = allocatePath('Same Very Long Name '.repeat(5), 'same-id', 'tab')
    const second = allocatePath('Same Very Long Name '.repeat(5), 'same-id', 'tab')

    expect(first.length).toBeLessThanOrEqual(STORAGE_PATH_SEGMENT_MAX_LENGTH)
    expect(second.length).toBeLessThanOrEqual(STORAGE_PATH_SEGMENT_MAX_LENGTH)
    expect(first).toMatch(/--[a-f0-9]{6}$/)
    expect(second).toMatch(/--[a-f0-9]{6}-2$/)
    expect(first).not.toBe(second)
  })

  it('does not split grapheme clusters while enforcing the byte guard', () => {
    const familyEmoji = '👨‍👩‍👧‍👦'
    const segment = buildStoragePathSegment(familyEmoji.repeat(50), 'emoji-id', 'tab')
    const readableName = segment.split('--')[0]

    expect(visibleLength(segment)).toBeLessThanOrEqual(STORAGE_PATH_SEGMENT_MAX_LENGTH)
    expect(encodedByteLength(segment)).toBeLessThanOrEqual(STORAGE_PATH_SEGMENT_MAX_BYTES)
    expect(readableName).toMatch(new RegExp(`^(${familyEmoji})+$`, 'u'))
    expect(segment).toMatch(/--[a-f0-9]{6}$/)
  })

  it('keeps file extensions inside the segment budget', () => {
    const fileName = buildStoragePathFileName('Aisle With An Extremely Long Generated Name '.repeat(3), 'aisle-1', 'Aisle', '.md')

    expect(fileName).toHaveLength(STORAGE_PATH_SEGMENT_MAX_LENGTH)
    expect(fileName).toMatch(/--[a-f0-9]{6}\.md$/)
    expect(encodedByteLength(fileName)).toBeLessThanOrEqual(STORAGE_PATH_SEGMENT_MAX_BYTES)
  })

  it('allocates colliding readable file names before the extension', () => {
    const allocateFileName = createStoragePathFileNameAllocator('.md')
    const first = allocateFileName('same file', 'same-id', 'note')
    const second = allocateFileName('same file', 'same-id', 'note')

    expect(first).toMatch(/--[a-f0-9]{6}\.md$/)
    expect(second).toMatch(/--[a-f0-9]{6}-2\.md$/)
    expect(first).not.toBe(second)
  })
})
