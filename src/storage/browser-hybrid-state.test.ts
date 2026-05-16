import { describe, expect, it } from 'vitest'
import { parseSavedState } from '../state/app-state'
import { buildHybridFileMapFromSerializedState, readSerializedStateFromHybridFileMap } from './browser-hybrid-state'

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
    const serialized = readSerializedStateFromHybridFileMap(fileMap)
    const roundTripped = parseSavedState(serialized)
    const homeBody = roundTripped.noteBodies.find((body) => body.id === 'body-tab')
    const subBody = roundTripped.noteBodies.find((body) => body.id === 'body-sub')

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
})
