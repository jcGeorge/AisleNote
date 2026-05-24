import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ContextPreviewData } from '../notes/note-preview-data'
import type { NoteContextReferencePayload } from '../notes/note-references'
import { createContextPreviewWidgetElement, createInternalNoteLinkWidgetElement } from './note-preview-widget'

vi.mock('@toast-ui/editor', () => ({
  Editor: class {
    destroy() {}
  },
}))

type FakeListener = (event: Event) => void

class FakeClassList {
  element: FakeElement

  constructor(element: FakeElement) {
    this.element = element
  }

  toggle(className: string, force?: boolean): boolean {
    const classes = new Set(this.element.className.split(/\s+/).filter(Boolean))
    const shouldAdd = force ?? !classes.has(className)
    if (shouldAdd) {
      classes.add(className)
    } else {
      classes.delete(className)
    }
    this.element.className = Array.from(classes).join(' ')
    return shouldAdd
  }
}

class FakeElement {
  tagName: string
  className = ''
  textContent = ''
  title = ''
  type = ''
  href = ''
  hidden = false
  attributes = new Map<string, string>()
  children: FakeElement[] = []
  listeners = new Map<string, FakeListener[]>()
  classList: FakeClassList

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
    this.classList = new FakeClassList(this)
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  append(...children: FakeElement[]) {
    this.children.push(...children)
  }

  replaceChildren(...children: FakeElement[]) {
    this.children = [...children]
  }

  addEventListener(type: string, listener: FakeListener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: FakeListener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener))
  }

  dispatch(type: string) {
    const event = {
      type,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as Event
    ;(this.listeners.get(type) ?? []).forEach((listener) => listener(event))
  }
}

function hasClass(element: FakeElement, className: string): boolean {
  return element.className.split(/\s+/).includes(className)
}

function findAllByClass(element: FakeElement, className: string): FakeElement[] {
  return [
    ...(hasClass(element, className) ? [element] : []),
    ...element.children.flatMap((child) => findAllByClass(child, className)),
  ]
}

function getTextContent(element: FakeElement): string {
  return `${element.textContent}${element.children.map(getTextContent).join('')}`
}

function createPreviewData(overrides: Partial<ContextPreviewData> = {}): ContextPreviewData {
  return {
    targetInfo: { domain: null, space: null, tab: null, subTab: null, noteBodyId: '', title: '' },
    targetBody: null,
    selectedAisles: [],
    recursiveBlocked: false,
    previewText: '',
    locationLabel: 'Domain / Space / Parent / Child',
    titleButtons: [
      { kind: 'parent', label: 'Parent' },
      { kind: 'subtab', label: 'Child' },
    ],
    status: 'empty',
    ...overrides,
  }
}

describe('note preview widget', () => {
  beforeEach(() => {
    vi.stubGlobal('document', {
      createElement: (tagName: string) => new FakeElement(tagName),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders preview title buttons and sends every button to the same target', () => {
    const payload: NoteContextReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
      heading: { aisleId: 'aisle', headingKey: 'aisle|h2|0|Child' },
    }
    const navigateToNoteLocation = vi.fn()
    const widget = createContextPreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getContextPreviewData: vi.fn(() => createPreviewData()),
      navigateToNoteLocation,
      deleteContextPreview: vi.fn(),
    }) as unknown as FakeElement
    const titleButtons = findAllByClass(widget, 'context-preview-title-btn')

    expect(titleButtons.map((button) => button.textContent)).toEqual(['Parent', 'Child'])
    expect(titleButtons.map((button) => button.className)).toEqual([
      'context-preview-title-btn btn btn-sm tab-btn parent-tab-btn',
      'context-preview-title-btn btn btn-sm tab-btn subtab-btn',
    ])
    expect(getTextContent(widget)).not.toContain('Parent > Child')

    titleButtons.forEach((button) => button.dispatch('click'))
    expect(navigateToNoteLocation).toHaveBeenCalledTimes(2)
    expect(navigateToNoteLocation).toHaveBeenNthCalledWith(1, { ...payload.target, heading: payload.heading })
    expect(navigateToNoteLocation).toHaveBeenNthCalledWith(2, { ...payload.target, heading: payload.heading })
  })

  it('keeps missing previews non-navigating with fallback label text', () => {
    const payload: NoteContextReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'missing', subTabId: null },
    }
    const navigateToNoteLocation = vi.fn()
    const widget = createContextPreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getContextPreviewData: vi.fn(() =>
        createPreviewData({
          locationLabel: 'missing note',
          titleButtons: [],
          status: 'missing',
        }),
      ),
      navigateToNoteLocation,
      deleteContextPreview: vi.fn(),
    }) as unknown as FakeElement

    expect(findAllByClass(widget, 'context-preview-title-btn')).toHaveLength(0)
    expect(findAllByClass(widget, 'context-preview-title-missing').map((element) => element.textContent)).toEqual([
      'missing note',
    ])
    expect(navigateToNoteLocation).not.toHaveBeenCalled()
  })

  it('leaves normal internal note hyperlinks as plain link widgets', () => {
    const navigateToNoteLocation = vi.fn()
    const link = createInternalNoteLinkWidgetElement(
      'Linked note',
      { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: null },
      '#tabs-note/body?domainId=domain&spaceId=space&tabId=parent',
      navigateToNoteLocation,
    ) as unknown as FakeElement

    expect(link.tagName).toBe('A')
    expect(link.className).toBe('internal-note-link-widget')
    expect(link.textContent).toBe('Linked note')
    expect(findAllByClass(link, 'context-preview-title-btn')).toHaveLength(0)
  })
})
