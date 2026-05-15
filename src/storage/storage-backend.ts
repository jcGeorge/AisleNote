export type StorageFileKind = 'text' | 'binary'

export type StorageFileEntry = {
  path: string
  kind: StorageFileKind
}

export type StorageReadResult<T> =
  | { ok: true; value: T | null }
  | { ok: false; error: string }

export type StorageWriteResult =
  | { ok: true }
  | { ok: false; error: string }

export interface StorageBackend {
  readTextFile(path: string): Promise<StorageReadResult<string>>
  writeTextFile(path: string, contents: string): Promise<StorageWriteResult>
  readBinaryFile(path: string): Promise<StorageReadResult<ArrayBuffer>>
  writeBinaryFile(path: string, contents: ArrayBuffer): Promise<StorageWriteResult>
  listFiles(prefix?: string): Promise<StorageReadResult<StorageFileEntry[]>>
  deleteFile(path: string): Promise<StorageWriteResult>
  exists(path: string): Promise<StorageReadResult<boolean>>
}

export function storageReadOk<T>(value: T | null): StorageReadResult<T> {
  return { ok: true, value }
}

export function storageWriteOk(): StorageWriteResult {
  return { ok: true }
}

export function storageError(error: unknown): { ok: false; error: string } {
  return {
    ok: false,
    error: error instanceof Error ? error.message : 'Storage operation failed.',
  }
}
