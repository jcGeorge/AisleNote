import type { TagAutocompleteSuggestion } from '../../tags/tag-autocomplete'

type TagAutocompleteMenuProps = {
  top: number
  left: number
  suggestions: TagAutocompleteSuggestion[]
  activeIndex: number
  onHighlight: (index: number) => void
  onChoose: (index: number) => void
}

export function TagAutocompleteMenu({
  top,
  left,
  suggestions,
  activeIndex,
  onHighlight,
  onChoose,
}: TagAutocompleteMenuProps) {
  return (
    <div
      className="tag-autocomplete-menu"
      style={{ top: `${top}px`, left: `${left}px` }}
      role="listbox"
      aria-label="Tag suggestions"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={suggestion.key}
          type="button"
          className={`tag-autocomplete-item${index === activeIndex ? ' is-active' : ''}`}
          role="option"
          aria-selected={index === activeIndex}
          onMouseEnter={() => onHighlight(index)}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onChoose(index)
          }}
        >
          <span className="tag-autocomplete-token tabs-tag-token">#{suggestion.label}</span>
        </button>
      ))}
    </div>
  )
}
