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
    const appControllerSource = readSource('../app/useAppController.tsx')
    const domainsSource = readSource('../state/domains.ts')

    expect(appControllerSource).toContain("createSpace('space'")
    expect(appControllerSource).toContain("createDomain('domain'")
    expect(domainsSource).toContain("createDomain(name = 'domain'")

    expect(appControllerSource).not.toContain('New Space')
    expect(appControllerSource).not.toContain('New Domain')
    expect(domainsSource).not.toContain('New Domain')
  })
})
