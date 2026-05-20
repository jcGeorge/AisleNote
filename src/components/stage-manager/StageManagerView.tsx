import type {
  Domain,
  FrontmatterTemplate,
  Space,
  StageManagerAction,
  StageManagerDraft,
  StageManagerSelectionSnapshot,
  StageManagerStep,
  StageManagerStrayHandlingMode,
  Tab,
} from '../../types/app'
import { STAGE_MANAGER_DESTINATION_SORT_OPTIONS } from '../../arrange/tab-sort'

type StageManagerSelectionCounts = {
  fullParentCount: number
  selectedSubTabCount: number
}

type StageManagerViewProps = {
  domains: Domain[]
  step: StageManagerStep
  action: StageManagerAction | null
  draft: StageManagerDraft
  selectionSnapshot: StageManagerSelectionSnapshot
  selectionCounts: StageManagerSelectionCounts
  promoteDomainId: string
  promoteDestinationSpaces: Space[]
  demoteDomainId: string
  demoteSpaces: Space[]
  demoteSpace: Space | null
  demoteParentOptions: Tab[]
  migrateDomainId: string
  migrateDestinationSpaces: Space[]
  strayHandlingSelectValue: string
  strayExistingParentOptions: Tab[]
  migrateParentDomainId: string
  migrateParentSpaces: Space[]
  migrateParentOptions: Tab[]
  frontmatterTemplates: FrontmatterTemplate[]
  openDestinationAfterApply: boolean
  reviewDetails: string[]
  reviewWarning: string
  onSelectAll: () => void
  onDeselectAll: () => void
  onSelectAction: (action: StageManagerAction) => void
  onDraftChange: (patch: Partial<StageManagerDraft>) => void
  onOpenDestinationChange: (checked: boolean) => void
  onPrevious: () => void
  onNext: () => void
  onApply: () => void
}

const STEP_LABELS: Array<[StageManagerStep, string]> = [
  ['select', 'select items'],
  ['action', 'choose action'],
  ['configure', 'configure'],
  ['review', 'review'],
]

const ACTIONS: Array<[StageManagerAction, string]> = [
  ['migrate', 'migrate'],
  ['promote', 'promote'],
  ['demote', 'demote'],
  ['frontmatter', 'frontmatter'],
  ['mass-delete', 'mass delete'],
]

function DomainSelect({
  domains,
  value,
  onChange,
}: {
  domains: Domain[]
  value: string
  onChange: (domainId: string) => void
}) {
  return (
    <select className="form-select form-select-sm" value={value} onChange={(event) => onChange(event.target.value)}>
      {domains.map((domain) => (
        <option key={domain.id} value={domain.id}>
          {domain.name}
        </option>
      ))}
    </select>
  )
}

function SpaceOptions({ spaces }: { spaces: Space[] }) {
  return (
    <>
      {spaces.map((space) => (
        <option key={space.id} value={space.id}>
          {space.name}
        </option>
      ))}
    </>
  )
}

function ParentOptions({ tabs }: { tabs: Tab[] }) {
  return (
    <>
      {tabs.map((tab) => (
        <option key={tab.id} value={tab.id}>
          {tab.title}
        </option>
      ))}
    </>
  )
}

type FrontmatterTemplateFieldPreview = FrontmatterTemplate['fields'][number]

function getFrontmatterTemplateFieldSourceLabel(field: FrontmatterTemplateFieldPreview) {
  if (field.computed !== 'none') return `computed: ${field.computed}`
  const defaultValue = field.defaultValue.trim()
  return defaultValue ? `default: ${defaultValue}` : 'empty'
}

function FrontmatterTemplateFieldPreviewList({ template }: { template: FrontmatterTemplate | null }) {
  if (!template) {
    return (
      <div className="stage-manager-frontmatter-preview" aria-label="frontmatter fields to apply">
        <p className="stage-manager-help">select a template to preview fields.</p>
      </div>
    )
  }

  if (template.fields.length === 0) {
    return (
      <div className="stage-manager-frontmatter-preview" aria-label="frontmatter fields to apply">
        <h3>fields to apply</h3>
        <p className="stage-manager-help">this template has no fields.</p>
      </div>
    )
  }

  return (
    <div className="stage-manager-frontmatter-preview" aria-label="frontmatter fields to apply">
      <h3>fields to apply</h3>
      <ul>
        {template.fields.map((field) => (
          <li key={field.id}>
            <span className="stage-manager-frontmatter-field-key">{field.key || '(blank key)'}</span>
            <span>{field.type}</span>
            <span>{getFrontmatterTemplateFieldSourceLabel(field)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function StageManagerView({
  domains,
  step,
  action,
  draft,
  selectionSnapshot,
  selectionCounts,
  promoteDomainId,
  promoteDestinationSpaces,
  demoteDomainId,
  demoteSpaces,
  demoteSpace,
  demoteParentOptions,
  migrateDomainId,
  migrateDestinationSpaces,
  strayHandlingSelectValue,
  strayExistingParentOptions,
  migrateParentDomainId,
  migrateParentSpaces,
  migrateParentOptions,
  frontmatterTemplates,
  openDestinationAfterApply,
  reviewDetails,
  reviewWarning,
  onSelectAll,
  onDeselectAll,
  onSelectAction,
  onDraftChange,
  onOpenDestinationChange,
  onPrevious,
  onNext,
  onApply,
}: StageManagerViewProps) {
  const selectedFrontmatterTemplate =
    action === 'frontmatter'
      ? frontmatterTemplates.find((template) => template.id === draft.frontmatterTemplateId) ?? null
      : null

  return (
    <section className="stage-manager-shell">
      <div className="stage-manager-card">
        <div className="stage-manager-steps" aria-label="Director steps">
          {STEP_LABELS.map(([candidateStep, label], index) => (
            <div
              key={candidateStep}
              className={`stage-manager-step-pill ${step === candidateStep ? 'is-active' : ''} ${
                STEP_LABELS.findIndex(([candidate]) => candidate === step) > index ? 'is-complete' : ''
              }`}
            >
              <span className="stage-manager-step-index">{index + 1}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {step === 'select' && (
          <div className="stage-manager-panel">
            <h2>director</h2>
            <p>select the parent tabs and sub-tabs you want to work with in this space.</p>
            <div className="stage-manager-actions-row">
              <button type="button" className="btn btn-sm stage-manager-secondary-btn" onClick={onSelectAll}>
                select all
              </button>
              <button type="button" className="btn btn-sm stage-manager-secondary-btn" onClick={onDeselectAll}>
                deselect all
              </button>
            </div>
            <p className="stage-manager-help">
              selected parent tabs: {selectionCounts.fullParentCount}. selected sub-tabs: {selectionCounts.selectedSubTabCount}.
            </p>
          </div>
        )}

        {step === 'action' && (
          <div className="stage-manager-panel">
            <h2>choose action</h2>
            <p>pick what you want to do with the current selection.</p>
            <div className="stage-manager-action-grid">
              {ACTIONS.map(([candidateAction, label]) => (
                <button
                  key={candidateAction}
                  type="button"
                  className={`btn btn-sm stage-manager-action-btn ${action === candidateAction ? 'is-selected' : ''}`}
                  onClick={() => onSelectAction(candidateAction)}
                >
                  {label}
                </button>
              ))}
            </div>
            {action === 'migrate' && (
              <p className="stage-manager-help">
                migration changes location. moving a parent tab into another parent will demote that parent into a sub-tab.
              </p>
            )}
            {action === 'promote' && (
              <p className="stage-manager-help">
                promotion changes level. one fully selected parent can become a new space. selected sub-tabs can become prime tabs.
              </p>
            )}
            {action === 'demote' && (
              <p className="stage-manager-help">
                demotion changes level. selected parent tabs become sub-tabs under the destination parent, and selected loose sub-tabs move with them.
              </p>
            )}
            {action === 'frontmatter' && (
              <p className="stage-manager-help">
                frontmatter applies a saved YAML template to the selected notes.
              </p>
            )}
            {action === 'mass-delete' && (
              <p className="stage-manager-help">
                mass delete can either move the selection into trash or permanently remove it.
              </p>
            )}
          </div>
        )}

        {step === 'configure' && (
          <div className="stage-manager-panel">
            <h2>configure</h2>
            {action === 'promote' && selectionSnapshot.fullParents.length === 1 && (
              <>
                <p>
                  this fully selected parent will become a new space. its home note becomes a prime tab named <code>main</code>.
                </p>
                <div className="stage-manager-field-grid">
                  <label className="stage-manager-field">
                    <span>destination domain</span>
                    <DomainSelect domains={domains} value={promoteDomainId} onChange={(domainId) => onDraftChange({ promoteDomainId: domainId })} />
                  </label>
                  <label className="stage-manager-field">
                    <span>new space name</span>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      value={draft.newSpaceName}
                      onChange={(event) => onDraftChange({ newSpaceName: event.target.value })}
                      placeholder={selectionSnapshot.fullParents[0]?.title ?? 'new space'}
                    />
                  </label>
                </div>
              </>
            )}

            {action === 'promote' && selectionSnapshot.fullParents.length === 0 && (
              <>
                <p>selected sub-tabs will be promoted into prime tabs in the destination space.</p>
                <div className="stage-manager-actions-row">
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.promoteSpaceMode === 'existing' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ promoteSpaceMode: 'existing' })}
                  >
                    existing space
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.promoteSpaceMode === 'new' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ promoteSpaceMode: 'new' })}
                  >
                    new space
                  </button>
                </div>
                <div className="stage-manager-field-grid">
                  <label className="stage-manager-field">
                    <span>destination domain</span>
                    <DomainSelect
                      domains={domains}
                      value={promoteDomainId}
                      onChange={(domainId) => onDraftChange({ promoteDomainId: domainId, promoteSpaceId: '' })}
                    />
                  </label>
                  {draft.promoteSpaceMode === 'existing' ? (
                    <label className="stage-manager-field">
                      <span>destination space</span>
                      <select
                        className="form-select form-select-sm"
                        value={draft.promoteSpaceId}
                        onChange={(event) => onDraftChange({ promoteSpaceId: event.target.value })}
                      >
                        <option value="">select a space</option>
                        <SpaceOptions spaces={promoteDestinationSpaces} />
                      </select>
                    </label>
                  ) : (
                    <label className="stage-manager-field">
                      <span>new space name</span>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={draft.newSpaceName}
                        onChange={(event) => onDraftChange({ newSpaceName: event.target.value })}
                        placeholder="new space"
                      />
                    </label>
                  )}
                </div>
              </>
            )}

            {action === 'demote' && (
              <>
                <p>selected parent tabs will become sub-tabs under the destination parent. their old home notes become their new note content.</p>
                <div className="stage-manager-field-grid">
                  <label className="stage-manager-field">
                    <span>destination domain</span>
                    <DomainSelect
                      domains={domains}
                      value={demoteDomainId}
                      onChange={(domainId) => onDraftChange({ demoteDomainId: domainId, demoteSpaceId: '', demoteParentId: '' })}
                    />
                  </label>
                  <label className="stage-manager-field">
                    <span>destination space</span>
                    <select
                      className="form-select form-select-sm"
                      value={demoteSpace?.id ?? ''}
                      onChange={(event) => onDraftChange({ demoteSpaceId: event.target.value, demoteParentId: '' })}
                    >
                      <SpaceOptions spaces={demoteSpaces} />
                    </select>
                  </label>
                </div>
                <div className="stage-manager-actions-row">
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.demoteParentMode === 'existing' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ demoteParentMode: 'existing' })}
                  >
                    existing parent
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.demoteParentMode === 'new' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ demoteParentMode: 'new' })}
                  >
                    new parent
                  </button>
                </div>
                <div className="stage-manager-field-grid">
                  {draft.demoteParentMode === 'existing' ? (
                    <label className="stage-manager-field">
                      <span>destination parent</span>
                      <select
                        className="form-select form-select-sm"
                        value={draft.demoteParentId}
                        onChange={(event) => onDraftChange({ demoteParentId: event.target.value })}
                      >
                        <option value="">select a parent tab</option>
                        <ParentOptions tabs={demoteParentOptions} />
                      </select>
                    </label>
                  ) : (
                    <label className="stage-manager-field">
                      <span>new parent name</span>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={draft.demoteNewParentName}
                        onChange={(event) => onDraftChange({ demoteNewParentName: event.target.value })}
                        placeholder="new parent"
                      />
                    </label>
                  )}
                </div>
              </>
            )}

            {action === 'migrate' && (
              <>
                <p>choose whether the selection moves to another space or underneath a destination parent tab.</p>
                <div className="stage-manager-actions-row">
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.migrateTarget === 'space' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ migrateTarget: 'space' })}
                  >
                    migrate to space
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.migrateTarget === 'parent' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ migrateTarget: 'parent' })}
                  >
                    migrate to parent tab
                  </button>
                </div>

                {draft.migrateTarget === 'space' && (
                  <>
                    <div className="stage-manager-actions-row">
                      <button
                        type="button"
                        className={`btn btn-sm stage-manager-action-btn ${draft.migrateSpaceMode === 'existing' ? 'is-selected' : ''}`}
                        onClick={() => onDraftChange({ migrateSpaceMode: 'existing' })}
                      >
                        existing space
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm stage-manager-action-btn ${draft.migrateSpaceMode === 'new' ? 'is-selected' : ''}`}
                        onClick={() => onDraftChange({ migrateSpaceMode: 'new' })}
                      >
                        new space
                      </button>
                    </div>
                    <div className="stage-manager-field-grid">
                      <label className="stage-manager-field">
                        <span>destination domain</span>
                        <DomainSelect
                          domains={domains}
                          value={migrateDomainId}
                          onChange={(domainId) => onDraftChange({ migrateDomainId: domainId, migrateSpaceId: '' })}
                        />
                      </label>
                      {draft.migrateSpaceMode === 'existing' ? (
                        <label className="stage-manager-field">
                          <span>destination space</span>
                          <select
                            className="form-select form-select-sm"
                            value={draft.migrateSpaceId}
                            onChange={(event) => onDraftChange({ migrateSpaceId: event.target.value })}
                          >
                            <option value="">select a space</option>
                            <SpaceOptions spaces={migrateDestinationSpaces} />
                          </select>
                        </label>
                      ) : (
                        <label className="stage-manager-field">
                          <span>new space name</span>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={draft.newSpaceName}
                            onChange={(event) => onDraftChange({ newSpaceName: event.target.value })}
                            placeholder="new space"
                          />
                        </label>
                      )}
                    </div>

                    {selectionSnapshot.looseSubTabs.length > 0 && (
                      <>
                        <label className="stage-manager-field">
                          <span>how do we handle stray sub-tabs?</span>
                          <select
                            className="form-select form-select-sm"
                            value={strayHandlingSelectValue}
                            onChange={(event) => {
                              const value = event.target.value
                              if (value.startsWith('selected-parent:')) {
                                onDraftChange({
                                  strayHandlingMode: 'selected-parent',
                                  straySelectedParentId: value.slice('selected-parent:'.length),
                                })
                                return
                              }
                              onDraftChange({ strayHandlingMode: value as StageManagerStrayHandlingMode })
                            }}
                          >
                            <option value="promote">promote to own prime tabs</option>
                            {selectionSnapshot.fullParents.map((tab) => (
                              <option key={tab.id} value={`selected-parent:${tab.id}`}>
                                include under {tab.title}
                              </option>
                            ))}
                            <option value="existing-parent">include under existing parent...</option>
                            <option value="new-parent">create new parent tab...</option>
                          </select>
                        </label>

                        {draft.strayHandlingMode === 'existing-parent' && (
                          <label className="stage-manager-field">
                            <span>destination parent</span>
                            <select
                              className="form-select form-select-sm"
                              value={draft.strayExistingParentId}
                              onChange={(event) => onDraftChange({ strayExistingParentId: event.target.value })}
                            >
                              <option value="">select a parent tab</option>
                              <ParentOptions tabs={strayExistingParentOptions} />
                            </select>
                          </label>
                        )}

                        {draft.strayHandlingMode === 'new-parent' && (
                          <label className="stage-manager-field">
                            <span>new parent name</span>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={draft.strayNewParentName}
                              onChange={(event) => onDraftChange({ strayNewParentName: event.target.value })}
                              placeholder="new parent"
                            />
                          </label>
                        )}
                      </>
                    )}
                  </>
                )}

                {draft.migrateTarget === 'parent' && (
                  <>
                    <div className="stage-manager-actions-row">
                      <button
                        type="button"
                        className={`btn btn-sm stage-manager-action-btn ${draft.migrateParentSpaceMode === 'current' ? 'is-selected' : ''}`}
                        onClick={() => onDraftChange({ migrateParentSpaceMode: 'current' })}
                      >
                        current space
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm stage-manager-action-btn ${draft.migrateParentSpaceMode === 'existing' ? 'is-selected' : ''}`}
                        onClick={() => onDraftChange({ migrateParentSpaceMode: 'existing' })}
                      >
                        existing space
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm stage-manager-action-btn ${draft.migrateParentSpaceMode === 'new' ? 'is-selected' : ''}`}
                        onClick={() => onDraftChange({ migrateParentSpaceMode: 'new' })}
                      >
                        new space
                      </button>
                    </div>

                    {draft.migrateParentSpaceMode === 'existing' && (
                      <div className="stage-manager-field-grid">
                        <label className="stage-manager-field">
                          <span>destination domain</span>
                          <DomainSelect
                            domains={domains}
                            value={migrateParentDomainId}
                            onChange={(domainId) =>
                              onDraftChange({
                                migrateParentDomainId: domainId,
                                migrateParentSpaceId: '',
                                migrateParentId: '',
                              })
                            }
                          />
                        </label>
                        <label className="stage-manager-field">
                          <span>destination space</span>
                          <select
                            className="form-select form-select-sm"
                            value={draft.migrateParentSpaceId}
                            onChange={(event) => onDraftChange({ migrateParentSpaceId: event.target.value, migrateParentId: '' })}
                          >
                            <option value="">select a space</option>
                            <SpaceOptions spaces={migrateParentSpaces} />
                          </select>
                        </label>
                      </div>
                    )}

                    {draft.migrateParentSpaceMode === 'new' && (
                      <div className="stage-manager-field-grid">
                        <label className="stage-manager-field">
                          <span>destination domain</span>
                          <DomainSelect
                            domains={domains}
                            value={migrateParentDomainId}
                            onChange={(domainId) => onDraftChange({ migrateParentDomainId: domainId })}
                          />
                        </label>
                        <label className="stage-manager-field">
                          <span>new space name</span>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={draft.newSpaceName}
                            onChange={(event) => onDraftChange({ newSpaceName: event.target.value })}
                            placeholder="new space"
                          />
                        </label>
                      </div>
                    )}

                    {draft.migrateParentSpaceMode !== 'new' && (
                      <div className="stage-manager-actions-row">
                        <button
                          type="button"
                          className={`btn btn-sm stage-manager-action-btn ${draft.migrateParentMode === 'existing' ? 'is-selected' : ''}`}
                          onClick={() => onDraftChange({ migrateParentMode: 'existing' })}
                        >
                          existing parent
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm stage-manager-action-btn ${draft.migrateParentMode === 'new' ? 'is-selected' : ''}`}
                          onClick={() => onDraftChange({ migrateParentMode: 'new' })}
                        >
                          new parent
                        </button>
                      </div>
                    )}

                    <div className="stage-manager-field-grid">
                      {draft.migrateParentSpaceMode !== 'new' && draft.migrateParentMode === 'existing' ? (
                        <label className="stage-manager-field">
                          <span>destination parent</span>
                          <select
                            className="form-select form-select-sm"
                            value={draft.migrateParentId}
                            onChange={(event) => onDraftChange({ migrateParentId: event.target.value })}
                          >
                            <option value="">select a parent tab</option>
                            <ParentOptions tabs={migrateParentOptions} />
                          </select>
                        </label>
                      ) : (
                        <label className="stage-manager-field">
                          <span>new parent name</span>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            value={draft.migrateNewParentName}
                            onChange={(event) => onDraftChange({ migrateNewParentName: event.target.value })}
                            placeholder="new parent"
                          />
                        </label>
                      )}
                    </div>
                  </>
                )}

                {draft.migrateTarget === 'parent' && (
                  <p className="stage-manager-help">
                    migrating a parent tab into another parent will demote that parent into a sub-tab under the destination parent.
                  </p>
                )}
              </>
            )}

            {action === 'mass-delete' && (
              <>
                <p>choose whether the current selection should move into trash or be deleted permanently.</p>
                <div className="stage-manager-actions-row">
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.massDeleteMode === 'trash' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ massDeleteMode: 'trash' })}
                  >
                    move to trash
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm stage-manager-action-btn ${draft.massDeleteMode === 'permanent' ? 'is-selected' : ''}`}
                    onClick={() => onDraftChange({ massDeleteMode: 'permanent' })}
                  >
                    delete for real
                  </button>
                </div>
                <p className="stage-manager-help">the review step is the confirmation point for mass delete.</p>
              </>
            )}

            {action === 'frontmatter' && (
              <>
                <p>choose a template to replace frontmatter with its fields.</p>
                <div className="stage-manager-field-grid">
                  <label className="stage-manager-field">
                    <span>template</span>
                    <select
                      className="form-select form-select-sm"
                      value={draft.frontmatterTemplateId}
                      onChange={(event) => onDraftChange({ frontmatterTemplateId: event.target.value })}
                    >
                      <option value="">select a template</option>
                      {frontmatterTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <FrontmatterTemplateFieldPreviewList template={selectedFrontmatterTemplate} />
              </>
            )}

            {((action === 'migrate' && draft.migrateTarget !== null) || action === 'promote' || action === 'demote') && (
              <div className="stage-manager-field-grid">
                <label className="stage-manager-field">
                  <span>destination order</span>
                  <select
                    className="form-select form-select-sm"
                    value={draft.destinationSortMode}
                    onChange={(event) =>
                      onDraftChange({
                        destinationSortMode: event.target.value as typeof draft.destinationSortMode,
                      })
                    }
                  >
                    {STAGE_MANAGER_DESTINATION_SORT_OPTIONS.map((option) => (
                      <option key={option.mode} value={option.mode}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {action !== 'mass-delete' && action !== 'frontmatter' && !(action === 'migrate' && draft.migrateTarget === null) && (
              <div className="stage-manager-switch-row">
                <label className="settings-hotkey-label" htmlFor="stage-manager-open-destination">
                  open destination after apply
                </label>
                <div className="form-check form-switch settings-switch">
                  <input
                    id="stage-manager-open-destination"
                    className="form-check-input"
                    type="checkbox"
                    role="switch"
                    checked={openDestinationAfterApply}
                    onChange={(event) => onOpenDestinationChange(event.target.checked)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'review' && (
          <div className="stage-manager-panel">
            <h2>review</h2>
            <ul className="stage-manager-review-list">
              {reviewDetails.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
            {action === 'frontmatter' && (
              <FrontmatterTemplateFieldPreviewList template={selectedFrontmatterTemplate} />
            )}
            {reviewWarning ? (
              <div className="stage-manager-warning" role="note">
                {reviewWarning}
              </div>
            ) : (
              <p className="stage-manager-help">review the destination and apply when it looks right.</p>
            )}
          </div>
        )}

        <div className="stage-manager-footer">
          <button
            type="button"
            className="btn btn-sm stage-manager-secondary-btn stage-manager-nav-btn"
            onClick={onPrevious}
            disabled={step === 'select'}
          >
            previous
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary stage-manager-nav-btn"
            onClick={step === 'review' ? onApply : onNext}
          >
            {step === 'review' ? 'apply' : 'next'}
          </button>
        </div>
      </div>
    </section>
  )
}
