import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function readSource(relativePath) {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
}

describe('immediate app-state commit routing', () => {
  it('routes Settings immediate commits through usePersistentAppState commitAppStateNow', () => {
    const source = readSource('src/settings/useSettingsController.ts')

    expect(source).toContain('commitAppStateNow')
    expect(source).not.toContain('appPersistenceService')
    expect(source).not.toContain('saveSerializedState')
  })

})
