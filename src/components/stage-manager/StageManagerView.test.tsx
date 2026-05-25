import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultStageManagerDraft } from '../../stage-manager/selection'
import type { Domain, FrontmatterTemplate, Space, StageManagerMigrateTarget, StageManagerStep } from '../../types/app'
import { StageManagerView } from './StageManagerView'

const template: FrontmatterTemplate = {
  id: 'template-1',
  name: 'review template',
  fields: [
    { id: 'field-status', key: 'status', type: 'text', defaultValue: 'draft', computed: 'none' },
    { id: 'field-created', key: 'created', type: 'date', defaultValue: '', computed: 'createdAt' },
    { id: 'field-empty', key: 'summary', type: 'text', defaultValue: '', computed: 'none' },
  ],
}

const space: Space = {
  id: 'space-1',
  name: 'Space',
  settings: { autoRemoveDeletedDays: 7 },
  data: {
    activeTabId: 'tab-1',
    tabs: [{ id: 'tab-1', title: 'Tab', noteBodyId: 'body-1', activeSubTabId: null, subTabs: [] }],
    deletedTabs: [],
    deletedSubTabs: [],
  },
}

const domain: Domain = {
  id: 'domain-1',
  name: 'Domain',
  activeSpaceId: space.id,
  spaces: [space],
}

const noop = () => undefined

function renderFrontmatterStageManager(step: StageManagerStep) {
  return renderToStaticMarkup(
    <StageManagerView
      domains={[domain]}
      step={step}
      action="frontmatter"
      selectionKind="notes"
      availableActions={['migrate', 'promote', 'demote', 'frontmatter', 'mass-delete']}
      draft={{ ...createDefaultStageManagerDraft(), frontmatterTemplateId: template.id }}
      selectionSnapshot={{
        fullParents: [],
        partialParents: [],
        looseSubTabs: [],
        fullParentIds: new Set(),
        hasSelection: true,
      }}
      selectionCounts={{
        kind: 'notes',
        fullParentCount: 0,
        selectedSubTabCount: 1,
        selectedSpaceCount: 0,
        selectedDomainCount: 0,
        hasSelection: true,
      }}
      promoteDomainId={domain.id}
      promoteDestinationSpaces={[space]}
      demoteDomainId={domain.id}
      demoteSpaces={[space]}
      demoteSpace={space}
      demoteParentOptions={space.data.tabs}
      migrateDomainId={domain.id}
      migrateDestinationSpaces={[space]}
      strayHandlingSelectValue="promote"
      strayExistingParentOptions={space.data.tabs}
      migrateParentDomainId={domain.id}
      migrateParentSpaces={[space]}
      migrateParentOptions={space.data.tabs}
      frontmatterTemplates={[template]}
      openDestinationAfterApply
      reviewDetails={['template: review template']}
      reviewWarning=""
      onSelectAll={noop}
      onDeselectAll={noop}
      onSelectAction={noop}
      onDraftChange={noop}
      onOpenDestinationChange={noop}
      onPrevious={noop}
      onNext={noop}
      onApply={noop}
    />,
  )
}

function renderMigrateStageManager(migrateTarget: StageManagerMigrateTarget = null) {
  const destinationSpace = { ...space, id: 'space-2', name: 'Archive' }

  return renderToStaticMarkup(
    <StageManagerView
      domains={[{ ...domain, spaces: [space, destinationSpace] }]}
      step="configure"
      action="migrate"
      selectionKind="notes"
      availableActions={['migrate', 'promote', 'demote', 'frontmatter', 'mass-delete']}
      draft={{
        ...createDefaultStageManagerDraft(),
        migrateTarget,
        migrateSpaceMode: 'existing',
        migrateSpaceId: destinationSpace.id,
      }}
      selectionSnapshot={{
        fullParents: [],
        partialParents: [],
        looseSubTabs: [],
        fullParentIds: new Set(),
        hasSelection: true,
      }}
      selectionCounts={{
        kind: 'notes',
        fullParentCount: 0,
        selectedSubTabCount: 1,
        selectedSpaceCount: 0,
        selectedDomainCount: 0,
        hasSelection: true,
      }}
      promoteDomainId={domain.id}
      promoteDestinationSpaces={[space, destinationSpace]}
      demoteDomainId={domain.id}
      demoteSpaces={[space, destinationSpace]}
      demoteSpace={space}
      demoteParentOptions={space.data.tabs}
      migrateDomainId={domain.id}
      migrateDestinationSpaces={[destinationSpace]}
      strayHandlingSelectValue="promote"
      strayExistingParentOptions={destinationSpace.data.tabs}
      migrateParentDomainId={domain.id}
      migrateParentSpaces={[space, destinationSpace]}
      migrateParentOptions={space.data.tabs}
      frontmatterTemplates={[template]}
      openDestinationAfterApply
      reviewDetails={[]}
      reviewWarning=""
      onSelectAll={noop}
      onDeselectAll={noop}
      onSelectAction={noop}
      onDraftChange={noop}
      onOpenDestinationChange={noop}
      onPrevious={noop}
      onNext={noop}
      onApply={noop}
    />,
  )
}

function renderHierarchyStageManager(kind: 'spaces' | 'domains') {
  return renderToStaticMarkup(
    <StageManagerView
      domains={[domain, { ...domain, id: 'domain-2', name: 'Archive' }]}
      step="action"
      action={null}
      selectionKind={kind}
      availableActions={kind === 'spaces' ? ['migrate', 'promote', 'mass-delete'] : ['demote', 'mass-delete']}
      draft={createDefaultStageManagerDraft()}
      selectionSnapshot={{
        fullParents: [],
        partialParents: [],
        looseSubTabs: [],
        fullParentIds: new Set(),
        hasSelection: false,
      }}
      selectionCounts={{
        kind,
        fullParentCount: 0,
        selectedSubTabCount: 0,
        selectedSpaceCount: kind === 'spaces' ? 2 : 0,
        selectedDomainCount: kind === 'domains' ? 2 : 0,
        hasSelection: true,
      }}
      promoteDomainId={domain.id}
      promoteDestinationSpaces={[space]}
      demoteDomainId="domain-2"
      demoteSpaces={[space]}
      demoteSpace={space}
      demoteParentOptions={space.data.tabs}
      migrateDomainId="domain-2"
      migrateDestinationSpaces={[space]}
      strayHandlingSelectValue="promote"
      strayExistingParentOptions={space.data.tabs}
      migrateParentDomainId={domain.id}
      migrateParentSpaces={[space]}
      migrateParentOptions={space.data.tabs}
      frontmatterTemplates={[template]}
      openDestinationAfterApply
      reviewDetails={[]}
      reviewWarning=""
      onSelectAll={noop}
      onDeselectAll={noop}
      onSelectAction={noop}
      onDraftChange={noop}
      onOpenDestinationChange={noop}
      onPrevious={noop}
      onNext={noop}
      onApply={noop}
    />,
  )
}

describe('StageManagerView frontmatter preview', () => {
  it('filters actions for space and domain selections', () => {
    const spaceHtml = renderHierarchyStageManager('spaces')
    const domainHtml = renderHierarchyStageManager('domains')

    expect(spaceHtml).toContain('migrate')
    expect(spaceHtml).toContain('promote')
    expect(spaceHtml).toContain('mass delete')
    expect(spaceHtml).not.toContain('frontmatter')
    expect(spaceHtml).not.toContain('demote')
    expect(domainHtml).toContain('demote')
    expect(domainHtml).toContain('mass delete')
    expect(domainHtml).not.toContain('frontmatter')
    expect(domainHtml).not.toContain('promote')
  })

  it('initially shows only the migration target choices', () => {
    const html = renderMigrateStageManager()

    expect(html).toContain('migrate to space')
    expect(html).toContain('migrate to parent tab')
    expect(html).not.toContain('destination domain')
    expect(html).not.toContain('destination space')
    expect(html).not.toContain('<span>destination parent</span>')
    expect(html).not.toContain('destination order')
    expect(html).not.toContain('open destination after apply')
  })

  it('reveals space controls after choosing migrate to space', () => {
    const html = renderMigrateStageManager('space')

    expect(html).toContain('existing space')
    expect(html).toContain('new space')
    expect(html).toContain('destination domain')
    expect(html).toContain('destination space')
    expect(html).toContain('Archive')
    expect(html).toContain('destination order')
    expect(html).toContain('open destination after apply')
    expect(html).not.toContain('<span>destination parent</span>')
  })

  it('reveals parent controls after choosing migrate to parent tab', () => {
    const html = renderMigrateStageManager('parent')

    expect(html).toContain('current space')
    expect(html).toContain('existing space')
    expect(html).toContain('new space')
    expect(html).toContain('existing parent')
    expect(html).toContain('new parent')
    expect(html).toContain('destination parent')
    expect(html).toContain('destination order')
    expect(html).toContain('open destination after apply')
  })

  it('shows template fields in the configure step', () => {
    const html = renderFrontmatterStageManager('configure')

    expect(html).toContain('aria-label="frontmatter fields to apply"')
    expect(html).toContain('fields to apply')
    expect(html).toContain('status')
    expect(html).toContain('text')
    expect(html).toContain('default: draft')
    expect(html).toContain('created')
    expect(html).toContain('date')
    expect(html).toContain('computed: createdAt')
    expect(html).toContain('summary')
    expect(html).toContain('empty')
  })

  it('shows template fields in the review step', () => {
    const html = renderFrontmatterStageManager('review')

    expect(html).toContain('template: review template')
    expect(html).toContain('aria-label="frontmatter fields to apply"')
    expect(html).toContain('computed: createdAt')
    expect(html).toContain('default: draft')
  })
})
