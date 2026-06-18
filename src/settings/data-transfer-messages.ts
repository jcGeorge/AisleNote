type ImportNotebookSummary = {
  folders?: number
  notes?: number
  noteBodies?: number
  unresolvedReferences?: number
  warnings?: string[]
}

function warningSuffix(count: number): string {
  return count > 0 ? ` ${count} warning(s).` : ''
}

function unknownMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error.'
}

export const dataTransferMessages = {
  exportBuilding: () => 'Building export...',
  exportCanceled: () => 'Export canceled.',
  exportFailed: () => 'Export failed.',
  exportSaved: () => 'Export saved.',
  notebookFolderExportDesktopOnly: 'Notebook folder export is available in the desktop app.',
  notebookFolderExportPreparing: 'Preparing notebook folder export...',
  notebookFolderExportCanceled: 'Notebook folder export canceled.',
  notebookFolderExportFailed: (message?: string) => `Notebook folder export failed: ${message ?? 'Unknown error.'}`,
  notebookFolderExported: (location?: string) => `Notebook folder exported${location ? `: ${location}` : '.'}`,
  chooseNotebookImport: 'Choose a notebook to import.',
  notebookImportCanceled: 'Notebook import canceled.',
  notebookImportFailed: (message?: string) => `Notebook import failed${message ? `: ${message}` : '.'}`,
  notebookImportCaughtError: (error: unknown) => `Notebook import failed: ${unknownMessage(error)}`,
  notebookImportMissingSourceData: 'Notebook import failed: source did not contain file data.',
  notebookImportValidating: 'Validating notebook...',
  notebookImportImporting: 'Importing notebook...',
  notebookFolderImportDesktopOnly: 'Notebook folder import is available in the desktop app.',
  markdownFolderImportDesktopOnly: 'Markdown folder import is available in the desktop app.',
  notebookImported: (summary: ImportNotebookSummary, materializedWarningCount = 0) => {
    const unresolvedText =
      summary.unresolvedReferences && summary.unresolvedReferences > 0
        ? ` ${summary.unresolvedReferences} reference(s) stayed unresolved.`
        : ''
    const warningCount = (summary.warnings?.length ?? 0) + materializedWarningCount
    return `Imported notebook: ${summary.folders ?? 0} folder(s), ${summary.notes ?? 0} note(s), ${summary.noteBodies ?? 0} note body record(s).${unresolvedText}${warningSuffix(warningCount)}`
  },
  userSettingsExportBuilding: 'Building user settings export...',
  userSettingsExportCanceled: 'User settings export canceled.',
  userSettingsExportFailed: (message?: string) => `User settings export failed${message ? `: ${message}` : '.'}`,
  userSettingsExported: 'User settings exported.',
  userSettingsShared: 'User settings shared.',
  userSettingsImportChooseFile: 'Choose an app-settings.json file to import.',
  userSettingsImportChooseNotebookFolder: 'Choose a notebook folder to import user settings from.',
  userSettingsImportCanceled: 'User settings import canceled.',
  userSettingsImportFailed: (message?: string) => `User settings import failed${message ? `: ${message}` : '.'}`,
  userSettingsImported: 'User settings imported.',
  userSettingsImportedFromNotebookFolder: 'User settings imported from notebook folder.',
  userSettingsFileStructureError: "The file selected doesn't match our app-settings.json structure.",
  userSettingsFolderStructureError:
    "The folder selected doesn't contain an app-settings.json file that matches this project's structure.",
  userSettingsFolderImportHint: 'Export or copy app-settings.json into that notebook folder, then try again.',
  userSettingsFolderImportDesktopOnly: 'Import from notebook folder is available in the desktop app.',
  userSettingsOverwriteConfirm: 'Importing user settings will overwrite current theme, hotkeys, shortcuts, and app preferences. Continue?',
  userSettingsResetConfirm: 'Reset user settings to defaults? Notebook content will not be changed.',
  userSettingsResetCanceled: 'User settings reset canceled.',
  userSettingsResetFailed: (message?: string) => `User settings reset failed: ${message ?? 'Unknown error.'}`,
  userSettingsResetToDefaults: 'User settings reset to defaults.',
}
