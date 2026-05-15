export const CURRENT_STORAGE_SCHEMA_VERSION = 1

export function migrateStorageRootManifest(rootManifest, currentVersion = CURRENT_STORAGE_SCHEMA_VERSION) {
  if (!rootManifest || typeof rootManifest !== 'object') {
    return { ok: false, reason: 'invalid-manifest', version: null }
  }

  const schemaVersion = rootManifest.schemaVersion
  if (!Number.isInteger(schemaVersion) || schemaVersion <= 0) {
    return { ok: false, reason: 'invalid-manifest', version: null }
  }

  if (schemaVersion > currentVersion) {
    return { ok: false, reason: 'unsupported-version', version: schemaVersion }
  }

  if (schemaVersion < currentVersion) {
    return { ok: false, reason: 'missing-migration', version: schemaVersion }
  }

  return {
    ok: true,
    manifest: rootManifest,
    fromVersion: schemaVersion,
    toVersion: currentVersion,
  }
}
