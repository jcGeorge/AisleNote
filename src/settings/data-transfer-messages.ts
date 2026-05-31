import type { ImportBackupSummary } from '../import/backup-import'
import type { NotebookArchiveSummary, NotebookImportMergeResult } from '../notebook/notebook-archive'

type ExportScope = 'space' | 'all'

function warningSuffix(count: number): string {
  return count > 0 ? ` ${count} warning(s).` : ''
}

function unknownMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

export function formatNotebookArchiveSummary(summary: NotebookArchiveSummary): string {
  return `${summary.domains} domain(s), ${summary.spaces} space(s), ${summary.tabs} tab(s), ${summary.notes} note(s)`
}

export const dataTransferMessages = {
  exportBuilding: (scope: ExportScope) => (scope === 'all' ? 'building support archive...' : 'building export...'),
  exportCanceled: (scope: ExportScope) => (scope === 'all' ? 'support archive export canceled' : 'export canceled'),
  exportFailed: (scope: ExportScope) => (scope === 'all' ? 'support archive export failed' : 'export failed'),
  exportSaved: (scope: ExportScope) => (scope === 'all' ? 'support archive exported' : 'export saved'),
  supportArchiveExportDesktopOnly: 'support archive export is available in the desktop app.',
  supportArchiveImportDesktopOnly: 'support archive import is available in the desktop app.',
  chooseSupportArchiveImport: 'choose a support archive to import.',
  supportArchiveImportCanceled: 'import canceled.',
  supportArchiveMissingAppState: 'support archive import failed: archive did not contain app state.',
  supportArchiveImportFailed: (message?: string) =>
    message ? `support archive import failed: ${message}` : 'support archive import failed.',
  supportArchiveImportCaughtError: (error: unknown) => `support archive import failed: ${unknownMessage(error)}`,
  supportArchiveImported: (summary: ImportBackupSummary, extraWarningCount = 0) => {
    const unresolvedText =
      summary.unresolvedReferences > 0 ? ` ${summary.unresolvedReferences} reference(s) stayed unresolved.` : ''
    return `imported support archive: ${summary.domains} domain(s), ${summary.spaces} space(s), ${summary.tabs} tab(s), ${summary.notes} note(s).${unresolvedText}${warningSuffix(summary.warnings.length + extraWarningCount)}`
  },
  notebookExportBuilding: 'building notebook archive...',
  notebookExportCanceled: 'notebook export canceled',
  notebookExportFailed: (message?: string) => (message ? `notebook export failed: ${message}` : 'notebook export failed'),
  notebookExportSaved: (warningCount: number) => `notebook export saved.${warningSuffix(warningCount)}`,
  notebookExportShared: (warningCount: number) => `notebook export shared.${warningSuffix(warningCount)}`,
  notebookBackupsDesktopOnly: 'notebook backups are available in the desktop app.',
  notebookBackupBuilding: 'building notebook backup...',
  notebookBackupCanceled: 'notebook backup canceled.',
  notebookBackupSkipped: 'notebook backup skipped.',
  notebookBackupSaved: 'notebook backup saved.',
  notebookBackupFailed: (message?: string) => `notebook backup failed: ${message ?? 'unknown error'}`,
  backupFolderSelectionDesktopOnly: 'backup folder selection is available in the desktop app.',
  backupFolderSelectionCanceled: 'backup folder selection canceled.',
  backupFolderUpdated: 'backup folder updated.',
  backupFolderFailed: (message?: string) => `backup folder failed: ${message ?? 'unknown error'}`,
  revealBackupFolderDesktopOnly: 'reveal backup folder is available in the desktop app.',
  revealBackupFolderFailed: (message: string) => `reveal backup folder failed: ${message}`,
  turnOffBackupsDesktopOnly: 'turn off backups is available in the desktop app.',
  backupsTurnedOff: 'automatic backups turned off.',
  turnOffBackupsFailed: (message?: string) => `turn off backups failed: ${message ?? 'unknown error'}`,
  recoveryCopyMobileOnly: 'recovery copy export is available in the mobile and tablet app.',
  recoveryCopyCreating: 'creating recovery copy...',
  recoveryCopyFailed: (message: string) => `recovery copy failed: ${message}`,
  recoveryCopyCreated: (location?: string) => `recovery copy created: ${location}`,
  chooseNotebookImport: 'choose a notebook to import.',
  notebookImportCanceled: 'notebook import canceled.',
  notebookImportFailed: (message?: string) => `notebook import failed${message ? `: ${message}` : '.'}`,
  notebookImportCaughtError: (error: unknown) => `notebook import failed: ${unknownMessage(error)}`,
  notebookImportMissingSourceData: 'notebook import failed: source did not contain file data.',
  notebookImportValidating: 'validating notebook...',
  notebookImportImporting: 'importing notebook...',
  notebookFolderImportDesktopOnly: 'notebook folder import is available in the desktop app.',
  markdownFolderImportDesktopOnly: 'Markdown folder import is available in the desktop app.',
  notebookFolderImportConversionFailed: 'notebook import failed: notebook folder could not be converted.',
  notebookImportReady: (summary: NotebookArchiveSummary, warningCount = 0) =>
    `ready to import notebook: ${formatNotebookArchiveSummary(summary)}.${warningSuffix(warningCount)}`,
  notebookImported: (summary: NotebookImportMergeResult['summary'], materializedWarningCount = 0) => {
    const unresolvedText =
      summary.unresolvedReferences && summary.unresolvedReferences > 0
        ? ` ${summary.unresolvedReferences} reference(s) stayed unresolved.`
        : ''
    const appliedText = summary.appliedScratchpad ? ' scratchpad applied.' : ''
    const warningCount = (summary.warnings?.length ?? 0) + materializedWarningCount
    return `imported notebook: ${summary.domains} domain(s), ${summary.spaces} space(s), ${summary.tabs} tab(s), ${summary.notes} note(s).${appliedText}${unresolvedText}${warningSuffix(warningCount)}`
  },
  userSettingsExportBuilding: 'building user settings export...',
  userSettingsExportCanceled: 'user settings export canceled',
  userSettingsExportFailed: (message?: string) => `user settings export failed${message ? `: ${message}` : ''}`,
  userSettingsExported: 'user settings exported',
  userSettingsShared: 'user settings shared',
  userSettingsImportChooseFile: 'choose an app-settings.json file to import.',
  userSettingsImportChooseNotebookFolder: 'choose a notebook folder to import user settings from.',
  userSettingsImportCanceled: 'user settings import canceled.',
  userSettingsImportFailed: (message?: string) => `user settings import failed${message ? `: ${message}` : '.'}`,
  userSettingsImported: 'user settings imported.',
  userSettingsImportedFromNotebookFolder: 'user settings imported from notebook folder.',
  userSettingsFileStructureError: "The file selected doesn't match our app-settings.json structure.",
  userSettingsFolderStructureError:
    "The folder selected doesn't contain an app-settings.json file that matches this project's structure.",
  userSettingsFolderImportHint: 'Export or copy app-settings.json into that notebook folder, then try again.',
  userSettingsFolderImportDesktopOnly: 'import from notebook folder is available in the desktop app.',
  userSettingsOverwriteConfirm: 'Importing user settings will overwrite current theme, hotkeys, shortcuts, and app preferences. Continue?',
  userSettingsResetConfirm: 'Reset user settings to defaults? Notebook content will not be changed.',
  userSettingsResetCanceled: 'user settings reset canceled.',
  userSettingsResetFailed: (message?: string) => `user settings reset failed: ${message ?? 'unknown error'}`,
  userSettingsResetToDefaults: 'user settings reset to defaults.',
}
