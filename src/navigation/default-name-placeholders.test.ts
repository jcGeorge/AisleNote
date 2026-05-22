import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const navigationDir = dirname(fileURLToPath(import.meta.url))

function readSource(relativePath: string): string {
  return readFileSync(join(navigationDir, relativePath), 'utf8')
}

describe('space and domain placeholder names', () => {
  it('uses lowercase placeholders for compact and full-page creation paths', () => {
    const appSource = readSource('../App.tsx')
    const navigationActionsSource = readSource('useAppNavigationActions.ts')
    const domainsSource = readSource('../state/domains.ts')

    expect(appSource).toContain("createSpace('space'")
    expect(appSource).toContain("createDomain('domain'")
    expect(navigationActionsSource).toContain("createSpace('space'")
    expect(navigationActionsSource).toContain("createDomain('domain'")
    expect(domainsSource).toContain("createDomain(name = 'domain'")

    expect(appSource).not.toContain('New Space')
    expect(appSource).not.toContain('New Domain')
    expect(navigationActionsSource).not.toContain('New Space')
    expect(navigationActionsSource).not.toContain('New Domain')
    expect(domainsSource).not.toContain('New Domain')
  })
})
