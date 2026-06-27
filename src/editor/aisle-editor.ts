import type { Editor } from '@toast-ui/editor'

export type AisleEditorMeta = {
  editor: Editor
  root: HTMLElement
  noteBodyId: string
  noteId: string
  aisleId: string
  aisleBodyId: string
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
