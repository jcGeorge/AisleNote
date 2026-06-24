import { describe, expect, it } from 'vitest'
import {
  buildHybridFileMapFromSerializedState,
  readFileMapFromStorageBackend,
  readSerializedStateFromHybridFileMap,
  writeFileMapToStorageBackend,
} from './browser-hybrid-state'
import { storageReadOk, storageWriteOk, type StorageBackend, type StorageFileEntry } from './storage-backend'

class MemoryStorageBackend implements StorageBackend {
  private readonly files = new Map<string, { kind: 'text'; text: string } | { kind: 'binary'; bytes: ArrayBuffer }>()

  async readTextFile(path: string) {
    const entry = this.files.get(path)
    return storageReadOk(entry?.kind === 'text' ? entry.text : null)
  }

  async writeTextFile(path: string, contents: string) {
    this.files.set(path, { kind: 'text', text: contents })
    return storageWriteOk()
  }

  async readBinaryFile(path: string) {
    const entry = this.files.get(path)
    return storageReadOk(entry?.kind === 'binary' ? entry.bytes : null)
  }

  async writeBinaryFile(path: string, contents: ArrayBuffer) {
    this.files.set(path, { kind: 'binary', bytes: contents })
    return storageWriteOk()
  }

  async listFiles(prefix = '') {
    const entries: StorageFileEntry[] = []
    this.files.forEach((entry, path) => {
      if (!prefix || path.startsWith(prefix)) entries.push({ path, kind: entry.kind })
    })
    return storageReadOk(entries)
  }

  async deleteFile(path: string) {
    this.files.delete(path)
    return storageWriteOk()
  }

  async exists(path: string) {
    return storageReadOk(this.files.has(path))
  }
}

describe('storage backend file map helpers', () => {
  it('writes and reads text and binary files through the storage boundary', async () => {
    const backend = new MemoryStorageBackend()
    const fileMap = new Map([
      ['notes/manifest.json', { path: 'notes/manifest.json', kind: 'text' as const, text: '{}' }],
      [
        'notes/assets/image.png',
        { path: 'notes/assets/image.png', kind: 'binary' as const, bytes: new Uint8Array([1, 2, 3]) },
      ],
    ])

    await writeFileMapToStorageBackend(backend, fileMap)
    const roundTripped = await readFileMapFromStorageBackend(backend)

    expect(roundTripped.get('notes/manifest.json')).toEqual({
      path: 'notes/manifest.json',
      kind: 'text',
      text: '{}',
    })
    const imageEntry = roundTripped.get('notes/assets/image.png')
    expect(imageEntry?.kind).toBe('binary')
    expect(imageEntry?.kind === 'binary' ? Array.from(imageEntry.bytes) : []).toEqual([1, 2, 3])
  })

  it('preserves notebook open tabs in browser hybrid split files', () => {
    const serializedState = JSON.stringify({
      theme: 'dark',
      notebook: {
        activeNoteId: 'note-b',
        openTabs: [
          { noteId: 'note-a', status: 'retained' },
          { noteId: 'note-b', status: 'temporary' },
        ],
        items: [
          { type: 'note', id: 'note-a', title: 'A', noteBodyId: 'body-a' },
          { type: 'note', id: 'note-b', title: 'B', noteBodyId: 'body-b' },
        ],
        deletedItems: [],
        settings: { autoRemoveDeletedDays: 30 },
      },
      messages: [],
      toastHistory: [],
      noteBodies: [],
      noteAisleBodies: [],
      hotkeys: { shortcuts: {}, newlineShortcuts: { shortcuts: {}, menuOperations: [] } },
      frontmatter: { templates: [], settingsTemplateId: '', lastAppliedTemplateId: '' },
      ui: {},
    })

    const fileMap = buildHybridFileMapFromSerializedState(serializedState)
    const notebookIndex = JSON.parse(fileMap.get('notes/.aislenote/notebook-index.json')?.kind === 'text'
      ? fileMap.get('notes/.aislenote/notebook-index.json')?.text ?? '{}'
      : '{}')
    const restored = JSON.parse(readSerializedStateFromHybridFileMap(fileMap) ?? '{}')

    expect(notebookIndex.openTabs).toEqual([
      { noteId: 'note-a', status: 'retained' },
      { noteId: 'note-b', status: 'temporary' },
    ])
    expect(restored.notebook.openTabs).toEqual(notebookIndex.openTabs)
  })
})
