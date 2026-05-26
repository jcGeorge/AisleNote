import type { Domain, NoteBody, NoteHeadingAnchor, NotePreviewStart } from '../../types/app'

export type NoteLocationPickerValue = {
  domainId: string
  spaceId: string
  tabId: string
  subTabId: string | null
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
  previewStart?: NotePreviewStart
}

type NoteLocationPickerProps = {
  domains: Domain[]
  noteBodies: NoteBody[]
  value: NoteLocationPickerValue
  onChange: (value: NoteLocationPickerValue) => void
  includeAisles?: boolean
  allowAllAisles?: boolean
  aisleSelectionMode?: 'multiple' | 'single'
}

const HOME_NOTE_ID = '__home__'
type NoteLocationPickerRowKind = 'domain' | 'space' | 'parent' | 'subtab'

function getLocationPickerChipClassName(kind: NoteLocationPickerRowKind, selected: boolean): string {
  const selectedClass = selected ? ' is-selected' : ''
  if (kind === 'domain') {
    return `note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain${selectedClass}`
  }
  if (kind === 'space') {
    return `note-location-picker-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space${selectedClass}`
  }
  if (kind === 'parent') {
    return `note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent${selectedClass}`
  }
  return `note-location-picker-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab${selectedClass}`
}

export function NoteLocationPicker({
  domains,
  noteBodies,
  value,
  onChange,
  includeAisles = false,
  allowAllAisles = false,
  aisleSelectionMode = 'multiple',
}: NoteLocationPickerProps) {
  const selectedDomain = domains.find((domain) => domain.id === value.domainId) ?? domains[0] ?? null
  const selectedSpace = selectedDomain?.spaces.find((space) => space.id === value.spaceId) ?? selectedDomain?.spaces[0] ?? null
  const selectedTab = selectedSpace?.data.tabs.find((tab) => tab.id === value.tabId) ?? selectedSpace?.data.tabs[0] ?? null
  const selectedSubTab =
    value.subTabId && selectedTab ? selectedTab.subTabs.find((subTab) => subTab.id === value.subTabId) ?? null : null
  const selectedNoteBodyId = selectedSubTab?.noteBodyId ?? selectedTab?.noteBodyId ?? ''
  const selectedBody = noteBodies.find((body) => body.id === selectedNoteBodyId) ?? null
  const selectedAisleIds = value.aisleIds ?? []
  const selectedSingleAisleId = selectedAisleIds[0] ?? selectedBody?.aisles[0]?.id ?? ''
  const allAislesSelected = selectedAisleIds.length === 0

  const commitDomain = (domainId: string) => {
    const domain = domains.find((candidate) => candidate.id === domainId) ?? domains[0]
    const space = domain?.spaces[0]
    const tab = space?.data.tabs[0]
    onChange({
      domainId: domain?.id ?? '',
      spaceId: space?.id ?? '',
      tabId: tab?.id ?? '',
      subTabId: null,
    })
  }

  const commitSpace = (spaceId: string) => {
    const space = selectedDomain?.spaces.find((candidate) => candidate.id === spaceId) ?? selectedDomain?.spaces[0]
    const tab = space?.data.tabs[0]
    onChange({
      domainId: selectedDomain?.id ?? '',
      spaceId: space?.id ?? '',
      tabId: tab?.id ?? '',
      subTabId: null,
    })
  }

  const commitTab = (tabId: string) => {
    onChange({
      ...value,
      domainId: selectedDomain?.id ?? '',
      spaceId: selectedSpace?.id ?? '',
      tabId,
      subTabId: null,
      aisleIds: [],
      heading: undefined,
    })
  }

  const commitSubTab = (rawValue: string) => {
    onChange({
      ...value,
      domainId: selectedDomain?.id ?? '',
      spaceId: selectedSpace?.id ?? '',
      tabId: selectedTab?.id ?? '',
      subTabId: rawValue === '__home__' ? null : rawValue,
      aisleIds: [],
      heading: undefined,
    })
  }

  const renderPickerRow = (
    label: string,
    kind: NoteLocationPickerRowKind,
    selectedId: string,
    items: Array<{ id: string; label: string; onSelect: () => void }>,
  ) => (
    <section className="note-location-picker-row" aria-label={label}>
      <div className="note-location-picker-row-items">
        {items.length > 0 ? (
          items.map((item) => {
            const selected = item.id === selectedId
            return (
              <button
                key={item.id}
                type="button"
                className={getLocationPickerChipClassName(kind, selected)}
                aria-current={selected ? 'true' : undefined}
                aria-pressed={selected}
                onClick={item.onSelect}
              >
                {item.label}
              </button>
            )
          })
        ) : (
          <span className="note-location-picker-empty">none</span>
        )}
      </div>
    </section>
  )

  const toggleAisle = (aisleId: string) => {
    if (aisleSelectionMode === 'single') {
      onChange({
        ...value,
        aisleIds: [aisleId],
        heading: value.heading?.aisleId === aisleId ? value.heading : undefined,
      })
      return
    }
    const current = new Set(selectedAisleIds)
    if (current.has(aisleId)) {
      current.delete(aisleId)
    } else {
      current.add(aisleId)
    }
    onChange({
      ...value,
      aisleIds: Array.from(current),
    })
  }

  return (
    <div className="note-location-picker">
      {renderPickerRow(
        'domain',
        'domain',
        selectedDomain?.id ?? '',
        domains.map((domain) => ({
          id: domain.id,
          label: domain.name,
          onSelect: () => commitDomain(domain.id),
        })),
      )}
      {renderPickerRow(
        'space',
        'space',
        selectedSpace?.id ?? '',
        selectedDomain?.spaces.map((space) => ({
          id: space.id,
          label: space.name,
          onSelect: () => commitSpace(space.id),
        })) ?? [],
      )}
      {renderPickerRow(
        'parent tab',
        'parent',
        selectedTab?.id ?? '',
        selectedSpace?.data.tabs.map((tab) => ({
          id: tab.id,
          label: tab.title,
          onSelect: () => commitTab(tab.id),
        })) ?? [],
      )}
      {renderPickerRow(
        'note',
        'subtab',
        selectedSubTab?.id ?? HOME_NOTE_ID,
        [
          {
            id: HOME_NOTE_ID,
            label: 'home',
            onSelect: () => commitSubTab(HOME_NOTE_ID),
          },
          ...(selectedTab?.subTabs.map((subTab) => ({
            id: subTab.id,
            label: subTab.title,
            onSelect: () => commitSubTab(subTab.id),
          })) ?? []),
        ],
      )}
      {includeAisles && selectedBody && selectedBody.aisles.length > 1 && (
        <div className="note-picker-aisles">
          {allowAllAisles && (
            <button
              type="button"
              className={`note-picker-aisle-choice ${allAislesSelected ? 'is-active' : ''}`}
              onClick={() => onChange({ ...value, aisleIds: [], heading: undefined })}
            >
              all aisles
            </button>
          )}
          {selectedBody.aisles.map((aisle, index) => (
            <button
              key={aisle.id}
              type="button"
              className={`note-picker-aisle-choice ${
                aisleSelectionMode === 'single'
                  ? selectedSingleAisleId === aisle.id
                    ? 'is-active'
                    : ''
                  : selectedAisleIds.includes(aisle.id)
                    ? 'is-active'
                    : ''
              }`}
              onClick={() => toggleAisle(aisle.id)}
            >
              aisle {index + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
