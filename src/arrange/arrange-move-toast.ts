export type ArrangeCrossDomainMoveKind = 'space' | 'parent' | 'subtab'

const FALLBACK_ITEM_LABELS: Record<ArrangeCrossDomainMoveKind, string> = {
  space: 'space',
  parent: 'parent tab',
  subtab: 'subtab',
}

const PLURAL_ITEM_LABELS: Record<ArrangeCrossDomainMoveKind, string> = {
  space: 'spaces',
  parent: 'parent tabs',
  subtab: 'subtabs',
}

export function formatArrangeCrossDomainMoveToast(
  kind: ArrangeCrossDomainMoveKind,
  itemNames: readonly string[],
  targetDomainName: string | null | undefined,
) {
  const domainName = targetDomainName?.trim()
  if (!domainName || itemNames.length === 0) return null

  if (itemNames.length === 1) {
    const itemName = itemNames[0]?.trim() || FALLBACK_ITEM_LABELS[kind]
    return `${itemName} has been moved to ${domainName}`
  }

  return `${itemNames.length} ${PLURAL_ITEM_LABELS[kind]} have been moved to ${domainName}`
}
