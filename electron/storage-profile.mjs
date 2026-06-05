import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export const STORAGE_PROFILE_CONFIG_FILE = 'storage-profile.json'
export const STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME = 'Default Notebook'

const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])

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
  return path.resolve(userDataPath, STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME)
}

export function getStorageProfileNotebookName(profileRootPath) {
  const name = path.basename(path.resolve(profileRootPath))
  return name || STORAGE_PROFILE_DEFAULT_NOTEBOOK_NAME
}

export function validateNotebookName(value) {
  const rawName = typeof value === 'string' ? value : ''
  const name = rawName.trim()
  if (!name) return { ok: false, error: 'Notebook name is required.' }
  if (rawName !== name) return { ok: false, error: 'Notebook name cannot start or end with a space or period.' }
  if (name === '.' || name === '..') return { ok: false, error: 'Notebook name is invalid.' }
  if (/[<>:"/\\|?*\u0000-\u001F]/u.test(name)) {
    return { ok: false, error: 'Notebook name contains characters that cannot be used in a folder name.' }
  }
  if (/^\./u.test(name) || /\.$/u.test(name)) {
    return { ok: false, error: 'Notebook name cannot start or end with a space or period.' }
  }
  const baseName = name.split('.')[0]?.toLowerCase() ?? ''
  if (WINDOWS_RESERVED_NAMES.has(baseName)) {
    return { ok: false, error: 'Notebook name is reserved by the operating system.' }
  }
  return { ok: true, name }
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
    notebookPath: profileRootPath,
    notebookName: getStorageProfileNotebookName(profileRootPath),
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
