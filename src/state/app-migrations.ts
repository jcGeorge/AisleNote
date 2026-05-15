export const CURRENT_APP_DATA_VERSION = 1

export type AppDataMigration = {
  fromVersion: number
  toVersion: number
  migrate: (data: Record<string, unknown>) => Record<string, unknown>
}

export type MigrationRegistry = {
  currentVersion: number
  migrations: AppDataMigration[]
}

export type MigrationResult =
  | { ok: true; data: Record<string, unknown>; fromVersion: number; toVersion: number }
  | { ok: false; reason: 'invalid-data' | 'unsupported-version' | 'missing-migration'; version: number | null }

export const APP_DATA_MIGRATION_REGISTRY: MigrationRegistry = {
  currentVersion: CURRENT_APP_DATA_VERSION,
  migrations: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readVersion(data: Record<string, unknown>): number {
  const version = typeof data.dataVersion === 'number'
    ? data.dataVersion
    : typeof data.schemaVersion === 'number'
      ? data.schemaVersion
      : CURRENT_APP_DATA_VERSION
  return Number.isInteger(version) && version > 0 ? version : CURRENT_APP_DATA_VERSION
}

export function migrateRawAppData(
  raw: unknown,
  registry: MigrationRegistry = APP_DATA_MIGRATION_REGISTRY,
): MigrationResult {
  if (!isRecord(raw)) return { ok: false, reason: 'invalid-data', version: null }

  const fromVersion = readVersion(raw)
  if (fromVersion > registry.currentVersion) {
    return { ok: false, reason: 'unsupported-version', version: fromVersion }
  }

  let currentVersion = fromVersion
  let data = raw
  while (currentVersion < registry.currentVersion) {
    const migration = registry.migrations.find((entry) => entry.fromVersion === currentVersion)
    if (!migration) return { ok: false, reason: 'missing-migration', version: currentVersion }
    data = migration.migrate(data)
    currentVersion = migration.toVersion
  }

  return {
    ok: true,
    data,
    fromVersion,
    toVersion: registry.currentVersion,
  }
}
