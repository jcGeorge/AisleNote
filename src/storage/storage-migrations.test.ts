import { describe, expect, it } from 'vitest'
import { STORAGE_SCHEMA_VERSION } from '../types/storage-schema'
import { migrateStorageRootManifest } from './storage-migrations'

describe('storage manifest migrations', () => {
  it('passes current schema manifests through unchanged', () => {
    const manifest = { schemaVersion: STORAGE_SCHEMA_VERSION, domains: [] }

    expect(migrateStorageRootManifest(manifest)).toEqual({
      ok: true,
      manifest,
      fromVersion: STORAGE_SCHEMA_VERSION,
      toVersion: STORAGE_SCHEMA_VERSION,
    })
  })

  it('rejects older schema versions', () => {
    expect(migrateStorageRootManifest({ schemaVersion: 1 })).toEqual({
      ok: false,
      reason: 'missing-migration',
      version: 1,
    })
  })

  it('rejects unsupported future schema versions', () => {
    expect(migrateStorageRootManifest({ schemaVersion: STORAGE_SCHEMA_VERSION + 1 })).toEqual({
      ok: false,
      reason: 'unsupported-version',
      version: STORAGE_SCHEMA_VERSION + 1,
    })
  })
})
