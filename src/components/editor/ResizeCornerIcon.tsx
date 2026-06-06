export function ResizeCornerIcon() {
  return (
    <svg
      className="resize-corner-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect className="resize-corner-icon-background" x="0" y="0" width="24" height="24" rx="3.5" />
      <g transform="translate(0 24) scale(1 -1)">
        <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M14 15H9v-5" />
        <path d="M16 3h5v5" />
        <path d="M21 3 9 15" />
      </g>
    </svg>
  )
}
