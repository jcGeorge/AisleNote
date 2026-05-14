import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import type { WorkspaceData } from '../types/app'
import { buildTrashParentBuckets, resolveTrashContentDisplay, TRASH_HOME_ID } from './trash-model'

type UseTrashSelectionParams = {
  workspace: WorkspaceData
  viewMode: string
  trashTabId: string
  setTrashTabId: Dispatch<SetStateAction<string>>
  trashSubTabId: string | null
  setTrashSubTabId: Dispatch<SetStateAction<string | null>>
}

const TRASH_HOME_CONTENT = `# Trash

Items moved here are pending deletion.

- Use **Restore All** to move everything back into notes.
- Use **delete all** to permanently remove all items in Trash.
- This Trash note is read-only.`

export function useTrashSelection({
  workspace,
  viewMode,
  trashTabId,
  setTrashTabId,
  trashSubTabId,
  setTrashSubTabId,
}: UseTrashSelectionParams) {
  const trashParentTabs = useMemo(
    () => buildTrashParentBuckets(workspace),
    [workspace],
  )

  const selectedTrashTab = useMemo(
    () => (trashTabId === TRASH_HOME_ID ? null : trashParentTabs.find((entry) => entry.id === trashTabId) ?? null),
    [trashTabId, trashParentTabs],
  )

  const trashSubTabs = useMemo(() => (selectedTrashTab ? selectedTrashTab.subTabs : []), [selectedTrashTab])

  const selectedTrashSubTab = useMemo(
    () => (trashSubTabId ? trashSubTabs.find((sub) => sub.id === trashSubTabId) ?? null : null),
    [trashSubTabId, trashSubTabs],
  )

  const trashDisplay = resolveTrashContentDisplay({
    trashTabId,
    trashHomeContent: TRASH_HOME_CONTENT,
    selectedTrashTab,
    selectedTrashSubTab,
  })

  useEffect(() => {
    if (viewMode !== 'trash') return

    if (trashTabId === TRASH_HOME_ID) {
      if (trashSubTabId !== null) setTrashSubTabId(null)
      return
    }

    if (!selectedTrashTab) {
      setTrashTabId(TRASH_HOME_ID)
      setTrashSubTabId(null)
      return
    }

    if (trashSubTabId && !selectedTrashSubTab) {
      setTrashSubTabId(null)
    }
  }, [viewMode, trashTabId, trashSubTabId, selectedTrashTab, selectedTrashSubTab, setTrashTabId, setTrashSubTabId])

  return {
    trashParentTabs,
    selectedTrashTab,
    trashSubTabs,
    selectedTrashSubTab,
    trashDisplay,
  }
}
