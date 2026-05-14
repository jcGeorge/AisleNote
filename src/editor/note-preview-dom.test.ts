import { afterEach, describe, expect, it } from 'vitest'
import { isInsideReadonlyNotePreview } from './note-preview-dom'

const previousElement = globalThis.Element
const previousText = globalThis.Text

afterEach(() => {
  ;(globalThis as any).Element = previousElement
  ;(globalThis as any).Text = previousText
})

describe('note preview dom helpers', () => {
  it('identifies targets inside readonly note previews', () => {
    class FakeElement {
      private insidePreview: boolean

      constructor(insidePreview: boolean) {
        this.insidePreview = insidePreview
      }

      closest(selector: string) {
        return selector === '.context-preview-editor-host' && this.insidePreview ? this : null
      }
    }

    ;(globalThis as any).Element = FakeElement
    ;(globalThis as any).Text = class FakeText {}

    expect(isInsideReadonlyNotePreview(new FakeElement(true) as unknown as Element)).toBe(true)
    expect(isInsideReadonlyNotePreview(new FakeElement(false) as unknown as Element)).toBe(false)
  })
})
