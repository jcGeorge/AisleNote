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

describe('NotebookApp frontmatter modal routing', () => {
  it('blocks structured frontmatter editing when stored YAML is invalid', () => {
    expect(source).toContain("body?.frontmatterStatus === 'invalid'")
    expect(source).toContain('Frontmatter YAML is invalid. Fix the markdown block before using the structured frontmatter editor.')
  })

  it('includes fixed list controls for template settings and note rows', () => {
    expect(source).toContain('aria-label="frontmatter fixed list values"')
    expect(source).toContain('aria-label="frontmatter fixed list default values"')
    expect(source).toContain('frontmatter-fixed-list-choice')
    expect(source).not.toContain('<option value="">no options</option>')
  })
})

describe('NotebookApp sidebar search wiring', () => {
  it('routes metadata filter actions into the sidebar search panel', () => {
    expect(source).toContain('SidebarSearchPanel')
    expect(source).toContain("activateSidebarSearchKey('synced', key)")
    expect(source).toContain("activateSidebarSearchKey('tags', key)")
    expect(source).toContain("activateSidebarSearchKey('frontmatter', getFrontmatterTemplateFilterKey(templateId))")
    expect(source).toContain('onOpenTagFilter={filterTag}')
    expect(source).toContain('onFilterTemplate={filterFrontmatterTemplateFromModal}')
    expect(source).not.toContain('frontmatterTemplateFilterAisleIds={frontmatterTemplateFilterAisleIds}')
    expect(source).not.toContain('onFilterAisleFrontmatterTemplate={filterAisleFrontmatterTemplate}')
  })
})

describe('NotebookApp aisle insertion focus', () => {
  it('routes shortcut and context-menu aisle creation through pending editor focus', () => {
    expect(source).toContain('addAisleFromNewlineRef.current = addAisle')
    expect(source).toContain('const insertEditorContextAisle = useCallback(')
    expect(source).toContain('addAisle(side, aisleId)')
    expect(source).toContain('pendingFocusToAisleIdRef.current = createdAisleId')
    expect(source).toContain('pendingScrollToAisleIdRef.current = createdAisleId')
    expect(source).toContain('pendingCursorRestoreRef.current = {')
    expect(source).toContain('aisleId: createdAisleId')
    expect(source).toContain("focusIntent: 'aisle-activation'")
    expect(source).toContain('setActiveAisleId(createdAisleId)')
    expect(source).not.toContain('window.setTimeout(() => setActiveAisleId(aisle.id), 0)')
  })
})
