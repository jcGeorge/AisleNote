import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const STORAGE_PROFILE_CONFIG_FILE = 'storage-profile.json'
export const STORAGE_PROFILE_NOTES_DIR = 'notes-data'

function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) return null
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFile(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function normalizeProfileRootPath(profileRootPath) {
  if (typeof profileRootPath !== 'string' || profileRootPath.trim().length === 0) return null
  return path.resolve(profileRootPath)
}

export function getStorageProfileConfigPath(userDataPath) {
  return path.join(userDataPath, STORAGE_PROFILE_CONFIG_FILE)
}

export function getDefaultStorageProfileRoot(userDataPath) {
  return path.resolve(userDataPath)
}

export function getStorageProfileNotesPath(profileRootPath) {
  return path.join(profileRootPath, STORAGE_PROFILE_NOTES_DIR)
}

export function readStorageProfileConfig(userDataPath) {
  const config = readJsonFile(getStorageProfileConfigPath(userDataPath))
  const profileRootPath = normalizeProfileRootPath(config?.profileRootPath)
  return profileRootPath ? { profileRootPath } : {}
}

export function resolveStorageProfile(userDataPath) {
  const defaultProfileRootPath = getDefaultStorageProfileRoot(userDataPath)
  const config = readStorageProfileConfig(userDataPath)
  const profileRootPath = config.profileRootPath ?? defaultProfileRootPath
  return {
    profileRootPath,
    notesDataPath: getStorageProfileNotesPath(profileRootPath),
    isDefault: profileRootPath === defaultProfileRootPath,
  }
}

export function writeStorageProfileConfig(userDataPath, profileRootPath) {
  const defaultProfileRootPath = getDefaultStorageProfileRoot(userDataPath)
  const normalizedProfileRootPath = normalizeProfileRootPath(profileRootPath)
  const configPath = getStorageProfileConfigPath(userDataPath)

  if (!normalizedProfileRootPath || normalizedProfileRootPath === defaultProfileRootPath) {
    rmSync(configPath, { force: true })
    return resolveStorageProfile(userDataPath)
  }

  writeJsonFile(configPath, { profileRootPath: normalizedProfileRootPath })
  return resolveStorageProfile(userDataPath)
}
