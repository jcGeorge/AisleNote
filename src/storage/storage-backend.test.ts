import { describe, expect, it } from 'vitest'
import { readFileMapFromStorageBackend, writeFileMapToStorageBackend } from './browser-hybrid-state'
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
      ['notes-data/manifest.json', { path: 'notes-data/manifest.json', kind: 'text' as const, text: '{}' }],
      [
        'notes-data/assets/image.png',
        { path: 'notes-data/assets/image.png', kind: 'binary' as const, bytes: new Uint8Array([1, 2, 3]) },
      ],
    ])

    await writeFileMapToStorageBackend(backend, fileMap)
    const roundTripped = await readFileMapFromStorageBackend(backend)

    expect(roundTripped.get('notes-data/manifest.json')).toEqual({
      path: 'notes-data/manifest.json',
      kind: 'text',
      text: '{}',
    })
    const imageEntry = roundTripped.get('notes-data/assets/image.png')
    expect(imageEntry?.kind).toBe('binary')
    expect(imageEntry?.kind === 'binary' ? Array.from(imageEntry.bytes) : []).toEqual([1, 2, 3])
  })
})
