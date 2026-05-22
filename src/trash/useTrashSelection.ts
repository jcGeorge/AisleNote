import { useEffect, useMemo, type Dispatch, type SetStateAction } from 'react'
import { projectActiveDomainState } from '../state/domains'
import type { AppState } from '../types/app'
import { buildTrashDomainBuckets, resolveTrashContentDisplay, TRASH_HOME_ID } from './trash-model'

type UseTrashSelectionParams = {
  state: AppState
  viewMode: string
  trashDomainId: string
  setTrashDomainId: Dispatch<SetStateAction<string>>
  trashSpaceId: string
  setTrashSpaceId: Dispatch<SetStateAction<string>>
  trashTabId: string
  setTrashTabId: Dispatch<SetStateAction<string>>
  trashSubTabId: string | null
  setTrashSubTabId: Dispatch<SetStateAction<string | null>>
}

const TRASH_HOME_CONTENT = `# Trash

Items moved here are pending deletion.

- Use **Restore All** to move deleted domains, spaces, tabs, and sub-tabs back into notes.
- Use **delete all** to permanently remove all items in Trash.
- This Trash note is read-only.`

export function useTrashSelection({
  state,
  viewMode,
  trashDomainId,
  setTrashDomainId,
  trashSpaceId,
  setTrashSpaceId,
  trashTabId,
  setTrashTabId,
  trashSubTabId,
  setTrashSubTabId,
}: UseTrashSelectionParams) {
  const trashDomains = useMemo(() => buildTrashDomainBuckets(projectActiveDomainState(state)), [state])

  const selectedTrashDomain = useMemo(
    () =>
      trashDomains.find((domain) => domain.id === trashDomainId) ??
      trashDomains.find((domain) => domain.source === 'live' && domain.domainId === state.activeDomainId) ??
      trashDomains[0] ??
      null,
    [state.activeDomainId, trashDomainId, trashDomains],
  )

  const trashSpaces = useMemo(() => selectedTrashDomain?.spaces ?? [], [selectedTrashDomain])

  const selectedTrashSpace = useMemo(
    () =>
      trashSpaces.find((space) => space.id === trashSpaceId) ??
      trashSpaces.find((space) => space.source === 'live' && space.spaceId === state.activeSpaceId) ??
      trashSpaces[0] ??
      null,
    [state.activeSpaceId, trashSpaceId, trashSpaces],
  )

  const trashParentTabs = useMemo(() => selectedTrashSpace?.parentTabs ?? [], [selectedTrashSpace])

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
    selectedTrashDomain,
    selectedTrashSpace,
    selectedTrashTab,
    selectedTrashSubTab,
  })

  useEffect(() => {
    if (viewMode !== 'trash') return

    if (!selectedTrashDomain) return

    if (trashDomainId !== selectedTrashDomain.id) {
      setTrashDomainId(selectedTrashDomain.id)
      return
    }

    if (selectedTrashSpace && trashSpaceId !== selectedTrashSpace.id) {
      setTrashSpaceId(selectedTrashSpace.id)
      return
    }

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
  }, [
    viewMode,
    trashDomainId,
    trashSpaceId,
    trashTabId,
    trashSubTabId,
    selectedTrashDomain,
    selectedTrashSpace,
    selectedTrashTab,
    selectedTrashSubTab,
    setTrashDomainId,
    setTrashSpaceId,
    setTrashTabId,
    setTrashSubTabId,
  ])

  return {
    trashDomains,
    selectedTrashDomain,
    trashSpaces,
    selectedTrashSpace,
    trashParentTabs,
    selectedTrashTab,
    trashSubTabs,
    selectedTrashSubTab,
    trashDisplay,
  }
}
