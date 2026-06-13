import type { Editor } from '@toast-ui/editor'
import type { ActiveEditorCore } from './editor-core'

export type AisleEditorMeta = {
  editor: Editor
  root: HTMLElement
  noteBodyId: string
  spaceId: string
  tabId: string
  subTabId: string | null
  aisleId: string
  aisleBodyId: string
  editorCore: ActiveEditorCore
  pluginKey: unknown
  cleanup: () => void
}

export function buildAisleEditorKey(noteBodyId: string, aisleId: string): string {
  return `${noteBodyId}::${aisleId}`
}

export function getAisleIdFromAisleEditorKey(editorKey: string): string {
  const separatorIndex = editorKey.indexOf('::')
  return separatorIndex >= 0 ? editorKey.slice(separatorIndex + 2) : editorKey
}
