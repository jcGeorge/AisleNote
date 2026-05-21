import { describe, expect, it } from 'vitest'
import {
  canDropPalettePayload,
  canDropToolbarPayload,
  getToolbarDropIndexFromPointer,
  parseToolbarDragPayload,
  readToolbarDragPayload,
  serializeToolbarDragPayload,
  writeToolbarDragPayload,
  type ToolbarDragPayload,
} from './toolbar-settings-drag'

function createDataTransferStore() {
  const store = new Map<string, string>()
  return {
    getData: (type: string) => store.get(type) ?? '',
    setData: (type: string, value: string) => {
      store.set(type, value)
    },
  } as Pick<DataTransfer, 'getData' | 'setData'>
}

function rect(left: number, top: number, right: number, bottom: number) {
  return { left, top, right, bottom }
}

describe('toolbar settings drag helpers', () => {
  it('round-trips toolbar drag payloads through custom and text transfer data', () => {
    const dataTransfer = createDataTransferStore()
    const payload: ToolbarDragPayload = { source: 'layout', itemId: 'gap' }

    writeToolbarDragPayload(dataTransfer as DataTransfer, payload)

    expect(readToolbarDragPayload(dataTransfer, null)).toEqual(payload)
    expect(parseToolbarDragPayload(`tabs-toolbar:${serializeToolbarDragPayload(payload)}`)).toEqual(payload)
  })

  it('falls back when drag transfer data is missing or malformed', () => {
    const dataTransfer = createDataTransferStore()
    const fallback: ToolbarDragPayload = { source: 'spacer' }
    dataTransfer.setData('application/x-tabs-toolbar', '{')

    expect(readToolbarDragPayload(dataTransfer, fallback)).toEqual(fallback)
    expect(readToolbarDragPayload(dataTransfer, null)).toBeNull()
  })

  it('accepts only layout items for palette drops and all valid payloads for toolbar drops', () => {
    expect(canDropPalettePayload({ source: 'layout', itemId: 'copy' })).toBe(true)
    expect(canDropPalettePayload({ source: 'tool', toolId: 'bold' })).toBe(false)
    expect(canDropPalettePayload({ source: 'spacer' })).toBe(false)
    expect(canDropToolbarPayload({ source: 'tool', toolId: 'bold' })).toBe(true)
    expect(canDropToolbarPayload({ source: 'spacer' })).toBe(true)
    expect(canDropToolbarPayload({ source: 'layout', itemId: 'copy' })).toBe(true)
    expect(canDropToolbarPayload(null)).toBe(false)
  })

  it('calculates toolbar insertion indexes from pointer position and wrapped rows', () => {
    const rects = [
      rect(10, 10, 30, 30),
      rect(40, 10, 60, 30),
      rect(10, 44, 30, 64),
      rect(40, 44, 60, 64),
    ]

    expect(getToolbarDropIndexFromPointer([], { x: 100, y: 100 }, 0)).toBe(0)
    expect(getToolbarDropIndexFromPointer(rects, { x: 5, y: 16 })).toBe(0)
    expect(getToolbarDropIndexFromPointer(rects, { x: 35, y: 16 })).toBe(1)
    expect(getToolbarDropIndexFromPointer(rects, { x: 100, y: 16 })).toBe(2)
    expect(getToolbarDropIndexFromPointer(rects, { x: 25, y: 50 })).toBe(3)
    expect(getToolbarDropIndexFromPointer(rects, { x: 100, y: 50 })).toBe(4)
    expect(getToolbarDropIndexFromPointer(rects, { x: 100, y: 90 })).toBe(4)
  })
})
