import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './NotebookApp.tsx'), 'utf8')
const contextMenuSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../components/overlays/NotebookEditorContextMenu.tsx'),
  'utf8',
)
const notebookEditorsSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../editor/useNotebookAisleEditors.ts'),
  'utf8',
)

describe('Notebook link insertion routing', () => {
  it('routes toolbar URL links through the lightweight link prompt', () => {
    expect(appSource).toContain('const openToolbarLinkPicker = useCallback')
    expect(appSource).toContain('notebookEditors.openUrlLinkPrompt()')
    expect(appSource).toContain('<LinkPrompt')
    expect(appSource).toContain('onOpenUrlLinkPrompt: openUrlLinkPrompt')
    expect(appSource).toContain('onOpenNoteLink={openNoteLinkFromLinkPrompt}')
    expect(appSource).toContain("source: 'toolbar-link'")
    expect(appSource).toContain("title: 'Insert note reference'")
    expect(appSource).toContain("actions: ['note-link', 'note-preview']")
    expect(appSource).toContain('onInsertWebLink={openToolbarLinkPicker}')
    expect(notebookEditorsSource).toContain('isUrlLinkShortcutEvent(event, isMacPlatformRef.current)')
    expect(notebookEditorsSource).toContain("if (event.key !== 'Enter') return")
    expect(notebookEditorsSource).toContain("root.addEventListener('click', handleLinkClick, true)")
    expect(notebookEditorsSource).toContain('openExternalWebUrl(href)')
  })

  it('exposes note link and note preview insert actions in the editor context menu', () => {
    expect(contextMenuSource).toContain('onInsertNoteLink')
    expect(contextMenuSource).toContain('onInsertNotePreview')
    expect(contextMenuSource).toContain('note link')
    expect(contextMenuSource).toContain('note preview')
    expect(appSource).toContain("onInsertNoteLink={() => openContextNoteReferencePicker('note-link')}")
    expect(appSource).toContain("onInsertNotePreview={() => openContextNoteReferencePicker('note-preview')}")
  })
})
