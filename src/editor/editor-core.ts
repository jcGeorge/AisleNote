export const EDITOR_CORE_LOCAL_STORAGE_KEY = 'tabs.editorCore'

export const EDITOR_CORE_MODES = ['auto', 'toast', 'codemirror-live', 'codemirror', 'lexical'] as const

export type SelectableEditorCoreMode = typeof EDITOR_CORE_MODES[number]
export type EditorCoreMode = SelectableEditorCoreMode
export type ActiveEditorCore = 'toast' | 'codemirror' | 'lexical'
export type UserFacingEditorRenderer = 'toast' | 'codemirror' | 'lexical'

export const EDITOR_CORE_MODE_LABELS: Record<EditorCoreMode, string> = {
  auto: 'Auto',
  toast: 'Toast UI',
  'codemirror-live': 'CodeMirror Live',
  codemirror: 'CodeMirror source',
  lexical: 'Lexical',
}

const VALID_EDITOR_CORE_MODES = new Set<string>(EDITOR_CORE_MODES)

export function parseEditorCoreMode(value: unknown): EditorCoreMode {
  return typeof value === 'string' && VALID_EDITOR_CORE_MODES.has(value)
    ? value as SelectableEditorCoreMode
    : 'auto'
}

export function readEditorCoreMode(
  storage: Pick<Storage, 'getItem' | 'removeItem'> | null = getLocalStorage(),
): EditorCoreMode {
  if (!storage) return 'auto'
  try {
    const storedMode = storage.getItem(EDITOR_CORE_LOCAL_STORAGE_KEY)
    const parsedMode = parseEditorCoreMode(storedMode)
    if (storedMode !== null && !VALID_EDITOR_CORE_MODES.has(storedMode)) {
      storage.removeItem(EDITOR_CORE_LOCAL_STORAGE_KEY)
    }
    return parsedMode
  } catch {
    return 'auto'
  }
}

export function writeEditorCoreMode(
  mode: EditorCoreMode,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
): boolean {
  if (!storage) return false
  try {
    if (mode === 'auto') {
      storage.removeItem(EDITOR_CORE_LOCAL_STORAGE_KEY)
    } else {
      storage.setItem(EDITOR_CORE_LOCAL_STORAGE_KEY, mode)
    }
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
  if (mode === 'codemirror' || mode === 'codemirror-live' || mode === 'auto') return 'codemirror'
  if (mode === 'lexical') return 'lexical'
  if (mode === 'toast') return 'toast'
  return 'codemirror'
}

export function getRendererForEditorCoreMode(mode: EditorCoreMode): UserFacingEditorRenderer {
  if (mode === 'lexical') return 'lexical'
  return mode === 'toast' ? 'toast' : 'codemirror'
}

export function getEditorCoreModeForRenderer(renderer: UserFacingEditorRenderer): EditorCoreMode {
  if (renderer === 'lexical') return 'lexical'
  return renderer === 'toast' ? 'toast' : 'codemirror-live'
}

function getLocalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}
