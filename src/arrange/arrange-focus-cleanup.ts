export const ARRANGE_RAIL_CONTROL_SELECTOR = [
  '[data-arrange-tab-id]',
  '[data-arrange-subtab-id]',
  '[data-arrange-space-id]',
  '[data-arrange-domain-id]',
].join(', ')

type ArrangeRailFocusable = {
  blur: () => void
  matches: (selector: string) => boolean
}

function isArrangeRailFocusable(value: unknown): value is ArrangeRailFocusable {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ArrangeRailFocusable>
  return (
    typeof candidate.blur === 'function' &&
    typeof candidate.matches === 'function' &&
    candidate.matches(ARRANGE_RAIL_CONTROL_SELECTOR)
  )
}

export function blurArrangeRailControl(target: unknown): boolean {
  if (!isArrangeRailFocusable(target)) return false
  target.blur()
  return true
}

export function blurActiveArrangeRailControl(
  ownerDocument: Pick<Document, 'activeElement'> | null | undefined =
    typeof document === 'undefined' ? null : document,
): boolean {
  return blurArrangeRailControl(ownerDocument?.activeElement)
}
