export type ToolbarFormatKey = 'bold' | 'italic' | 'strike'
export type ToolbarFormatState = Record<ToolbarFormatKey, boolean>

export const DEFAULT_TOOLBAR_FORMAT_STATE: ToolbarFormatState = {
  bold: false,
  italic: false,
  strike: false,
}
