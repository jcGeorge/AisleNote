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

  it('renders compact drag previews with matching button classes and active state', () => {
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
        }}
      />,
    )

    expect(spaceHtml).toContain('compact-scope-arrange-preview compact-scope-btn compact-space-btn is-space is-active')
    expect(domainHtml).toContain('compact-scope-arrange-preview compact-scope-btn compact-domain-btn is-domain is-active')
    expect(spaceHtml).toContain('left:90px')
    expect(domainHtml).toContain('top:72px')
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

    expect(source).toContain('onAutoSizeRenameInput(event.currentTarget)')
    expect(source).toContain('const action = getRenameInputKeyAction(event)')
    expect(source).toContain("if (action === 'commit')")
    expect(source).toContain("if (action === 'cancel')")
    expect(source).toContain("onBeginEdit({ type: 'space', id: space.id })")
    expect(source).toContain("onBeginEdit({ type: 'domain', id: domain.id })")
    expect(source).toContain('onHandleArrangeSpaceSelectionClick?.(space.id, modifiers)')
    expect(source).toContain('onHandleArrangeDomainSelectionClick?.(domain.id, modifiers)')
    expect(source).toContain('onClearArrangeSelection?.()')
    expect(source).toContain('if (arrangeMode.active) return')
  })
})
