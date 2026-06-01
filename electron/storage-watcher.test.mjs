import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorageProfileWatcher } from './storage-watcher.mjs'

function withTempProfile(run) {
  const profileRoot = mkdtempSync(path.join(os.tmpdir(), 'tabs-storage-watcher-'))
  mkdirSync(path.join(profileRoot, 'notes'), { recursive: true })
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
        writeFileSync(path.join(profileRoot, 'notes', 'manifest.json'), '{"schemaVersion":2}', 'utf8')
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
        writeFileSync(path.join(profileRoot, 'notes', 'manifest.json'), '{"schemaVersion":2}', 'utf8')
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
        writeFileSync(path.join(profileRoot, 'notes', 'manifest.json'), '{"schemaVersion":2}', 'utf8')
        watcher.scan()
        vi.advanceTimersByTime(20)

        expect(onExternalChange).toHaveBeenCalledTimes(1)
      } finally {
        watcher.close()
      }
    }))
})
