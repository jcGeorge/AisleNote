import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appControllerSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './useAppController.tsx'), 'utf8')

describe('et cetera navigation', () => {
  it('remembers the last utility parent and routes the settings shortcut through et cetera', () => {
    expect(appControllerSource).toContain("type EtCeteraViewMode = Extract<ViewMode, 'about' | 'messages' | 'settings'>")
    expect(appControllerSource).toContain('const lastEtCeteraViewModeRef = useRef<EtCeteraViewMode>')
    expect(appControllerSource).toContain('const openEtCeteraView = () => {')
    expect(appControllerSource).toContain('const targetViewMode = lastEtCeteraViewModeRef.current')
    expect(appControllerSource).toContain('openSettings: openEtCeteraView')
  })

  it('keeps the settings parent button separate from the et cetera entry point', () => {
    expect(appControllerSource).toContain('onOpenSettings={openSettingsView}')
    expect(appControllerSource).toContain('onOpenEtCetera={openEtCeteraView}')
  })
})
