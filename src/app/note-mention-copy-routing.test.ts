import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const appControllerSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), './useAppController.tsx'), 'utf8')

function extractMentionCopyHandler() {
  const start = appControllerSource.indexOf('const replaceCurrentNoteFromMention =')
  const end = appControllerSource.indexOf('const noteMention = useNoteMentionController', start)
  if (start < 0 || end < 0) throw new Error('replaceCurrentNoteFromMention block not found')
  return appControllerSource.slice(start, end)
}

describe('@ menu copy routing', () => {
  it('routes mention copy actions through aisle-scoped focused replacement', () => {
    const handler = extractMentionCopyHandler()

    expect(handler).toContain('getNoteMentionAisleCopyTarget(latestState, target)')
    expect(handler).toContain("scope: 'aisle'")
    expect(handler).toContain("const action = mode === 'linked' ? 'duplicate' : 'copy'")
    expect(handler).toContain('buildFocusedAisleStructuralPasteReplacement')
    expect(handler).toContain("mode: 'always'")
    expect(handler).toContain("getCopyAsPasteSuccessMessage('aisle', payload.action)")
    expect(handler).not.toContain('applyNoteCopyToState')
    expect(handler).not.toContain('applyIndependentCopyToScratchpad')
  })
})
