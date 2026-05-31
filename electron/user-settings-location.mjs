import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  getHybridStorageRoot,
  getUserSettingsFilePath,
  writeAppSettingsForState,
} from './app-state-storage.mjs'
import {
  parseStrictPortableAppSettingsJson,
  stringifyDefaultPortableAppSettings,
} from '../src/storage/settings-partition.js'

export const USER_SETTINGS_LOCATION_CONFIG_FILE = 'user-settings-location.json'

const SETTINGS_LOCATION_NOT_READY_MESSAGE = 'Settings folder could not be reached. Using local app settings.'
const SETTINGS_LOCATION_MISSING_MESSAGE =
  'Settings folder does not contain settings/app-settings.json. Using local app settings.'
const SETTINGS_LOCATION_INVALID_MESSAGE =
  'Settings folder contains invalid app-settings.json. Using local app settings.'
const SETTINGS_LOCATION_WRITE_FAILED_MESSAGE =
  'Settings folder could not be updated. Using local app settings.'
const SETTINGS_LOCATION_RECREATED_MESSAGE =
  'Settings folder did not contain settings/app-settings.json. It was recreated from local app settings.'

function writeTextFileAtomic(absolutePath, contents) {
  mkdirSync(path.dirname(absolutePath), { recursive: true })
  const tempPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${process.pid}.${Date.now()}.tmp`,
  )
  writeFileSync(tempPath, contents, 'utf8')
  renameSync(tempPath, absolutePath)
}

function isSamePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  return path.resolve(left) === path.resolve(right)
}

function getUserSettingsLocationConfigPath(userDataPath) {
  return path.join(userDataPath, USER_SETTINGS_LOCATION_CONFIG_FILE)
}

function readUserSettingsLocationConfig(userDataPath) {
  const configPath = getUserSettingsLocationConfigPath(userDataPath)
  if (!existsSync(configPath)) return {}
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function normalizeSettingsContents(raw) {
  const parsed = parseStrictPortableAppSettingsJson(raw)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    contents: `${JSON.stringify(parsed.settings, null, 2)}\n`,
    settings: parsed.settings,
  }
}

function readSettingsFile(settingsPath) {
  try {
    if (!existsSync(settingsPath)) return { ok: false, missing: true }
    const raw = readFileSync(settingsPath, 'utf8')
    const normalized = normalizeSettingsContents(raw)
    if (!normalized.ok) return { ok: false, invalid: true, error: normalized.error }
    return { ok: true, contents: normalized.contents, raw, settings: normalized.settings }
  } catch (error) {
    return {
      ok: false,
      unreadable: true,
      error: error instanceof Error ? error.message : 'User settings file could not be read.',
    }
  }
}

function writeDefaultSettingsFile(settingsPath) {
  writeTextFileAtomic(settingsPath, stringifyDefaultPortableAppSettings())
}

function ensureLocalSettingsFile(userDataPath) {
  const localSettingsPath = getUserSettingsFilePath(userDataPath)
  const localSettings = readSettingsFile(localSettingsPath)
  if (localSettings.ok) return { ok: true, contents: localSettings.contents, created: false }
  if (!localSettings.missing) {
    return {
      ok: false,
      error: localSettings.error ?? 'Local app settings cache could not be loaded.',
      invalid: true,
    }
  }
  try {
    writeDefaultSettingsFile(localSettingsPath)
    return { ok: true, contents: stringifyDefaultPortableAppSettings(), created: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Local app settings cache could not be created.',
    }
  }
}

export function createUserSettingsLocation(userDataPath, settingsRootPath = userDataPath) {
  const finalUserDataPath = path.resolve(userDataPath)
  const finalSettingsRootPath = path.resolve(settingsRootPath)
  return {
    userDataPath: finalUserDataPath,
    settingsRootPath: finalSettingsRootPath,
    settingsPath: getUserSettingsFilePath(finalSettingsRootPath),
    localSettingsPath: getUserSettingsFilePath(finalUserDataPath),
    isDefault: isSamePath(finalSettingsRootPath, finalUserDataPath),
  }
}

export function resolveUserSettingsLocation(userDataPath) {
  const finalUserDataPath = path.resolve(userDataPath)
  const config = readUserSettingsLocationConfig(finalUserDataPath)
  const configuredRoot =
    typeof config.settingsRootPath === 'string' && config.settingsRootPath.trim()
      ? path.resolve(config.settingsRootPath)
      : finalUserDataPath
  return createUserSettingsLocation(finalUserDataPath, configuredRoot)
}

export function createUserSettingsLocationStatus(userDataPath, location = resolveUserSettingsLocation(userDataPath), options = {}) {
  const status = options.status ?? 'ready'
  return {
    status,
    event: options.event ?? 'ready',
    settingsRootPath: location.settingsRootPath,
    settingsPath: location.settingsPath,
    localSettingsPath: location.localSettingsPath,
    isDefault: location.isDefault,
    canWrite: typeof options.canWrite === 'boolean' ? options.canWrite : status === 'ready',
    syncStatus: options.syncStatus ?? (location.isDefault ? 'local' : 'synced'),
    source: options.source ?? (location.isDefault ? 'local-cache' : 'settings-folder'),
    ...(options.error ? { error: options.error } : {}),
  }
}

export function writeUserSettingsLocationConfig(userDataPath, settingsRootPath) {
  const finalUserDataPath = path.resolve(userDataPath)
  const finalSettingsRootPath = path.resolve(settingsRootPath)
  const configPath = getUserSettingsLocationConfigPath(finalUserDataPath)
  if (isSamePath(finalUserDataPath, finalSettingsRootPath)) {
    rmSync(configPath, { force: true })
    return resolveUserSettingsLocation(finalUserDataPath)
  }
  writeTextFileAtomic(
    configPath,
    `${JSON.stringify({ settingsRootPath: finalSettingsRootPath }, null, 2)}\n`,
  )
  return resolveUserSettingsLocation(finalUserDataPath)
}

export function resetUserSettingsLocationConfig(userDataPath) {
  rmSync(getUserSettingsLocationConfigPath(path.resolve(userDataPath)), { force: true })
  return resolveUserSettingsLocation(userDataPath)
}

export function validateUserSettingsFolderCandidate(settingsRootPath, activeNotebookRootPath) {
  const finalSettingsRootPath = path.resolve(settingsRootPath)
  if (isSamePath(finalSettingsRootPath, activeNotebookRootPath)) {
    return {
      ok: false,
      error: 'Notebook folders cannot be used as the live settings folder. Choose a different folder.',
    }
  }
  if (existsSync(path.join(getHybridStorageRoot(finalSettingsRootPath), 'manifest.json'))) {
    return {
      ok: false,
      error: 'This folder contains a notebook. Choose a folder that only stores user settings.',
    }
  }
  return { ok: true }
}

export function readUserSettingsFromLocation(location) {
  return readSettingsFile(location.settingsPath)
}

export function refreshLocalUserSettingsFromLocation(userDataPath, location = resolveUserSettingsLocation(userDataPath)) {
  if (location.isDefault) {
    const localSettings = ensureLocalSettingsFile(userDataPath)
    if (!localSettings.ok) {
      return {
        ok: false,
        status: createUserSettingsLocationStatus(userDataPath, location, {
          status: 'warning',
          event: localSettings.invalid ? 'local-settings-invalid' : 'local-settings-error',
          syncStatus: 'local',
          source: 'local-cache',
          canWrite: false,
          error: localSettings.error,
        }),
      }
    }
    return {
      ok: true,
      copied: false,
      created: localSettings.created,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        event: localSettings.created ? 'local-settings-created' : 'local-settings-ready',
        syncStatus: 'local',
        source: 'local-cache',
      }),
    }
  }

  if (!existsSync(location.settingsRootPath)) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-sync-unreachable',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: SETTINGS_LOCATION_NOT_READY_MESSAGE,
      }),
    }
  }

  const cloudSettings = readSettingsFile(location.settingsPath)
  if (!cloudSettings.ok) {
    if (cloudSettings.missing) {
      const localSettings = ensureLocalSettingsFile(userDataPath)
      if (!localSettings.ok) {
        return {
          ok: false,
          status: createUserSettingsLocationStatus(userDataPath, location, {
            status: 'warning',
            event: 'settings-cache-invalid',
            syncStatus: 'fallback',
            source: 'local-cache',
            canWrite: false,
            error: 'Local app settings cache could not be used to recreate the settings folder.',
          }),
        }
      }
      try {
        writeTextFileAtomic(location.settingsPath, localSettings.contents)
        return {
          ok: true,
          copied: false,
          recreated: true,
          status: createUserSettingsLocationStatus(userDataPath, location, {
            status: 'warning',
            event: 'settings-sync-recreated',
            syncStatus: 'synced',
            source: 'local-cache',
            error: SETTINGS_LOCATION_RECREATED_MESSAGE,
          }),
        }
      } catch (error) {
        return {
          ok: false,
          status: createUserSettingsLocationStatus(userDataPath, location, {
            status: 'warning',
            event: 'settings-sync-write-failed',
            syncStatus: 'fallback',
            source: 'local-cache',
            canWrite: false,
            error: error instanceof Error ? error.message : SETTINGS_LOCATION_WRITE_FAILED_MESSAGE,
          }),
        }
      }
    }
    const error = cloudSettings.missing
      ? SETTINGS_LOCATION_MISSING_MESSAGE
      : cloudSettings.invalid
        ? SETTINGS_LOCATION_INVALID_MESSAGE
        : SETTINGS_LOCATION_NOT_READY_MESSAGE
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: cloudSettings.missing ? 'settings-sync-missing' : 'settings-sync-invalid',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error,
      }),
    }
  }

  try {
    writeTextFileAtomic(location.localSettingsPath, cloudSettings.contents)
  } catch (error) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-cache-write-failed',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: error instanceof Error ? error.message : 'Local app settings cache could not be updated.',
      }),
    }
  }

  return {
    ok: true,
    copied: true,
    status: createUserSettingsLocationStatus(userDataPath, location, {
      event: 'settings-sync-loaded',
      syncStatus: 'synced',
      source: 'settings-folder',
    }),
  }
}

export function writeUserSettingsLocationFromState(userDataPath, location, serializedState) {
  if (location.isDefault) {
    return {
      ok: true,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        event: 'local-settings-saved',
        syncStatus: 'local',
        source: 'local-cache',
      }),
    }
  }

  if (!existsSync(location.settingsRootPath)) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-sync-unreachable',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: SETTINGS_LOCATION_NOT_READY_MESSAGE,
      }),
    }
  }

  try {
    writeAppSettingsForState(location.settingsRootPath, serializedState)
    return {
      ok: true,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        event: 'settings-sync-saved',
        syncStatus: 'synced',
        source: 'settings-folder',
      }),
    }
  } catch (error) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-sync-write-failed',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: error instanceof Error ? error.message : SETTINGS_LOCATION_WRITE_FAILED_MESSAGE,
      }),
    }
  }
}

export function initializeUserSettingsLocationFromState(userDataPath, location, serializedState) {
  try {
    writeAppSettingsForState(userDataPath, serializedState)
    if (!location.isDefault) writeAppSettingsForState(location.settingsRootPath, serializedState)
    return {
      ok: true,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        event: location.isDefault ? 'local-settings-saved' : 'settings-sync-initialized',
        syncStatus: location.isDefault ? 'local' : 'synced',
        source: location.isDefault ? 'local-cache' : 'settings-folder',
      }),
    }
  } catch (error) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-sync-write-failed',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: error instanceof Error ? error.message : SETTINGS_LOCATION_WRITE_FAILED_MESSAGE,
      }),
    }
  }
}

export function recreateMissingUserSettingsLocationFile(userDataPath, location, serializedState = null) {
  if (!existsSync(location.settingsRootPath)) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-sync-unreachable',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: SETTINGS_LOCATION_NOT_READY_MESSAGE,
      }),
    }
  }

  try {
    if (typeof serializedState === 'string') {
      writeAppSettingsForState(userDataPath, serializedState)
      writeAppSettingsForState(location.settingsRootPath, serializedState)
      return {
        ok: true,
        status: createUserSettingsLocationStatus(userDataPath, location, {
          event: 'settings-sync-recreated',
          syncStatus: 'synced',
          source: 'settings-folder',
        }),
      }
    }

    const localSettings = readSettingsFile(location.localSettingsPath)
    if (!localSettings.ok) {
      return {
        ok: false,
        status: createUserSettingsLocationStatus(userDataPath, location, {
          status: 'warning',
          event: 'settings-cache-invalid',
          syncStatus: 'fallback',
          source: 'local-cache',
          canWrite: false,
          error: 'Local app settings cache could not be used to recreate the settings folder.',
        }),
      }
    }
    writeTextFileAtomic(location.settingsPath, localSettings.contents)
    return {
      ok: true,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        event: 'settings-sync-recreated',
        syncStatus: 'synced',
        source: 'settings-folder',
      }),
    }
  } catch (error) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-sync-write-failed',
        syncStatus: 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: error instanceof Error ? error.message : SETTINGS_LOCATION_WRITE_FAILED_MESSAGE,
      }),
    }
  }
}

export function resetUserSettingsLocationToDefaults(userDataPath, location = resolveUserSettingsLocation(userDataPath)) {
  try {
    const defaultSettings = stringifyDefaultPortableAppSettings()
    writeTextFileAtomic(location.localSettingsPath, defaultSettings)
    if (location.isDefault) {
      return {
        ok: true,
        status: createUserSettingsLocationStatus(userDataPath, location, {
          event: 'settings-reset-defaults',
          syncStatus: 'local',
          source: 'local-cache',
        }),
      }
    }
    if (!existsSync(location.settingsRootPath)) {
      return {
        ok: true,
        status: createUserSettingsLocationStatus(userDataPath, location, {
          status: 'warning',
          event: 'settings-reset-defaults',
          syncStatus: 'fallback',
          source: 'local-cache',
          canWrite: false,
          error: SETTINGS_LOCATION_NOT_READY_MESSAGE,
        }),
      }
    }
    writeTextFileAtomic(location.settingsPath, defaultSettings)
    return {
      ok: true,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        event: 'settings-reset-defaults',
        syncStatus: 'synced',
        source: 'settings-folder',
      }),
    }
  } catch (error) {
    return {
      ok: false,
      status: createUserSettingsLocationStatus(userDataPath, location, {
        status: 'warning',
        event: 'settings-reset-defaults-error',
        syncStatus: location.isDefault ? 'local' : 'fallback',
        source: 'local-cache',
        canWrite: false,
        error: error instanceof Error ? error.message : 'User settings could not be reset.',
      }),
    }
  }
}
