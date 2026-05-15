import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAppStateResult, saveAppState } from './app-state-storage.mjs'

function createTempUserDataPath() {
  return mkdtempSync(path.join(os.tmpdir(), 'tabs-user-data-'))
}

function withTempUserDataPath(run) {
  const userDataPath = createTempUserDataPath()
  try {
    return run(userDataPath)
  } finally {
    rmSync(userDataPath, { recursive: true, force: true })
  }
}

function serializedAppState() {
  const space = {
    id: 'space-1',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 7 },
    data: {
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          title: 'Tab',
          noteBodyId: 'body-1',
          homeContent: 'hello',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [],
      deletedSubTabs: [],
    },
  }

  return JSON.stringify({
    theme: 'dawn',
    activeDomainId: 'domain-1',
    domains: [
      {
        id: 'domain-1',
        name: 'Domain',
        activeSpaceId: space.id,
        spaces: [space],
      },
    ],
    noteBodies: [
      {
        id: 'body-1',
        aisles: [{ id: 'aisle-1', markdown: 'hello' }],
      },
    ],
    activeSpaceId: space.id,
    spaces: [space],
  })
}

describe('Electron app state storage load result', () => {
  it('returns serialized state for a valid hybrid profile', () =>
    withTempUserDataPath((userDataPath) => {
      saveAppState(userDataPath, serializedAppState())

      const result = loadAppStateResult(userDataPath)

      expect(result.ok).toBe(true)
      expect(result.source).toBe('hybrid')
      expect(result.serializedState).toEqual(expect.any(String))
      const parsed = JSON.parse(result.serializedState)
      expect(parsed.domains).toHaveLength(1)
      expect(parsed.noteBodies).toHaveLength(1)
    }))

  it('returns an empty writable result when no profile exists', () =>
    withTempUserDataPath((userDataPath) => {
      expect(loadAppStateResult(userDataPath)).toEqual({
        ok: true,
        serializedState: null,
        source: 'empty',
      })
    }))

  it('returns a failed result for an existing corrupt profile', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), '{nope', 'utf8')

      expect(loadAppStateResult(userDataPath)).toEqual({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
      })
    }))

  it('returns a failed result for an unsupported existing profile', () =>
    withTempUserDataPath((userDataPath) => {
      const root = path.join(userDataPath, 'notes-data')
      mkdirSync(root, { recursive: true })
      writeFileSync(path.join(root, 'manifest.json'), '{"schemaVersion":999}', 'utf8')

      expect(loadAppStateResult(userDataPath)).toEqual({
        ok: false,
        serializedState: null,
        source: 'hybrid',
        error: 'Existing app state could not be loaded.',
      })
    }))
})
