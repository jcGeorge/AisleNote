import JSZip from 'jszip'
import { splitImageResizeMetadataFromUrl } from '../markdown/image-metadata'
import { convertInternalTabsForExport } from '../markdown/markdown-utils'
import type { AppState, Space, SpaceSettings } from '../types/app'

export type ExportScope = 'space' | 'all'

type ExportAppDataOptions = {
  scope: ExportScope
  spaceId?: string
  getLatestState: () => AppState
  setStatus: (status: string) => void
}

export function sanitizeName(value: string): string {
  const withoutControlCharacters = Array.from(value.trim())
    .filter((char) => char.charCodeAt(0) >= 32)
    .join('')
  const safe = withoutControlCharacters.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ')
  return safe.length > 0 ? safe : 'untitled'
}

function decodeDataUrl(dataUrl: string): Uint8Array | null {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return null
  const base64 = dataUrl.slice(commaIndex + 1)
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function rewriteMarkdownImages(markdown: string, spaceFolder: string, imageBank: Map<string, Uint8Array>) {
  let counter = imageBank.size + 1
  const exportReadyMarkdown = convertInternalTabsForExport(markdown)
  const nextMarkdown = exportReadyMarkdown.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (_all, alt: string, src: string) => {
    const { imageUrl, metadata } = splitImageResizeMetadataFromUrl(src)
    const extensionMatch = imageUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,/)
    const extRaw = extensionMatch?.[1]?.toLowerCase() ?? 'png'
    const ext = extRaw === 'jpeg' ? 'jpg' : extRaw.replace(/[^a-z0-9]/g, '') || 'png'
    const fileName = `image-${String(counter).padStart(4, '0')}.${ext}`
    counter += 1
    const bytes = decodeDataUrl(imageUrl)
    if (bytes) {
      imageBank.set(`${spaceFolder}/assets/${fileName}`, bytes)
    }
    const nextSrc = `assets/${fileName}`
    if (metadata) {
      return `<img src="${escapeHtmlAttribute(nextSrc)}" alt="${escapeHtmlAttribute(alt)}" width="${metadata.w}">`
    }
    return `![${alt}](${nextSrc})`
  })
  return nextMarkdown
}

export async function exportAppData({
  scope,
  spaceId,
  getLatestState,
  setStatus,
}: ExportAppDataOptions) {
  try {
    setStatus('building export...')
    const latestState = getLatestState()
    let exportState: AppState
    let defaultName: string
    let spacesToExport: Space[]

    if (scope === 'space') {
      const selectedSpace =
        latestState.spaces.find((space) => space.id === (spaceId ?? latestState.activeSpaceId)) ??
        latestState.spaces.find((space) => space.id === latestState.activeSpaceId) ??
        latestState.spaces[0]
      if (!selectedSpace) {
        setStatus('export failed')
        return
      }
      exportState = {
        ...latestState,
        activeSpaceId: selectedSpace.id,
        spaces: [selectedSpace],
      }
      defaultName = `${sanitizeName(selectedSpace.name)}-export.zip`
      spacesToExport = [selectedSpace]
    } else {
      exportState = latestState
      defaultName = 'notes-export-all.zip'
      spacesToExport = exportState.spaces
    }

    if (window.electronAPI?.exportAppState) {
      const result = await window.electronAPI.exportAppState({
        defaultPath: defaultName,
        serializedState: JSON.stringify(exportState),
      })
      if (result?.canceled) {
        setStatus('export canceled')
        return
      }
      if (result?.error) {
        setStatus('export failed')
        return
      }
      setStatus('export saved')
      return
    }

    const zip = new JSZip()
    const imageBank = new Map<string, Uint8Array>()
    const manifest = {
      exportedAt: new Date().toISOString(),
      scope,
      version: 1,
      theme: exportState.theme,
      spaces: [] as Array<{
        id: string
        name: string
        settings: SpaceSettings
        activeTabId: string
        tabs: Array<{ id: string; title: string; homeNote: string; subTabs: Array<{ id: string; title: string; file: string }> }>
      }>,
    }

    for (const space of spacesToExport) {
      const spaceFolder = `spaces/${sanitizeName(space.name)}-${space.id.slice(0, 8)}`
      const tabManifest: Array<{ id: string; title: string; homeNote: string; subTabs: Array<{ id: string; title: string; file: string }> }> = []

      for (const tab of space.data.tabs) {
        const tabFolder = `${spaceFolder}/${sanitizeName(tab.title)}-${tab.id.slice(0, 8)}`
        const homeMarkdown = rewriteMarkdownImages(tab.homeContent ?? '', spaceFolder, imageBank)
        zip.file(`${tabFolder}/home.md`, homeMarkdown)

        const subManifest: Array<{ id: string; title: string; file: string }> = []
        tab.subTabs.forEach((subTab, index) => {
          const subFileName = `${String(index + 1).padStart(2, '0')}-${sanitizeName(subTab.title)}.md`
          const rewritten = rewriteMarkdownImages(subTab.content ?? '', spaceFolder, imageBank)
          zip.file(`${tabFolder}/${subFileName}`, rewritten)
          subManifest.push({ id: subTab.id, title: subTab.title, file: subFileName })
        })

        tabManifest.push({
          id: tab.id,
          title: tab.title,
          homeNote: 'home.md',
          subTabs: subManifest,
        })
      }

      manifest.spaces.push({
        id: space.id,
        name: space.name,
        settings: space.settings,
        activeTabId: space.data.activeTabId,
        tabs: tabManifest,
      })
    }

    imageBank.forEach((bytes, path) => {
      zip.file(path, bytes)
    })
    zip.file('manifest.json', JSON.stringify(manifest, null, 2))
    zip.file(
      'README.txt',
      'This export contains markdown notes by space/tab and a manifest.json with metadata. Images are in assets/.',
    )

    const zipBytes = await zip.generateAsync({ type: 'uint8array' })
    const exportArray = Uint8Array.from(zipBytes)
    const exportBuffer = exportArray.buffer as ArrayBuffer

    if (window.electronAPI?.saveFile) {
      const result = await window.electronAPI.saveFile({
        defaultPath: defaultName,
        data: exportBuffer,
      })
      if (result?.canceled) {
        setStatus('export canceled')
        return
      }
      setStatus('export saved')
      return
    }

    const blob = new Blob([exportBuffer], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = defaultName
    anchor.click()
    URL.revokeObjectURL(url)
    setStatus('export saved')
  } catch {
    setStatus('export failed')
  }
}
