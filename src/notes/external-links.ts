import { parseAssetUrl } from '../markdown/image-asset-refs.js'
import { openAssetUrl } from '../markdown/image-asset-registry'

const BARE_WEB_ADDRESS_RE =
  /^(?:www\.|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+)[a-z][a-z0-9-]{1,62}(?::\d{2,5})?(?:[/?#][^\s]*)?$/i

export function normalizeExternalWebUrl(value: string): string | null {
  try {
    const trimmed = value.trim()
    if (!trimmed || /\s/.test(trimmed)) return null
    const candidate = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : BARE_WEB_ADDRESS_RE.test(trimmed)
        ? `https://${trimmed}`
        : trimmed
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function openExternalWebUrl(value: string): boolean {
  if (parseAssetUrl(value)) return openAssetUrl(value)

  const url = normalizeExternalWebUrl(value)
  if (!url) return false

  if (typeof window !== 'undefined' && typeof window.electronAPI?.openExternalUrl === 'function') {
    void window.electronAPI.openExternalUrl(url)
    return true
  }

  if (typeof window === 'undefined' || typeof window.open !== 'function') return false
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}
