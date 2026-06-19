import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const appSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './NotebookApp.tsx'), 'utf8')

describe('@ menu copy routing', () => {
  it('routes mention copy actions through focused-aisle notebook replacement helpers', () => {
    expect(appSource).toContain("source: 'mention'")
    expect(appSource).toContain("actions: ['note-link', 'note-preview', 'independent-copy', 'synced-copy']")
    expect(appSource).toContain('anchor: null')
    expect(appSource).toContain('replaceFocusedAisleFromTargetNote(previous')
    expect(appSource).toContain('focusedAisleId: renderedActiveAisleId')
    expect(appSource).toContain("source === 'whole-note-copy'")
    expect(appSource).toContain('replaceActiveNoteBodyFromTargetNote(previous')
    expect(appSource).toContain('dismissedMentionStartRef')
    expect(appSource).toContain('dismissedMentionStartRef.current === mention.from')
    expect(appSource).toContain('dismissedMentionStartRef.current = current.mentionRange.from')
    expect(appSource).not.toContain('domainId')
    expect(appSource).not.toContain('spaceId')
  })
})
