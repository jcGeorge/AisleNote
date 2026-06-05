import { describe, expect, it } from 'vitest'
import { getHeadingOutlineFromMarkdown } from '../editor/heading-outline'
import { DEFAULT_FRONTMATTER_SETTINGS } from '../frontmatter/frontmatter'
import { DEFAULT_NEWLINE_SHORTCUT_SETTINGS, DEFAULT_SHORTCUTS } from '../hotkeys/shortcuts'
import {
  WIKI_NOTE_REFERENCE_RE,
  buildInternalNoteLinkToken,
  buildPreviewToken,
  resolveWikiReferenceToken,
} from '../notes/note-references'
import { DEFAULT_UI_SETTINGS } from '../settings/defaults'
import type { AppState, FrontmatterSettings, NoteLocation } from '../types/app'
import { mergeImportedNotebookState } from './notebook-import'

function createIdGenerator() {
  let next = 0
  return () => {
    next += 1
    return `import-id-${next}`
  }
}

function noteLocation(tabId: string, subTabId: string | null = null): NoteLocation {
  return { domainId: 'domain', spaceId: 'space', tabId, subTabId }
}

function createFrontmatterSettings(): FrontmatterSettings {
  return {
    templates: [
      {
        id: 'template',
        name: 'Imported template',
        fields: [
          {
            id: 'field',
            key: 'status',
            type: 'text',
            defaultValue: '',
            computed: 'none',
          },
        ],
      },
    ],
    settingsTemplateId: 'template',
    lastAppliedTemplateId: 'template',
  }
}

function createNotebookState(markdownByBody: Record<string, string> = {}): AppState {
  const space = {
    id: 'space',
    name: 'Space',
    settings: { autoRemoveDeletedDays: 30 },
    data: {
      activeTabId: 'source',
      tabs: [
        {
          id: 'source',
          title: 'Source',
          noteBodyId: 'body-source',
          activeSubTabId: 'source-sub',
          subTabs: [{ id: 'source-sub', title: 'Source sub', noteBodyId: 'body-source-sub' }],
        },
        {
          id: 'target',
          title: 'Target',
          noteBodyId: 'body-target',
          activeSubTabId: null,
          subTabs: [],
        },
      ],
      deletedTabs: [
        {
          id: 'deleted-tab-entry',
          deletedAt: 10,
          tab: {
            id: 'deleted-tab',
            title: 'Deleted',
            noteBodyId: 'body-deleted',
            activeSubTabId: null,
            subTabs: [],
          },
        },
      ],
      deletedSubTabs: [],
    },
  }
  return {
    theme: 'dark',
    activeDomainId: 'domain',
    domains: [{ id: 'domain', name: 'Domain', activeSpaceId: 'space', spaces: [space] }],
    deletedDomains: [],
    deletedSpaces: [
      {
        id: 'deleted-space-entry',
        domainId: 'domain',
        domainName: 'Domain',
        deletedAt: 20,
        space: {
          ...space,
          id: 'deleted-space',
          name: 'Deleted space',
          data: { ...space.data, deletedTabs: [], deletedSubTabs: [] },
        },
      },
    ],
    scratchpad: { noteBodyId: 'body-scratchpad', activeAisleId: 'aisle-scratchpad' },
    noteBodies: [
      { id: 'body-source', aisles: [{ id: 'aisle-source', aisleBodyId: 'aisle-body-source' }] },
      { id: 'body-source-sub', aisles: [{ id: 'aisle-source-sub', aisleBodyId: 'aisle-body-source-sub' }] },
      { id: 'body-target', aisles: [{ id: 'aisle-target', aisleBodyId: 'aisle-body-target' }] },
      { id: 'body-deleted', aisles: [{ id: 'aisle-deleted', aisleBodyId: 'aisle-body-deleted' }] },
      { id: 'body-scratchpad', aisles: [{ id: 'aisle-scratchpad', aisleBodyId: 'aisle-body-scratchpad' }] },
    ],
    noteAisleBodies: [
      { id: 'aisle-body-source', markdown: markdownByBody['body-source'] ?? '' },
      { id: 'aisle-body-source-sub', markdown: markdownByBody['body-source-sub'] ?? '' },
      {
        id: 'aisle-body-target',
        markdown: markdownByBody['body-target'] ?? '# Intro\n\nTarget body',
        frontmatterMeta: {
          templateId: 'template',
          templateFieldOrigins: { status: { templateId: 'template', fieldId: 'field' } },
          templateRemovedFieldIds: ['field'],
        },
      },
      { id: 'aisle-body-deleted', markdown: '' },
      { id: 'aisle-body-scratchpad', markdown: 'scratch content' },
    ],
    activeSpaceId: 'space',
    spaces: [space],
    hotkeys: {
      shortcuts: DEFAULT_SHORTCUTS,
      newlineShortcuts: DEFAULT_NEWLINE_SHORTCUT_SETTINGS,
    },
    frontmatter: createFrontmatterSettings(),
    ui: {
      ...DEFAULT_UI_SETTINGS,
      noteCursorLocations: {},
      headingCollapseState: {},
    },
  }
}

describe('mergeImportedNotebookState', () => {
  it('appends remapped imported content with identical names and ids without mutating current settings', () => {
    const current = createNotebookState({ 'body-source': 'current source' })
    current.frontmatter = DEFAULT_FRONTMATTER_SETTINGS
    current.theme = 'dawn'
    const imported = createNotebookState({ 'body-source': 'imported source' })

    const { state: merged, summary } = mergeImportedNotebookState(current, imported, createIdGenerator())
    const importedDomain = merged.domains[1]
    const importedSpace = importedDomain.spaces[0]
    const importedSource = importedSpace.data.tabs.find((tab) => tab.title === 'Source')
    const scratchpadTab = importedSpace.data.tabs.find((tab) => tab.title === 'imported scratchpad')
    const importedTemplate = merged.frontmatter.templates.find((template) => template.name === 'Imported template')
    const importedTargetBody = merged.noteBodies.find((body) => body.id === importedSpace.data.tabs[1].noteBodyId)
    const importedTargetAisleBody = merged.noteAisleBodies?.find(
      (body) => body.id === importedTargetBody?.aisles[0]?.aisleBodyId,
    )

    expect(merged.domains).toHaveLength(2)
    expect(merged.domains[0]).toEqual(current.domains[0])
    expect(merged.theme).toBe('dawn')
    expect(merged.hotkeys).toEqual(current.hotkeys)
    expect(merged.ui).toEqual(current.ui)
    expect(merged.scratchpad).toEqual(current.scratchpad)
    expect(importedDomain.id).not.toBe('domain')
    expect(importedSpace.id).not.toBe('space')
    expect(importedSource?.id).not.toBe('source')
    expect(importedSource?.noteBodyId).not.toBe('body-source')
    expect(importedSpace.data.deletedTabs[0].id).not.toBe('deleted-tab-entry')
    expect(merged.deletedSpaces?.[merged.deletedSpaces.length - 1]?.id).not.toBe('deleted-space-entry')
    expect(scratchpadTab?.noteBodyId).not.toBe('body-scratchpad')
    expect(importedTemplate?.id).not.toBe('template')
    expect(importedTargetAisleBody?.frontmatterMeta?.templateId).toBe(importedTemplate?.id)
    expect(importedTargetAisleBody?.frontmatterMeta?.templateFieldOrigins?.status?.fieldId).toBe(
      importedTemplate?.fields[0].id,
    )
    expect(summary).toMatchObject({
      domains: 1,
      spaces: 1,
      tabs: 3,
      notes: 4,
      noteBodies: 5,
      frontmatterTemplates: 1,
    })
  })

  it('rewrites imported wiki links, previews, aisle anchors, heading anchors, and aliases to remapped targets', () => {
    const imported = createNotebookState()
    const heading = getHeadingOutlineFromMarkdown('aisle-target', '# Intro\n\nTarget body')[0]
    const target = noteLocation('target')
    const sourceMarkdown = [
      buildInternalNoteLinkToken(imported, target, 'Target alias'),
      buildPreviewToken(imported, { id: 'preview', target }),
      buildInternalNoteLinkToken(imported, { ...target, aisleIds: ['aisle-target'] }, 'Aisle alias'),
      buildInternalNoteLinkToken(
        imported,
        { ...target, heading: { aisleId: 'aisle-target', headingKey: heading.key } },
        'Heading alias',
      ),
      '[[Missing--abcdef]]',
    ].join('\n')
    imported.noteAisleBodies = imported.noteAisleBodies?.map((body) =>
      body.id === 'aisle-body-source' ? { ...body, markdown: sourceMarkdown } : body,
    )
    const current = createNotebookState()

    const { state: merged, summary } = mergeImportedNotebookState(current, imported, createIdGenerator())
    const importedDomain = merged.domains[1]
    const importedSpace = importedDomain.spaces[0]
    const importedSource = importedSpace.data.tabs.find((tab) => tab.title === 'Source')
    const importedSourceBody = merged.noteBodies.find((body) => body.id === importedSource?.noteBodyId)
    const importedSourceMarkdown =
      merged.noteAisleBodies?.find((body) => body.id === importedSourceBody?.aisles[0]?.aisleBodyId)?.markdown ?? ''
    const tokens = [...importedSourceMarkdown.matchAll(WIKI_NOTE_REFERENCE_RE)].map((match) => match[0])

    expect(tokens).toHaveLength(5)
    expect(tokens[0]).toContain('|Target alias')
    expect(tokens[1].startsWith('!')).toBe(true)
    expect(tokens[2]).toContain('|Aisle alias')
    expect(tokens[3]).toContain('|Heading alias')
    expect(tokens[4]).toBe('[[Missing--abcdef]]')
    tokens.slice(0, 4).forEach((token) => {
      const resolved = resolveWikiReferenceToken(merged, token)
      expect(resolved?.payload.target.domainId).toBe(importedDomain.id)
      expect(resolved?.payload.target.spaceId).toBe(importedSpace.id)
      expect(resolved?.payload.target.tabId).toBe(importedSpace.data.tabs.find((tab) => tab.title === 'Target')?.id)
    })
    expect(resolveWikiReferenceToken(merged, tokens[2])?.payload.aisleIds).toEqual([
      merged.noteBodies.find((body) => body.id === importedSpace.data.tabs.find((tab) => tab.title === 'Target')?.noteBodyId)
        ?.aisles[0].id,
    ])
    expect(resolveWikiReferenceToken(merged, tokens[3])?.payload.heading?.aisleId).toBe(
      merged.noteBodies.find((body) => body.id === importedSpace.data.tabs.find((tab) => tab.title === 'Target')?.noteBodyId)
        ?.aisles[0].id,
    )
    expect(summary.unresolvedReferences).toBe(1)
  })
})
