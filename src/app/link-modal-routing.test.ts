import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appControllerSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './useAppController.tsx'), 'utf8')

describe('App add-link modal routing', () => {
  it('routes context-menu add link through URL selection behavior while preserving explicit note links', () => {
    expect(appControllerSource).toContain('const openEditorContextLinkModal = (mode: LinkInsertMode | null) => {')
    expect(appControllerSource).toContain("if (mode === 'note') {")
    expect(appControllerSource).toContain("openSharedLinkModal(selectedText, 'note')")
    expect(appControllerSource).toContain("openUrlLinkModalFromSelection(selectedText, 'context-menu')")
  })

  it('suspends App-level shortcuts while the insert-link modal is open', () => {
    expect(appControllerSource).toContain("const insertNoteReferenceModalOpen = modal?.type === 'insert-note-reference'")
    expect(appControllerSource).toContain('if (insertNoteReferenceModalOpen) return')
    expect(appControllerSource).toContain("if (!shortcutMode || viewMode !== 'main' || insertNoteReferenceModalOpen) return")
    expect(appControllerSource).toContain('shortcutsSuspended: insertNoteReferenceModalOpen')
  })
})
