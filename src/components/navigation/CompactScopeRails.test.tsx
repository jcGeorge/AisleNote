import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRef, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { ArrangeModeState, Domain, Space } from '../../types/app'
import { CompactDomainRail, CompactScopeDragPreview, CompactSpaceRail } from './CompactScopeRails'

const componentDir = dirname(fileURLToPath(import.meta.url))

const arrangeMode: ArrangeModeState = {
  active: true,
  scope: 'tabs',
  source: 'press',
  dragItem: { type: 'tab', tabId: 'parent-a' },
  overParentTabId: null,
  overParentInsert: null,
  overSubTabId: null,
  overSubTabInsert: null,
  overSpaceId: 'space-b',
  overSpaceInsert: null,
  overDomainId: 'domain-b',
  overDomainInsert: null,
}

const space = (id: string): Space => ({
  id,
  name: id,
  settings: { autoRemoveDeletedDays: 7 },
  data: {
    activeTabId: 'parent-a',
    tabs: [],
    deletedTabs: [],
    deletedSubTabs: [],
  },
})

const domain = (id: string): Domain => ({
  id,
  name: id,
  activeSpaceId: 'space-a',
  spaces: [],
})

const noop = () => undefined
const autoSizeNoop = () => undefined

type TestElement = ReactElement<Record<string, unknown> & { children?: ReactNode }>
type TestHandler = (event: Record<string, unknown>) => void

function findElementByProp(node: ReactNode, propName: string, propValue: string): TestElement | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElementByProp(child, propName, propValue)
      if (match) return match
    }
    return null
  }
  if (!isValidElement(node)) return null
  const element = node as TestElement
  if (element.props[propName] === propValue) return element
  return findElementByProp(element.props.children, propName, propValue)
}

describe('compact scope rails', () => {
  it('renders compact space buttons with active and drop target classes', () => {
    const html = renderToStaticMarkup(
      <CompactSpaceRail
        spaces={[space('space-a'), space('space-b')]}
        activeSpaceId="space-a"
        editing={null}
        arrangeMode={arrangeMode}
        arrangeableSpaceClassName="is-arrangeable"
        draggingSpaceId={null}
        spacesGridRef={createRef<HTMLDivElement>()}
        onOpenSpace={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeSpacePointerMove={noop}
        onHandleArrangeSpacePointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeSpacePointerDrag={noop}
      />,
    )

    expect(html).toContain('compact-space-rail')
    expect(html).toContain('data-arrange-space-id="space-a"')
    expect(html).toContain('compact-space-btn is-active is-arrangeable')
    expect(html).toContain('data-arrange-space-id="space-b"')
    expect(html).toContain('is-arrange-target')
  })

  it('renders dual-sided placement cues for compact space and domain rails', () => {
    const spaceHtml = renderToStaticMarkup(
      <CompactSpaceRail
        spaces={[space('space-a'), space('space-b'), space('space-c')]}
        activeSpaceId="space-a"
        editing={null}
        arrangeMode={{
          ...arrangeMode,
          dragItem: { type: 'space', spaceId: 'space-c' },
          overSpaceId: 'space-b',
          overSpaceInsert: 'before',
        }}
        arrangeableSpaceClassName="is-arrangeable"
        draggingSpaceId={null}
        spacesGridRef={createRef<HTMLDivElement>()}
        onOpenSpace={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeSpacePointerMove={noop}
        onHandleArrangeSpacePointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeSpacePointerDrag={noop}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactDomainRail
        domains={[domain('domain-a'), domain('domain-b'), domain('domain-c')]}
        activeDomainId="domain-a"
        editing={null}
        arrangeMode={{
          ...arrangeMode,
          dragItem: { type: 'domain', domainId: 'domain-c' },
          overDomainId: 'domain-b',
          overDomainInsert: 'before',
        }}
        arrangeableDomainClassName="is-arrangeable"
        draggingDomainId={null}
        domainsGridRef={createRef<HTMLDivElement>()}
        onOpenDomain={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeDomainPointerMove={noop}
        onHandleArrangeDomainPointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeDomainPointerDrag={noop}
      />,
    )

    expect(spaceHtml).toContain('is-arrange-neighbor-after')
    expect(spaceHtml).toContain('is-arrange-target-before')
    expect(domainHtml).toContain('is-arrange-neighbor-after')
    expect(domainHtml).toContain('is-arrange-target-before')
  })

  it('renders compact domain buttons with active and drop target classes', () => {
    const html = renderToStaticMarkup(
      <CompactDomainRail
        domains={[domain('domain-a'), domain('domain-b')]}
        activeDomainId="domain-a"
        editing={null}
        arrangeMode={arrangeMode}
        arrangeableDomainClassName="is-arrangeable"
        draggingDomainId={null}
        domainsGridRef={createRef<HTMLDivElement>()}
        onOpenDomain={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeDomainPointerMove={noop}
        onHandleArrangeDomainPointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeDomainPointerDrag={noop}
      />,
    )

    expect(html).toContain('compact-domain-rail')
    expect(html).toContain('data-arrange-domain-id="domain-a"')
    expect(html).toContain('compact-domain-btn is-active is-arrangeable')
    expect(html).toContain('data-arrange-domain-id="domain-b"')
    expect(html).toContain('is-arrange-target')
  })

  it('renders tappable add controls for compact space and domain rails', () => {
    const onAddSpace = vi.fn()
    const onAddDomain = vi.fn()
    const spaceHtml = renderToStaticMarkup(
      <CompactSpaceRail
        spaces={[space('space-a')]}
        activeSpaceId="space-a"
        editing={null}
        arrangeMode={{ ...arrangeMode, active: false }}
        arrangeableSpaceClassName=""
        draggingSpaceId={null}
        spacesGridRef={createRef<HTMLDivElement>()}
        onOpenSpace={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onAddSpace={onAddSpace}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeSpacePointerMove={noop}
        onHandleArrangeSpacePointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeSpacePointerDrag={noop}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactDomainRail
        domains={[domain('domain-a')]}
        activeDomainId="domain-a"
        editing={null}
        arrangeMode={{ ...arrangeMode, active: false }}
        arrangeableDomainClassName=""
        draggingDomainId={null}
        domainsGridRef={createRef<HTMLDivElement>()}
        onOpenDomain={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onAddDomain={onAddDomain}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeDomainPointerMove={noop}
        onHandleArrangeDomainPointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeDomainPointerDrag={noop}
      />,
    )

    expect(spaceHtml).toContain('compact-scope-add-btn')
    expect(spaceHtml).toContain('aria-label="add space"')
    expect(domainHtml).toContain('compact-scope-add-btn')
    expect(domainHtml).toContain('aria-label="add domain"')
  })

  it('runs compact space and domain add callbacks without bubbling tap events to the rail', () => {
    const onAddSpace = vi.fn()
    const onAddDomain = vi.fn()
    const spaceTree = CompactSpaceRail({
      spaces: [space('space-a')],
      activeSpaceId: 'space-a',
      editing: null,
      arrangeMode: { ...arrangeMode, active: false },
      arrangeableSpaceClassName: '',
      draggingSpaceId: null,
      spacesGridRef: createRef<HTMLDivElement>(),
      onOpenSpace: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onAddSpace,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeSpacePointerMove: noop,
      onHandleArrangeSpacePointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const domainTree = CompactDomainRail({
      domains: [domain('domain-a')],
      activeDomainId: 'domain-a',
      editing: null,
      arrangeMode: { ...arrangeMode, active: false },
      arrangeableDomainClassName: '',
      draggingDomainId: null,
      domainsGridRef: createRef<HTMLDivElement>(),
      onOpenDomain: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onAddDomain,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeDomainPointerMove: noop,
      onHandleArrangeDomainPointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeDomainPointerDrag: noop,
    })
    const spaceAddButton = findElementByProp(spaceTree, 'aria-label', 'add space')
    const domainAddButton = findElementByProp(domainTree, 'aria-label', 'add domain')
    const spacePointerEvent = { stopPropagation: vi.fn() }
    const spaceClickEvent = { stopPropagation: vi.fn() }
    const domainPointerEvent = { stopPropagation: vi.fn() }
    const domainClickEvent = { stopPropagation: vi.fn() }

    expect(spaceAddButton).not.toBeNull()
    expect(domainAddButton).not.toBeNull()
    ;(spaceAddButton?.props.onPointerDown as (event: unknown) => void)(spacePointerEvent)
    ;(spaceAddButton?.props.onClick as (event: unknown) => void)(spaceClickEvent)
    ;(domainAddButton?.props.onPointerDown as (event: unknown) => void)(domainPointerEvent)
    ;(domainAddButton?.props.onClick as (event: unknown) => void)(domainClickEvent)

    expect(spacePointerEvent.stopPropagation).toHaveBeenCalled()
    expect(spaceClickEvent.stopPropagation).toHaveBeenCalled()
    expect(domainPointerEvent.stopPropagation).toHaveBeenCalled()
    expect(domainClickEvent.stopPropagation).toHaveBeenCalled()
    expect(onAddSpace).toHaveBeenCalledTimes(1)
    expect(onAddDomain).toHaveBeenCalledTimes(1)
  })

  it('bypasses arrange handlers while compact rails are selecting a guided destination', () => {
    const onOpenSpace = vi.fn()
    const onOpenDomain = vi.fn()
    const onHandleArrangeSpaceSelectionClick = vi.fn(() => true)
    const onHandleArrangeDomainSelectionClick = vi.fn(() => true)
    const onStartArrangeSpaceDragSeed = vi.fn()
    const onStartArrangeDomainDragSeed = vi.fn()
    const onHandleArrangeSpacePointerMove = vi.fn()
    const onHandleArrangeDomainPointerMove = vi.fn()
    const onHandleArrangeSpacePointerUp = vi.fn()
    const onHandleArrangeDomainPointerUp = vi.fn()
    const spaceTree = CompactSpaceRail({
      spaces: [space('space-a'), space('space-b')],
      activeSpaceId: 'space-a',
      editing: null,
      arrangeMode,
      arrangeableSpaceClassName: 'is-arrangeable',
      draggingSpaceId: null,
      guidedDestinationActive: true,
      spacesGridRef: createRef<HTMLDivElement>(),
      onOpenSpace,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onHandleArrangeSpaceSelectionClick,
      onStartArrangeDragSeed: onStartArrangeSpaceDragSeed,
      onStartArrangeTapCandidate: vi.fn(),
      onStartArrangePress: vi.fn(),
      onHandleArrangeSpacePointerMove,
      onHandleArrangeSpacePointerUp,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const domainTree = CompactDomainRail({
      domains: [domain('domain-a'), domain('domain-b')],
      activeDomainId: 'domain-a',
      editing: null,
      arrangeMode,
      arrangeableDomainClassName: 'is-arrangeable',
      draggingDomainId: null,
      guidedDestinationActive: true,
      domainsGridRef: createRef<HTMLDivElement>(),
      onOpenDomain,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onHandleArrangeDomainSelectionClick,
      onStartArrangeDragSeed: onStartArrangeDomainDragSeed,
      onStartArrangeTapCandidate: vi.fn(),
      onStartArrangePress: vi.fn(),
      onHandleArrangeDomainPointerMove,
      onHandleArrangeDomainPointerUp,
      onClearArrangePressTimer: noop,
      onCancelArrangeDomainPointerDrag: noop,
    })
    const spaceButton = findElementByProp(spaceTree, 'data-arrange-space-id', 'space-b')
    const domainButton = findElementByProp(domainTree, 'data-arrange-domain-id', 'domain-b')
    const spaceClickEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
    const domainClickEvent = { preventDefault: vi.fn(), stopPropagation: vi.fn() }

    expect(spaceButton).not.toBeNull()
    expect(domainButton).not.toBeNull()
    ;(spaceButton?.props.onPointerDown as TestHandler)({ button: 0 })
    ;(spaceButton?.props.onPointerMove as TestHandler)({})
    ;(spaceButton?.props.onPointerUp as TestHandler)({})
    ;(spaceButton?.props.onClick as TestHandler)(spaceClickEvent)
    ;(domainButton?.props.onPointerDown as TestHandler)({ button: 0 })
    ;(domainButton?.props.onPointerMove as TestHandler)({})
    ;(domainButton?.props.onPointerUp as TestHandler)({})
    ;(domainButton?.props.onClick as TestHandler)(domainClickEvent)

    expect(onOpenSpace).toHaveBeenCalledWith('space-b')
    expect(onOpenDomain).toHaveBeenCalledWith('domain-b')
    expect(spaceClickEvent.preventDefault).toHaveBeenCalled()
    expect(spaceClickEvent.stopPropagation).toHaveBeenCalled()
    expect(domainClickEvent.preventDefault).toHaveBeenCalled()
    expect(domainClickEvent.stopPropagation).toHaveBeenCalled()
    expect(onHandleArrangeSpaceSelectionClick).not.toHaveBeenCalled()
    expect(onHandleArrangeDomainSelectionClick).not.toHaveBeenCalled()
    expect(onStartArrangeSpaceDragSeed).not.toHaveBeenCalled()
    expect(onStartArrangeDomainDragSeed).not.toHaveBeenCalled()
    expect(onHandleArrangeSpacePointerMove).not.toHaveBeenCalled()
    expect(onHandleArrangeDomainPointerMove).not.toHaveBeenCalled()
    expect(onHandleArrangeSpacePointerUp).not.toHaveBeenCalled()
    expect(onHandleArrangeDomainPointerUp).not.toHaveBeenCalled()
  })

  it('cancels active arrangement before opening compact scope context menus', () => {
    const spaceCalls: string[] = []
    const domainCalls: string[] = []
    const onCancelSpaceArrangeMode = vi.fn(() => spaceCalls.push('cancel'))
    const onCancelDomainArrangeMode = vi.fn(() => domainCalls.push('cancel'))
    const onOpenSpaceContextMenu = vi.fn(() => spaceCalls.push('menu'))
    const onOpenDomainContextMenu = vi.fn(() => domainCalls.push('menu'))
    const onStartArrangeSpaceDragSeed = vi.fn()
    const onStartArrangeDomainDragSeed = vi.fn()
    const spaceTree = CompactSpaceRail({
      spaces: [space('space-a')],
      activeSpaceId: 'space-a',
      editing: null,
      arrangeMode,
      arrangeableSpaceClassName: 'is-arrangeable',
      draggingSpaceId: null,
      spacesGridRef: createRef<HTMLDivElement>(),
      onOpenSpace: noop,
      onOpenContextMenu: onOpenSpaceContextMenu,
      onCancelArrangeMode: onCancelSpaceArrangeMode,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: onStartArrangeSpaceDragSeed,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeSpacePointerMove: noop,
      onHandleArrangeSpacePointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const domainTree = CompactDomainRail({
      domains: [domain('domain-a')],
      activeDomainId: 'domain-a',
      editing: null,
      arrangeMode,
      arrangeableDomainClassName: 'is-arrangeable',
      draggingDomainId: null,
      domainsGridRef: createRef<HTMLDivElement>(),
      onOpenDomain: noop,
      onOpenContextMenu: onOpenDomainContextMenu,
      onCancelArrangeMode: onCancelDomainArrangeMode,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: onStartArrangeDomainDragSeed,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeDomainPointerMove: noop,
      onHandleArrangeDomainPointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeDomainPointerDrag: noop,
    })
    const spaceButton = findElementByProp(spaceTree, 'data-arrange-space-id', 'space-a')
    const domainButton = findElementByProp(domainTree, 'data-arrange-domain-id', 'domain-a')

    expect(spaceButton).not.toBeNull()
    expect(domainButton).not.toBeNull()
    ;(spaceButton?.props.onPointerDown as TestHandler)({ button: 2 })
    ;(domainButton?.props.onPointerDown as TestHandler)({ button: 2 })
    ;(spaceButton?.props.onContextMenu as TestHandler)({})
    ;(domainButton?.props.onContextMenu as TestHandler)({})

    expect(spaceCalls).toEqual(['cancel', 'menu'])
    expect(domainCalls).toEqual(['cancel', 'menu'])
    expect(onOpenSpaceContextMenu).toHaveBeenCalledWith(expect.anything(), 'space-a', { force: true })
    expect(onOpenDomainContextMenu).toHaveBeenCalledWith(expect.anything(), 'domain-a', { force: true })
    expect(onStartArrangeSpaceDragSeed).not.toHaveBeenCalled()
    expect(onStartArrangeDomainDragSeed).not.toHaveBeenCalled()
  })

  it('keeps compact scope context menus unchanged when arrangement is inactive', () => {
    const onCancelArrangeMode = vi.fn()
    const onOpenContextMenu = vi.fn()
    const inactiveArrangeMode = { ...arrangeMode, active: false }
    const tree = CompactSpaceRail({
      spaces: [space('space-a')],
      activeSpaceId: 'space-a',
      editing: null,
      arrangeMode: inactiveArrangeMode,
      arrangeableSpaceClassName: '',
      draggingSpaceId: null,
      spacesGridRef: createRef<HTMLDivElement>(),
      onOpenSpace: noop,
      onOpenContextMenu,
      onCancelArrangeMode,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeSpacePointerMove: noop,
      onHandleArrangeSpacePointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const button = findElementByProp(tree, 'data-arrange-space-id', 'space-a')

    expect(button).not.toBeNull()
    ;(button?.props.onContextMenu as TestHandler)({})

    expect(onCancelArrangeMode).not.toHaveBeenCalled()
    expect(onOpenContextMenu).toHaveBeenCalledWith(expect.anything(), 'space-a', undefined)
  })

  it('requests editor focus only from Enter commits while renaming compact spaces and domains', () => {
    const onCommitRename = vi.fn()
    const spaceTree = CompactSpaceRail({
      spaces: [space('space-a')],
      activeSpaceId: 'space-a',
      editing: { type: 'space', id: 'space-a' },
      arrangeMode,
      arrangeableSpaceClassName: '',
      draggingSpaceId: null,
      spacesGridRef: createRef<HTMLDivElement>(),
      onOpenSpace: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeSpacePointerMove: noop,
      onHandleArrangeSpacePointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const domainTree = CompactDomainRail({
      domains: [domain('domain-a')],
      activeDomainId: 'domain-a',
      editing: { type: 'domain', id: 'domain-a' },
      arrangeMode,
      arrangeableDomainClassName: '',
      draggingDomainId: null,
      domainsGridRef: createRef<HTMLDivElement>(),
      onOpenDomain: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeDomainPointerMove: noop,
      onHandleArrangeDomainPointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeDomainPointerDrag: noop,
    })
    const spaceInput = findElementByProp(spaceTree, 'className', 'tab-rename-input compact-scope-rename-input')
    const domainInput = findElementByProp(domainTree, 'className', 'tab-rename-input compact-scope-rename-input')
    const spaceEnterEvent = { key: 'Enter', currentTarget: { value: 'Renamed Space' }, preventDefault: vi.fn() }
    const domainEnterEvent = { key: 'Enter', currentTarget: { value: 'Renamed Domain' }, preventDefault: vi.fn() }

    expect(spaceInput).not.toBeNull()
    expect(domainInput).not.toBeNull()
    ;(spaceInput?.props.onBlur as TestHandler)({ target: { value: 'Blurred Space' } })
    ;(domainInput?.props.onBlur as TestHandler)({ target: { value: 'Blurred Domain' } })
    ;(spaceInput?.props.onKeyDown as TestHandler)(spaceEnterEvent)
    ;(domainInput?.props.onKeyDown as TestHandler)(domainEnterEvent)

    expect(spaceEnterEvent.preventDefault).toHaveBeenCalled()
    expect(domainEnterEvent.preventDefault).toHaveBeenCalled()
    expect(onCommitRename).toHaveBeenCalledWith('space', 'space-a', 'Blurred Space')
    expect(onCommitRename).toHaveBeenCalledWith('domain', 'domain-a', 'Blurred Domain')
    expect(onCommitRename).toHaveBeenCalledWith('space', 'space-a', 'Renamed Space', { focusEditor: true })
    expect(onCommitRename).toHaveBeenCalledWith('domain', 'domain-a', 'Renamed Domain', { focusEditor: true })
  })

  it('creates another space or domain from a plain Tab key while renaming', () => {
    const onAddSpace = vi.fn()
    const onAddDomain = vi.fn()
    const onCommitRename = vi.fn()
    const spaceTree = CompactSpaceRail({
      spaces: [space('space-a')],
      activeSpaceId: 'space-a',
      editing: { type: 'space', id: 'space-a' },
      arrangeMode,
      arrangeableSpaceClassName: '',
      draggingSpaceId: null,
      spacesGridRef: createRef<HTMLDivElement>(),
      onOpenSpace: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onAddSpace,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeSpacePointerMove: noop,
      onHandleArrangeSpacePointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const domainTree = CompactDomainRail({
      domains: [domain('domain-a')],
      activeDomainId: 'domain-a',
      editing: { type: 'domain', id: 'domain-a' },
      arrangeMode,
      arrangeableDomainClassName: '',
      draggingDomainId: null,
      domainsGridRef: createRef<HTMLDivElement>(),
      onOpenDomain: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onAddDomain,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeDomainPointerMove: noop,
      onHandleArrangeDomainPointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeDomainPointerDrag: noop,
    })
    const spaceInput = findElementByProp(spaceTree, 'className', 'tab-rename-input compact-scope-rename-input')
    const domainInput = findElementByProp(domainTree, 'className', 'tab-rename-input compact-scope-rename-input')
    const spaceEvent = { key: 'Tab', currentTarget: { value: 'Renamed Space' }, preventDefault: vi.fn() }
    const domainEvent = { key: 'Tab', currentTarget: { value: 'Renamed Domain' }, preventDefault: vi.fn() }

    expect(spaceInput).not.toBeNull()
    expect(domainInput).not.toBeNull()
    ;(spaceInput?.props.onKeyDown as TestHandler)(spaceEvent)
    ;(domainInput?.props.onKeyDown as TestHandler)(domainEvent)

    expect(spaceEvent.preventDefault).toHaveBeenCalled()
    expect(domainEvent.preventDefault).toHaveBeenCalled()
    expect(onCommitRename).toHaveBeenCalledWith('space', 'space-a', 'Renamed Space')
    expect(onCommitRename).toHaveBeenCalledWith('domain', 'domain-a', 'Renamed Domain')
    expect(onAddSpace).toHaveBeenCalledTimes(1)
    expect(onAddDomain).toHaveBeenCalledTimes(1)
  })

  it('does not create another space or domain from modified Tab while renaming', () => {
    const onAddSpace = vi.fn()
    const onAddDomain = vi.fn()
    const spaceTree = CompactSpaceRail({
      spaces: [space('space-a')],
      activeSpaceId: 'space-a',
      editing: { type: 'space', id: 'space-a' },
      arrangeMode,
      arrangeableSpaceClassName: '',
      draggingSpaceId: null,
      spacesGridRef: createRef<HTMLDivElement>(),
      onOpenSpace: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onAddSpace,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeSpacePointerMove: noop,
      onHandleArrangeSpacePointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const domainTree = CompactDomainRail({
      domains: [domain('domain-a')],
      activeDomainId: 'domain-a',
      editing: { type: 'domain', id: 'domain-a' },
      arrangeMode,
      arrangeableDomainClassName: '',
      draggingDomainId: null,
      domainsGridRef: createRef<HTMLDivElement>(),
      onOpenDomain: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit: noop,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onAddDomain,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeDomainPointerMove: noop,
      onHandleArrangeDomainPointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeDomainPointerDrag: noop,
    })
    const spaceInput = findElementByProp(spaceTree, 'className', 'tab-rename-input compact-scope-rename-input')
    const domainInput = findElementByProp(domainTree, 'className', 'tab-rename-input compact-scope-rename-input')

    ;(spaceInput?.props.onKeyDown as TestHandler)({
      key: 'Tab',
      shiftKey: true,
      currentTarget: { value: 'Renamed Space' },
      preventDefault: vi.fn(),
    })
    ;(domainInput?.props.onKeyDown as TestHandler)({
      key: 'Tab',
      metaKey: true,
      currentTarget: { value: 'Renamed Domain' },
      preventDefault: vi.fn(),
    })

    expect(onAddSpace).not.toHaveBeenCalled()
    expect(onAddDomain).not.toHaveBeenCalled()
  })

  it('renders stage-manager selected classes on compact space and domain rails', () => {
    const inactiveArrangeMode = { ...arrangeMode, active: false }
    const spaceHtml = renderToStaticMarkup(
      <CompactSpaceRail
        spaces={[space('space-a')]}
        activeSpaceId="space-a"
        editing={null}
        arrangeMode={inactiveArrangeMode}
        arrangeableSpaceClassName=""
        draggingSpaceId={null}
        spacesGridRef={createRef<HTMLDivElement>()}
        stageManagerMode
        stageManagerSelectedSpaceIds={new Set(['space-a'])}
        onOpenSpace={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeSpacePointerMove={noop}
        onHandleArrangeSpacePointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeSpacePointerDrag={noop}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactDomainRail
        domains={[domain('domain-a')]}
        activeDomainId="domain-a"
        editing={null}
        arrangeMode={inactiveArrangeMode}
        arrangeableDomainClassName=""
        draggingDomainId={null}
        domainsGridRef={createRef<HTMLDivElement>()}
        stageManagerMode
        stageManagerSelectedDomainIds={new Set(['domain-a'])}
        onOpenDomain={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeDomainPointerMove={noop}
        onHandleArrangeDomainPointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeDomainPointerDrag={noop}
      />,
    )

    expect(spaceHtml).toContain('stage-manager-space-selected')
    expect(spaceHtml).not.toContain('compact-scope-add-btn')
    expect(domainHtml).toContain('stage-manager-domain-selected')
    expect(domainHtml).not.toContain('compact-scope-add-btn')
  })

  it('routes stage-manager space double-clicks to the director descendant selector', () => {
    const onStageManagerSpaceDoubleClick = vi.fn()
    const onBeginEdit = vi.fn()
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    const tree = CompactSpaceRail({
      spaces: [space('space-a')],
      activeSpaceId: 'space-a',
      editing: null,
      arrangeMode: { ...arrangeMode, active: false },
      arrangeableSpaceClassName: '',
      draggingSpaceId: null,
      spacesGridRef: createRef<HTMLDivElement>(),
      stageManagerMode: true,
      onStageManagerSpaceDoubleClick,
      onOpenSpace: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeSpacePointerMove: noop,
      onHandleArrangeSpacePointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeSpacePointerDrag: noop,
    })
    const button = findElementByProp(tree, 'data-arrange-space-id', 'space-a')

    expect(button).not.toBeNull()
    ;(button?.props.onDoubleClick as (event: unknown) => void)(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(onStageManagerSpaceDoubleClick).toHaveBeenCalledWith('space-a')
    expect(onBeginEdit).not.toHaveBeenCalled()
  })

  it('routes stage-manager domain double-clicks to the director descendant selector', () => {
    const onStageManagerDomainDoubleClick = vi.fn()
    const onBeginEdit = vi.fn()
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    const tree = CompactDomainRail({
      domains: [domain('domain-a')],
      activeDomainId: 'domain-a',
      editing: null,
      arrangeMode: { ...arrangeMode, active: false },
      arrangeableDomainClassName: '',
      draggingDomainId: null,
      domainsGridRef: createRef<HTMLDivElement>(),
      stageManagerMode: true,
      onStageManagerDomainDoubleClick,
      onOpenDomain: noop,
      onOpenContextMenu: noop,
      onShouldSkipRenameBlur: () => false,
      onCommitRename: noop,
      onCancelRename: noop,
      onRenameDraftChange: noop,
      onBeginEdit,
      onAutoSizeRenameInput: autoSizeNoop,
      onClearRenameDraft: noop,
      onConsumeArrangeClickSuppression: () => false,
      onStartArrangeDragSeed: noop,
      onStartArrangeTapCandidate: noop,
      onStartArrangePress: noop,
      onHandleArrangeDomainPointerMove: noop,
      onHandleArrangeDomainPointerUp: noop,
      onClearArrangePressTimer: noop,
      onCancelArrangeDomainPointerDrag: noop,
    })
    const button = findElementByProp(tree, 'data-arrange-domain-id', 'domain-a')

    expect(button).not.toBeNull()
    ;(button?.props.onDoubleClick as (event: unknown) => void)(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopPropagation).toHaveBeenCalled()
    expect(onStageManagerDomainDoubleClick).toHaveBeenCalledWith('domain-a')
    expect(onBeginEdit).not.toHaveBeenCalled()
  })

  it('renders arrange selected classes on compact space and domain rails', () => {
    const spaceHtml = renderToStaticMarkup(
      <CompactSpaceRail
        spaces={[space('space-a'), space('space-b')]}
        activeSpaceId="space-a"
        editing={null}
        arrangeMode={arrangeMode}
        arrangeableSpaceClassName="is-arrangeable"
        draggingSpaceId={null}
        spacesGridRef={createRef<HTMLDivElement>()}
        arrangeSelectedSpaceIds={new Set(['space-b'])}
        onOpenSpace={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeSpacePointerMove={noop}
        onHandleArrangeSpacePointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeSpacePointerDrag={noop}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactDomainRail
        domains={[domain('domain-a'), domain('domain-b')]}
        activeDomainId="domain-a"
        editing={null}
        arrangeMode={arrangeMode}
        arrangeableDomainClassName="is-arrangeable"
        draggingDomainId={null}
        domainsGridRef={createRef<HTMLDivElement>()}
        arrangeSelectedDomainIds={new Set(['domain-b'])}
        onOpenDomain={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeDomainPointerMove={noop}
        onHandleArrangeDomainPointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeDomainPointerDrag={noop}
      />,
    )

    expect(spaceHtml).toContain('compact-space-btn is-arrange-selected is-arrangeable')
    expect(domainHtml).toContain('compact-domain-btn is-arrange-selected is-arrangeable')
  })


  it('renders inline rename inputs for compact spaces and domains', () => {
    const spaceHtml = renderToStaticMarkup(
      <CompactSpaceRail
        spaces={[space('space-a')]}
        activeSpaceId="space-a"
        editing={{ type: 'space', id: 'space-a' }}
        arrangeMode={arrangeMode}
        arrangeableSpaceClassName=""
        draggingSpaceId={null}
        spacesGridRef={createRef<HTMLDivElement>()}
        onOpenSpace={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeSpacePointerMove={noop}
        onHandleArrangeSpacePointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeSpacePointerDrag={noop}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactDomainRail
        domains={[domain('domain-a')]}
        activeDomainId="domain-a"
        editing={{ type: 'domain', id: 'domain-a' }}
        arrangeMode={arrangeMode}
        arrangeableDomainClassName=""
        draggingDomainId={null}
        domainsGridRef={createRef<HTMLDivElement>()}
        onOpenDomain={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeDomainPointerMove={noop}
        onHandleArrangeDomainPointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeDomainPointerDrag={noop}
      />,
    )

    expect(spaceHtml).toContain('class="tab-rename-input compact-scope-rename-input"')
    expect(domainHtml).toContain('class="tab-rename-input compact-scope-rename-input"')
    expect(spaceHtml).not.toContain('space-rename-input compact-scope-rename-input')
    expect(domainHtml).not.toContain('space-rename-input compact-scope-rename-input')
  })

  it('renders compact drag previews with focused button classes even when inactive', () => {
    const spaceHtml = renderToStaticMarkup(
      <CompactScopeDragPreview
        type="space"
        active={false}
        preview={{
          spaceId: 'space-a',
          sourceDomainId: 'domain-a',
          label: 'Space A',
          currentX: 100,
          currentY: 80,
          offsetX: 10,
          offsetY: 8,
          width: 120,
          height: 26,
        }}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactScopeDragPreview
        type="domain"
        active={false}
        preview={{
          domainId: 'domain-a',
          label: 'Domain A',
          currentX: 100,
          currentY: 80,
          offsetX: 10,
          offsetY: 8,
          width: 120,
          height: 26,
        }}
      />,
    )

    expect(spaceHtml).toContain('data-drag-count="1"')
    expect(domainHtml).toContain('data-drag-count="1"')
    expect(spaceHtml).toContain(
      'compact-scope-arrange-preview compact-scope-btn compact-space-btn is-space is-active is-selected arrange-preview-card arrange-preview-primary',
    )
    expect(domainHtml).toContain(
      'compact-scope-arrange-preview compact-scope-btn compact-domain-btn is-domain is-active is-selected arrange-preview-card arrange-preview-primary',
    )
    expect(spaceHtml).not.toContain('arrange-preview-ghost')
    expect(spaceHtml).toContain('left:90px')
    expect(domainHtml).toContain('top:72px')
  })

  it('renders compact scope preview ghost cards for multi-item drags', () => {
    const spaceHtml = renderToStaticMarkup(
      <CompactScopeDragPreview
        type="space"
        active
        preview={{
          spaceId: 'space-a',
          sourceDomainId: 'domain-a',
          label: 'Space A',
          currentX: 100,
          currentY: 80,
          offsetX: 10,
          offsetY: 8,
          width: 120,
          height: 26,
          dragCount: 2,
          ghostItems: [{ id: 'space-b', label: 'Space B', x: -32, y: 0, width: 92, height: 26 }],
        }}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactScopeDragPreview
        type="domain"
        active
        preview={{
          domainId: 'domain-a',
          label: 'Domain A',
          currentX: 100,
          currentY: 80,
          offsetX: 10,
          offsetY: 8,
          width: 120,
          height: 26,
          dragCount: 3,
          ghostItems: [
            { id: 'domain-b', label: 'Domain B', x: -32, y: 0, width: 104, height: 26 },
            { id: 'domain-c', label: 'Domain C', x: 64, y: 0, width: 136, height: 26 },
          ],
        }}
      />,
    )

    expect(spaceHtml).toContain('data-drag-count="2"')
    expect(spaceHtml).toContain('class="arrange-preview-stack is-stacked"')
    expect(spaceHtml).toContain(
      'compact-scope-arrange-preview compact-scope-btn compact-space-btn is-space is-active is-selected arrange-preview-card arrange-preview-ghost is-ghost-1',
    )
    expect(spaceHtml).toContain('--arrange-preview-ghost-x:-32px')
    expect(spaceHtml).toContain('--arrange-preview-ghost-rotation:-30deg')
    expect(spaceHtml).not.toContain('arrange-preview-ghost is-ghost-2')
    expect(spaceHtml).toContain('width:92px')
    expect(spaceHtml.match(/Space A/g)).toHaveLength(1)
    expect(spaceHtml).toContain('Space B')
    expect(spaceHtml).not.toContain('Space A +')
    expect(domainHtml).toContain('data-drag-count="3"')
    expect(domainHtml).toContain(
      'compact-scope-arrange-preview compact-scope-btn compact-domain-btn is-domain is-active is-selected arrange-preview-card arrange-preview-ghost is-ghost-1',
    )
    expect(domainHtml).toContain(
      'compact-scope-arrange-preview compact-scope-btn compact-domain-btn is-domain is-active is-selected arrange-preview-card arrange-preview-ghost is-ghost-2',
    )
    expect(domainHtml).toContain('--arrange-preview-ghost-x:64px')
    expect(domainHtml).toContain('--arrange-preview-ghost-rotation:30deg')
    expect(domainHtml).toContain('left:90px')
    expect(domainHtml).toContain('top:72px')
    expect(domainHtml).toContain('width:104px')
    expect(domainHtml).toContain('width:136px')
    expect(domainHtml.match(/Domain A/g)).toHaveLength(1)
    expect(domainHtml).toContain('Domain B')
    expect(domainHtml).toContain('Domain C')
    expect(domainHtml).not.toContain('Domain A +')
  })

  it('keeps compact scope sort buttons visible but disabled when arrange controls are disabled', () => {
    const spaceHtml = renderToStaticMarkup(
      <CompactSpaceRail
        spaces={[space('space-a')]}
        activeSpaceId="space-a"
        editing={null}
        arrangeMode={arrangeMode}
        arrangeableSpaceClassName="is-arrangeable"
        arrangeControlsDisabled
        draggingSpaceId={null}
        spacesGridRef={createRef<HTMLDivElement>()}
        onOpenSpace={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onOpenSpaceSortModal={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeSpacePointerMove={noop}
        onHandleArrangeSpacePointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeSpacePointerDrag={noop}
      />,
    )
    const domainHtml = renderToStaticMarkup(
      <CompactDomainRail
        domains={[domain('domain-a')]}
        activeDomainId="domain-a"
        editing={null}
        arrangeMode={arrangeMode}
        arrangeableDomainClassName="is-arrangeable"
        arrangeControlsDisabled
        draggingDomainId={null}
        domainsGridRef={createRef<HTMLDivElement>()}
        onOpenDomain={noop}
        onOpenContextMenu={noop}
        onShouldSkipRenameBlur={() => false}
        onCommitRename={noop}
        onCancelRename={noop}
        onRenameDraftChange={noop}
        onBeginEdit={noop}
        onAutoSizeRenameInput={autoSizeNoop}
        onClearRenameDraft={noop}
        onOpenDomainSortModal={noop}
        onConsumeArrangeClickSuppression={() => false}
        onStartArrangeDragSeed={noop}
        onStartArrangeTapCandidate={noop}
        onStartArrangePress={noop}
        onHandleArrangeDomainPointerMove={noop}
        onHandleArrangeDomainPointerUp={noop}
        onClearArrangePressTimer={noop}
        onCancelArrangeDomainPointerDrag={noop}
      />,
    )

    expect(spaceHtml).toContain('aria-label="sort spaces"')
    expect(spaceHtml).toContain('disabled=""')
    expect(domainHtml).toContain('aria-label="sort domains"')
    expect(domainHtml).toContain('disabled=""')
  })

  it('wires compact space/domain rename parity handlers', () => {
    const source = readFileSync(join(componentDir, 'CompactScopeRails.tsx'), 'utf8')
    const appSource = readFileSync(join(componentDir, '../../App.tsx'), 'utf8')

    expect(source).toContain('onAutoSizeRenameInput(event.currentTarget)')
    expect(source).toContain('const action = getRenameInputKeyAction(event)')
    expect(source).toContain("if (action === 'commit')")
    expect(source).toContain("if (action === 'commit-and-create')")
    expect(source).toContain("if (action === 'cancel')")
    expect(source).toContain("onBeginEdit({ type: 'space', id: space.id })")
    expect(source).toContain("onBeginEdit({ type: 'domain', id: domain.id })")
    expect(source).toContain('onHandleArrangeSpaceSelectionClick?.(space.id, modifiers)')
    expect(source).toContain('onHandleArrangeDomainSelectionClick?.(domain.id, modifiers)')
    expect(source).toContain('onClearArrangeSelection?.()')
    expect(source).toContain('if (arrangeMode.active) return')
    expect(appSource).not.toContain("arrangeMode.scope === 'spaces' &&")
    expect(appSource).not.toContain("arrangeMode.scope === 'domains' &&")
  })
})
