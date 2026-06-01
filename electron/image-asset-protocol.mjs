import path from 'node:path'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { getHybridStorageRoot } from './app-state-storage.mjs'
import { normalizeImageAssetPath } from '../src/markdown/image-asset-refs.js'
import { getMimeTypeFromExtension } from '../src/storage/hybrid-storage-core.js'

export const IMAGE_ASSET_PROTOCOL_SCHEME = 'tabs-asset'

const EXTENSION_MIME_TYPES = new Map([
  ['aac', 'audio/aac'],
  ['flac', 'audio/flac'],
  ['m4a', 'audio/mp4'],
  ['mp3', 'audio/mpeg'],
  ['oga', 'audio/ogg'],
  ['ogg', 'audio/ogg'],
  ['opus', 'audio/ogg'],
  ['wav', 'audio/wav'],
  ['weba', 'audio/webm'],
  ['m4v', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['mp4', 'video/mp4'],
  ['ogv', 'video/ogg'],
  ['webm', 'video/webm'],
])

function getRequestAssetPath(requestUrl) {
  try {
    const url = new URL(requestUrl)
    const rawPath = url.hostname ? `${url.hostname}${url.pathname}` : url.pathname
    const decodedPath = decodeURIComponent(rawPath)
    if (decodedPath.split(/[\\/]+/).includes('..')) return null
    const assetPath = normalizeImageAssetPath(decodedPath)
    return assetPath.startsWith('assets/') ? assetPath : null
  } catch {
    return null
  }
}

function getAssetContentType(assetPath) {
  const extension = path.extname(assetPath).slice(1).toLowerCase()
  return EXTENSION_MIME_TYPES.get(extension) ?? getMimeTypeFromExtension(extension)
}

export function parseAssetRangeHeader(rangeHeader, size) {
  if (typeof rangeHeader !== 'string' || !rangeHeader.trim()) return null
  const match = rangeHeader.trim().match(/^bytes=(\d*)-(\d*)$/)
  if (!match) return { satisfiable: false }

  const startRaw = match[1] ?? ''
  const endRaw = match[2] ?? ''
  if (!startRaw && !endRaw) return { satisfiable: false }

  let start
  let end
  if (!startRaw) {
    const suffixLength = Number(endRaw)
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size <= 0) return { satisfiable: false }
    start = Math.max(size - suffixLength, 0)
    end = size - 1
  } else {
    start = Number(startRaw)
    end = endRaw ? Number(endRaw) : size - 1
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return { satisfiable: false }
  }

  if (start < 0 || end < start || start >= size) return { satisfiable: false }
  return {
    satisfiable: true,
    start,
    end: Math.min(end, Math.max(size - 1, 0)),
  }
}

function streamAssetFile(filePath, range = null) {
  const stream = range ? createReadStream(filePath, range) : createReadStream(filePath)
  return Readable.toWeb(stream)
}

function buildHeaders(entries) {
  return new Headers(
    Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, String(value)])),
  )
}

export function createImageAssetProtocolResponse(request, profileRootPath) {
  const assetPath = getRequestAssetPath(request?.url)
  if (!assetPath || !profileRootPath) {
    return new Response('Not found', { status: 404 })
  }

  const notesRoot = getHybridStorageRoot(profileRootPath)
  const absoluteAssetPath = path.resolve(notesRoot, assetPath)
  if (!absoluteAssetPath.startsWith(notesRoot + path.sep)) {
    return new Response('Not found', { status: 404 })
  }

  try {
    if (!existsSync(absoluteAssetPath)) {
      return new Response('Not found', { status: 404 })
    }
    const stats = statSync(absoluteAssetPath)
    if (!stats.isFile()) {
      return new Response('Not found', { status: 404 })
    }

    const size = stats.size
    const contentType = getAssetContentType(assetPath)
    const rangeHeader = request.headers?.get?.('range')
    const range = parseAssetRangeHeader(rangeHeader, size)
    if (range && !range.satisfiable) {
      return new Response('', {
        status: 416,
        headers: buildHeaders({
          'Accept-Ranges': 'bytes',
          'Content-Range': `bytes */${size}`,
        }),
      })
    }
    if (range?.satisfiable) {
      const contentLength = range.end - range.start + 1
      return new Response(streamAssetFile(absoluteAssetPath, { start: range.start, end: range.end }), {
        status: 206,
        headers: buildHeaders({
          'Accept-Ranges': 'bytes',
          'Content-Type': contentType,
          'Content-Length': contentLength,
          'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        }),
      })
    }

    return new Response(streamAssetFile(absoluteAssetPath), {
      status: 200,
      headers: buildHeaders({
        'Accept-Ranges': 'bytes',
        'Content-Type': contentType,
        'Content-Length': size,
      }),
    })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}

export function registerImageAssetProtocol({ protocol, storageSession }) {
  if (!protocol || typeof protocol.handle !== 'function') return

  protocol.handle(IMAGE_ASSET_PROTOCOL_SCHEME, (request) => {
    const profileRootPath = storageSession?.getProfileRootPath?.()
    return createImageAssetProtocolResponse(request, profileRootPath)
  })
}
