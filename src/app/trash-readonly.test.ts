import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appControllerSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './useAppController.tsx'), 'utf8')

describe('trash read-only note display', () => {
  it('keeps trash markdown out of editor persistence state', () => {
    expect(appControllerSource).toContain('const displayContent = activeContent')
    expect(appControllerSource).toContain("const isEditorView = viewMode === 'main'")
    expect(appControllerSource).not.toContain("viewMode === 'trash' ? trashDisplay.markdown : activeContent")
    expect(appControllerSource).not.toContain("viewMode === 'main' || (viewMode === 'trash'")
  })

  it('renders deleted trash notes with the read-only markdown preview instead of the editor shell', () => {
    expect(appControllerSource).toContain("import { TrashMarkdownPreview } from '../components/trash/TrashMarkdownPreview'")
    expect(appControllerSource).toContain('<TrashMarkdownPreview markdown={trashDisplay.markdown} />')
    expect(appControllerSource).not.toContain('renderEditorShell()')
  })
})
