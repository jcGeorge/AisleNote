import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getHybridStorageRoot } from './app-state-storage.mjs'
import { normalizeImageAssetPath } from '../src/markdown/image-asset-refs.js'

export const IMAGE_ASSET_PROTOCOL_SCHEME = 'tabs-asset'

export function registerImageAssetProtocol({ protocol, net, storageSession }) {
  if (!protocol || typeof protocol.handle !== 'function' || !net || typeof net.fetch !== 'function') return

  protocol.handle(IMAGE_ASSET_PROTOCOL_SCHEME, (request) => {
    const url = new URL(request.url)
    const rawPath = url.hostname ? `${url.hostname}${url.pathname}` : url.pathname
    const assetPath = normalizeImageAssetPath(decodeURIComponent(rawPath))
    const profileRootPath = storageSession?.getProfileRootPath?.()
    if (!assetPath || !profileRootPath) {
      return new Response('Not found', { status: 404 })
    }

    const notesRoot = getHybridStorageRoot(profileRootPath)
    const absoluteAssetPath = path.resolve(notesRoot, assetPath)
    if (!absoluteAssetPath.startsWith(notesRoot + path.sep)) {
      return new Response('Not found', { status: 404 })
    }

    return net.fetch(pathToFileURL(absoluteAssetPath).toString())
  })
}
