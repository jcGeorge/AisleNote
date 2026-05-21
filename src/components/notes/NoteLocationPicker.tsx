import type { Domain, NoteBody, NoteHeadingAnchor } from '../../types/app'

export type NoteLocationPickerValue = {
  domainId: string
  spaceId: string
  tabId: string
  subTabId: string | null
  aisleIds?: string[]
  heading?: NoteHeadingAnchor
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
      <label className="settings-modal-field">
        <span>domain</span>
        <select className="settings-select-input" value={selectedDomain?.id ?? ''} onChange={(event) => commitDomain(event.target.value)}>
          {domains.map((domain) => (
            <option key={domain.id} value={domain.id}>
              {domain.name}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-modal-field">
        <span>space</span>
        <select className="settings-select-input" value={selectedSpace?.id ?? ''} onChange={(event) => commitSpace(event.target.value)}>
          {selectedDomain?.spaces.map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-modal-field">
        <span>parent tab</span>
        <select className="settings-select-input" value={selectedTab?.id ?? ''} onChange={(event) => commitTab(event.target.value)}>
          {selectedSpace?.data.tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.title}
            </option>
          ))}
        </select>
      </label>
      <label className="settings-modal-field">
        <span>note</span>
        <select
          className="settings-select-input"
          value={selectedSubTab?.id ?? '__home__'}
          onChange={(event) => commitSubTab(event.target.value)}
        >
          <option value="__home__">home</option>
          {selectedTab?.subTabs.map((subTab) => (
            <option key={subTab.id} value={subTab.id}>
              {subTab.title}
            </option>
          ))}
        </select>
      </label>
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
