import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { getHybridStorageRoot } from './app-state-storage.mjs'

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
    if (!entry.isFile()) continue
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

export function createStorageProfileWatcher({
  getProfileRootPath,
  onExternalChange,
  intervalMs = 1500,
  debounceMs = 400,
}) {
  let lastSignature = computeStorageSignature(getProfileRootPath())
  let debounceTimer = null

  const clearDebounce = () => {
    if (debounceTimer === null) return
    clearTimeout(debounceTimer)
    debounceTimer = null
  }

  const markAppWrite = () => {
    clearDebounce()
    lastSignature = computeStorageSignature(getProfileRootPath())
  }

  const scan = () => {
    const nextSignature = computeStorageSignature(getProfileRootPath())
    if (nextSignature === lastSignature) return
    lastSignature = nextSignature
    clearDebounce()
    debounceTimer = setTimeout(() => {
      debounceTimer = null
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
    },
  }
}
