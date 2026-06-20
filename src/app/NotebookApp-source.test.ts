import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./NotebookApp.tsx', import.meta.url), 'utf8')

describe('NotebookApp editable asset tools', () => {
  it('closes editable asset tool overlays only when the active note changes', () => {
    expect(source).toContain("const previousAssetToolsNoteLocationKeyRef = useRef('')")
    expect(source).toMatch(
      /useEffect\(\(\) => {\s*if \(previousAssetToolsNoteLocationKeyRef\.current === activeNoteLocationKey\) return\s*previousAssetToolsNoteLocationKeyRef\.current = activeNoteLocationKey\s*imageToolsController\.close\(\)\s*mediaToolsController\.close\(\)\s*}, \[activeNoteLocationKey, imageToolsController, mediaToolsController\]\)/,
    )
  })
})
