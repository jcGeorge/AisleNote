import { useCallback, useEffect, useRef, useState } from 'react'
import { exportAppData, exportNotebookArchive, type ExportScope } from '../export/export-data'
import { getRegisteredAssetBytes, importBlobAsAssetUrl } from '../markdown/image-asset-registry'
import { buildNotebookArchive, materializeNotebookImportAssets, mergeImportedNotebookState, parseNotebookArchive, toNotebookArchiveArrayBuffer, type ParsedNotebookArchive } from '../notebook/notebook-archive'
import { createCapacitorRecoveryNotebookArchive } from '../storage/capacitor-hybrid-state'
import { parseSavedState } from '../state/app-state'
import type { AppState, NotebookBackupStatus } from '../types/app'
import type { DataPlatformCapabilities } from '../platform/data-platform'
import type { AppStateSnapshotMode } from '../storage/persistence-debounce'
import { mergeImportedBackupState } from './backup-import'
import { formatMarkdownFolderImportSummary, mergeMarkdownFolderImport, parseMarkdownFolderZip, type MarkdownFolderImportAsset, type MarkdownFolderImportPayload } from './markdown-folder-import'
import { dataTransferMessages } from '../settings/data-transfer-messages'

type UseNotebookTransferActionsParams = {
  dataCapabilities: DataPlatformCapabilities
  getLatestState: () => AppState
  commitAppStateNow: (nextState: AppState) => Promise<unknown> | unknown
  flushStorageActionState: (options?: { snapshotMode?: Extract<AppStateSnapshotMode, 'force' | 'skip'> }) => Promise<void> | void
  setExportStatus: (status: string) => void
  setImportStatus: (status: string) => void
}

function chooseNotebookArchiveWithBrowserInput(): Promise<{ canceled: true } | { canceled: false; bytes: ArrayBuffer }> {
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
        .then((bytes) => resolve({ canceled: false, bytes }))
        .catch(() => resolve({ canceled: true }))
        .finally(cleanup)
    }, { once: true })
    document.body.appendChild(input)
    input.click()
  })
}

function getActionError(result: unknown): string | undefined {
  return result && typeof result === 'object' && 'error' in result && typeof result.error === 'string'
    ? result.error
    : undefined
}

export function useNotebookTransferActions({
  dataCapabilities,
  getLatestState,
  commitAppStateNow,
  flushStorageActionState,
  setExportStatus,
  setImportStatus,
}: UseNotebookTransferActionsParams) {
  const [pendingNotebookImport, setPendingNotebookImport] = useState<ParsedNotebookArchive | null>(null)
  const [notebookImportScratchpadEnabled, setNotebookImportScratchpadEnabled] = useState(false)
  const [notebookBackupStatus, setNotebookBackupStatus] = useState<NotebookBackupStatus | null>(null)
  const notebookBackupStatusRef = useRef<NotebookBackupStatus | null>(null)
  const notebookBackupInFlightRef = useRef(false)
  const suppressNextAutomaticBackupRef = useRef(false)

  useEffect(() => {
    let disposed = false
    const applyNotebookBackupStatus = (nextStatus: NotebookBackupStatus) => {
      notebookBackupStatusRef.current = nextStatus
      setNotebookBackupStatus(nextStatus)
    }

    void window.electronAPI?.getNotebookBackupStatus?.().then((status) => {
      if (!disposed && status) applyNotebookBackupStatus(status)
    })
    const unsubscribe =
      window.electronAPI?.onNotebookBackupStatusUpdated?.((status) => {
        if (!disposed) applyNotebookBackupStatus(status)
      }) ?? (() => undefined)
    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  const exportData = (scope: ExportScope, spaceId?: string) => {
    if (scope === 'all' && !window.electronAPI?.exportAppState) {
      setExportStatus(dataTransferMessages.supportArchiveExportDesktopOnly)
      return undefined
    }
    return exportAppData({
      scope,
      spaceId,
      getLatestState,
      setStatus: setExportStatus,
    })
  }

  const exportNotebook = () =>
    exportNotebookArchive({
      getLatestState,
      setStatus: setExportStatus,
    })

  const buildNotebookArchiveData = async (
    serializedState: string,
    readAssetBytes?: (assetPath: string) => Promise<Uint8Array | null> | Uint8Array | null,
  ): Promise<ArrayBuffer> => {
    const archiveState = parseSavedState(serializedState)
    const result = await buildNotebookArchive({
      state: archiveState,
      readAssetBytes: readAssetBytes ?? (async (assetPath) => {
        const fromDesktop = await window.electronAPI?.readAsset?.({ assetPath })
        if (fromDesktop?.ok && fromDesktop.bytes) return new Uint8Array(fromDesktop.bytes)
        return getRegisteredAssetBytes(assetPath)
      }),
    })
    return toNotebookArchiveArrayBuffer(result.bytes)
  }

  const writeNotebookBackup = useCallback(
    async (
      serializedState: string,
      trigger: 'manual' | 'automatic',
      options: { reportToSettings?: boolean } = {},
    ) => {
      const runBackup = window.electronAPI?.runNotebookBackupNow
      if (!runBackup) {
        if (options.reportToSettings) setExportStatus(dataTransferMessages.notebookBackupsDesktopOnly)
        return
      }
      if (notebookBackupInFlightRef.current) return

      notebookBackupInFlightRef.current = true
      if (options.reportToSettings) setExportStatus(dataTransferMessages.notebookBackupBuilding)
      try {
        const data = await buildNotebookArchiveData(serializedState)
        const result = await runBackup({ data, trigger })
        if ('status' in result && result.status) {
          notebookBackupStatusRef.current = result.status
          setNotebookBackupStatus(result.status)
        }

        if (options.reportToSettings) {
          if ('canceled' in result && result.canceled) {
            setExportStatus(dataTransferMessages.notebookBackupCanceled)
          } else if ('ok' in result && result.ok) {
            setExportStatus(result.skipped ? dataTransferMessages.notebookBackupSkipped : dataTransferMessages.notebookBackupSaved)
          } else {
            setExportStatus(dataTransferMessages.notebookBackupFailed(getActionError(result)))
          }
        }
      } catch (error) {
        if (options.reportToSettings) setExportStatus(dataTransferMessages.notebookBackupFailed(error instanceof Error ? error.message : 'unknown error'))
      } finally {
        notebookBackupInFlightRef.current = false
      }
    },
    [setExportStatus],
  )

  const chooseNotebookBackupFolder = async () => {
    const result = await window.electronAPI?.chooseNotebookBackupFolder?.()
    if (!result) {
      setExportStatus(dataTransferMessages.backupFolderSelectionDesktopOnly)
      return
    }
    if ('status' in result && result.status) {
      notebookBackupStatusRef.current = result.status
      setNotebookBackupStatus(result.status)
    }
    if ('canceled' in result && result.canceled) {
      setExportStatus(dataTransferMessages.backupFolderSelectionCanceled)
      return
    }
    if ('ok' in result && result.ok) {
      setExportStatus(dataTransferMessages.backupFolderUpdated)
      return
    }
    setExportStatus(dataTransferMessages.backupFolderFailed(getActionError(result)))
  }

  const runNotebookBackupNow = async () => {
    suppressNextAutomaticBackupRef.current = true
    try {
      await flushStorageActionState({ snapshotMode: 'force' })
    } finally {
      suppressNextAutomaticBackupRef.current = false
    }
    await writeNotebookBackup(JSON.stringify(getLatestState()), 'manual', {
      reportToSettings: true,
    })
  }

  const revealNotebookBackupFolder = async () => {
    const result = await window.electronAPI?.revealNotebookBackupFolder?.()
    if (!result) {
      setExportStatus(dataTransferMessages.revealBackupFolderDesktopOnly)
      return
    }
    if (!result.ok) setExportStatus(dataTransferMessages.revealBackupFolderFailed(result.error))
  }

  const resetNotebookBackupFolder = async () => {
    const result = await window.electronAPI?.resetNotebookBackupFolder?.()
    if (!result) {
      setExportStatus(dataTransferMessages.turnOffBackupsDesktopOnly)
      return
    }
    if ('status' in result && result.status) {
      notebookBackupStatusRef.current = result.status
      setNotebookBackupStatus(result.status)
    }
    if ('ok' in result && result.ok) {
      setExportStatus(dataTransferMessages.backupsTurnedOff)
      return
    }
    setExportStatus(dataTransferMessages.turnOffBackupsFailed(getActionError(result)))
  }

  useEffect(() => {
    const handleSavedState = (event: Event) => {
      const detail = (event as CustomEvent<{ serializedState?: string; snapshotMode?: AppStateSnapshotMode }>).detail
      if (!detail || typeof detail.serializedState !== 'string') return
      if (suppressNextAutomaticBackupRef.current) {
        suppressNextAutomaticBackupRef.current = false
        return
      }
      if (detail.snapshotMode === 'skip') return
      const status = notebookBackupStatusRef.current
      if (!status?.enabled) return
      if (typeof status.nextBackupAt === 'number' && Date.now() < status.nextBackupAt) return
      void writeNotebookBackup(detail.serializedState, 'automatic')
    }

    window.addEventListener('tabs:app-state-saved', handleSavedState)
    return () => window.removeEventListener('tabs:app-state-saved', handleSavedState)
  }, [writeNotebookBackup])

  const exportRecoveryCopy = async () => {
    if (!dataCapabilities.appPrivateNotebook) {
      setExportStatus(dataTransferMessages.recoveryCopyMobileOnly)
      return
    }

    setExportStatus(dataTransferMessages.recoveryCopyCreating)
    const result = await createCapacitorRecoveryNotebookArchive(JSON.stringify(getLatestState()))
    if (!result.ok) {
      setExportStatus(dataTransferMessages.recoveryCopyFailed(result.error))
      return
    }
    setExportStatus(dataTransferMessages.recoveryCopyCreated(result.uri ?? result.path))
  }

  const importBackup = async () => {
    const importArchive = window.electronAPI?.importAppStateArchive
    if (!importArchive) {
      setImportStatus(dataTransferMessages.supportArchiveImportDesktopOnly)
      return
    }

    setImportStatus(dataTransferMessages.chooseSupportArchiveImport)
    try {
      const result = await importArchive()
      if (result.canceled) {
        setImportStatus(dataTransferMessages.supportArchiveImportCanceled)
        return
      }
      if (!result.ok) {
        setImportStatus(dataTransferMessages.supportArchiveImportFailed(result.error))
        return
      }
      if (!result.serializedState) {
        setImportStatus(dataTransferMessages.supportArchiveMissingAppState)
        return
      }

      const latestState = getLatestState()
      const importedState = parseSavedState(result.serializedState)
      const { state: nextState, summary } = mergeImportedBackupState(latestState, importedState)
      await commitAppStateNow(nextState)
      const warningCount = result.issues?.filter((issue) => issue.severity === 'warning').length ?? 0
      setImportStatus(dataTransferMessages.supportArchiveImported(summary, warningCount))
    } catch (error) {
      setImportStatus(dataTransferMessages.supportArchiveImportCaughtError(error))
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

  const stageNotebookArchiveImport = (
    archive: ParsedNotebookArchive,
    options: { extraWarningCount?: number } = {},
  ) => {
    setPendingNotebookImport(archive)
    const warningCount = archive.issues.filter((issue) => issue.severity === 'warning').length + (options.extraWarningCount ?? 0)
    setImportStatus(dataTransferMessages.notebookImportReady(archive.summary, warningCount))
  }

  const prepareNotebookArchiveImport = async (
    archiveBytes: ArrayBuffer | Uint8Array,
    options: { extraWarningCount?: number } = {},
  ): Promise<boolean> => {
    setImportStatus(dataTransferMessages.notebookImportValidating)
    const parseResult = await parseNotebookArchive(archiveBytes)
    if (!parseResult.ok) return false

    stageNotebookArchiveImport(parseResult.archive, options)
    return true
  }

  const importZipNotebookSource = async (archiveBytes: ArrayBuffer | Uint8Array) => {
    setImportStatus(dataTransferMessages.notebookImportValidating)
    const notebookParseResult = await parseNotebookArchive(archiveBytes)
    if (notebookParseResult.ok) {
      stageNotebookArchiveImport(notebookParseResult.archive)
      return
    }

    const canTryMarkdownZip = notebookParseResult.issues.some((issue) => issue.code === 'missing-manifest')
    if (!canTryMarkdownZip) {
      setImportStatus(dataTransferMessages.notebookImportFailed(notebookParseResult.error))
      return
    }

    const markdownZip = await parseMarkdownFolderZip(archiveBytes)
    if (!markdownZip.ok) {
      setImportStatus(dataTransferMessages.notebookImportFailed(markdownZip.error))
      return
    }
    await commitMarkdownImport(markdownZip.payload, (relativePath) => markdownZip.assets.get(relativePath) ?? null)
  }

  const importNotebookFolderSource = async (source: {
    sourceId: string
    serializedState: string
    issues?: Array<{ severity: 'warning' | 'error' }>
  }) => {
    const readFolderImportAsset = window.electronAPI?.readFolderImportAsset
    if (!readFolderImportAsset) {
      setImportStatus(dataTransferMessages.notebookFolderImportDesktopOnly)
      return
    }
    const archiveBytes = await buildNotebookArchiveData(source.serializedState, async (assetPath) => {
      const assetResult = await readFolderImportAsset({ sourceId: source.sourceId, relativePath: assetPath })
      if (assetResult.ok && assetResult.bytes) return new Uint8Array(assetResult.bytes)
      return null
    })
    const loaderWarningCount = source.issues?.filter((issue) => issue.severity === 'warning').length ?? 0
    const prepared = await prepareNotebookArchiveImport(archiveBytes, {
      extraWarningCount: loaderWarningCount,
    })
    if (!prepared) setImportStatus(dataTransferMessages.notebookFolderImportConversionFailed)
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
    setPendingNotebookImport(null)
    setNotebookImportScratchpadEnabled(false)
    try {
      const desktopOpen = window.electronAPI?.openNotebookImportSource
      const openResult = desktopOpen ? await desktopOpen() : await chooseNotebookArchiveWithBrowserInput()
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

  const cancelNotebookImport = () => {
    setPendingNotebookImport(null)
    setNotebookImportScratchpadEnabled(false)
    setImportStatus(dataTransferMessages.notebookImportCanceled)
  }

  const confirmNotebookImport = async () => {
    const pendingImport = pendingNotebookImport
    if (!pendingImport) return

    setImportStatus(dataTransferMessages.notebookImportImporting)
    try {
      const materializedImport = await materializeNotebookImportAssets(pendingImport, {
        includeScratchpad: notebookImportScratchpadEnabled,
        importAsset: window.electronAPI?.importAsset
          ? async (asset) => {
              const result = await window.electronAPI?.importAsset?.({
                bytes: toNotebookArchiveArrayBuffer(asset.bytes),
                name: asset.file.split('/').pop() ?? 'asset',
                type: asset.mimeType,
                extension: asset.extension,
              })
              return result?.ok ? result.url : null
            }
          : undefined,
      })
      const latestState = getLatestState()
      const { state: nextState, summary } = mergeImportedNotebookState(latestState, materializedImport, {
        includeScratchpad: notebookImportScratchpadEnabled,
      })
      await commitAppStateNow(nextState)
      setPendingNotebookImport(null)
      setNotebookImportScratchpadEnabled(false)
      const materializedWarningCount = materializedImport.issues.filter((issue) => issue.severity === 'warning').length
      setImportStatus(dataTransferMessages.notebookImported(summary, materializedWarningCount))
    } catch (error) {
      setImportStatus(dataTransferMessages.notebookImportCaughtError(error))
    }
  }

  return {
    exportData,
    exportNotebook,
    exportRecoveryCopy,
    importBackup,
    importNotebook,
    chooseNotebookBackupFolder,
    runNotebookBackupNow,
    revealNotebookBackupFolder,
    resetNotebookBackupFolder,
    notebookBackupStatus,
    notebookImportSummary: pendingNotebookImport?.summary ?? null,
    notebookImportScratchpadEnabled,
    notebookImportHasScratchpad: Boolean(pendingNotebookImport?.scratchpad),
    setNotebookImportScratchpadEnabled,
    confirmNotebookImport,
    cancelNotebookImport,
  }
}
