export const NOTE_PREVIEW_EDITOR_HOST_CLASS = 'context-preview-editor-host'

export function isInsideReadonlyNotePreview(target: EventTarget | null): boolean {
  const element = target instanceof Element
    ? target
    : target instanceof Text
      ? target.parentElement
      : null
  return Boolean(element?.closest(`.${NOTE_PREVIEW_EDITOR_HOST_CLASS}`))
}
