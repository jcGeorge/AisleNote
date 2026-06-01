import { withImageResizeMetadata } from '../markdown/image-metadata'

export type ImageDimensions = {
  width: number
  height: number
}

export function getDefaultInsertedImageDisplayWidth(
  naturalWidth: number,
  containerWidth?: number | null,
): number | null {
  const imageWidth = Math.round(Number(naturalWidth))
  if (!Number.isFinite(imageWidth) || imageWidth <= 0) return null
  const noteWidth = Math.floor(Number(containerWidth))
  const width = Number.isFinite(noteWidth) && noteWidth > 0 ? Math.min(imageWidth, noteWidth) : imageWidth
  return Math.max(8, width)
}

export function getEditorImageInsertionContainerWidth(root: HTMLElement | null | undefined): number | null {
  const content =
    root?.querySelector<HTMLElement>('.toastui-editor-contents, .ProseMirror') ??
    (typeof HTMLElement !== 'undefined' && root instanceof HTMLElement ? root : null)
  if (!content) return null
  const rect = content.getBoundingClientRect()
  const width = rect.width || content.clientWidth
  return Number.isFinite(width) && width > 0 ? width : null
}

async function measureImageBlobWithBitmap(blob: Blob): Promise<ImageDimensions | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(blob)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions.width > 0 && dimensions.height > 0 ? dimensions : null
  } catch {
    return null
  }
}

async function measureImageBlobWithElement(blob: Blob): Promise<ImageDimensions | null> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return null
  const objectUrl = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = objectUrl
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('image load failed'))
    })
    return image.naturalWidth > 0 && image.naturalHeight > 0
      ? { width: image.naturalWidth, height: image.naturalHeight }
      : null
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function measureImageBlobDimensions(blob: Blob): Promise<ImageDimensions | null> {
  return (await measureImageBlobWithBitmap(blob)) ?? (await measureImageBlobWithElement(blob))
}

export async function withDefaultInsertedImageDisplayWidth(
  imageUrl: string,
  blob: Blob,
  containerRoot?: HTMLElement | null,
): Promise<string> {
  const dimensions = await measureImageBlobDimensions(blob)
  const width = getDefaultInsertedImageDisplayWidth(
    dimensions?.width ?? 0,
    getEditorImageInsertionContainerWidth(containerRoot),
  )
  return width ? withImageResizeMetadata(imageUrl, { v: 1, w: width }) : imageUrl
}
