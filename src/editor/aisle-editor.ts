import type { Editor } from '@toast-ui/editor'

export type AisleEditorMeta = {
  editor: Editor
  root: HTMLElement
  aisleId: string
  pluginKey: unknown
  cleanup: () => void
}

export function buildAisleEditorKey(noteBodyId: string, aisleId: string): string {
  return `${noteBodyId}::${aisleId}`
}
