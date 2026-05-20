import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDefaultStageManagerDraft } from '../../stage-manager/selection'
import type { Domain, FrontmatterTemplate, Space, StageManagerStep } from '../../types/app'
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
    tabs: [{ id: 'tab-1', title: 'Tab', noteBodyId: 'body-1', homeContent: '', activeSubTabId: null, subTabs: [] }],
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
      draft={{ ...createDefaultStageManagerDraft(), frontmatterTemplateId: template.id }}
      selectionSnapshot={{
        fullParents: [],
        partialParents: [],
        looseSubTabs: [],
        fullParentIds: new Set(),
        hasSelection: true,
      }}
      selectionCounts={{ fullParentCount: 0, selectedSubTabCount: 1 }}
      promoteDomainId={domain.id}
      promoteDestinationSpaces={[space]}
      demoteDomainId={domain.id}
      demoteSpaces={[space]}
      demoteSpace={space}
      demoteParentOptions={space.data.tabs}
      migrateDomainId={domain.id}
      otherSpaces={[space]}
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

describe('StageManagerView frontmatter preview', () => {
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
