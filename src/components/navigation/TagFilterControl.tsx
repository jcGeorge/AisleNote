import { useEffect, useMemo, useRef } from 'react'
import type { TagFilterSortMode, TagFilterTagSummary } from '../../tags/tag-filter'

type TagFilterControlProps = {
  open: boolean
  tags: TagFilterTagSummary[]
  selectedTagKeys: string[]
  sortMode: TagFilterSortMode
  onToggleOpen: () => void
  onClose: () => void
  onSelectAll: () => void
  onDeselectAll: () => void
  onToggleTag: (tagKey: string) => void
  onSortModeChange: (sortMode: TagFilterSortMode) => void
}

export function TagFilterControl({
  open,
  tags,
  selectedTagKeys,
  sortMode,
  onToggleOpen,
  onClose,
  onSelectAll,
  onDeselectAll,
  onToggleTag,
  onSortModeChange,
}: TagFilterControlProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const selectedKeys = useMemo(() => new Set(selectedTagKeys), [selectedTagKeys])

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
    <div className="tag-filter-control" ref={rootRef}>
      <button
        type="button"
        className={`btn btn-sm tab-btn topbar-action-btn topbar-context-btn topbar-tags-btn ${
          open ? 'is-selected' : ''
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggleOpen}
      >
        tags
      </button>
      {open && (
        <div className="tag-filter-dropdown" role="menu" aria-label="Tag filters">
          <div className="tag-filter-menu-actions">
            <button type="button" className="tag-filter-menu-command" onClick={onSelectAll}>
              select all
            </button>
            <button type="button" className="tag-filter-menu-command" onClick={onDeselectAll}>
              deselect all
            </button>
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
          </div>
          <div className="tag-filter-tag-grid">
            {tags.map((tag) => {
              const selected = selectedKeys.has(tag.key)
              return (
                <button
                  key={tag.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={selected}
                  className={`tag-filter-tag-btn tabs-tag-token ${selected ? 'is-selected' : ''}`}
                  title={`${tag.count} ${tag.count === 1 ? 'occurrence' : 'occurrences'}`}
                  onClick={() => onToggleTag(tag.key)}
                >
                  #{tag.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
