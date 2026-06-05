import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import {
  storageError,
  storageReadOk,
  storageWriteOk,
  type StorageBackend,
  type StorageFileEntry,
  type StorageFileKind,
  type StorageReadResult,
  type StorageWriteResult,
} from './storage-backend'
import { BrowserHybridStateAdapter } from './browser-hybrid-state'

type CapacitorFilesystemLike = Pick<
  typeof Filesystem,
  'readFile' | 'writeFile' | 'deleteFile' | 'readdir' | 'stat' | 'getUri'
>

const TEXT_FILE_EXTENSIONS = new Set(['json', 'md', 'txt', 'yaml', 'yml', 'csv'])
const APP_STATE_ROOTS = ['notes', 'settings'] as const

function normalizeStoragePath(pathValue: string, options: { allowEmpty?: boolean } = {}): string {
  const raw = pathValue.trim()
  if (!raw && options.allowEmpty) return ''
  if (!raw || raw.includes('\\') || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    throw new Error('Storage path must be a relative POSIX path.')
  }

  const segments = raw.split('/')
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new Error('Storage path must not contain empty or traversal segments.')
  }

  return segments.join('/')
}

function joinPath(...parts: string[]): string {
  return parts.filter((part) => part.length > 0).join('/')
}

function inferFileKind(pathValue: string): StorageFileKind {
  const extension = pathValue.split('.').pop()?.toLowerCase() ?? ''
  return TEXT_FILE_EXTENSIONS.has(extension) ? 'text' : 'binary'
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

async function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer()
}

export class CapacitorFilesystemStorageBackend implements StorageBackend {
  private readonly filesystem: CapacitorFilesystemLike
  private readonly directory: Directory

  constructor(
    filesystem: CapacitorFilesystemLike = Filesystem,
    directory: Directory = Directory.Data,
  ) {
    this.filesystem = filesystem
    this.directory = directory
  }

  async readTextFile(pathValue: string): Promise<StorageReadResult<string>> {
    try {
      const path = normalizeStoragePath(pathValue)
      const result = await this.filesystem.readFile({
        path,
        directory: this.directory,
        encoding: Encoding.UTF8,
      })
      return storageReadOk(typeof result.data === 'string' ? result.data : await result.data.text())
    } catch {
      return storageReadOk<string>(null)
    }
  }

  async writeTextFile(pathValue: string, contents: string): Promise<StorageWriteResult> {
    try {
      const path = normalizeStoragePath(pathValue)
      await this.filesystem.writeFile({
        path,
        directory: this.directory,
        encoding: Encoding.UTF8,
        data: contents,
        recursive: true,
      })
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async readBinaryFile(pathValue: string): Promise<StorageReadResult<ArrayBuffer>> {
    try {
      const path = normalizeStoragePath(pathValue)
      const result = await this.filesystem.readFile({
        path,
        directory: this.directory,
      })
      if (typeof result.data === 'string') return storageReadOk(base64ToArrayBuffer(result.data))
      return storageReadOk(await readBlobAsArrayBuffer(result.data))
    } catch {
      return storageReadOk<ArrayBuffer>(null)
    }
  }

  async writeBinaryFile(pathValue: string, contents: ArrayBuffer): Promise<StorageWriteResult> {
    try {
      const path = normalizeStoragePath(pathValue)
      await this.filesystem.writeFile({
        path,
        directory: this.directory,
        data: uint8ArrayToBase64(new Uint8Array(contents)),
        recursive: true,
      })
      return storageWriteOk()
    } catch (error) {
      return storageError(error)
    }
  }

  async listFiles(prefix = ''): Promise<StorageReadResult<StorageFileEntry[]>> {
    try {
      const normalizedPrefix = normalizeStoragePath(prefix, { allowEmpty: true })
      const entries: StorageFileEntry[] = []
      if (normalizedPrefix) {
        await this.collectFiles(normalizedPrefix, entries)
      } else {
        for (const root of APP_STATE_ROOTS) {
          await this.collectFiles(root, entries)
        }
      }
      return storageReadOk(
        normalizedPrefix
          ? entries.filter((entry) => entry.path === normalizedPrefix || entry.path.startsWith(`${normalizedPrefix}/`))
          : entries,
      )
    } catch (error) {
      return storageError(error)
    }
  }

  async deleteFile(pathValue: string): Promise<StorageWriteResult> {
    try {
      const path = normalizeStoragePath(pathValue)
      await this.filesystem.deleteFile({
        path,
        directory: this.directory,
      })
      return storageWriteOk()
    } catch {
      return storageWriteOk()
    }
  }

  async exists(pathValue: string): Promise<StorageReadResult<boolean>> {
    try {
      const path = normalizeStoragePath(pathValue)
      await this.filesystem.stat({
        path,
        directory: this.directory,
      })
      return storageReadOk(true)
    } catch {
      return storageReadOk(false)
    }
  }

  async getFileUri(pathValue: string): Promise<string | undefined> {
    const path = normalizeStoragePath(pathValue)
    try {
      const result = await this.filesystem.getUri({
        path,
        directory: this.directory,
      })
      return result.uri
    } catch {
      return undefined
    }
  }

  private async collectFiles(directoryPath: string, entries: StorageFileEntry[]): Promise<void> {
    let result: Awaited<ReturnType<CapacitorFilesystemLike['readdir']>>
    try {
      result = await this.filesystem.readdir({
        path: directoryPath,
        directory: this.directory,
      })
    } catch {
      return
    }

    for (const file of result.files) {
      const path = joinPath(directoryPath, file.name)
      if (file.type === 'directory') {
        await this.collectFiles(path, entries)
      } else {
        entries.push({ path, kind: inferFileKind(path) })
      }
    }
  }
}

export class CapacitorHybridStateAdapter extends BrowserHybridStateAdapter {
  constructor(backend: StorageBackend = new CapacitorFilesystemStorageBackend()) {
    super(backend)
  }
}
