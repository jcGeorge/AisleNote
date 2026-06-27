import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './VaultApp.tsx'), 'utf8')
const contextMenuSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../components/overlays/VaultEditorContextMenu.tsx'),
  'utf8',
)
const vaultEditorsSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../editor/useVaultAisleEditors.ts'),
  'utf8',
)

describe('Vault link insertion routing', () => {
  it('routes toolbar URL links through the lightweight link prompt', () => {
    expect(appSource).toContain('const openToolbarLinkPicker = useCallback')
    expect(appSource).toContain('vaultEditors.openUrlLinkPrompt()')
    expect(appSource).toContain('<LinkPrompt')
    expect(appSource).toContain('onOpenUrlLinkPrompt: openUrlLinkPrompt')
    expect(appSource).toContain('onOpenNoteLink={openNoteLinkFromLinkPrompt}')
    expect(appSource).toContain("source: 'toolbar-link'")
    expect(appSource).toContain("title: 'Insert note reference'")
    expect(appSource).toContain("actions: ['note-link', 'note-preview']")
    expect(appSource).toContain('onInsertWebLink={openToolbarLinkPicker}')
    expect(vaultEditorsSource).toContain('isUrlLinkShortcutEvent(event, isMacPlatformRef.current)')
    expect(vaultEditorsSource).toContain("if (event.key !== 'Enter') return")
    expect(vaultEditorsSource).toContain("root.addEventListener('click', handleLinkClick, true)")
    expect(vaultEditorsSource).toContain('openExternalWebUrl(href)')
  })

  it('exposes note link and note preview insert actions in the editor context menu', () => {
    expect(contextMenuSource).toContain('onInsertNoteLink')
    expect(contextMenuSource).toContain('onInsertNotePreview')
    expect(contextMenuSource).toContain('note link')
    expect(contextMenuSource).toContain('note preview')
    expect(appSource).toContain("onInsertNoteLink={() => openContextNoteReferencePicker('note-link')}")
    expect(appSource).toContain("onInsertNotePreview={() => openContextNoteReferencePicker('note-preview')}")
  })

  it('inserts vault note references through the note-aware editor API', () => {
    const insertStart = appSource.indexOf('const insertVaultNoteReference = useCallback')
    const insertEnd = appSource.indexOf('const applyVaultNoteCopyAction = useCallback', insertStart)
    const insertBody = appSource.slice(insertStart, insertEnd)

    expect(insertBody).toContain('const insertRange = currentPicker?.source === \'mention\'')
    expect(insertBody).toContain('vaultEditors.insertNoteReferenceAtSelection(token, insertRange)')
    expect(insertBody).toContain('vaultEditors.insertNoteReferenceAtSelection(token)')
    expect(insertBody).not.toContain('vaultEditors.insertTextAtSelection(token)')
    expect(insertBody).not.toContain('vaultEditors.replaceActiveEditorRangeWithText')
  })
})
