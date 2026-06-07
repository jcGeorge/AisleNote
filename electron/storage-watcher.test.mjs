import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computeStorageContentFingerprint, createStorageProfileWatcher } from './storage-watcher.mjs'

function withTempProfile(run) {
  const profileRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-storage-watcher-'))
  mkdirSync(profileRoot, { recursive: true })
  try {
    return run(profileRoot)
  } finally {
    rmSync(profileRoot, { recursive: true, force: true })
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('storage profile watcher', () => {
  it('computes content fingerprints independent of mtime-only changes', () =>
    withTempProfile((profileRoot) => {
      writeFileSync(path.join(profileRoot, 'manifest.json'), '{"schemaVersion":1}', 'utf8')
      const firstFingerprint = computeStorageContentFingerprint(profileRoot)

      utimesSync(path.join(profileRoot, 'manifest.json'), new Date(2_000), new Date(2_000))

      expect(computeStorageContentFingerprint(profileRoot)).toBe(firstFingerprint)
    }))

  it('changes content fingerprints when storage file contents change', () =>
    withTempProfile((profileRoot) => {
      writeFileSync(path.join(profileRoot, 'manifest.json'), '{"schemaVersion":1}', 'utf8')
      const firstFingerprint = computeStorageContentFingerprint(profileRoot)

      writeFileSync(path.join(profileRoot, 'manifest.json'), '{"schemaVersion":2}', 'utf8')

      expect(computeStorageContentFingerprint(profileRoot)).not.toBe(firstFingerprint)
    }))

  it('ignores hidden metadata files in content fingerprints', () =>
    withTempProfile((profileRoot) => {
      writeFileSync(path.join(profileRoot, 'manifest.json'), '{"schemaVersion":1}', 'utf8')
      const firstFingerprint = computeStorageContentFingerprint(profileRoot)

      writeFileSync(path.join(profileRoot, '.DS_Store'), 'metadata', 'utf8')
      writeFileSync(path.join(profileRoot, 'desktop.ini'), 'metadata', 'utf8')

      expect(computeStorageContentFingerprint(profileRoot)).toBe(firstFingerprint)
    }))

  it('defers quiet-window changes and reports them after rechecking', () =>
    withTempProfile((profileRoot) => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000)
      const onExternalChange = vi.fn()
      const watcher = createStorageProfileWatcher({
        getProfileRootPath: () => profileRoot,
        onExternalChange,
        intervalMs: 60_000,
        debounceMs: 20,
        appWriteQuietMs: 500,
      })
      try {
        watcher.markAppWrite()
        writeFileSync(path.join(profileRoot, 'manifest.json'), '{"schemaVersion":2}', 'utf8')
        watcher.scan()

        expect(onExternalChange).not.toHaveBeenCalled()
        vi.advanceTimersByTime(600)
        expect(onExternalChange).toHaveBeenCalledTimes(1)
      } finally {
        watcher.close()
      }
    }))

  it('suppresses app-owned writes after the saved signature is marked', () =>
    withTempProfile((profileRoot) => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000)
      const onExternalChange = vi.fn()
      const watcher = createStorageProfileWatcher({
        getProfileRootPath: () => profileRoot,
        onExternalChange,
        intervalMs: 60_000,
        debounceMs: 20,
        appWriteQuietMs: 500,
      })
      try {
        watcher.markAppWrite()
        writeFileSync(path.join(profileRoot, 'manifest.json'), '{"schemaVersion":2}', 'utf8')
        watcher.markAppWrite()
        watcher.scan()
        vi.advanceTimersByTime(600)

        expect(onExternalChange).not.toHaveBeenCalled()
      } finally {
        watcher.close()
      }
    }))

  it('still reports changes that are not app-owned writes', () =>
    withTempProfile((profileRoot) => {
      vi.useFakeTimers()
      vi.setSystemTime(1_000)
      const onExternalChange = vi.fn()
      const watcher = createStorageProfileWatcher({
        getProfileRootPath: () => profileRoot,
        onExternalChange,
        intervalMs: 60_000,
        debounceMs: 20,
        appWriteQuietMs: 500,
      })
      try {
        writeFileSync(path.join(profileRoot, 'manifest.json'), '{"schemaVersion":2}', 'utf8')
        watcher.scan()
        vi.advanceTimersByTime(20)

        expect(onExternalChange).toHaveBeenCalledTimes(1)
      } finally {
        watcher.close()
      }
    }))
})
