import { STORAGE_SCHEMA_VERSION } from '../types/storage-schema'

export type StorageManifestMigration = {
  fromVersion: number
  toVersion: number
  migrate: (manifest: Record<string, unknown>) => Record<string, unknown>
}

export type StorageMigrationResult =
  | { ok: true; manifest: Record<string, unknown>; fromVersion: number; toVersion: number }
  | { ok: false; reason: 'invalid-manifest' | 'unsupported-version' | 'missing-migration'; version: number | null }

export const STORAGE_MIGRATIONS: StorageManifestMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (manifest) => ({
      ...manifest,
      schemaVersion: 2,
    }),
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function migrateStorageRootManifest(
  rawManifest: unknown,
  currentVersion = STORAGE_SCHEMA_VERSION,
  migrations = STORAGE_MIGRATIONS,
): StorageMigrationResult {
  if (!isRecord(rawManifest)) return { ok: false, reason: 'invalid-manifest', version: null }

  const schemaVersion = rawManifest.schemaVersion
  if (typeof schemaVersion !== 'number' || !Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    return { ok: false, reason: 'invalid-manifest', version: null }
  }

  if (schemaVersion > currentVersion) {
    return { ok: false, reason: 'unsupported-version', version: schemaVersion }
  }

  let version = schemaVersion
  let manifest = rawManifest
  while (version < currentVersion) {
    const migration = migrations.find((entry) => entry.fromVersion === version)
    if (!migration) return { ok: false, reason: 'missing-migration', version }
    manifest = migration.migrate(manifest)
    version = migration.toVersion
  }

  return { ok: true, manifest, fromVersion: schemaVersion, toVersion: currentVersion }
}
