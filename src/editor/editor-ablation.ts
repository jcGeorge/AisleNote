export const EDITOR_ABLATION_LOCAL_STORAGE_KEY = 'aislenote.editorAblationMode'

export const EDITOR_ABLATION_MODES = [
  'off',
  'toast-only',
  'toast-blank-restore',
  'toast-core-plugins',
  'toast-special-plugins',
  'toast-full-no-restore',
  'toast-retain-current-previous',
] as const

export type EditorAblationMode = typeof EDITOR_ABLATION_MODES[number]

export const EDITOR_ABLATION_MODE_LABELS: Record<EditorAblationMode, string> = {
  off: 'off',
  'toast-only': 'Toast only',
  'toast-blank-restore': 'Toast plus blank restore',
  'toast-core-plugins': 'Toast plus core plugins',
  'toast-special-plugins': 'Toast without special links',
  'toast-full-no-restore': 'Full editor without blank restore',
  'toast-retain-current-previous': 'Full editor retain previous aisle',
}

export type EditorAblationPolicy = {
  mode: EditorAblationMode
  useDisplayPreparation: boolean
  runMountBlankRestore: boolean
  includeToolbarItems: boolean
  includeCorePlugins: boolean
  includeSpecialLinkPlugins: boolean
  includeStructuralPlugins: boolean
  includeImageHook: boolean
  includeDomInstallers: boolean
  retainPreviousAisle: boolean
}

const VALID_EDITOR_ABLATION_MODES = new Set<string>(EDITOR_ABLATION_MODES)

export function isEditorAblationEnabled(): boolean {
  return import.meta.env?.VITE_ENABLE_EDITOR_ABLATION === 'true'
}

export function parseEditorAblationMode(value: unknown): EditorAblationMode {
  return typeof value === 'string' && VALID_EDITOR_ABLATION_MODES.has(value)
    ? value as EditorAblationMode
    : 'off'
}

export function readEditorAblationMode({
  enabled = isEditorAblationEnabled(),
  storage = getLocalStorage(),
}: {
  enabled?: boolean
  storage?: Pick<Storage, 'getItem' | 'removeItem'> | null
} = {}): EditorAblationMode {
  if (!storage) return 'off'
  if (!enabled) {
    try {
      storage.removeItem(EDITOR_ABLATION_LOCAL_STORAGE_KEY)
    } catch {
      // Ignore storage failures; disabled ablation must still resolve to off.
    }
    return 'off'
  }
  try {
    return parseEditorAblationMode(storage.getItem(EDITOR_ABLATION_LOCAL_STORAGE_KEY))
  } catch {
    return 'off'
  }
}

export function writeEditorAblationMode(
  mode: EditorAblationMode,
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null = getLocalStorage(),
  { enabled = isEditorAblationEnabled() }: { enabled?: boolean } = {},
): boolean {
  if (!storage) return false
  try {
    if (!enabled || mode === 'off') {
      storage.removeItem(EDITOR_ABLATION_LOCAL_STORAGE_KEY)
    } else {
      storage.setItem(EDITOR_ABLATION_LOCAL_STORAGE_KEY, mode)
    }
    return true
  } catch {
    return false
  }
}

export function createEditorAblationPolicy(mode: EditorAblationMode): EditorAblationPolicy {
  const activeMode = isEditorAblationEnabled() ? mode : 'off'
  switch (activeMode) {
    case 'toast-only':
      return createPolicy(activeMode, {
        useDisplayPreparation: false,
        runMountBlankRestore: false,
        includeToolbarItems: false,
        includeCorePlugins: false,
        includeSpecialLinkPlugins: false,
        includeStructuralPlugins: false,
        includeImageHook: false,
        includeDomInstallers: false,
      })
    case 'toast-blank-restore':
      return createPolicy(activeMode, {
        includeToolbarItems: false,
        includeCorePlugins: false,
        includeSpecialLinkPlugins: false,
        includeStructuralPlugins: false,
        includeImageHook: false,
        includeDomInstallers: false,
      })
    case 'toast-core-plugins':
      return createPolicy(activeMode, {
        includeToolbarItems: false,
        includeSpecialLinkPlugins: false,
        includeStructuralPlugins: false,
        includeImageHook: false,
        includeDomInstallers: false,
      })
    case 'toast-special-plugins':
      return createPolicy(activeMode, {
        includeSpecialLinkPlugins: false,
      })
    case 'toast-full-no-restore':
      return createPolicy(activeMode, {
        runMountBlankRestore: false,
      })
    case 'toast-retain-current-previous':
      return createPolicy(activeMode, {
        runMountBlankRestore: false,
        retainPreviousAisle: true,
      })
    case 'off':
      return createPolicy(activeMode, {
        runMountBlankRestore: false,
      })
  }
}

export function isEditorAblationActive(mode: EditorAblationMode): boolean {
  return isEditorAblationEnabled() && mode !== 'off'
}

export function measureEditorAblationOperation<T>(operation: () => T): { result: T; durationMs: number } {
  const startedAt = nowMs()
  return {
    result: operation(),
    durationMs: nowMs() - startedAt,
  }
}

function createPolicy(
  mode: EditorAblationMode,
  overrides: Partial<Omit<EditorAblationPolicy, 'mode'>> = {},
): EditorAblationPolicy {
  return {
    mode,
    useDisplayPreparation: true,
    runMountBlankRestore: true,
    includeToolbarItems: true,
    includeCorePlugins: true,
    includeSpecialLinkPlugins: true,
    includeStructuralPlugins: true,
    includeImageHook: true,
    includeDomInstallers: true,
    retainPreviousAisle: false,
    ...overrides,
  }
}

function getLocalStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}
