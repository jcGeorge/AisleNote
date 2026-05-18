import { splitImageResizeMetadataFromUrl } from './image-metadata'
import {
  buildImageAssetUrl,
  parseImageAssetUrl,
  rewriteMarkdownImageSources,
} from './image-asset-refs.js'

type RegisteredImageAsset = {
  bytes: Uint8Array
  mimeType: string
  objectUrl: string | null
}

const registeredAssets = new Map<string, RegisteredImageAsset>()
const objectUrlToAssetUrl = new Map<string, string>()

function normalizeImageExtension(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalized === 'jpeg') return 'jpg'
  if (normalized === 'svgxml') return 'svg'
  return normalized || 'png'
}

function getMimeTypeFromExtension(extension: string): string {
  switch (normalizeImageExtension(extension)) {
    case 'jpg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    case 'png':
    default:
      return 'image/png'
  }
}

function getExtensionFromImageBlob(blob: Blob, fileName = ''): string {
  const typeMatch = blob.type.match(/^image\/([a-zA-Z0-9+.-]+)$/)
  if (typeMatch) return normalizeImageExtension(typeMatch[1])
  const fileMatch = fileName.match(/\.([a-zA-Z0-9]+)$/)
  return normalizeImageExtension(fileMatch?.[1] ?? 'png')
}

function createBrowserAssetHash(bytes: Uint8Array): string {
  let hashA = 2166136261
  let hashB = 16777619
  for (let index = 0; index < bytes.length; index += 1) {
    hashA ^= bytes[index]
    hashA = Math.imul(hashA, 16777619) >>> 0
    hashB ^= Math.imul(bytes[index] + index + 1, 1315423911) >>> 0
    hashB = Math.imul(hashB, 2246822519) >>> 0
  }
  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`
}

function isElectronRuntime() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export function registerImageAssetBytes(assetPath: string, bytes: Uint8Array, mimeType = getMimeTypeFromExtension(assetPath.split('.').pop() ?? 'png')) {
  registeredAssets.set(assetPath, {
    bytes,
    mimeType,
    objectUrl: registeredAssets.get(assetPath)?.objectUrl ?? null,
  })
}

export function getRegisteredImageAssetBytes(assetPath: string): Uint8Array | null {
  return registeredAssets.get(assetPath)?.bytes ?? null
}

export function getRegisteredImageAssetMimeType(assetPath: string): string {
  return registeredAssets.get(assetPath)?.mimeType ?? getMimeTypeFromExtension(assetPath.split('.').pop() ?? 'png')
}

export async function importImageBlobAsAssetUrl(blob: Blob, fileName = 'image'): Promise<string | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const extension = getExtensionFromImageBlob(blob, fileName)

  if (isElectronRuntime() && typeof window.electronAPI?.importImageAsset === 'function') {
    const result = await window.electronAPI.importImageAsset({
      bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      name: fileName,
      type: blob.type,
      extension,
    })
    return result?.ok ? result.url : null
  }

  const assetPath = `assets/asset-${createBrowserAssetHash(bytes)}.${extension}`
  registerImageAssetBytes(assetPath, bytes, blob.type || getMimeTypeFromExtension(extension))
  return buildImageAssetUrl(assetPath)
}

export function resolveImageAssetDisplayUrl(url: string): string {
  const assetPath = parseImageAssetUrl(url)
  if (!assetPath) return url
  if (isElectronRuntime()) return url

  const existing = registeredAssets.get(assetPath)
  if (!existing || typeof URL === 'undefined' || typeof Blob === 'undefined') return url
  if (existing.objectUrl) return existing.objectUrl

  const objectUrl = URL.createObjectURL(new Blob([toArrayBuffer(existing.bytes)], { type: existing.mimeType }))
  existing.objectUrl = objectUrl
  objectUrlToAssetUrl.set(objectUrl, buildImageAssetUrl(assetPath))
  return objectUrl
}

export function normalizeImageAssetDisplayUrl(url: string): string {
  const imageAssetPath = parseImageAssetUrl(url)
  if (imageAssetPath) return buildImageAssetUrl(imageAssetPath)
  return objectUrlToAssetUrl.get(url) ?? url
}

export function prepareMarkdownImagesForDisplay(markdown: string): string {
  return rewriteMarkdownImageSources(markdown, (src: string) => {
    const { imageUrl, metadataFragment } = splitImageResizeMetadataFromUrl(src)
    return `${resolveImageAssetDisplayUrl(imageUrl)}${metadataFragment}`
  })
}

export function normalizeMarkdownImageSourcesForPersistence(markdown: string): string {
  return rewriteMarkdownImageSources(markdown, (src: string) => {
    const { imageUrl, metadataFragment } = splitImageResizeMetadataFromUrl(src)
    return `${normalizeImageAssetDisplayUrl(imageUrl)}${metadataFragment}`
  })
}

export function revokeImageAssetObjectUrls() {
  if (typeof URL === 'undefined') return
  registeredAssets.forEach((asset) => {
    if (asset.objectUrl) {
      URL.revokeObjectURL(asset.objectUrl)
      objectUrlToAssetUrl.delete(asset.objectUrl)
      asset.objectUrl = null
    }
  })
}
