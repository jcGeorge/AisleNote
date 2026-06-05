import { exportSpaceData } from '../export/export-data'
import { importBlobAsAssetUrl } from '../markdown/image-asset-registry'
import { MARKDOWN_LINK_PATTERN, parseImageAssetUrl } from '../markdown/image-asset-refs.js'
import { splitAssetMetadataFromUrl } from '../markdown/asset-metadata.js'
import { parseSavedState } from '../state/app-state'
import type { AppState, NoteAisleBody } from '../types/app'
import { mergeImportedNotebookState } from './notebook-import'
import {
  formatMarkdownFolderImportSummary,
  mergeMarkdownFolderImport,
  parseMarkdownFolderZip,
  type MarkdownFolderImportAsset,
  type MarkdownFolderImportPayload,
} from './markdown-folder-import'
import { dataTransferMessages } from '../settings/data-transfer-messages'

type UseNotebookTransferActionsParams = {
  getLatestState: () => AppState
  commitAppStateNow: (nextState: AppState) => Promise<unknown> | unknown
  flushStorageActionState: () => Promise<void> | void
  setExportStatus: (status: string) => void
  setImportStatus: (status: string) => void
}

type BrowserZipImportResult =
  | { canceled: true }
  | { canceled: false; ok: true; kind: 'zip'; bytes: ArrayBuffer }
  | { canceled: false; ok: false; error: string }

type NotebookImportAsset = {
  relativePath?: string
  bytes: ArrayBuffer
  fileName?: string
  name?: string
  mimeType?: string
  extension?: string
}

function chooseZipWithBrowserInput(): Promise<BrowserZipImportResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip'
    input.style.display = 'none'
    const cleanup = () => {
      input.remove()
    }
    input.addEventListener('change', () => {
      const file = input.files?.[0] ?? null
      if (!file) {
        cleanup()
        resolve({ canceled: true })
        return
      }
      file.arrayBuffer()
        .then((bytes) => resolve({ canceled: false, ok: true, kind: 'zip', bytes }))
        .catch((error) => resolve({
          canceled: false,
          ok: false,
          error: error instanceof Error ? error.message : 'ZIP file could not be opened.',
        }))
        .finally(cleanup)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

function makeAssetMap(assets: NotebookImportAsset[] = []) {
  const assetMap = new Map<string, NotebookImportAsset>()
  assets.forEach((asset) => {
    if (asset.relativePath) assetMap.set(asset.relativePath, asset)
  })
  return assetMap
}

function getAssetExtension(assetPath: string, asset?: NotebookImportAsset | null) {
  if (asset?.extension) return asset.extension
  const fileName = asset?.name ?? asset?.fileName ?? assetPath
  return fileName.split('.').pop()?.toLowerCase() ?? 'bin'
}

export function useNotebookTransferActions({
  getLatestState,
  commitAppStateNow,
  flushStorageActionState,
  setExportStatus,
  setImportStatus,
}: UseNotebookTransferActionsParams) {
  const exportSpace = (spaceId?: string) =>
    exportSpaceData({
      spaceId,
      getLatestState,
      setStatus: setExportStatus,
    })

  const exportNotebook = async () => {
    const exportNotebookFolder = window.electronAPI?.exportNotebookFolder
    if (!exportNotebookFolder) {
      setExportStatus(dataTransferMessages.notebookFolderExportDesktopOnly)
      return
    }

    setExportStatus(dataTransferMessages.notebookFolderExportPreparing)
    try {
      await flushStorageActionState()
      const result = await exportNotebookFolder({ serializedState: JSON.stringify(getLatestState()) })
      if (result.canceled) {
        setExportStatus(dataTransferMessages.notebookFolderExportCanceled)
        return
      }
      if (!result.ok) {
        setExportStatus(dataTransferMessages.notebookFolderExportFailed(result.error))
        return
      }
      setExportStatus(dataTransferMessages.notebookFolderExported(result.profileRootPath))
    } catch (error) {
      setExportStatus(dataTransferMessages.notebookFolderExportFailed(error instanceof Error ? error.message : 'unknown error'))
    }
  }

  const importMarkdownAsset = async (asset: MarkdownFolderImportAsset) => {
    if (window.electronAPI?.importAsset) {
      const result = await window.electronAPI.importAsset({
        bytes: asset.bytes,
        name: asset.name ?? 'asset',
        type: asset.mimeType,
        extension: asset.extension,
      })
      return result?.ok ? result.url : null
    }
    return importBlobAsAssetUrl(new Blob([asset.bytes], { type: asset.mimeType ?? 'application/octet-stream' }), asset.name ?? 'asset')
  }

  const importNotebookAsset = async (assetPath: string, asset: NotebookImportAsset | null) => {
    if (!asset) return null
    const name = asset.name ?? asset.fileName ?? assetPath.split('/').pop() ?? 'asset'
    const extension = getAssetExtension(assetPath, asset)
    if (window.electronAPI?.importAsset) {
      const result = await window.electronAPI.importAsset({
        bytes: asset.bytes,
        name,
        type: asset.mimeType,
        extension,
      })
      return result?.ok ? result.url : null
    }
    return importBlobAsAssetUrl(new Blob([asset.bytes], { type: asset.mimeType ?? 'application/octet-stream' }), name)
  }

  const materializeImportedNotebookAssets = async (
    importedState: AppState,
    readAsset: (assetPath: string) => Promise<NotebookImportAsset | null> | NotebookImportAsset | null,
  ) => {
    const assetUrlByPath = new Map<string, string | null>()

    const materializeAssetPath = async (assetPath: string) => {
      if (assetUrlByPath.has(assetPath)) return assetUrlByPath.get(assetPath) ?? null
      const asset = await readAsset(assetPath)
      const nextUrl = await importNotebookAsset(assetPath, asset)
      assetUrlByPath.set(assetPath, nextUrl)
      return nextUrl
    }

    const nextAisleBodies: NoteAisleBody[] = []
    for (const aisleBody of importedState.noteAisleBodies ?? []) {
      let markdown = String(aisleBody.markdown ?? '')
      const replacements = new Map<string, string>()
      for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
        const source = String(match[3] ?? '').trim()
        const { assetUrl, metadataFragment } = splitAssetMetadataFromUrl(source)
        const assetPath = parseImageAssetUrl(assetUrl)
        if (!assetPath || replacements.has(source)) continue
        const nextUrl = await materializeAssetPath(assetPath)
        if (nextUrl) replacements.set(source, `${nextUrl}${metadataFragment}`)
      }
      if (replacements.size > 0) {
        markdown = markdown.replace(MARKDOWN_LINK_PATTERN, (fullMatch, imageBang: string, label: string, sourceRaw: string) => {
          const source = String(sourceRaw ?? '').trim()
          const replacement = replacements.get(source)
          return replacement ? `${imageBang}[${label}](${replacement})` : fullMatch
        })
      }
      nextAisleBodies.push({ ...aisleBody, markdown })
    }

    return {
      ...importedState,
      noteAisleBodies: nextAisleBodies,
    }
  }

  const commitNotebookImport = async (
    serializedState: string | null,
    options: {
      warningCount?: number
      readAsset?: (assetPath: string) => Promise<NotebookImportAsset | null> | NotebookImportAsset | null
    } = {},
  ) => {
    if (!serializedState) {
      setImportStatus(dataTransferMessages.notebookImportMissingSourceData)
      return
    }

    setImportStatus(dataTransferMessages.notebookImportImporting)
    const importedState = parseSavedState(serializedState)
    const materializedState = options.readAsset
      ? await materializeImportedNotebookAssets(importedState, options.readAsset)
      : importedState
    const latestState = getLatestState()
    const { state: nextState, summary } = mergeImportedNotebookState(latestState, materializedState)
    await commitAppStateNow(nextState)
    setImportStatus(dataTransferMessages.notebookImported(summary, options.warningCount ?? 0))
  }

  const commitMarkdownImport = async (
    payload: MarkdownFolderImportPayload,
    readAsset: NonNullable<Parameters<typeof mergeMarkdownFolderImport>[2]>['readAsset'],
  ) => {
    setImportStatus(dataTransferMessages.notebookImportImporting)
    const latestState = getLatestState()
    const { state: nextState, summary } = await mergeMarkdownFolderImport(latestState, payload, {
      readAsset,
      importAsset: importMarkdownAsset,
    })
    await commitAppStateNow(nextState)
    setImportStatus(formatMarkdownFolderImportSummary(summary))
  }

  const importZipNotebookSource = async (archiveBytes: ArrayBuffer | Uint8Array) => {
    setImportStatus(dataTransferMessages.notebookImportValidating)
    const markdownZip = await parseMarkdownFolderZip(archiveBytes)
    if (!markdownZip.ok) {
      setImportStatus(dataTransferMessages.notebookImportFailed(markdownZip.error))
      return
    }
    await commitMarkdownImport(markdownZip.payload, (relativePath) => markdownZip.assets.get(relativePath) ?? null)
  }

  const importNotebookFolderSource = async (source: {
    sourceId: string
    serializedState: string | null
    issues?: Array<{ severity: 'warning' | 'error' }>
  }) => {
    const readFolderImportAsset = window.electronAPI?.readFolderImportAsset
    if (!readFolderImportAsset) {
      setImportStatus(dataTransferMessages.notebookFolderImportDesktopOnly)
      return
    }
    const warningCount = source.issues?.filter((issue) => issue.severity === 'warning').length ?? 0
    await commitNotebookImport(source.serializedState, {
      warningCount,
      readAsset: async (assetPath) => {
        const assetResult = await readFolderImportAsset({ sourceId: source.sourceId, relativePath: assetPath })
        return assetResult.ok ? assetResult : null
      },
    })
  }

  const importNotebookZipSource = async (source: {
    serializedState: string | null
    assets?: NotebookImportAsset[]
    issues?: Array<{ severity: 'warning' | 'error' }>
  }) => {
    const warningCount = source.issues?.filter((issue) => issue.severity === 'warning').length ?? 0
    const assetMap = makeAssetMap(source.assets)
    await commitNotebookImport(source.serializedState, {
      warningCount,
      readAsset: (assetPath) => assetMap.get(assetPath) ?? null,
    })
  }

  const importMarkdownFolderSource = async (source: {
    sourceId: string
    rootName?: string
    files: Array<{ relativePath: string; markdown: string; size?: number }>
  }) => {
    const readFolderImportAsset = window.electronAPI?.readFolderImportAsset
    if (!readFolderImportAsset) {
      setImportStatus(dataTransferMessages.markdownFolderImportDesktopOnly)
      return
    }
    await commitMarkdownImport(
      {
        sourceId: source.sourceId,
        rootName: source.rootName,
        files: source.files,
      },
      async (relativePath) => {
        const assetResult = await readFolderImportAsset({ sourceId: source.sourceId, relativePath })
        if (!assetResult.ok) return null
        return {
          bytes: assetResult.bytes,
          name: assetResult.name ?? assetResult.fileName,
          mimeType: assetResult.mimeType,
          extension: assetResult.extension,
        }
      },
    )
  }

  const importNotebook = async () => {
    setImportStatus(dataTransferMessages.chooseNotebookImport)
    try {
      const desktopOpen = window.electronAPI?.openNotebookImportSource
      const openResult = desktopOpen ? await desktopOpen() : await chooseZipWithBrowserInput()
      if (openResult.canceled) {
        setImportStatus(dataTransferMessages.notebookImportCanceled)
        return
      }
      if ('ok' in openResult && !openResult.ok) {
        setImportStatus(dataTransferMessages.notebookImportFailed(openResult.error))
        return
      }

      if ('kind' in openResult && openResult.kind === 'notebook-folder') {
        await importNotebookFolderSource(openResult)
        return
      }
      if ('kind' in openResult && openResult.kind === 'notebook-zip') {
        await importNotebookZipSource(openResult)
        return
      }
      if ('kind' in openResult && openResult.kind === 'markdown-folder') {
        await importMarkdownFolderSource(openResult)
        return
      }

      const archiveBytes = 'bytes' in openResult ? openResult.bytes : null
      if (!archiveBytes) {
        setImportStatus(dataTransferMessages.notebookImportMissingSourceData)
        return
      }
      await importZipNotebookSource(archiveBytes)
    } catch (error) {
      setImportStatus(dataTransferMessages.notebookImportCaughtError(error))
    }
  }

  return {
    exportSpace,
    exportNotebook,
    importNotebook,
  }
}
