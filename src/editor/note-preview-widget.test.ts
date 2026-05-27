import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotePreviewData } from '../notes/note-preview-data'
import type { NotePreviewReferencePayload } from '../notes/note-references'
import {
  createNotePreviewWidgetElement,
  createInternalNoteLinkWidgetElement,
  createReadonlyNotePreviewWidgetElement,
  getNotePreviewFittedHeightRem,
} from './note-preview-widget'

const editorInstances = vi.hoisted(() => [] as any[])
const editorMockState = vi.hoisted(() => ({ renderMode: 'sync' }))

vi.mock('@toast-ui/editor', () => ({
  Editor: class {
    options: any
    contentRoot: FakeElement | null = null
    wwEditor = { view: null as { dom: FakeElement } | null }
    setMarkdown: ReturnType<typeof vi.fn>
    setHeight = vi.fn()
    destroy = vi.fn()

    constructor(options: any) {
      this.options = options
      this.setMarkdown = vi.fn((markdown: string) => {
        this.setContentMarkdown(markdown)
      })
      editorInstances.push(this)
      if (editorMockState.renderMode === 'delayed-root') return
      if (editorMockState.renderMode === 'empty-root') {
        this.installRoot('')
        this.setEmptyRoot()
        return
      }
      this.installRoot(options.initialValue)
    }

    installRoot(markdown: string) {
      this.contentRoot = this.options.el.ownerDocument.createElement('div') as FakeElement
      this.contentRoot.className = 'ProseMirror'
      this.contentRoot.style.setProperty('height', '100%', 'important')
      this.contentRoot.style.setProperty('overflow-x', 'hidden', 'important')
      this.contentRoot.style.setProperty('overflow-y', 'auto', 'important')
      this.setContentMarkdown(markdown)
      this.wwEditor.view = { dom: this.contentRoot }
      this.options.el.append(this.contentRoot)
      return this.contentRoot
    }

    replaceRoot(markdown: string) {
      this.contentRoot = this.options.el.ownerDocument.createElement('div') as FakeElement
      this.contentRoot.className = 'ProseMirror'
      this.contentRoot.style.setProperty('height', '100%', 'important')
      this.contentRoot.style.setProperty('overflow-x', 'hidden', 'important')
      this.contentRoot.style.setProperty('overflow-y', 'auto', 'important')
      this.setContentMarkdown(markdown)
      this.wwEditor.view = { dom: this.contentRoot }
      this.options.el.replaceChildren(this.contentRoot)
      return this.contentRoot
    }

    setContentMarkdown(markdown: string) {
      if (!this.contentRoot) return
      const height = getMockPreviewContentHeight(markdown)
      const viewportHeight = Math.min(height, 344)
      this.contentRoot.clientWidth = 620
      this.contentRoot.naturalScrollHeight = height
      this.contentRoot.scrollHeight = viewportHeight
      this.contentRoot.setBounds(0, viewportHeight)
      const child = this.contentRoot.ownerDocument.createElement('p') as FakeElement
      this.contentRoot.textContent = markdown
      child.textContent = markdown
      child.clientWidth = 620
      child.setBounds(0, Math.max(0, viewportHeight - 8))
      this.contentRoot.replaceChildren(child)
    }

    setEmptyRoot() {
      if (!this.contentRoot) return
      this.contentRoot.textContent = ''
      this.contentRoot.naturalScrollHeight = 0
      this.contentRoot.scrollHeight = 0
      this.contentRoot.setBounds(0, 0)
      this.contentRoot.replaceChildren()
    }
  },
}))

type FakeListener = (event: Event) => void

function getMockPreviewContentHeight(markdown: string): number {
  if (markdown.includes('large-only')) return 430
  if (markdown.includes('tall')) return 900
  if (markdown.includes('medium')) return 160
  return 32
}

let fakeDocument: {
  createElement: (tagName: string) => FakeElement
  documentElement: FakeElement
  body: FakeElement
  defaultView?: any
}
let resizeObserverInstances: FakeResizeObserver[] = []
let mutationObserverInstances: FakeMutationObserver[] = []

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
  disabled = false
  private scrollHeightValue = 0
  clientWidth = 0
  naturalScrollHeight: number | null = null
  ownerDocument: typeof fakeDocument
  parentElement: FakeElement | null = null
  attributes = new Map<string, string>()
  children: FakeElement[] = []
  listeners = new Map<string, FakeListener[]>()
  classList: FakeClassList
  rect = { top: 0, bottom: 0, height: 0, width: 0 }
  style = {
    priorities: new Map<string, string>(),
    values: new Map<string, string>(),
    getPropertyPriority: (name: string) => this.style.priorities.get(name) ?? '',
    getPropertyValue: (name: string) => this.style.values.get(name) ?? '',
    removeProperty: (name: string) => {
      const value = this.style.values.get(name) ?? ''
      this.style.values.delete(name)
      this.style.priorities.delete(name)
      return value
    },
    setProperty: (name: string, value: string, priority = '') => {
      this.style.values.set(name, value)
      if (priority) {
        this.style.priorities.set(name, priority)
      } else {
        this.style.priorities.delete(name)
      }
    },
  }

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase()
    this.ownerDocument = fakeDocument
    this.classList = new FakeClassList(this)
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  append(...children: FakeElement[]) {
    children.forEach((child) => {
      child.parentElement = this
    })
    this.children.push(...children)
    notifyMutation(this)
  }

  replaceChildren(...children: FakeElement[]) {
    this.children.forEach((child) => {
      child.parentElement = null
    })
    children.forEach((child) => {
      child.parentElement = this
    })
    this.children = [...children]
    notifyMutation(this)
  }

  remove() {
    if (!this.parentElement) return
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this)
    notifyMutation(this.parentElement)
    this.parentElement = null
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

  get scrollHeight() {
    if (this.naturalScrollHeight !== null && this.style.getPropertyValue('height') === 'auto') {
      return this.naturalScrollHeight
    }
    return this.scrollHeightValue
  }

  set scrollHeight(value: number) {
    this.scrollHeightValue = value
  }

  setBounds(top: number, bottom: number) {
    this.rect = { top, bottom, height: Math.max(0, bottom - top), width: this.clientWidth }
  }

  getBoundingClientRect() {
    return this.rect
  }

  cloneNode(deep = false): FakeElement {
    const clone = this.ownerDocument.createElement(this.tagName.toLowerCase()) as FakeElement
    clone.className = this.className
    clone.textContent = this.textContent
    clone.title = this.title
    clone.type = this.type
    clone.href = this.href
    clone.hidden = this.hidden
    clone.disabled = this.disabled
    clone.clientWidth = this.clientWidth
    clone.scrollHeight = this.scrollHeightValue
    clone.naturalScrollHeight = this.naturalScrollHeight
    clone.rect = { ...this.rect }
    this.attributes.forEach((value, name) => clone.attributes.set(name, value))
    this.style.values.forEach((value, name) => clone.style.values.set(name, value))
    this.style.priorities.forEach((value, name) => clone.style.priorities.set(name, value))
    if (deep) clone.replaceChildren(...this.children.map((child) => child.cloneNode(true)))
    return clone
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches =
      selector.startsWith('.')
        ? hasClass(this, selector.slice(1))
        : this.tagName.toLowerCase() === selector.toLowerCase()
    return [
      ...(matches ? [this] : []),
      ...this.children.flatMap((child) => child.querySelectorAll(selector)),
    ]
  }
}

class FakeResizeObserver {
  callback: ResizeObserverCallback
  observed = new Set<FakeElement>()

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeObserverInstances.push(this)
  }

  observe(element: FakeElement) {
    this.observed.add(element)
  }

  disconnect() {
    this.observed.clear()
  }

  trigger() {
    this.callback([] as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver)
  }
}

class FakeMutationObserver {
  callback: MutationCallback
  observed: Array<{ target: FakeElement; options?: MutationObserverInit }> = []

  constructor(callback: MutationCallback) {
    this.callback = callback
    mutationObserverInstances.push(this)
  }

  observe(target: FakeElement, options?: MutationObserverInit) {
    this.observed.push({ target, options })
  }

  disconnect() {
    this.observed = []
  }

  trigger() {
    this.callback([] as unknown as MutationRecord[], this as unknown as MutationObserver)
  }
}

function isDescendantOf(element: FakeElement, ancestor: FakeElement): boolean {
  let current: FakeElement | null = element
  while (current) {
    if (current === ancestor) return true
    current = current.parentElement
  }
  return false
}

function notifyMutation(target: FakeElement) {
  mutationObserverInstances.forEach((observer) => {
    if (
      observer.observed.some(
        (entry) => entry.target === target || (entry.options?.subtree && isDescendantOf(target, entry.target)),
      )
    ) {
      observer.trigger()
    }
  })
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

function createPreviewData(overrides: Partial<NotePreviewData> = {}): NotePreviewData {
  return {
    targetInfo: { domain: null, space: null, tab: null, subTab: null, noteBodyId: '', title: '' },
    targetBody: null,
    selectedAisle: null,
    recursiveBlocked: false,
    previewText: '',
    previewCursorSelection: null,
    locationLabel: 'Domain / Space / Parent / Child',
    titleButtons: [
      { kind: 'parent', label: 'Parent' },
      { kind: 'subtab', label: 'Child' },
    ],
    status: 'empty',
    ...overrides,
  }
}

function createReadonlyPluginContext() {
  class Plugin {
    props: any

    constructor(config: any) {
      this.props = config.props
    }
  }

  return {
    pmState: { Plugin },
    pmView: {
      Decoration: {
        widget: vi.fn((from: number, factory: () => unknown, options: Record<string, unknown>) => ({
          type: 'widget',
          from,
          factory,
          options,
        })),
        inline: vi.fn((from: number, to: number, attrs: Record<string, unknown>) => ({
          type: 'inline',
          from,
          to,
          attrs,
        })),
      },
      DecorationSet: {
        create: vi.fn((_doc: unknown, decorations: unknown[]) => decorations),
      },
    },
  }
}

function createTextDoc(text: string) {
  return {
    descendants(callback: (node: unknown, pos: number) => void) {
      callback({ isText: true, text }, 1)
    },
  }
}

describe('note preview widget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    editorMockState.renderMode = 'sync'
    resizeObserverInstances = []
    mutationObserverInstances = []
    const fakeWindow = {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        callback(0)
        return 1
      },
      cancelAnimationFrame: vi.fn(),
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      getComputedStyle: (element: FakeElement) => ({
        fontSize: element.tagName === 'HTML' ? '16px' : '',
        marginTop: '0px',
        marginBottom: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
      }),
    }
    fakeDocument = {
      createElement: (tagName: string) => new FakeElement(tagName),
      documentElement: new FakeElement('html'),
      body: new FakeElement('body'),
      defaultView: fakeWindow,
    }
    fakeDocument.documentElement.ownerDocument = fakeDocument
    fakeDocument.body.ownerDocument = fakeDocument
    vi.stubGlobal('document', fakeDocument)
    vi.stubGlobal('window', fakeWindow)
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.stubGlobal('MutationObserver', FakeMutationObserver)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    editorInstances.length = 0
    vi.unstubAllGlobals()
  })

  it('renders preview title buttons and sends every button to the same target', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
      heading: { aisleId: 'aisle', headingKey: 'aisle|h2|0|Child' },
    }
    const navigateToNoteLocation = vi.fn()
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() => createPreviewData()),
      navigateToNoteLocation,
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const titleButtons = findAllByClass(widget, 'context-preview-title-btn')

    expect(titleButtons.map((button) => button.textContent)).toEqual(['Parent', 'Child'])
    expect(titleButtons.map((button) => button.className)).toEqual([
      'rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent',
      'rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab',
    ])
    expect(getTextContent(widget)).not.toContain('Parent > Child')

    titleButtons.forEach((button) => button.dispatch('click'))
    expect(navigateToNoteLocation).toHaveBeenCalledTimes(2)
    expect(navigateToNoteLocation).toHaveBeenNthCalledWith(1, { ...payload.target, heading: payload.heading })
    expect(navigateToNoteLocation).toHaveBeenNthCalledWith(2, { ...payload.target, heading: payload.heading })
  })

  it('keeps missing previews non-navigating with fallback label text', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'missing', subTabId: null },
    }
    const navigateToNoteLocation = vi.fn()
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          locationLabel: 'missing note',
          titleButtons: [],
          status: 'missing',
        }),
      ),
      navigateToNoteLocation,
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement

    expect(findAllByClass(widget, 'context-preview-title-btn')).toHaveLength(0)
    expect(findAllByClass(widget, 'context-preview-title-missing').map((element) => element.textContent)).toEqual([
      'missing note',
    ])
    expect(navigateToNoteLocation).not.toHaveBeenCalled()
  })

  it('renders one two-button caret size control and edit-aisle delete icon markup', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() => createPreviewData()),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement

    expect(findAllByClass(widget, 'context-bar-size-control')).toHaveLength(1)
    expect(findAllByClass(widget, 'context-bar-size-btn')).toHaveLength(2)
    expect(findAllByClass(widget, 'context-bar-minimize-btn')).toHaveLength(0)
    expect(findAllByClass(widget, 'aisle-edit-delete-icon')).toHaveLength(1)
  })

  it('steps note preview size through small, large, and minimized states', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() => createPreviewData()),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const shrinkButton = findAllByClass(widget, 'context-bar-size-up-btn')[0]
    const growButton = findAllByClass(widget, 'context-bar-size-down-btn')[0]
    const lowerBar = findAllByClass(widget, 'context-bar-lower')[0]

    expect(shrinkButton.title).toBe('Minimize note preview')
    expect(shrinkButton.disabled).toBe(false)
    expect(growButton.title).toBe('Expand note preview')
    expect(growButton.disabled).toBe(false)
    expect(lowerBar.hidden).toBe(false)

    growButton.dispatch('click')
    expect(shrinkButton.title).toBe('Shrink note preview')
    expect(growButton.title).toBe('Note preview is fully expanded')
    expect(growButton.disabled).toBe(true)
    expect(lowerBar.hidden).toBe(false)

    shrinkButton.dispatch('click')
    expect(shrinkButton.title).toBe('Minimize note preview')
    expect(growButton.title).toBe('Expand note preview')
    expect(lowerBar.hidden).toBe(false)

    shrinkButton.dispatch('click')
    expect(shrinkButton.title).toBe('Note preview is minimized')
    expect(shrinkButton.disabled).toBe(true)
    expect(growButton.title).toBe('Show note preview')
    expect(lowerBar.hidden).toBe(true)

    growButton.dispatch('click')
    expect(shrinkButton.title).toBe('Minimize note preview')
    expect(growButton.title).toBe('Expand note preview')
    expect(lowerBar.hidden).toBe(false)
  })

  it('clamps smart preview height to content size within min and max caps', () => {
    expect(getNotePreviewFittedHeightRem(32, 16, 21.5)).toBe(4.5)
    expect(getNotePreviewFittedHeightRem(154, 16, 21.5)).toBe(10)
    expect(getNotePreviewFittedHeightRem(800, 16, 21.5)).toBe(21.5)
  })

  it('fits preview height from natural content scroll height instead of the forced shell height', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown: 'medium preview content' } as any,
        }),
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const editorHost = findAllByClass(widget, 'context-preview-editor-host')[0]

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('10.38rem')
    expect(editorInstances[0].options.height).toBe('344px')
    expect(editorInstances[0].options.minHeight).toBe('0px')
    expect(editorInstances[0].setHeight).toHaveBeenLastCalledWith('166.08px')
    expect(findAllByClass(fakeDocument.body, 'context-preview-measurement-host')).toHaveLength(0)
  })

  it('keeps the size cap until Toast UI inserts the delayed content root, then fits content', () => {
    editorMockState.renderMode = 'delayed-root'
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown: 'medium preview content' } as any,
        }),
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const editorHost = findAllByClass(widget, 'context-preview-editor-host')[0]

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('21.5rem')

    editorInstances[0].installRoot('medium preview content')
    vi.advanceTimersByTime(40)

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('10.38rem')
  })

  it('keeps the size cap while meaningful markdown has an empty rendered root', () => {
    editorMockState.renderMode = 'empty-root'
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown: 'medium preview content' } as any,
        }),
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const editorHost = findAllByClass(widget, 'context-preview-editor-host')[0]

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('21.5rem')

    editorInstances[0].setContentMarkdown('medium preview content')
    vi.advanceTimersByTime(40)

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('10.38rem')
  })

  it('rebinds measurement observers when Toast UI replaces the content root', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown: 'short preview content' } as any,
        }),
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const editorHost = findAllByClass(widget, 'context-preview-editor-host')[0]
    const observer = resizeObserverInstances[0]
    const originalRoot = editorInstances[0].contentRoot as FakeElement

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('4.5rem')
    expect(observer.observed.has(originalRoot)).toBe(true)

    const replacementRoot = editorInstances[0].replaceRoot('medium preview content')
    vi.advanceTimersByTime(40)

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('10.38rem')
    expect(observer.observed.has(originalRoot)).toBe(false)
    expect(observer.observed.has(replacementRoot)).toBe(true)
  })

  it('caps tall preview content at the current size maximum', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown: 'tall preview content' } as any,
        }),
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const editorHost = findAllByClass(widget, 'context-preview-editor-host')[0]

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('21.5rem')
  })

  it('reruns fitting when size toggles so large can grow beyond the small cap', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown: 'large-only preview content' } as any,
        }),
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const growButton = findAllByClass(widget, 'context-bar-size-down-btn')[0]

    expect(findAllByClass(widget, 'context-preview-editor-host')[0].style.values.get('--note-preview-editor-height')).toBe(
      '21.5rem',
    )
    const initialRoot = editorInstances[0].contentRoot as FakeElement
    expect(initialRoot.style.values.get('height')).toBe('100%')
    expect(initialRoot.style.priorities.get('height')).toBe('important')
    expect(initialRoot.style.values.get('overflow-y')).toBe('auto')
    expect(initialRoot.style.values.get('overflow-x')).toBe('hidden')
    expect(initialRoot.style.values.has('min-height')).toBe(false)
    expect(initialRoot.style.values.has('overflow')).toBe(false)
    expect(editorInstances[0].setHeight).toHaveBeenLastCalledWith('344px')
    expect(findAllByClass(fakeDocument.body, 'context-preview-measurement-host')).toHaveLength(0)

    growButton.dispatch('click')

    expect(findAllByClass(widget, 'context-preview-editor-host')[0].style.values.get('--note-preview-editor-height')).toBe(
      '27.25rem',
    )
    expect(editorInstances[1].options.height).toBe('528px')
    expect(editorInstances[1].options.minHeight).toBe('0px')
    expect(editorInstances[1].setHeight).toHaveBeenLastCalledWith('436px')
    expect(findAllByClass(fakeDocument.body, 'context-preview-measurement-host')).toHaveLength(0)
  })

  it('refreshes the embedded readonly editor when the target aisle markdown changes', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    let markdown = 'short preview content'
    const widget = createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown } as any,
        }),
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement
    const editorHost = findAllByClass(widget, 'context-preview-editor-host')[0]

    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('4.5rem')

    markdown = 'medium preview content'
    vi.advanceTimersByTime(1000)

    expect(editorInstances[0].setMarkdown).toHaveBeenCalledWith('medium preview content', false)
    expect(editorHost.style.values.get('--note-preview-editor-height')).toBe('10.38rem')
    expect(editorInstances[0].setHeight).toHaveBeenLastCalledWith('166.08px')
  })

  it('installs readonly reference rendering inside embedded preview editors', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
    }
    const nestedPayload: NotePreviewReferencePayload = {
      id: 'nested-preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'other', subTabId: null },
    }
    createNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle', markdown: 'preview with [[Linked--123abc]] and ![[Other--456def]]' } as any,
        }),
      ),
      resolvePreviewToken: vi.fn((token: string) => (token.startsWith('!') ? nestedPayload : null)),
      resolveInternalNoteReferenceToken: vi.fn((token: string) =>
        token === '[[Linked--123abc]]'
          ? {
              token,
              parsed: {
                token,
                embed: false,
                target: 'Linked--123abc',
                noteHandle: 'Linked--123abc',
                suffixHandle: '',
                alias: '',
              },
              payload: {
                id: 'wiki-link:Linked--123abc',
                target: { domainId: 'domain', spaceId: 'space', tabId: 'linked', subTabId: null },
              },
              target: { domainId: 'domain', spaceId: 'space', tabId: 'linked', subTabId: null },
              label: 'Linked',
              canonicalTarget: 'Linked--123abc',
              canonicalToken: '[[Linked--123abc]]',
            }
          : null,
      ),
      navigateToNoteLocation: vi.fn(),
      deleteNotePreview: vi.fn(),
    })

    const pluginFactory = editorInstances[0].options.plugins.find(
      (plugin: { name?: string }) => plugin.name === 'readonlyPreviewReferencesPlugin',
    )
    const pluginBundle = pluginFactory(createReadonlyPluginContext())
    const plugin = pluginBundle.wysiwygPlugins[0]()
    const decorations = plugin.props.decorations({ doc: createTextDoc('preview with [[Linked--123abc]] and ![[Other--456def]]') })
    const widgets = decorations.filter((decoration: any) => decoration.type === 'widget')

    expect(
      editorInstances[0].options.plugins.some((plugin: { name?: string }) => plugin.name === 'readonlyPreviewReferencesPlugin'),
    ).toBe(true)
    expect(pluginBundle.wysiwygPlugins).toHaveLength(1)
    expect(widgets).toHaveLength(2)
    expect((widgets[0].factory() as FakeElement).className).toContain('context-preview-navigation-widget')
    expect((widgets[1].factory() as FakeElement).className).toContain('internal-note-link-widget')
  })

  it('renders nested note previews as readonly content with navigable title chips', () => {
    const payload: NotePreviewReferencePayload = {
      id: 'nested-preview-id',
      target: { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: 'child' },
      aisleIds: ['aisle-2'],
    }
    const navigateToNoteLocation = vi.fn()
    const widget = createReadonlyNotePreviewWidgetElement(payload, {
      sourceNoteBodyId: 'source-body',
      getNotePreviewData: vi.fn(() =>
        createPreviewData({
          status: 'ready',
          selectedAisle: { id: 'aisle-2', markdown: 'nested preview content' } as any,
          titleButtons: [
            { kind: 'parent', label: 'Parent' },
            { kind: 'subtab', label: 'Child' },
          ],
        }),
      ),
      navigateToNoteLocation,
      deleteNotePreview: vi.fn(),
    }) as unknown as FakeElement

    expect(widget.className).toContain('context-preview-navigation-widget')
    expect(findAllByClass(widget, 'context-preview-title-btn').map((button) => button.textContent)).toEqual(['Parent', 'Child'])
    expect(findAllByClass(widget, 'context-bar-size-btn')).toHaveLength(0)
    expect(findAllByClass(widget, 'context-bar-delete-btn')).toHaveLength(0)
    expect(findAllByClass(widget, 'context-preview-nested-editor-host')).toHaveLength(1)
    expect(editorInstances[editorInstances.length - 1]?.options.initialValue).toBe('nested preview content')

    findAllByClass(widget, 'context-preview-navigation-title')[0].dispatch('click')

    expect(navigateToNoteLocation).toHaveBeenCalledWith({
      domainId: 'domain',
      spaceId: 'space',
      tabId: 'parent',
      subTabId: 'child',
      heading: undefined,
      aisleId: 'aisle-2',
    })
  })

  it('leaves normal internal note hyperlinks as plain link widgets', () => {
    const navigateToNoteLocation = vi.fn()
    const target = { domainId: 'domain', spaceId: 'space', tabId: 'parent', subTabId: null }
    const link = createInternalNoteLinkWidgetElement(
      'Linked note',
      target,
      '[[Linked note--123abc]]',
      navigateToNoteLocation,
      { from: 3, to: 26, occurrence: 1 },
    ) as unknown as FakeElement

    expect(link.tagName).toBe('A')
    expect(link.className).toBe('internal-note-link-widget')
    expect(link.getAttribute('data-internal-note-link-syntax')).toBe('[[Linked note--123abc]]')
    expect(link.getAttribute('data-internal-note-link-from')).toBe('3')
    expect(link.getAttribute('data-internal-note-link-to')).toBe('26')
    expect(link.getAttribute('data-internal-note-link-occurrence')).toBe('1')
    expect(link.textContent).toBe('Linked note')
    expect(findAllByClass(link, 'context-preview-title-btn')).toHaveLength(0)

    link.dispatch('click')

    expect(navigateToNoteLocation).toHaveBeenCalledWith(target)
  })
})
