let editorContentStateMutationVersion = 0

export function markEditorContentStateMutation(): number {
  editorContentStateMutationVersion += 1
  return editorContentStateMutationVersion
}

export function getEditorContentStateMutationVersion(): number {
  return editorContentStateMutationVersion
}
