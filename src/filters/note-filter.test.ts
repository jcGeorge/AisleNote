import { describe, expect, it } from 'vitest'
import { buildAisleSlotKey, decoupleAisleSlotsInState } from '../notes/aisle-links'
import { decoupleNoteLocationsInState } from '../notes/note-decouple-service'
import { parseSavedState } from '../state/app-state'
import {
  buildNoteFilterIndex,
  extractMediaFilterReferences,
  getFirstMatchingNoteFilterLocationForDomain,
  getFirstMatchingNoteFilterLocationForParent,
  getFirstMatchingNoteFilterLocationForSpace,
  getFrontmatterPropertyFilterKey,
  getFrontmatterTemplateFilterKey,
  getMediaFilterKey,
  getNoteFilterParentKey,
  getNoteFilterSpaceKey,
  getSyncedAisleFilterKey,
  getSyncedNoteFilterKey,
} from './note-filter'

function createState() {
  return parseSavedState(JSON.stringify({
    frontmatter: {
      settingsTemplateId: '',
      lastAppliedTemplateId: '',
      templates: [
        {
          id: 'template-basic',
          name: 'basic',
          fields: [{ id: 'field-status', key: 'Status', type: 'text', defaultValue: '', computed: 'none' }],
        },
      ],
    },
    domains: [
      {
        id: 'domain-a',
        name: 'Domain A',
        activeSpaceId: 'space-a',
        spaces: [
          {
            id: 'space-a',
            name: 'Space A',
            settings: { autoRemoveDeletedDays: 7 },
            data: {
              activeTabId: 'parent-a',
              tabs: [
                {
                  id: 'parent-a',
                  title: 'Parent A',
                  noteBodyId: 'body-shared-note',
                  activeSubTabId: 'sub-a',
                  subTabs: [
                    { id: 'sub-a', title: 'Sub A', noteBodyId: 'body-frontmatter-template' },
                    { id: 'sub-b', title: 'Sub B', noteBodyId: 'body-linked-aisle' },
                    { id: 'sub-copy', title: 'Sub Copy', noteBodyId: 'body-shared-note' },
                  ],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
      },
      {
        id: 'domain-b',
        name: 'Domain B',
        activeSpaceId: 'space-b',
        spaces: [
          {
            id: 'space-b',
            name: 'Space B',
            settings: { autoRemoveDeletedDays: 7 },
            data: {
              activeTabId: 'parent-b',
              tabs: [
                {
                  id: 'parent-b',
                  title: 'Parent B',
                  noteBodyId: 'body-frontmatter-property',
                  activeSubTabId: null,
                  subTabs: [],
                },
              ],
              deletedTabs: [],
              deletedSubTabs: [],
            },
          },
        ],
      },
    ],
    activeDomainId: 'domain-a',
    activeSpaceId: 'space-a',
    spaces: [
      {
        id: 'space-a',
        name: 'Space A',
        settings: { autoRemoveDeletedDays: 7 },
        data: {
          activeTabId: 'parent-a',
          tabs: [
            {
              id: 'parent-a',
              title: 'Parent A',
              noteBodyId: 'body-shared-note',
              activeSubTabId: 'sub-a',
              subTabs: [
                { id: 'sub-a', title: 'Sub A', noteBodyId: 'body-frontmatter-template' },
                { id: 'sub-b', title: 'Sub B', noteBodyId: 'body-linked-aisle' },
                { id: 'sub-copy', title: 'Sub Copy', noteBodyId: 'body-shared-note' },
              ],
            },
          ],
          deletedTabs: [],
          deletedSubTabs: [],
        },
      },
    ],
    noteBodies: [
      { id: 'body-shared-note', aisles: [{ id: 'aisle-note', aisleBodyId: 'aisle-body-note' }] },
      { id: 'body-frontmatter-template', aisles: [{ id: 'aisle-template', aisleBodyId: 'aisle-body-template' }] },
      { id: 'body-linked-aisle', aisles: [{ id: 'aisle-linked', aisleBodyId: 'aisle-body-linked' }] },
      { id: 'body-frontmatter-property', aisles: [{ id: 'aisle-property', aisleBodyId: 'aisle-body-linked' }] },
      { id: 'body-scratch', aisles: [{ id: 'aisle-scratch', aisleBodyId: 'aisle-body-scratch' }] },
    ],
    scratchpad: { noteBodyId: 'body-scratch', activeAisleId: 'aisle-scratch' },
    noteAisleBodies: [
      {
        id: 'aisle-body-note',
        markdown: [
          '#Tag',
          '![Hero](tabs-asset:///assets/photo.png#tabs-image=width=320)',
          '[Theme Song](tabs-asset:///assets/song.mp3#tabs-media=volume=50)',
          '[Clip](https://cdn.example.com/clip.mp4)',
          '![Hero copy](tabs-asset:///assets/photo.png#tabs-image=width=640)',
          '[Not an image filter](https://cdn.example.com/photo.png)',
        ].join('\n'),
      },
      {
        id: 'aisle-body-template',
        markdown: 'template',
        frontmatterStatus: 'valid',
        frontmatter: { Status: 'ready' },
        frontmatterMeta: { templateId: 'template-basic', templateDerived: true },
      },
      {
        id: 'aisle-body-linked',
        markdown: 'linked',
        frontmatterStatus: 'valid',
        frontmatter: { status: 'done', Owner: 'me' },
      },
      {
        id: 'aisle-body-scratch',
        markdown: 'scratch',
        frontmatterStatus: 'valid',
        frontmatter: { status: 'scratch' },
      },
    ],
  }))
}

describe('note filter index', () => {
  it('extracts markdown image references and audio/video links for the media filter', () => {
    const references = extractMediaFilterReferences([
      '![Hero](tabs-asset:///assets/photo.png#tabs-image=width=320)',
      '[Theme Song](tabs-asset:///assets/song.mp3#tabs-media=volume=50)',
      '[Clip File](https://cdn.example.com/clip.webm)',
      '[Plain Image Link](https://cdn.example.com/photo.png)',
    ].join('\n'))

    expect(references.map((reference) => ({
      key: reference.key,
      label: reference.label,
      kind: reference.kind,
      source: reference.source,
    }))).toEqual([
      {
        key: getMediaFilterKey('image', 'tabs-asset:///assets/photo.png'),
        label: 'Hero',
        kind: 'image',
        source: 'tabs-asset:///assets/photo.png',
      },
      {
        key: getMediaFilterKey('audio', 'tabs-asset:///assets/song.mp3'),
        label: 'Theme Song',
        kind: 'audio',
        source: 'tabs-asset:///assets/song.mp3',
      },
      {
        key: getMediaFilterKey('video', 'https://cdn.example.com/clip.webm'),
        label: 'Clip File',
        kind: 'video',
        source: 'https://cdn.example.com/clip.webm',
      },
    ])
  })

  it('builds media options grouped by stripped source URL with ordered occurrences', () => {
    const state = createState()
    const imageKey = getMediaFilterKey('image', 'tabs-asset:///assets/photo.png')
    const audioKey = getMediaFilterKey('audio', 'tabs-asset:///assets/song.mp3')
    const videoKey = getMediaFilterKey('video', 'https://cdn.example.com/clip.mp4')
    const index = buildNoteFilterIndex(state, 'media', [imageKey])

    expect(index.availableOptions.map((option) => ({
      key: option.key,
      label: option.label,
      count: option.count,
      type: option.type,
      mediaKind: option.mediaKind,
      source: option.source,
      previewUrl: option.previewUrl,
    })).sort((left, right) => left.key.localeCompare(right.key))).toEqual([
      {
        key: audioKey,
        label: 'Theme Song',
        count: 2,
        type: 'media-audio',
        mediaKind: 'audio',
        source: 'tabs-asset:///assets/song.mp3',
        previewUrl: undefined,
      },
      {
        key: imageKey,
        label: 'Hero',
        count: 4,
        type: 'media-image',
        mediaKind: 'image',
        source: 'tabs-asset:///assets/photo.png',
        previewUrl: 'tabs-asset:///assets/photo.png',
      },
      {
        key: videoKey,
        label: 'Clip',
        count: 2,
        type: 'media-video',
        mediaKind: 'video',
        source: 'https://cdn.example.com/clip.mp4',
        previewUrl: undefined,
      },
    ].sort((left, right) => left.key.localeCompare(right.key)))
    expect(index.selectedOccurrences.map((occurrence) => ({
      key: occurrence.key,
      label: occurrence.label,
      locationKey: [
        occurrence.location.domainId,
        occurrence.location.spaceId,
        occurrence.location.tabId,
        occurrence.location.subTabId ?? '__home__',
      ].join('::'),
    }))).toEqual([
      {
        key: imageKey,
        label: 'Hero',
        locationKey: 'domain-a::space-a::parent-a::__home__',
      },
      {
        key: imageKey,
        label: 'Hero copy',
        locationKey: 'domain-a::space-a::parent-a::__home__',
      },
      {
        key: imageKey,
        label: 'Hero',
        locationKey: 'domain-a::space-a::parent-a::sub-copy',
      },
      {
        key: imageKey,
        label: 'Hero copy',
        locationKey: 'domain-a::space-a::parent-a::sub-copy',
      },
    ])
    expect(index.noteCounts.get('domain-a::space-a::parent-a::__home__')).toBe(2)
    expect(index.noteCounts.get('domain-a::space-a::parent-a::sub-copy')).toBe(2)
  })

  it('includes synced whole-note and synced aisle groups together', () => {
    const state = createState()
    const index = buildNoteFilterIndex(state, 'synced', [])

    expect(index.availableOptions.map((option) => option.key).sort()).toEqual([
      getSyncedAisleFilterKey('aisle-body-linked'),
      getSyncedNoteFilterKey('body-shared-note'),
    ].sort())
    expect(index.noteCounts.get('domain-a::space-a::parent-a::__home__')).toBe(1)
    expect(index.noteCounts.get('domain-a::space-a::parent-a::sub-copy')).toBe(1)
    expect(index.noteCounts.get('domain-a::space-a::parent-a::sub-b')).toBe(1)
    expect(index.noteCounts.get('domain-b::space-b::parent-b::__home__')).toBe(1)
  })

  it('filters synced notes and aisles by selected group key', () => {
    const state = createState()
    const noteIndex = buildNoteFilterIndex(state, 'synced', [getSyncedNoteFilterKey('body-shared-note')])
    const aisleIndex = buildNoteFilterIndex(state, 'synced', [getSyncedAisleFilterKey('aisle-body-linked')])

    expect(noteIndex.noteCounts.get('domain-a::space-a::parent-a::__home__')).toBe(1)
    expect(noteIndex.noteCounts.get('domain-a::space-a::parent-a::sub-b')).toBeUndefined()
    expect(aisleIndex.noteCounts.get('domain-a::space-a::parent-a::sub-b')).toBe(1)
    expect(aisleIndex.noteCounts.get('domain-a::space-a::parent-a::__home__')).toBeUndefined()
  })

  it('drops a synced whole-note option key after the note copies are de-coupled', () => {
    const state = createState()
    const staleKey = getSyncedNoteFilterKey('body-shared-note')
    const decoupledState = decoupleNoteLocationsInState(
      state,
      'body-shared-note',
      new Set(['domain-a::space-a::parent-a::__home__']),
      true,
    )
    const index = buildNoteFilterIndex(decoupledState, 'synced', [staleKey])

    expect(index.availableOptions.map((option) => option.key)).not.toContain(staleKey)
    expect(index.selectedOccurrences).toEqual([])
    expect(index.noteCounts.size).toBe(0)
  })

  it('drops a synced aisle option key after the aisle copies are de-coupled', () => {
    const state = createState()
    const staleKey = getSyncedAisleFilterKey('aisle-body-linked')
    const result = decoupleAisleSlotsInState(
      state,
      'aisle-body-linked',
      new Set([buildAisleSlotKey('body-linked-aisle', 'aisle-linked')]),
      true,
    )
    expect(result.status).toBe('applied')
    if (result.status !== 'applied') throw new Error('expected aisle slots to de-couple')
    const index = buildNoteFilterIndex(result.state, 'synced', [staleKey])

    expect(index.availableOptions.map((option) => option.key)).not.toContain(staleKey)
    expect(index.selectedOccurrences).toEqual([])
    expect(index.noteCounts.size).toBe(0)
  })

  it('matches frontmatter templates and case-insensitive property names', () => {
    const state = createState()
    const templateIndex = buildNoteFilterIndex(state, 'frontmatter', [getFrontmatterTemplateFilterKey('template-basic')])
    const propertyIndex = buildNoteFilterIndex(state, 'frontmatter', [getFrontmatterPropertyFilterKey('STATUS')])

    expect(templateIndex.noteCounts.get('domain-a::space-a::parent-a::sub-a')).toBe(1)
    expect(templateIndex.noteCounts.get('domain-b::space-b::parent-b::__home__')).toBeUndefined()
    expect(propertyIndex.noteCounts.get('domain-a::space-a::parent-a::sub-a')).toBe(1)
    expect(propertyIndex.noteCounts.get('domain-b::space-b::parent-b::__home__')).toBe(1)
    expect(propertyIndex.scratchpadCount).toBe(0)
  })

  it('builds rail counts and first matches for active filters', () => {
    const state = createState()
    const index = buildNoteFilterIndex(state, 'frontmatter', [getFrontmatterPropertyFilterKey('owner')])

    expect(index.domainCounts.get('domain-b')).toBe(1)
    expect(index.spaceCounts.get(getNoteFilterSpaceKey('domain-b', 'space-b'))).toBe(1)
    expect(index.parentCounts.get(getNoteFilterParentKey('domain-b', 'space-b', 'parent-b'))).toBe(1)
    expect(getFirstMatchingNoteFilterLocationForDomain(index, 'domain-b')).toEqual({
      domainId: 'domain-b',
      spaceId: 'space-b',
      tabId: 'parent-b',
      subTabId: null,
    })
    expect(getFirstMatchingNoteFilterLocationForSpace(index, 'domain-b', 'space-b')).toEqual({
      domainId: 'domain-b',
      spaceId: 'space-b',
      tabId: 'parent-b',
      subTabId: null,
    })
    expect(getFirstMatchingNoteFilterLocationForParent(index, 'domain-b', 'space-b', 'parent-b')).toEqual({
      domainId: 'domain-b',
      spaceId: 'space-b',
      tabId: 'parent-b',
      subTabId: null,
    })
  })
})
