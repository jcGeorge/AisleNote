import { useCallback, useMemo, useState } from 'react'
import {
  buildNoteLocationKey,
  getLocationInfo,
  listNoteLocationsForBody,
  type NoteLocationListEntry,
} from '../../notes/note-locations'
import { listLinkedAisleSlotsForAisleBody, type LinkedAisleSlot } from '../../notes/aisle-links'
import type { AppState } from '../../types/app'
import { AisleHorizontalScrollbar } from '../notes/AisleHorizontalScrollbar'

const locationCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true })

type ResolvedDecoupleLocation = NoteLocationListEntry & {
  domainName: string
  spaceName: string
  parentName: string
  noteName: string
  key: string
  aisleLabel?: string | null
}

type DecoupleLocationCardStripProps =
  | {
      mode?: 'note'
      state: AppState
      noteBodyId: string
      keepLocationKeys: string[]
      onKeepLocationKeysChange: (keepLocationKeys: string[]) => void
    }
  | {
      mode: 'aisle'
      state: AppState
      aisleBodyId: string
      keepAisleSlotKeys: string[]
      onKeepAisleSlotKeysChange: (keepAisleSlotKeys: string[]) => void
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
    compareLocationText(left.aisleLabel ?? '', right.aisleLabel ?? '') ||
    compareLocationText(left.key, right.key)
  )
}

function getLocationChipClassName(kind: 'domain' | 'space' | 'parent' | 'subtab' | 'aisle') {
  if (kind === 'domain') {
    return 'decouple-location-chip rail-control context-preview-title-btn compact-scope-btn compact-domain-btn is-domain'
  }
  if (kind === 'space') {
    return 'decouple-location-chip rail-control context-preview-title-btn compact-scope-btn compact-space-btn is-space'
  }
  if (kind === 'parent') {
    return 'decouple-location-chip rail-control context-preview-title-btn btn btn-sm tab-btn parent-tab-btn is-parent'
  }
  if (kind === 'aisle') {
    return 'decouple-location-chip decouple-aisle-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'
  }
  return 'decouple-location-chip rail-control context-preview-title-btn btn btn-sm tab-btn subtab-btn is-subtab'
}

function resolveNoteLocations(state: AppState, noteBodyId: string): ResolvedDecoupleLocation[] {
  return listNoteLocationsForBody(state, noteBodyId)
    .map((location) => {
      const info = getLocationInfo(state, location)
      return {
        ...location,
        domainName: info.domain?.name ?? 'domain',
        spaceName: info.space?.name ?? 'space',
        parentName: info.tab?.title ?? 'parent',
        noteName: info.subTab?.title ?? 'home',
        key: buildNoteLocationKey(location),
      }
    })
    .sort(compareDecoupleLocations)
}

function resolveAisleLocations(state: AppState, aisleBodyId: string): ResolvedDecoupleLocation[] {
  return listLinkedAisleSlotsForAisleBody(state, aisleBodyId)
    .map((slot: LinkedAisleSlot) => ({
      domainId: '',
      spaceId: '',
      tabId: '',
      subTabId: null,
      title: slot.noteName,
      label: slot.label,
      domainName: slot.domainName,
      spaceName: slot.spaceName,
      parentName: slot.parentName,
      noteName: slot.noteName,
      key: slot.key,
      aisleLabel: slot.aisleLabel,
    }))
    .sort(compareDecoupleLocations)
}

export function DecoupleLocationCardStrip(props: DecoupleLocationCardStripProps) {
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null)
  const mode = props.mode ?? 'note'

  const locations = useMemo<ResolvedDecoupleLocation[]>(
    () =>
      props.mode === 'aisle'
        ? resolveAisleLocations(props.state, props.aisleBodyId)
        : resolveNoteLocations(props.state, props.noteBodyId),
    [props],
  )

  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    setScrollNode((currentNode) => (currentNode === node ? currentNode : node))
  }, [])

  const toggleLocation = (locationKey: string) => {
    if (props.mode === 'aisle') {
      const nextKeepAisleSlotKeys = new Set(props.keepAisleSlotKeys)
      if (nextKeepAisleSlotKeys.has(locationKey)) {
        nextKeepAisleSlotKeys.delete(locationKey)
      } else {
        nextKeepAisleSlotKeys.add(locationKey)
      }
      props.onKeepAisleSlotKeysChange(Array.from(nextKeepAisleSlotKeys))
      return
    }

    const nextKeepLocationKeys = new Set(props.keepLocationKeys)
    if (nextKeepLocationKeys.has(locationKey)) {
      nextKeepLocationKeys.delete(locationKey)
    } else {
      nextKeepLocationKeys.add(locationKey)
    }
    props.onKeepLocationKeysChange(Array.from(nextKeepLocationKeys))
  }

  return (
    <div className="decouple-location-scroll-shell">
      <div
        ref={setScrollRef}
        className="decouple-location-list"
        aria-label={mode === 'aisle' ? 'Synced aisle locations' : 'Synced note locations'}
      >
        {locations.map((location) => {
          const willDecouple =
            props.mode === 'aisle'
              ? !props.keepAisleSlotKeys.includes(location.key)
              : !props.keepLocationKeys.includes(location.key)
          return (
            <button
              key={location.key}
              type="button"
              className={`decouple-location-card ${willDecouple ? 'is-decoupled' : ''}`}
              aria-pressed={willDecouple}
              aria-label={`${location.label}. ${willDecouple ? 'Will be de-coupled.' : 'Will stay coupled.'}`}
              onClick={() => toggleLocation(location.key)}
            >
              <span className="decouple-location-chip-stack" aria-hidden="true">
                <span className={getLocationChipClassName('domain')}>{location.domainName}</span>
                <span className={getLocationChipClassName('space')}>{location.spaceName}</span>
                <span className={getLocationChipClassName('parent')}>{location.parentName}</span>
                <span className={getLocationChipClassName('subtab')}>{location.noteName}</span>
                {location.aisleLabel && (
                  <span className={getLocationChipClassName('aisle')}>{location.aisleLabel}</span>
                )}
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
