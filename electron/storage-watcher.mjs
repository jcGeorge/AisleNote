import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createStorageFilesSnapshot, getHybridStorageRoot } from './app-state-storage.mjs'

function isTemporaryAtomicWriteFile(fileName) {
  return /^\..+\.\d+\.\d+\.tmp$/.test(fileName)
}

function isIgnoredStorageMetadataFile(fileName) {
  return (
    fileName.startsWith('.') ||
    fileName === 'desktop.ini' ||
    fileName === 'Thumbs.db' ||
    fileName.endsWith('~')
  )
}

function listFileSignatures(rootPath, currentPath = rootPath, signatures = []) {
  let entries
  try {
    entries = readdirSync(currentPath, { withFileTypes: true })
  } catch {
    return signatures
  }

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name)
    const relativePath = path.relative(rootPath, absolutePath)
    if (entry.isDirectory()) {
      listFileSignatures(rootPath, absolutePath, signatures)
      continue
    }
    if (!entry.isFile() || isTemporaryAtomicWriteFile(entry.name) || isIgnoredStorageMetadataFile(entry.name)) continue
    try {
      const stat = statSync(absolutePath)
      signatures.push(`${relativePath}:${stat.size}:${Math.round(stat.mtimeMs)}`)
    } catch {
      signatures.push(`${relativePath}:unreadable`)
    }
  }
  return signatures
}

export function computeStorageSignature(profileRootPath) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  if (!existsSync(rootPath)) return 'missing'
  return listFileSignatures(rootPath).sort().join('|')
}

function listFileContents(rootPath, currentPath = rootPath, entries = []) {
  let directoryEntries
  try {
    directoryEntries = readdirSync(currentPath, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of directoryEntries) {
    const absolutePath = path.join(currentPath, entry.name)
    if (entry.isDirectory()) {
      const nextEntries = listFileContents(rootPath, absolutePath, entries)
      if (nextEntries === null) return null
      continue
    }
    if (!entry.isFile() || isTemporaryAtomicWriteFile(entry.name) || isIgnoredStorageMetadataFile(entry.name)) continue
    try {
      entries.push([path.relative(rootPath, absolutePath), readFileSync(absolutePath)])
    } catch {
      return null
    }
  }
  return entries
}

export function computeStorageContentFingerprint(profileRootPath) {
  const snapshot = computeStorageContentSnapshot(profileRootPath)
  return typeof snapshot === 'string' || snapshot === null ? snapshot : snapshot.fingerprint
}

export function computeStorageContentSnapshot(profileRootPath) {
  const rootPath = getHybridStorageRoot(profileRootPath)
  if (!existsSync(rootPath)) return 'missing'
  const entries = listFileContents(rootPath)
  if (entries === null) return null
  return createStorageFilesSnapshot(entries)
}

export function createStorageProfileWatcher({
  getProfileRootPath,
  onExternalChange,
  intervalMs = 1500,
  debounceMs = 400,
  appWriteQuietMs = 2500,
}) {
  let lastSignature = computeStorageSignature(getProfileRootPath())
  let debounceTimer = null
  let quietTimer = null
  let appWriteQuietUntil = 0

  const clearDebounce = () => {
    if (debounceTimer === null) return
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const clearQuietTimer = () => {
    if (quietTimer === null) return
    clearTimeout(quietTimer)
    quietTimer = null
  }

  const scheduleQuietRescan = () => {
    clearQuietTimer()
    const delayMs = Math.max(0, appWriteQuietUntil - Date.now()) + debounceMs
    quietTimer = setTimeout(() => {
      quietTimer = null
      scan()
    }, delayMs)
    quietTimer.unref?.()
  }

  const markAppWrite = () => {
    clearDebounce()
    clearQuietTimer()
    appWriteQuietUntil = Date.now() + appWriteQuietMs
    lastSignature = computeStorageSignature(getProfileRootPath())
  }

  const scan = () => {
    const nextSignature = computeStorageSignature(getProfileRootPath())
    if (nextSignature === lastSignature) return
    clearDebounce()
    if (Date.now() < appWriteQuietUntil) {
      scheduleQuietRescan()
      return
    }
    lastSignature = nextSignature
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      if (Date.now() < appWriteQuietUntil) {
        scheduleQuietRescan()
        return
      }
      lastSignature = computeStorageSignature(getProfileRootPath())
      onExternalChange()
    }, debounceMs)
    debounceTimer.unref?.()
  }

  const interval = setInterval(scan, intervalMs)
  interval.unref?.()

  return {
    markAppWrite,
    reset: markAppWrite,
    scan,
    close: () => {
      clearInterval(interval)
      clearDebounce()
      clearQuietTimer()
    },
  }
}
