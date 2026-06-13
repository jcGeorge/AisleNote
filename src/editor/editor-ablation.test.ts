import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EDITOR_ABLATION_LOCAL_STORAGE_KEY,
  EDITOR_ABLATION_MODES,
  createEditorAblationPolicy,
  isEditorAblationActive,
  isEditorAblationEnabled,
  parseEditorAblationMode,
  readEditorAblationMode,
  writeEditorAblationMode,
} from './editor-ablation'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('editor ablation mode helpers', () => {
  it('parses only supported ablation modes', () => {
    for (const mode of EDITOR_ABLATION_MODES) {
      expect(parseEditorAblationMode(mode)).toBe(mode)
    }

    expect(parseEditorAblationMode(null)).toBe('off')
    expect(parseEditorAblationMode('unknown')).toBe('off')
  })

  it('defaults to off when storage is missing, disabled, or invalid', () => {
    const disabledStorage = createStorage('toast-only')
    expect(readEditorAblationMode({ enabled: false, storage: disabledStorage })).toBe('off')
    expect(disabledStorage.removals).toEqual([EDITOR_ABLATION_LOCAL_STORAGE_KEY])
    expect(readEditorAblationMode({ enabled: true, storage: null })).toBe('off')
    expect(readEditorAblationMode({ enabled: true, storage: createStorage('invalid-mode') })).toBe('off')
  })

  it('is disabled unless the editor ablation env flag is explicit', () => {
    expect(isEditorAblationEnabled()).toBe(false)
    expect(isEditorAblationActive('toast-only')).toBe(false)

    vi.stubEnv('VITE_ENABLE_EDITOR_ABLATION', 'true')

    expect(isEditorAblationEnabled()).toBe(true)
    expect(isEditorAblationActive('toast-only')).toBe(true)
  })

  it('reads supported mode from the expected localStorage key', () => {
    const storage = {
      getItem: (key: string) => key === EDITOR_ABLATION_LOCAL_STORAGE_KEY ? 'toast-core-plugins' : null,
      removeItem: vi.fn(),
    }

    expect(readEditorAblationMode({ enabled: true, storage })).toBe('toast-core-plugins')
  })

  it('keeps off mode on the production policy with mount restore removed from the hot path', () => {
    expect(createEditorAblationPolicy('off')).toMatchObject({
      useDisplayPreparation: true,
      runMountBlankRestore: false,
      includeToolbarItems: true,
      includeCorePlugins: true,
      includeSpecialLinkPlugins: true,
      includeStructuralPlugins: true,
      includeImageHook: true,
      includeDomInstallers: true,
      retainPreviousAisle: false,
    })
  })

  it('builds the expected stripped Toast-only policy', () => {
    vi.stubEnv('VITE_ENABLE_EDITOR_ABLATION', 'true')

    expect(createEditorAblationPolicy('toast-only')).toMatchObject({
      useDisplayPreparation: false,
      runMountBlankRestore: false,
      includeToolbarItems: false,
      includeCorePlugins: false,
      includeSpecialLinkPlugins: false,
      includeStructuralPlugins: false,
      includeImageHook: false,
      includeDomInstallers: false,
    })
  })

  it('can isolate blank restore, special links, and previous-aisle retention', () => {
    vi.stubEnv('VITE_ENABLE_EDITOR_ABLATION', 'true')

    expect(createEditorAblationPolicy('toast-blank-restore')).toMatchObject({
      runMountBlankRestore: true,
      includeCorePlugins: false,
    })
    expect(createEditorAblationPolicy('toast-special-plugins')).toMatchObject({
      includeCorePlugins: true,
      includeSpecialLinkPlugins: false,
      includeDomInstallers: true,
    })
    expect(createEditorAblationPolicy('toast-retain-current-previous')).toMatchObject({
      runMountBlankRestore: false,
      retainPreviousAisle: true,
      includeSpecialLinkPlugins: true,
    })
  })

  it('writes non-off modes and removes off mode from local storage', () => {
    vi.stubEnv('VITE_ENABLE_EDITOR_ABLATION', 'true')
    const writes: Array<[string, string]> = []
    const removals: string[] = []
    const storage = {
      setItem: (key: string, value: string) => writes.push([key, value]),
      removeItem: (key: string) => removals.push(key),
    }

    expect(writeEditorAblationMode('toast-only', storage)).toBe(true)
    expect(writeEditorAblationMode('off', storage)).toBe(true)
    expect(writes).toEqual([[EDITOR_ABLATION_LOCAL_STORAGE_KEY, 'toast-only']])
    expect(removals).toEqual([EDITOR_ABLATION_LOCAL_STORAGE_KEY])
  })
})

function createStorage(value: string | null): Pick<Storage, 'getItem' | 'removeItem'> & { removals: string[] } {
  const removals: string[] = []
  return {
    getItem: () => value,
    removeItem: (key: string) => removals.push(key),
    removals,
  }
}
