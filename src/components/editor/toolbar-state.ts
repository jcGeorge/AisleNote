export type ToolbarFormatKey = 'bold' | 'italic' | 'strike' | 'highlight'
export type ToolbarFormatState = Record<ToolbarFormatKey, boolean>
export type ToolbarHeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | null

export const DEFAULT_TOOLBAR_FORMAT_STATE: ToolbarFormatState = {
  bold: false,
  italic: false,
  strike: false,
  highlight: false,
}
