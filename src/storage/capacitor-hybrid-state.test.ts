import { describe, expect, it, vi } from 'vitest'
import {
  CapacitorFilesystemStorageBackend,
  createCapacitorRecoveryNotebookArchive,
} from './capacitor-hybrid-state'
import { BrowserHybridStateAdapter } from './browser-hybrid-state'
import { DEFAULT_STATE, parseSavedState } from '../state/app-state'

type FakeFile = {
  data: string
}

function createFakeFilesystem() {
  const files = new Map<string, FakeFile>()

  return {
    files,
    readFile: vi.fn(async ({ path }: { path: string }) => {
      const file = files.get(path)
      if (!file) throw new Error('File does not exist.')
      return { data: file.data }
    }),
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string | Blob }) => {
      files.set(path, { data: typeof data === 'string' ? data : await data.text() })
      return { uri: `capacitor://localhost/${path}` }
    }),
    deleteFile: vi.fn(async ({ path }: { path: string }) => {
      files.delete(path)
    }),
    stat: vi.fn(async ({ path }: { path: string }) => {
      if (files.has(path) || Array.from(files.keys()).some((filePath) => filePath.startsWith(`${path}/`))) {
        return { type: files.has(path) ? 'file' : 'directory' }
      }
      throw new Error('File does not exist.')
    }),
    getUri: vi.fn(async ({ path }: { path: string }) => ({ uri: `capacitor://localhost/${path}` })),
    readdir: vi.fn(async ({ path }: { path: string }) => {
      const prefix = path ? `${path}/` : ''
      const children = new Map<string, 'file' | 'directory'>()

      for (const filePath of files.keys()) {
        if (!filePath.startsWith(prefix)) continue
        const relative = filePath.slice(prefix.length)
        if (!relative) continue
        const [name, ...rest] = relative.split('/')
        children.set(name, rest.length > 0 ? 'directory' : 'file')
      }

      if (children.size === 0 && path && !files.has(path)) throw new Error('Directory does not exist.')

      return {
        files: Array.from(children.entries()).map(([name, type]) => ({
          name,
          type,
          size: 0,
          mtime: 0,
          uri: `capacitor://localhost/${path ? `${path}/` : ''}${name}`,
        })),
      }
    }),
  }
}

describe('Capacitor filesystem storage backend', () => {
  it('round-trips text and binary files through app-private storage', async () => {
    const filesystem = createFakeFilesystem()
    const backend = new CapacitorFilesystemStorageBackend(filesystem as never)
    const bytes = new Uint8Array([1, 2, 3, 255])
    const buffer = new ArrayBuffer(bytes.byteLength)
    new Uint8Array(buffer).set(bytes)

    await expect(backend.writeTextFile('notes/manifest.json', '{"ok":true}')).resolves.toEqual({ ok: true })
    await expect(backend.writeBinaryFile('notes/assets/image.png', buffer)).resolves.toEqual({ ok: true })

    const text = await backend.readTextFile('notes/manifest.json')
    const binary = await backend.readBinaryFile('notes/assets/image.png')
    const listed = await backend.listFiles()

    expect(text).toEqual({ ok: true, value: '{"ok":true}' })
    expect(binary.ok ? Array.from(new Uint8Array(binary.value ?? new ArrayBuffer(0))) : []).toEqual([1, 2, 3, 255])
    expect(listed.ok ? listed.value?.map((entry) => entry.path).sort() : []).toEqual([
      'notes/assets/image.png',
      'notes/manifest.json',
    ])
  })

  it('persists the hybrid notebook layout across adapter instances', async () => {
    const filesystem = createFakeFilesystem()
    const backend = new CapacitorFilesystemStorageBackend(filesystem as never)
    const adapter = new BrowserHybridStateAdapter(backend)

    await adapter.saveSerializedState(JSON.stringify(DEFAULT_STATE))

    expect(filesystem.files.has('notes/manifest.json')).toBe(true)
    expect(filesystem.files.has('settings/app-settings.json')).toBe(true)

    const reloadedAdapter = new BrowserHybridStateAdapter(new CapacitorFilesystemStorageBackend(filesystem as never))
    const reloaded = await reloadedAdapter.loadSerializedState()
    const reloadedState = parseSavedState(reloaded)

    expect(reloaded).not.toBeNull()
    expect(reloadedState.domains.map((domain) => domain.name)).toEqual(DEFAULT_STATE.domains.map((domain) => domain.name))
    expect(reloadedState.noteBodies.length).toBeGreaterThan(0)
  })

  it('heals app-private notebook storage when no domains are readable', async () => {
    const filesystem = createFakeFilesystem()
    const backend = new CapacitorFilesystemStorageBackend(filesystem as never)
    const adapter = new BrowserHybridStateAdapter(backend)

    await adapter.saveSerializedState(JSON.stringify(DEFAULT_STATE))
    const rootManifest = JSON.parse(filesystem.files.get('notes/manifest.json')?.data ?? '{}') as Record<string, unknown>
    const files =
      rootManifest.files && typeof rootManifest.files === 'object'
        ? (rootManifest.files as Record<string, unknown>)
        : {}
    const workspaceIndexPath = `notes/${String(files.workspaceIndex)}`
    const workspaceIndex = JSON.parse(filesystem.files.get(workspaceIndexPath)?.data ?? '{}') as Record<string, unknown>
    const firstDomain = Array.isArray(workspaceIndex.domains) ? workspaceIndex.domains[0] as Record<string, unknown> : {}
    const staleDomainManifest = `notes/domains/${String(firstDomain.path)}/manifest.json`
    filesystem.files.set(staleDomainManifest, { data: '{bad' })

    const reloadedAdapter = new BrowserHybridStateAdapter(new CapacitorFilesystemStorageBackend(filesystem as never))
    const reloaded = await reloadedAdapter.loadSerializedState()
    const reloadedState = parseSavedState(reloaded)

    expect(reloaded).not.toBeNull()
    expect(reloadedState.domains).toHaveLength(1)
    expect(reloadedState.domains[0].spaces).toHaveLength(1)
    expect(reloadedState.domains[0].spaces[0].data.tabs).toHaveLength(1)

    await reloadedAdapter.saveSerializedState(reloaded ?? '')
    expect(() => JSON.parse(filesystem.files.get(staleDomainManifest)?.data ?? '')).not.toThrow()
  })

  it('does not prune app-private recovery files during normal notebook saves', async () => {
    const filesystem = createFakeFilesystem()
    const backend = new CapacitorFilesystemStorageBackend(filesystem as never)
    const adapter = new BrowserHybridStateAdapter(backend)
    filesystem.files.set('recovery/manual-copy.zip', { data: 'existing-recovery' })

    await adapter.saveSerializedState(JSON.stringify(DEFAULT_STATE))
    await adapter.saveSerializedState(JSON.stringify(DEFAULT_STATE))

    expect(filesystem.files.has('recovery/manual-copy.zip')).toBe(true)
  })

  it('creates an app-private notebook archive recovery copy', async () => {
    const filesystem = createFakeFilesystem()
    const backend = new CapacitorFilesystemStorageBackend(filesystem as never)

    const result = await createCapacitorRecoveryNotebookArchive(JSON.stringify(DEFAULT_STATE), {
      backend,
      now: new Date('2026-05-29T10:11:12.000Z'),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.path).toBe('recovery/tabs-recovery-2026-05-29T10-11-12-000Z.zip')
    expect(result.uri).toBe('capacitor://localhost/recovery/tabs-recovery-2026-05-29T10-11-12-000Z.zip')
    expect(filesystem.files.has(result.path)).toBe(true)
  })
})
