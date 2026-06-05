import type { ImportNotebookSummary } from '../import/notebook-import'

function warningSuffix(count: number): string {
  return count > 0 ? ` ${count} warning(s).` : ''
}

function unknownMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

export const dataTransferMessages = {
  exportBuilding: () => 'building export...',
  exportCanceled: () => 'export canceled',
  exportFailed: () => 'export failed',
  exportSaved: () => 'export saved',
  notebookFolderExportDesktopOnly: 'notebook folder export is available in the desktop app.',
  notebookFolderExportPreparing: 'preparing notebook folder export...',
  notebookFolderExportCanceled: 'notebook folder export canceled.',
  notebookFolderExportFailed: (message?: string) => `notebook folder export failed: ${message ?? 'unknown error'}`,
  notebookFolderExported: (location?: string) => `notebook folder exported${location ? `: ${location}` : '.'}`,
  chooseNotebookImport: 'choose a notebook to import.',
  notebookImportCanceled: 'notebook import canceled.',
  notebookImportFailed: (message?: string) => `notebook import failed${message ? `: ${message}` : '.'}`,
  notebookImportCaughtError: (error: unknown) => `notebook import failed: ${unknownMessage(error)}`,
  notebookImportMissingSourceData: 'notebook import failed: source did not contain file data.',
  notebookImportValidating: 'validating notebook...',
  notebookImportImporting: 'importing notebook...',
  notebookFolderImportDesktopOnly: 'notebook folder import is available in the desktop app.',
  markdownFolderImportDesktopOnly: 'Markdown folder import is available in the desktop app.',
  notebookImported: (summary: ImportNotebookSummary, materializedWarningCount = 0) => {
    const unresolvedText =
      summary.unresolvedReferences && summary.unresolvedReferences > 0
        ? ` ${summary.unresolvedReferences} reference(s) stayed unresolved.`
        : ''
    const appliedText = summary.scratchpad ? ' scratchpad imported as a tab.' : ''
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
