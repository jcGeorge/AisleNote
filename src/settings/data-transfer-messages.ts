type ImportVaultSummary = {
  folders?: number
  notes?: number
  noteBodies?: number
  importedAssets?: number
  unresolvedReferences?: number
  missingAssets?: number
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
  vaultFolderExportDesktopOnly: 'Vault folder export is available in the desktop app.',
  vaultFolderExportPreparing: 'Preparing vault folder export...',
  vaultFolderExportCanceled: 'Vault folder export canceled.',
  vaultFolderExportFailed: (message?: string) => `Vault folder export failed: ${message ?? 'Unknown error.'}`,
  vaultFolderExported: (location?: string) => `Vault folder exported${location ? `: ${location}` : '.'}`,
  chooseVaultImport: 'Choose a vault or Markdown import source.',
  vaultImportCanceled: 'Vault import canceled.',
  vaultImportFailed: (message?: string) => `Vault import failed${message ? `: ${message}` : '.'}`,
  vaultImportCaughtError: (error: unknown) => `Vault import failed: ${unknownMessage(error)}`,
  vaultImportMissingSourceData: 'Vault import failed: source did not contain file data.',
  vaultImportValidating: 'Validating vault...',
  vaultImportImporting: 'Importing vault...',
  vaultFolderImportDesktopOnly: 'Vault folder import is available in the desktop app.',
  markdownFolderImportDesktopOnly: 'Markdown import is available in the desktop app.',
  vaultImported: (summary: ImportVaultSummary, materializedWarningCount = 0) => {
    const unresolvedText =
      summary.unresolvedReferences && summary.unresolvedReferences > 0
        ? ` ${summary.unresolvedReferences} reference(s) stayed unresolved.`
        : ''
    const assetText =
      summary.importedAssets && summary.importedAssets > 0 ? ` ${summary.importedAssets} asset(s) imported.` : ''
    const missingAssetText =
      summary.missingAssets && summary.missingAssets > 0 ? ` ${summary.missingAssets} asset(s) missing.` : ''
    const warningCount = (summary.warnings?.length ?? 0) + materializedWarningCount
    return `Imported vault: ${summary.folders ?? 0} folder(s), ${summary.notes ?? 0} note(s), ${summary.noteBodies ?? 0} note body record(s).${assetText}${unresolvedText}${missingAssetText}${warningSuffix(warningCount)}`
  },
  userSettingsExportBuilding: 'Building user settings export...',
  userSettingsExportCanceled: 'User settings export canceled.',
  userSettingsExportFailed: (message?: string) => `User settings export failed${message ? `: ${message}` : '.'}`,
  userSettingsExported: 'User settings exported.',
  userSettingsShared: 'User settings shared.',
  userSettingsImportChooseFile: 'Choose an app-settings.json file to import.',
  userSettingsImportChooseVaultFolder: 'Choose a vault folder to import user settings from.',
  userSettingsImportCanceled: 'User settings import canceled.',
  userSettingsImportFailed: (message?: string) => `User settings import failed${message ? `: ${message}` : '.'}`,
  userSettingsImported: 'User settings imported.',
  userSettingsImportedFromVaultFolder: 'User settings imported from vault folder.',
  userSettingsFileStructureError: "The file selected doesn't match our app-settings.json structure.",
  userSettingsFolderStructureError:
    "The folder selected doesn't contain an app-settings.json file that matches this project's structure.",
  userSettingsFolderImportHint: 'Export or copy app-settings.json into that vault folder, then try again.',
  userSettingsFolderImportDesktopOnly: 'Import from vault folder is available in the desktop app.',
  userSettingsOverwriteConfirm: 'Importing user settings will overwrite current theme, hotkeys, shortcuts, and app preferences. Continue?',
  userSettingsResetConfirm: 'Reset user settings to defaults? Vault content will not be changed.',
  userSettingsResetCanceled: 'User settings reset canceled.',
  userSettingsResetFailed: (message?: string) => `User settings reset failed: ${message ?? 'Unknown error.'}`,
  userSettingsResetToDefaults: 'User settings reset to defaults.',
}
