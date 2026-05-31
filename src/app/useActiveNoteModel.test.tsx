import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE } from '../state/app-state'
import { SCRATCHPAD_CURSOR_LOCATION_KEY } from '../state/scratchpad'
import type { AppState, NoteAisleBody, NoteBody } from '../types/app'
import { useActiveNoteModel } from './useActiveNoteModel'

type NoteBodyFixture = {
  noteBody: NoteBody
  aisleBodies: NoteAisleBody[]
}

function createNoteBodyFixture(bodyId: string, aisleIds: string[]): NoteBodyFixture {
  return {
    noteBody: {
      id: bodyId,
      aisles: aisleIds.map((id) => ({
        id,
        aisleBodyId: `${id}-body`,
      })),
    },
    aisleBodies: aisleIds.map((id) => ({
      id: `${id}-body`,
      markdown: `${id} markdown`,
    })),
  }
}

function createState(options: {
  scratchpadActiveAisleId?: string
  scratchpadSavedAisleId?: string
} = {}): AppState {
  const normal = createNoteBodyFixture('normal-body', ['normal-a', 'normal-b'])
  const scratchpad = createNoteBodyFixture('scratch-body', ['scratch-a', 'scratch-b'])
  const baseSpace = DEFAULT_STATE.spaces[0]
  const baseTab = baseSpace.data.tabs[0]
  const activeTab = {
    ...baseTab,
    noteBodyId: normal.noteBody.id,
    activeSubTabId: null,
  }
  const activeSpace = {
    ...baseSpace,
    data: {
      ...baseSpace.data,
      activeTabId: activeTab.id,
      tabs: [activeTab],
    },
  }
  const activeDomain = {
    ...DEFAULT_STATE.domains[0],
    activeSpaceId: activeSpace.id,
    spaces: [activeSpace],
  }
  const scratchpadSavedAisleId = options.scratchpadSavedAisleId

  return {
    ...DEFAULT_STATE,
    activeDomainId: activeDomain.id,
    activeSpaceId: activeSpace.id,
    domains: [activeDomain],
    spaces: [activeSpace],
    scratchpad: {
      noteBodyId: scratchpad.noteBody.id,
      ...(options.scratchpadActiveAisleId ? { activeAisleId: options.scratchpadActiveAisleId } : {}),
    },
    noteBodies: [normal.noteBody, scratchpad.noteBody],
    noteAisleBodies: [...normal.aisleBodies, ...scratchpad.aisleBodies],
    ui: {
      ...DEFAULT_STATE.ui,
      noteCursorLocations: {
        ...DEFAULT_STATE.ui.noteCursorLocations,
        ...(scratchpadSavedAisleId
          ? {
              [SCRATCHPAD_CURSOR_LOCATION_KEY]: {
                activeAisleId: scratchpadSavedAisleId,
                aisles: {},
                updatedAt: 1,
              },
            }
          : {}),
      },
    },
  }
}

function renderModel(
  state: AppState,
  activeAisleId: string,
  scratchpadActive: boolean,
): ReturnType<typeof useActiveNoteModel> {
  let model: ReturnType<typeof useActiveNoteModel> | null = null

  function Probe() {
    model = useActiveNoteModel({ state, activeAisleId, scratchpadActive })
    return null
  }

  renderToStaticMarkup(<Probe />)
  if (!model) throw new Error('model did not render')
  return model
}

describe('useActiveNoteModel', () => {
  it('prefers a live scratchpad aisle over the stored scratchpad active aisle', () => {
    const model = renderModel(createState({ scratchpadActiveAisleId: 'scratch-b' }), 'scratch-a', true)

    expect(model.resolvedActiveAisleId).toBe('scratch-a')
    expect(model.activeContent).toBe('scratch-a markdown')
  })

  it('restores the stored scratchpad active aisle when the live aisle is invalid', () => {
    const model = renderModel(createState({ scratchpadActiveAisleId: 'scratch-b' }), 'missing-aisle', true)

    expect(model.resolvedActiveAisleId).toBe('scratch-b')
    expect(model.activeContent).toBe('scratch-b markdown')
  })

  it('falls back to the saved scratchpad cursor aisle when there is no stored active aisle', () => {
    const model = renderModel(createState({ scratchpadSavedAisleId: 'scratch-b' }), 'missing-aisle', true)

    expect(model.resolvedActiveAisleId).toBe('scratch-b')
  })

  it('keeps normal note active aisle resolution unchanged', () => {
    const model = renderModel(createState(), 'normal-b', false)

    expect(model.resolvedActiveAisleId).toBe('normal-b')
    expect(model.activeContent).toBe('normal-b markdown')
  })
})
