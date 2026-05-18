import { getImageResizeMetadata } from '../markdown/image-metadata'

export function syncImageDisplayMetadata(image: HTMLImageElement) {
  const metadata = getImageResizeMetadata(image.getAttribute('src') ?? image.src)
  if (!metadata) return false

  image.style.width = `${metadata.w}px`
  image.style.height = 'auto'
  image.style.maxWidth = '100%'
  image.setAttribute('width', String(metadata.w))
  image.removeAttribute('height')
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

  const observer = new MutationObserver(scheduleSync)
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
