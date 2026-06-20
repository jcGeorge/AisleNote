import { getImageResizeMetadata } from '../markdown/image-metadata'

export type ImageDisplayLayoutReservation = {
  width: number
  height: number
}

const RESERVED_IMAGE_LAYOUT_ATTR = 'data-tabs-image-layout-reserved'

function normalizeReservedImageLayout(value: number): number | null {
  if (!Number.isFinite(value)) return null
  const rounded = Math.round(value)
  return rounded > 0 ? rounded : null
}

export function reserveImageDisplayLayout(image: HTMLImageElement, layout: ImageDisplayLayoutReservation) {
  const width = normalizeReservedImageLayout(layout.width)
  const height = normalizeReservedImageLayout(layout.height)
  if (!width || !height) return false

  image.style.width = `${width}px`
  image.style.height = `${height}px`
  image.style.maxWidth = '100%'
  image.setAttribute('width', String(width))
  image.setAttribute('height', String(height))
  image.setAttribute(RESERVED_IMAGE_LAYOUT_ATTR, 'true')
  return true
}

export function releaseImageDisplayLayoutReservation(image: HTMLImageElement) {
  image.removeAttribute(RESERVED_IMAGE_LAYOUT_ATTR)
  return syncImageDisplayMetadata(image)
}

export function syncImageDisplayMetadata(image: HTMLImageElement) {
  const metadata = getImageResizeMetadata(image.getAttribute('src') ?? image.src)
  if (!metadata) return false

  image.style.width = `${metadata.w}px`
  image.style.maxWidth = '100%'
  image.setAttribute('width', String(metadata.w))
  if (image.getAttribute(RESERVED_IMAGE_LAYOUT_ATTR) !== 'true') {
    image.style.height = 'auto'
    image.removeAttribute('height')
  }
  const transforms: string[] = []
  if (metadata.r) transforms.push(`rotate(${metadata.r}deg)`)
  if (metadata.fh) transforms.push('scaleX(-1)')
  if (metadata.fv) transforms.push('scaleY(-1)')
  image.style.transform = transforms.join(' ')
  image.style.transformOrigin = transforms.length > 0 ? 'center center' : ''
  image.style.display = transforms.length > 0 ? 'inline-block' : ''
  return true
}

export function syncImageDisplayMetadataInRoot(root: ParentNode | null) {
  if (!root) return 0
  let synced = 0
  root.querySelectorAll('img').forEach((image) => {
    if (image instanceof HTMLImageElement && syncImageDisplayMetadata(image)) {
      synced += 1
    }
  })
  return synced
}

export function installImageDisplayMetadataSync(root: ParentNode) {
  let frameId = 0
  const timeoutIds: number[] = []

  const runSync = () => {
    syncImageDisplayMetadataInRoot(root)
  }

  const scheduleSync = () => {
    if (frameId) return
    frameId = window.requestAnimationFrame(() => {
      frameId = 0
      runSync()
    })
  }

  runSync()
  scheduleSync()
  timeoutIds.push(window.setTimeout(runSync, 40))
  timeoutIds.push(window.setTimeout(runSync, 160))

  const observer = new MutationObserver(() => {
    runSync()
    scheduleSync()
  })
  observer.observe(root, {
    attributes: true,
    attributeFilter: ['src'],
    childList: true,
    subtree: true,
  })

  return () => {
    observer.disconnect()
    if (frameId) {
      window.cancelAnimationFrame(frameId)
    }
    timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId))
  }
}
