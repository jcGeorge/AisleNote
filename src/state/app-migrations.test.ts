import { describe, expect, it } from 'vitest'
import { parseSavedState } from './app-state'
import { CURRENT_APP_DATA_VERSION, migrateRawAppData } from './app-migrations'

describe('app data migrations', () => {
  it('passes current-version app data through unchanged', () => {
    const raw = { dataVersion: CURRENT_APP_DATA_VERSION, theme: 'dawn', spaces: [] }

    const result = migrateRawAppData(raw)

    expect(result).toEqual({
      ok: true,
      data: raw,
      fromVersion: CURRENT_APP_DATA_VERSION,
      toVersion: CURRENT_APP_DATA_VERSION,
    })
  })

  it('normalizes legacy unversioned JSON through parseSavedState', () => {
    const state = parseSavedState(JSON.stringify({ theme: 'light', spaces: [] }))

    expect(state.theme).toBe('light')
    expect(state.domains.length).toBeGreaterThan(0)
  })

  it('fails safely for unsupported future versions', () => {
    const state = parseSavedState(JSON.stringify({ dataVersion: CURRENT_APP_DATA_VERSION + 1, theme: 'light' }))

    expect(state.theme).toBe('dawn')
  })
})
