export const EDITOR_CORE_LOCAL_STORAGE_KEY = 'tabs.editorCore'

export const EDITOR_CORE_MODES = ['auto', 'toast', 'codemirror-live', 'codemirror', 'lexical'] as const
export const USER_SELECTABLE_EDITOR_CORE_MODES = ['toast', 'lexical'] as const
export const USER_FACING_EDITOR_RENDERERS = ['toast', 'lexical'] as const

export type SelectableEditorCoreMode = typeof EDITOR_CORE_MODES[number]
export type EditorCoreMode = SelectableEditorCoreMode
export type ActiveEditorCore = 'toast' | 'codemirror' | 'lexical'
export type UserFacingEditorRenderer = typeof USER_FACING_EDITOR_RENDERERS[number]

export const EDITOR_CORE_MODE_LABELS: Record<EditorCoreMode, string> = {
  auto: 'Auto',
  toast: 'Toast UI',
  'codemirror-live': 'CodeMirror Live',
  codemirror: 'CodeMirror source',
  lexical: 'Lexical',
}

const VALID_EDITOR_CORE_MODES = new Set<string>(EDITOR_CORE_MODES)
const LEGACY_CODEMIRROR_MODES = new Set<EditorCoreMode>(['auto', 'codemirror-live', 'codemirror'])

export function parseEditorCoreMode(value: unknown): EditorCoreMode {
  return typeof value === 'string' && VALID_EDITOR_CORE_MODES.has(value)
    ? value as SelectableEditorCoreMode
    : 'auto'
}

export function sanitizeEditorCoreModeForUse(mode: EditorCoreMode): EditorCoreMode {
  return LEGACY_CODEMIRROR_MODES.has(mode) ? 'lexical' : mode
}

export function readEditorCoreMode(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null = getLocalStorage(),
): EditorCoreMode {
  if (!storage) return 'lexical'
  try {
    const storedMode = storage.getItem(EDITOR_CORE_LOCAL_STORAGE_KEY)
    const parsedMode = parseEditorCoreMode(storedMode)
    if (storedMode !== null && !VALID_EDITOR_CORE_MODES.has(storedMode)) {
      storage.removeItem(EDITOR_CORE_LOCAL_STORAGE_KEY)
      storage.setItem(EDITOR_CORE_LOCAL_STORAGE_KEY, 'lexical')
      return 'lexical'
    }
    const sanitizedMode = sanitizeEditorCoreModeForUse(parsedMode)
    if (storedMode !== sanitizedMode) {
      storage.setItem(EDITOR_CORE_LOCAL_STORAGE_KEY, sanitizedMode)
    }
    return sanitizedMode
  } catch {
    return 'lexical'
  }
}

export function writeEditorCoreMode(
  mode: EditorCoreMode,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): boolean {
  if (!storage) return false
  try {
    storage.setItem(EDITOR_CORE_LOCAL_STORAGE_KEY, sanitizeEditorCoreModeForUse(mode))
    return true
  } catch {
    return false
  }
}

export function isMarkdownLikelyToastHeavy(markdown: string): boolean {
  const value = String(markdown ?? '')
  if (!value.includes('|') || !/\[[^\]]+\]\(https?:\/\//i.test(value)) return false
  const linkCount = value.match(/\[[^\]]+\]\(https?:\/\//gi)?.length ?? 0
  const tableLineCount = value
    .split('\n')
    .filter((line) => line.trim().startsWith('|') && line.trim().endsWith('|'))
    .length
  return linkCount >= 8 && tableLineCount >= 4
}

export function resolveActiveEditorCore(mode: EditorCoreMode, markdown: string): ActiveEditorCore {
  void markdown
  if (mode === 'codemirror' || mode === 'codemirror-live' || mode === 'auto') return 'lexical'
  if (mode === 'lexical') return 'lexical'
  if (mode === 'toast') return 'toast'
  return 'lexical'
}

export function getRendererForEditorCoreMode(mode: EditorCoreMode): UserFacingEditorRenderer {
  if (mode === 'lexical') return 'lexical'
  return mode === 'toast' ? 'toast' : 'lexical'
}

export function getEditorCoreModeForRenderer(renderer: UserFacingEditorRenderer): EditorCoreMode {
  if (renderer === 'lexical') return 'lexical'
  return 'toast'
}

function getLocalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
