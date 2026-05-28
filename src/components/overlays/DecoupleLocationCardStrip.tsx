import { useCallback, useMemo, useState } from 'react'
import {
  buildNoteLocationKey,
  getLocationInfo,
  listNoteLocationsForBody,
  type NoteLocationListEntry,
} from '../../notes/note-locations'
import type { AppState } from '../../types/app'
import { AisleHorizontalScrollbar } from '../notes/AisleHorizontalScrollbar'

const locationCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

type ResolvedDecoupleLocation = NoteLocationListEntry & {
  domainName: string
  spaceName: string
  parentName: string
  noteName: string
  locationKey: string
}

type DecoupleLocationCardStripProps = {
  state: AppState
  noteBodyId: string
  keepLocationKeys: string[]
  onKeepLocationKeysChange: (keepLocationKeys: string[]) => void
}

function compareLocationText(left: string, right: string) {
  return locationCollator.compare(left, right)
}

function compareDecoupleLocations(left: ResolvedDecoupleLocation, right: ResolvedDecoupleLocation) {
  return (
    compareLocationText(left.domainName, right.domainName) ||
    compareLocationText(left.spaceName, right.spaceName) ||
    compareLocationText(left.parentName, right.parentName) ||
    compareLocationText(left.noteName, right.noteName) ||
    compareLocationText(left.locationKey, right.locationKey)
  )
}

function getLocationChipClassName(kind: 'domain' | 'space' | 'parent' | 'subtab') {
  if (kind === 'domain') {
    return 'decouple-location-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'
  }
  if (kind === 'space') {
    return 'decouple-location-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'
  }
  if (kind === 'parent') {
    return 'decouple-location-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'
  }
  return 'decouple-location-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'
}

export function DecoupleLocationCardStrip({
  state,
  noteBodyId,
  keepLocationKeys,
  onKeepLocationKeysChange,
}: DecoupleLocationCardStripProps) {
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null)

  const locations = useMemo<ResolvedDecoupleLocation[]>(
    () =>
      listNoteLocationsForBody(state, noteBodyId)
        .map((location) => {
          const info = getLocationInfo(state, location)
          return {
            ...location,
            domainName: info.domain?.name ?? 'domain',
            spaceName: info.space?.name ?? 'space',
            parentName: info.tab?.title ?? 'parent',
            noteName: info.subTab?.title ?? 'home',
            locationKey: buildNoteLocationKey(location),
          }
        })
        .sort(compareDecoupleLocations),
    [noteBodyId, state],
  )

  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollNode((currentNode) => (currentNode === node ? currentNode : node))
  }, [])

  const toggleLocation = (locationKey: string) => {
    const nextKeepLocationKeys = new Set(keepLocationKeys)
    if (nextKeepLocationKeys.has(locationKey)) {
      nextKeepLocationKeys.delete(locationKey)
    } else {
      nextKeepLocationKeys.add(locationKey)
    }
    onKeepLocationKeysChange(Array.from(nextKeepLocationKeys))
  }

  return (
    <div className="decouple-location-scroll-shell">
      <div ref={setScrollRef} className="decouple-location-list" aria-label="Synced note locations">
        {locations.map((location) => {
          const willDecouple = !keepLocationKeys.includes(location.locationKey)
          return (
            <button
              key={location.locationKey}
              type="button"
              className={`decouple-location-card ${willDecouple ? 'is-decoupled' : ''}`}
              aria-pressed={willDecouple}
              aria-label={`${location.label}. ${willDecouple ? 'Will be de-coupled.' : 'Will stay coupled.'}`}
              onClick={() => toggleLocation(location.locationKey)}
            >
              <span className="decouple-location-chip-stack" aria-hidden="true">
                <span className={getLocationChipClassName('domain')}>{location.domainName}</span>
                <span className={getLocationChipClassName('space')}>{location.spaceName}</span>
                <span className={getLocationChipClassName('parent')}>{location.parentName}</span>
                <span className={getLocationChipClassName('subtab')}>{location.noteName}</span>
              </span>
              {willDecouple && <span className="decouple-location-status">de-coupled</span>}
            </button>
          )
        })}
      </div>
      <AisleHorizontalScrollbar
        scrollNode={scrollNode}
        aisleCount={locations.length}
        rootClassName="decouple-location-horizontal-scrollbar"
        ariaLabel="Scroll de-couple locations horizontally"
      />
    </div>
  )
}
