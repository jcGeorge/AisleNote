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

function uniqueNormalizedPaths(paths) {
  const seen = new Set()
  const normalized = []
  paths.forEach((candidate) => {
    const normalizedPath = normalizeProfileRootPath(candidate)
    if (!normalizedPath || seen.has(normalizedPath)) return
    seen.add(normalizedPath)
    normalized.push(normalizedPath)
  })
  return normalized
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
  const knownNotebookPaths = uniqueNormalizedPaths(Array.isArray(config?.knownNotebooks) ? config.knownNotebooks : [])
  return {
    ...(profileRootPath ? { profileRootPath } : {}),
    knownNotebookPaths,
  }
}

function getKnownNotebookPaths(userDataPath, activeProfileRootPath, config = readStorageProfileConfig(userDataPath), options = {}) {
  const defaultProfileRootPath = getDefaultStorageProfileRoot(userDataPath)
  const replacePaths = (Array.isArray(options.replacePaths) ? options.replacePaths : [])
    .map(([from, to]) => [normalizeProfileRootPath(from), normalizeProfileRootPath(to)])
    .filter(([from, to]) => from && to)
  const forgetPaths = new Set(uniqueNormalizedPaths(Array.isArray(options.forgetPaths) ? options.forgetPaths : []))
  const rememberedPaths = uniqueNormalizedPaths([
    defaultProfileRootPath,
    ...(Array.isArray(config.knownNotebookPaths) ? config.knownNotebookPaths : []),
    ...(Array.isArray(options.rememberPaths) ? options.rememberPaths : []),
    activeProfileRootPath,
  ])

  return uniqueNormalizedPaths(
    rememberedPaths
      .map((candidate) => {
        const replacement = replacePaths.find(([from]) => from === candidate)
        return replacement ? replacement[1] : candidate
      })
      .filter((candidate) => !forgetPaths.has(path.resolve(candidate)) || path.resolve(candidate) === defaultProfileRootPath || path.resolve(candidate) === activeProfileRootPath),
  )
}

export function resolveStorageProfile(userDataPath) {
  const defaultProfileRootPath = getDefaultStorageProfileRoot(userDataPath)
  const config = readStorageProfileConfig(userDataPath)
  const profileRootPath = config.profileRootPath ?? defaultProfileRootPath
  const knownNotebookPaths = getKnownNotebookPaths(userDataPath, profileRootPath, config)
  return {
    profileRootPath,
    notebookPath: profileRootPath,
    notebookName: getStorageProfileNotebookName(profileRootPath),
    isDefault: profileRootPath === defaultProfileRootPath,
    knownNotebookPaths,
  }
}

function writeResolvedStorageProfileConfig(userDataPath, profileRootPath, knownNotebookPaths) {
  const defaultProfileRootPath = getDefaultStorageProfileRoot(userDataPath)
  const normalizedProfileRootPath = normalizeProfileRootPath(profileRootPath) ?? defaultProfileRootPath
  const configPath = getStorageProfileConfigPath(userDataPath)
  const normalizedKnownNotebookPaths = uniqueNormalizedPaths([
    defaultProfileRootPath,
    ...knownNotebookPaths,
    normalizedProfileRootPath,
  ])
  const hasCustomActiveProfile = normalizedProfileRootPath !== defaultProfileRootPath
  const hasRememberedCustomNotebooks = normalizedKnownNotebookPaths.some((candidate) => candidate !== defaultProfileRootPath)

  if (!hasCustomActiveProfile && !hasRememberedCustomNotebooks) {
    rmSync(configPath, { force: true })
    return resolveStorageProfile(userDataPath)
  }

  writeJsonFile(configPath, {
    ...(hasCustomActiveProfile ? { profileRootPath: normalizedProfileRootPath } : {}),
    knownNotebooks: normalizedKnownNotebookPaths,
  })
  return resolveStorageProfile(userDataPath)
}

export function writeStorageProfileConfig(userDataPath, profileRootPath, options = {}) {
  const defaultProfileRootPath = getDefaultStorageProfileRoot(userDataPath)
  const normalizedProfileRootPath = normalizeProfileRootPath(profileRootPath) ?? defaultProfileRootPath
  const config = readStorageProfileConfig(userDataPath)
  const knownNotebookPaths = getKnownNotebookPaths(userDataPath, normalizedProfileRootPath, config, options)
  return writeResolvedStorageProfileConfig(userDataPath, normalizedProfileRootPath, knownNotebookPaths)
}

export function forgetStorageProfileNotebook(userDataPath, notebookPath) {
  const config = readStorageProfileConfig(userDataPath)
  const activeProfileRootPath = config.profileRootPath ?? getDefaultStorageProfileRoot(userDataPath)
  const normalizedNotebookPath = normalizeProfileRootPath(notebookPath)
  if (!normalizedNotebookPath) return { ok: false, error: 'Notebook path is invalid.', profile: resolveStorageProfile(userDataPath) }
  if (normalizedNotebookPath === activeProfileRootPath) {
    return { ok: false, error: 'The active notebook cannot be removed from the list.', profile: resolveStorageProfile(userDataPath) }
  }
  const knownNotebookPaths = getKnownNotebookPaths(userDataPath, activeProfileRootPath, config, {
    forgetPaths: [normalizedNotebookPath],
  })
  return {
    ok: true,
    profile: writeResolvedStorageProfileConfig(userDataPath, activeProfileRootPath, knownNotebookPaths),
  }
}

export function isKnownStorageProfileNotebook(userDataPath, notebookPath) {
  const normalizedNotebookPath = normalizeProfileRootPath(notebookPath)
  if (!normalizedNotebookPath) return false
  return resolveStorageProfile(userDataPath).knownNotebookPaths.includes(normalizedNotebookPath)
}
