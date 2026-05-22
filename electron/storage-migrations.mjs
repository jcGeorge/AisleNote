export const CURRENT_STORAGE_SCHEMA_VERSION = 3

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

  if (schemaVersion === 2 && currentVersion === 3) {
    return {
      ok: true,
      manifest: {
        ...rootManifest,
        schemaVersion: 3,
        deletedDomains: Array.isArray(rootManifest.deletedDomains) ? rootManifest.deletedDomains : [],
        deletedSpaces: Array.isArray(rootManifest.deletedSpaces) ? rootManifest.deletedSpaces : [],
      },
      fromVersion: schemaVersion,
      toVersion: currentVersion,
    }
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
