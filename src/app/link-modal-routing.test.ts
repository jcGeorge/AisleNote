import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../App.tsx'), 'utf8')

describe('App add-link modal routing', () => {
  it('routes context-menu add link through URL selection behavior while preserving explicit note links', () => {
    expect(appSource).toContain('const openEditorContextLinkModal = (mode: LinkInsertMode | null) => {')
    expect(appSource).toContain("if (mode === 'note') {")
    expect(appSource).toContain("openSharedLinkModal(selectedText, 'note')")
    expect(appSource).toContain("openUrlLinkModalFromSelection(selectedText, 'context-menu')")
  })

  it('suspends App-level shortcuts while the insert-link modal is open', () => {
    expect(appSource).toContain("const insertNoteReferenceModalOpen = modal?.type === 'insert-note-reference'")
    expect(appSource).toContain('if (insertNoteReferenceModalOpen) return')
    expect(appSource).toContain("if (!shortcutMode || viewMode !== 'main' || insertNoteReferenceModalOpen) return")
    expect(appSource).toContain('shortcutsSuspended: insertNoteReferenceModalOpen')
  })
})
