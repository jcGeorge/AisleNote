import React, { useEffect, useMemo, useRef } from 'react'
import type { NoteFilterKind, NoteFilterTagSortMode } from '../../types/app'
import type { NoteFilterOption } from '../../filters/note-filter'

void React

type NoteFilterControlProps = {
  open: boolean
  kind: NoteFilterKind
  options: NoteFilterOption[]
  selectedKeys: string[]
  sortMode: NoteFilterTagSortMode
  onToggleOpen: () => void
  onClose: () => void
  onKindChange: (kind: NoteFilterKind) => void
  onClear: () => void
  onToggleOption: (key: string) => void
  onSortModeChange: (sortMode: NoteFilterTagSortMode) => void
}

const FILTER_KIND_LABELS: Record<NoteFilterKind, string> = {
  tags: 'tag filter',
  synced: 'synced filter',
  frontmatter: 'fm filter',
  media: 'media filter',
}

const FILTER_MENU_KIND_LABELS: Record<NoteFilterKind, string> = {
  tags: 'tags',
  synced: 'synced copies',
  frontmatter: 'frontmatter',
  media: 'media',
}

function getOptionLabel(kind: NoteFilterKind, option: NoteFilterOption) {
  if (kind === 'tags') return `#${option.label}`
  return option.label
}

function getOptionTitle(option: NoteFilterOption) {
  return `${option.count} ${option.count === 1 ? 'match' : 'matches'}`
}

function getOptionCountLabel(option: NoteFilterOption) {
  return option.count === 1 ? '1 match' : `${option.count} matches`
}

function renderOptionContent(kind: NoteFilterKind, option: NoteFilterOption) {
  if (kind !== 'media') return getOptionLabel(kind, option)

  const countLabel = getOptionCountLabel(option)
  if (option.mediaKind === 'image') {
    return (
      <>
        <span className="note-filter-media-preview" aria-hidden="true">
          {option.previewUrl ? <img src={option.previewUrl} alt="" loading="lazy" /> : null}
        </span>
        <span className="note-filter-media-copy">
          <span className="note-filter-media-label">{option.label}</span>
          <span className="note-filter-media-count">{countLabel}</span>
        </span>
      </>
    )
  }

  return (
    <>
      <span className="note-filter-media-kind">{option.mediaKind ?? 'media'}</span>
      <span className="note-filter-media-copy">
        <span className="note-filter-media-label">{option.label}</span>
        <span className="note-filter-media-count">{countLabel}</span>
      </span>
    </>
  )
}

export function NoteFilterControl({
  open,
  kind,
  options,
  selectedKeys,
  sortMode,
  onToggleOpen,
  onClose,
  onKindChange,
  onClear,
  onToggleOption,
  onSortModeChange,
}: NoteFilterControlProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys])

  useEffect(() => {
    if (!open) return undefined

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, open])

  return (
    <div className="tag-filter-control note-filter-control" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-sm tab-btn topbar-action-btn topbar-context-btn topbar-tags-btn ${
          open ? 'is-selected' : ''
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggleOpen}
      >
        {FILTER_KIND_LABELS[kind]}
      </button>
      {open && (
        <div className="tag-filter-dropdown note-filter-dropdown" role="menu" aria-label="Filters">
          <div className="tag-filter-menu-actions note-filter-kind-actions">
            {(Object.keys(FILTER_MENU_KIND_LABELS) as NoteFilterKind[]).map((candidate) => (
              <button
                key={candidate}
                type="button"
                className={`tag-filter-menu-command ${kind === candidate ? 'is-selected' : ''}`}
                aria-pressed={kind === candidate}
                onClick={() => onKindChange(candidate)}
              >
                {FILTER_MENU_KIND_LABELS[candidate]}
              </button>
            ))}
          </div>
          <div className="tag-filter-menu-actions">
            <button type="button" className="tag-filter-menu-command" onClick={onClear}>
              clear filter
            </button>
            {kind === 'tags' && (
              <>
                <button
                  type="button"
                  className={`tag-filter-menu-command ${sortMode === 'az' ? 'is-selected' : ''}`}
                  aria-pressed={sortMode === 'az'}
                  onClick={() => onSortModeChange('az')}
                >
                  A-Z
                </button>
                <button
                  type="button"
                  className={`tag-filter-menu-command ${sortMode === 'occurrences' ? 'is-selected' : ''}`}
                  aria-pressed={sortMode === 'occurrences'}
                  onClick={() => onSortModeChange('occurrences')}
                >
                  occurrences
                </button>
              </>
            )}
          </div>
          <div className={[
            'tag-filter-tag-grid note-filter-option-grid',
            kind === 'media' ? 'note-filter-media-grid' : '',
          ].filter(Boolean).join(' ')}
          >
            {options.map((option) => {
              const selected = selectedKeySet.has(option.key)
              return (
                <button
                  key={option.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={selected}
                  className={[
                    'tag-filter-tag-btn note-filter-option-btn',
                    kind === 'tags' ? 'tabs-tag-token' : '',
                    kind === 'media' ? 'note-filter-media-option-btn' : '',
                    option.mediaKind === 'image' ? 'is-media-image' : '',
                    selected ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')}
                  data-app-tooltip={getOptionTitle(option)}
                  onClick={() => onToggleOption(option.key)}
                >
                  {renderOptionContent(kind, option)}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
