import { describe, expect, it } from 'vitest'
import { parseSavedState } from '../state/app-state'
import { buildHybridFileMapFromSerializedState, readSerializedStateFromHybridFileMap } from './browser-hybrid-state'

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

describe('browser hybrid storage', () => {
  it('round trips markdown note bodies through the manifest file map', () => {
    const state = parseSavedState(
      JSON.stringify({
        theme: 'dawn',
        spaces: [
          {
            id: 'space-1',
            name: 'Space',
            data: {
              activeTabId: 'tab-1',
              tabs: [
                {
                  id: 'tab-1',
                  title: 'Tab',
                  noteBodyId: 'body-tab',
                  homeContent: 'home mirror',
                  activeSubTabId: 'sub-1',
                  subTabs: [
                    {
                      id: 'sub-1',
                      title: 'Sub',
                      noteBodyId: 'body-sub',
                      content: 'sub mirror',
                    },
                  ],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
        noteBodies: [
          {
            id: 'body-tab',
            frontmatter: { created: '2024-01-01' },
            frontmatterTemplateId: 'template-1',
            frontmatterTemplateDerived: true,
            frontmatterTemplateFieldOrigins: {
              created: { templateId: 'template-1', fieldId: 'field-1' },
            },
            frontmatterTemplateRemovedFieldIds: ['field-2'],
            frontmatterComputedFields: { created: 'createdAt' },
            aisles: [{ id: 'aisle-tab', markdown: 'home body' }],
          },
          { id: 'body-sub', aisles: [{ id: 'aisle-sub', markdown: 'sub body' }] },
        ],
        frontmatter: {
          settingsTemplateId: 'template-1',
          lastAppliedTemplateId: 'template-1',
          templates: [
            {
              id: 'template-1',
              name: 'template',
              fields: [{ id: 'field-1', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' }],
            },
          ],
        },
        ui: {
          noteCursorLocations: {
            'domain::space-1::tab-1::__home__': {
              activeAisleId: 'aisle-tab',
              aisles: {
                'aisle-tab': {
                  anchor: 1,
                  head: 3,
                  anchorBlock: { blockIndex: 0, offset: 1 },
                  headBlock: { blockIndex: 0, offset: 3 },
                  updatedAt: 100,
                },
              },
              updatedAt: 100,
            },
          },
        },
      }),
    )

    const fileMap = buildHybridFileMapFromSerializedState(JSON.stringify(state))
    const rootManifestEntry = fileMap.get('notes-data/manifest.json')
    const rootManifest =
      rootManifestEntry?.kind === 'text' ? (JSON.parse(rootManifestEntry.text) as Record<string, unknown>) : null
    const firstDomain = getRecord(Array.isArray(rootManifest?.domains) ? rootManifest.domains[0] : null)
    const paths = Array.from(fileMap.keys())
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const homeBody = roundTripped.noteBodies.find((body) => body.id === 'body-tab')
    const subBody = roundTripped.noteBodies.find((body) => body.id === 'body-sub')

    expect(rootManifest?.schemaVersion).toBe(2)
    expect(firstDomain.path).toEqual(expect.stringMatching(/^humble beginnings--[a-f0-9]{6}$/))
    expect(paths.some((path) => path.startsWith('notes-data/domains/'))).toBe(true)
    expect(paths.some((path) => path.startsWith('notes-data/topics/'))).toBe(false)
    expect(paths.some((path) => path.startsWith('notes-data/note-bodies/'))).toBe(false)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/home\.md$/.test(path))).toBe(true)
    expect(paths.some((path) => /\/Tab--[a-f0-9]{6}\/Sub--[a-f0-9]{6}\/home\.md$/.test(path))).toBe(true)
    expect(serialized).not.toBeNull()
    expect(homeBody?.aisles[0]?.markdown).toBe('home body')
    expect(homeBody?.frontmatter).toEqual({ created: '2024-01-01' })
    expect(homeBody?.frontmatterTemplateId).toBe('template-1')
    expect(homeBody?.frontmatterTemplateDerived).toBe(true)
    expect(homeBody?.frontmatterTemplateFieldOrigins).toEqual({
      created: { templateId: 'template-1', fieldId: 'field-1' },
    })
    expect(homeBody?.frontmatterTemplateRemovedFieldIds).toEqual(['field-2'])
    expect(homeBody?.frontmatterComputedFields).toEqual({ created: 'createdAt' })
    expect(subBody?.aisles[0]?.markdown).toBe('sub body')
    expect(roundTripped.frontmatter.settingsTemplateId).toBe('template-1')
    expect(roundTripped.frontmatter.lastAppliedTemplateId).toBe('template-1')
    expect(roundTripped.ui.noteCursorLocations['domain::space-1::tab-1::__home__']).toEqual({
      activeAisleId: 'aisle-tab',
      aisles: {
        'aisle-tab': {
          anchor: 1,
          head: 3,
          anchorBlock: { blockIndex: 0, offset: 1 },
          headBlock: { blockIndex: 0, offset: 3 },
          updatedAt: 100,
        },
      },
      updatedAt: 100,
    })
  })

  it('does not read v1 topic/note-body file maps', () => {
    const fileMap = new Map([
      [
        'notes-data/manifest.json',
        {
          path: 'notes-data/manifest.json',
          kind: 'text' as const,
          text: JSON.stringify({
            schemaVersion: 1,
            topics: [{ id: 'domain-1', title: 'Domain' }],
            activeTopicId: 'domain-1',
          }),
        },
      ],
      [
        'notes-data/topics/domain-1/manifest.json',
        {
          path: 'notes-data/topics/domain-1/manifest.json',
          kind: 'text' as const,
          text: JSON.stringify({ id: 'domain-1', title: 'Domain', spaces: [] }),
        },
      ],
    ])

    expect(readSerializedStateFromHybridFileMap(fileMap)).toBeNull()
  })
})
