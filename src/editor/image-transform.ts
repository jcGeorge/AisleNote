import { getImageResizeMetadata, withImageResizeMetadata } from '../markdown/image-metadata'

export type ImageTransformOperation = 'rotate-ccw' | 'rotate-cw' | 'flip-horizontal' | 'flip-vertical'

type ImageDimensions = {
  width: number
  height: number
}

export function getImageTransformDimensions(
  sourceWidth: number,
  sourceHeight: number,
  operation: ImageTransformOperation,
): ImageDimensions {
  const width = Math.max(1, Math.round(sourceWidth))
  const height = Math.max(1, Math.round(sourceHeight))
  if (operation === 'rotate-ccw' || operation === 'rotate-cw') {
    return { width: height, height: width }
  }
  return { width, height }
}

export function getImageTransformDisplayWidth(sourceUrl: string, renderedWidth: number): number {
  const metadataWidth = getImageResizeMetadata(sourceUrl)?.w
  const candidate = metadataWidth ?? renderedWidth
  const rounded = Math.round(Number(candidate))
  return Number.isFinite(rounded) ? Math.max(8, rounded) : 8
}

export function getImageTransformDisplayWidthAfterOperation(
  sourceUrl: string,
  renderedWidth: number,
  sourceWidth: number,
  transformedWidth: number,
  operation: ImageTransformOperation,
): number {
  const displayWidth = getImageTransformDisplayWidth(sourceUrl, renderedWidth)
  if (operation !== 'rotate-ccw' && operation !== 'rotate-cw') return displayWidth

  const roundedSourceWidth = Math.round(sourceWidth)
  const roundedTransformedWidth = Math.round(transformedWidth)
  if (
    !Number.isFinite(roundedSourceWidth) ||
    !Number.isFinite(roundedTransformedWidth) ||
    roundedSourceWidth <= 0 ||
    roundedTransformedWidth <= 0
  ) {
    return displayWidth
  }
  return Math.max(8, Math.round(displayWidth * (roundedTransformedWidth / roundedSourceWidth)))
}

export function withImageTransformDisplayWidth(
  dataUrl: string,
  sourceUrl: string,
  renderedWidth: number,
  sourceWidth: number,
  transformedWidth: number,
  operation: ImageTransformOperation,
): string {
  return withImageResizeMetadata(dataUrl, {
    v: 1,
    w: getImageTransformDisplayWidthAfterOperation(sourceUrl, renderedWidth, sourceWidth, transformedWidth, operation),
  })
}

export function drawImageTransform(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  operation: ImageTransformOperation,
) {
  if (operation === 'rotate-cw') {
    context.translate(sourceHeight, 0)
    context.rotate(Math.PI / 2)
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight)
    return
  }

  if (operation === 'rotate-ccw') {
    context.translate(0, sourceWidth)
    context.rotate(-Math.PI / 2)
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight)
    return
  }

  if (operation === 'flip-horizontal') {
    context.translate(sourceWidth, 0)
    context.scale(-1, 1)
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight)
    return
  }

  context.translate(0, sourceHeight)
  context.scale(1, -1)
  context.drawImage(image, 0, 0, sourceWidth, sourceHeight)
}
