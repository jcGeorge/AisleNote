import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./usePersistentAppState.ts', import.meta.url), 'utf8')

describe('persistent app state source wiring', () => {
  it('exposes an external state load version for watcher-applied state updates', () => {
    expect(source).toContain('externalStateLoadVersion: number')
    expect(source).toContain('const [externalStateLoadVersion, setExternalStateLoadVersion] = useState(0)')
    const subscribeIndex = source.indexOf('appPersistenceService.subscribeSerializedState((serializedState) => {')
    const subscribeBody = source.slice(subscribeIndex, source.indexOf('return () => {', subscribeIndex))

    expect(subscribeIndex).toBeGreaterThan(-1)
    expect(subscribeBody).toContain('setExternalStateLoadVersion((version) => version + 1)')
    expect(subscribeBody).toContain('setState(nextState)')
    expect(subscribeBody).not.toContain('stateRef.current = nextState')
    expect(source).toContain('setExternalStateLoadVersion((version) => version + 1)')
    expect(source).toContain('externalStateLoadVersion,')
  })
})
