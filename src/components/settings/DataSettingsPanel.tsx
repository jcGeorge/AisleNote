import {
  MAX_AUTO_REMOVE_DAYS,
  MIN_AUTO_REMOVE_DAYS,
} from '../../settings/defaults'
import type {
  DataSettingsSection,
  StorageProfileStatus,
  UserSettingsLocationStatus,
} from '../../types/app'
import type { DataPlatformCapabilities } from '../../platform/data-platform'
import { DataSectionSwitch } from './DataSectionSwitch'

type DataSettingsPanelProps = {
  dataSection: DataSettingsSection
  settingsDaysDraft: string
  exportStatus: string
  importStatus: string
  dataCapabilities: DataPlatformCapabilities
  storageProfileStatus: StorageProfileStatus | null
  userSettingsLocationStatus: UserSettingsLocationStatus | null
  onDataSectionChange: (section: DataSettingsSection) => void
  onAutoRemoveDaysChange: (value: string, commit?: boolean) => void
  onExportUserSettings: () => void
  onImportNotebook: () => void
  onImportUserSettings: () => void
  onImportUserSettingsFromNotebookFolder: () => void
  onRevealUserSettingsFolder: () => void
  onResetUserSettingsFolder: () => void
  onResetUserSettingsToDefaults: () => void
  onCreateNotebook: () => void
  onRenameNotebook: () => void
  onOpenNotebook: () => void
  onSwitchNotebook: (notebookPath: string) => void
  onForgetNotebook: (notebookPath: string) => void
  onMoveStorageProfile: () => void
  onRevealStorageProfile: () => void
  onRetryStorageProfile: () => void
}

function TransferDataSection({
  dataCapabilities,
  exportStatus,
  importStatus,
  onExportUserSettings,
  onImportNotebook,
  onImportUserSettings,
  onImportUserSettingsFromNotebookFolder,
  userSettingsLocationStatus,
  onRevealUserSettingsFolder,
  onResetUserSettingsFolder,
  onResetUserSettingsToDefaults,
}: Pick<
  DataSettingsPanelProps,
  | 'exportStatus'
  | 'importStatus'
  | 'dataCapabilities'
  | 'onExportUserSettings'
  | 'onImportNotebook'
  | 'onImportUserSettings'
  | 'onImportUserSettingsFromNotebookFolder'
  | 'userSettingsLocationStatus'
  | 'onRevealUserSettingsFolder'
  | 'onResetUserSettingsFolder'
  | 'onResetUserSettingsToDefaults'
>) {
  const showCustomSettingsFolder = Boolean(userSettingsLocationStatus && !userSettingsLocationStatus.isDefault)

  return (
    <>
      <p>notebook import:</p>
      <div className="settings-page-actions">
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onImportNotebook}>
          import notebook/markdown
        </button>
      </div>
      <p className="settings-help">
        Import appends remapped Tabs notebook folders or ZIPs and Markdown folders or ZIPs; user settings stay separate.
      </p>
      <p>app settings transfer:</p>
      <div className="settings-page-actions">
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onExportUserSettings}>
          export user settings
        </button>
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onImportUserSettings}>
          import user settings
        </button>
        {dataCapabilities.notebookFolders && (
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onImportUserSettingsFromNotebookFolder}>
            import from notebook folder
          </button>
        )}
      </div>
      <p className="settings-help">User settings are stored in app-settings.json. Importing overwrites current theme, hotkeys, shortcuts, toolbar layouts, and app preferences after confirmation.</p>
      {showCustomSettingsFolder && (
        <div className="storage-profile-card">
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">settings folder</span>
            <code className="storage-profile-path">{userSettingsLocationStatus?.settingsRootPath}</code>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">status</span>
            <span>{userSettingsLocationStatus?.syncStatus ?? 'synced'}</span>
          </div>
          {userSettingsLocationStatus?.error && (
            <p className="settings-help storage-profile-error">{userSettingsLocationStatus.error}</p>
          )}
          <div className="settings-page-actions">
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onRevealUserSettingsFolder}>
              open settings folder
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onResetUserSettingsFolder}>
              use local settings
            </button>
          </div>
        </div>
      )}
      <details>
        <summary>advanced</summary>
        <div className="settings-page-actions">
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onResetUserSettingsToDefaults}>
            reset user settings to defaults
          </button>
        </div>
      </details>
      {exportStatus && <p className="settings-help">{exportStatus}</p>}
      {importStatus && <p className="settings-help">{importStatus}</p>}
    </>
  )
}

function StorageDataSection({
  dataCapabilities,
  storageProfileStatus,
  onCreateNotebook,
  onRenameNotebook,
  onOpenNotebook,
  onSwitchNotebook,
  onForgetNotebook,
  onMoveStorageProfile,
  onRevealStorageProfile,
  onRetryStorageProfile,
}: Pick<
  DataSettingsPanelProps,
  | 'dataCapabilities'
  | 'storageProfileStatus'
  | 'onCreateNotebook'
  | 'onRenameNotebook'
  | 'onOpenNotebook'
  | 'onSwitchNotebook'
  | 'onForgetNotebook'
  | 'onMoveStorageProfile'
  | 'onRevealStorageProfile'
  | 'onRetryStorageProfile'
>) {
  const storageHealth =
    storageProfileStatus?.health ?? (storageProfileStatus?.status === 'error' ? 'error' : 'healthy')
  const storageIssues = storageProfileStatus?.issues ?? []
  const knownNotebooks = storageProfileStatus?.knownNotebooks ?? []
  const activeNotebookPath = storageProfileStatus?.notebookPath ?? storageProfileStatus?.profileRootPath ?? ''
  const showRetry = Boolean(storageProfileStatus && (storageProfileStatus.status === 'error' || storageHealth !== 'healthy'))
  const storageProfileCardClassName = [
    'storage-profile-card',
    storageHealth === 'error' ? 'is-error' : '',
    storageHealth === 'warning' ? 'is-warning' : '',
  ].filter(Boolean).join(' ')

  if (!dataCapabilities.notebookFolders) {
    return (
      <>
        <p>{dataCapabilities.runtime === 'mobile' ? 'local app notebook:' : 'local browser notebook:'}</p>
        <p className="settings-help">
          {dataCapabilities.runtime === 'mobile'
            ? 'Mobile and tablet store notebook content inside this app.'
            : 'Browser stores notebook content in local browser storage.'}
        </p>
        <div className="storage-profile-card">
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">storage</span>
            <span>{dataCapabilities.runtime === 'mobile' ? 'app-private local' : 'browser local'}</span>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">folder controls</span>
            <span>desktop only</span>
          </div>
          <p className="settings-help">
            Live notebook folders, live settings folders, and folder switching are desktop features.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <p>notebook:</p>
      <p className="settings-help">The notebook folder is the named folder that contains this notebook's manifest, notes, and assets.</p>
      <div className={storageProfileCardClassName}>
        <div className="storage-profile-row">
          <label className="settings-hotkey-label" htmlFor="settings-notebook-select">current notebook</label>
          <select
            id="settings-notebook-select"
            className="settings-select-input"
            value={activeNotebookPath}
            onChange={(event) => {
              if (event.target.value && event.target.value !== activeNotebookPath) {
                onSwitchNotebook(event.target.value)
              }
            }}
          >
            {(knownNotebooks.length > 0
              ? knownNotebooks
              : [{
                  notebookPath: activeNotebookPath,
                  notebookName: storageProfileStatus?.notebookName ?? 'desktop notebook unavailable',
                  available: Boolean(activeNotebookPath),
                }]
            ).map((notebook) => (
              <option
                key={notebook.notebookPath}
                value={notebook.notebookPath}
                disabled={!notebook.available}
              >
                {notebook.notebookName}{notebook.available ? '' : ' (missing)'}
              </option>
            ))}
          </select>
        </div>
        {storageProfileStatus?.error && <p className="settings-help storage-profile-error">{storageProfileStatus.error}</p>}
        {storageIssues.length > 0 && (
          <div className="storage-profile-issues" aria-label="notebook folder health issues">
            {storageIssues.map((issue, index) => (
              <p
                key={`${issue.code}-${issue.path ?? index}`}
                className={`settings-help storage-profile-issue ${issue.severity === 'error' ? 'is-error' : 'is-warning'}`}
              >
                {issue.message}
                {issue.path ? ` (${issue.path})` : ''}
              </p>
            ))}
          </div>
        )}
        <div className="settings-page-actions">
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onCreateNotebook}>
            new notebook
          </button>
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onOpenNotebook}>
            open notebook...
          </button>
        </div>
        <details>
          <summary>notebook details</summary>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">notebook folder</span>
            <code className="storage-profile-path">
              {activeNotebookPath || 'desktop notebook folder unavailable'}
            </code>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">status</span>
            <span>{storageProfileStatus ? (storageProfileStatus.status === 'ready' ? 'ready' : 'error') : 'browser local'}</span>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">health</span>
            <span>{storageProfileStatus ? storageHealth : 'local'}</span>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">schema</span>
            <span>{storageProfileStatus?.schemaVersion ?? 'n/a'}</span>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">writable</span>
            <span>{storageProfileStatus ? (storageProfileStatus.canWrite ? 'yes' : 'paused') : 'browser local'}</span>
          </div>
          <div className="settings-page-actions">
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onRenameNotebook}>
              rename
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onMoveStorageProfile}>
              move folder
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onRevealStorageProfile}>
              open notebook folder
            </button>
            {showRetry && (
              <button
                type="button"
                className="btn btn-sm settings-action-btn"
                onClick={onRetryStorageProfile}
              >
                retry
              </button>
            )}
          </div>
          {knownNotebooks.length > 0 && (
            <div className="storage-profile-issues" aria-label="remembered notebooks">
              {knownNotebooks.map((notebook) => (
                <div key={notebook.notebookPath} className="storage-profile-row">
                  <span className="settings-hotkey-label">
                    {notebook.notebookName}{notebook.isActive ? ' (current)' : notebook.available ? '' : ' (missing)'}
                  </span>
                  <code className="storage-profile-path">{notebook.notebookPath}</code>
                  {!notebook.isActive && !notebook.isDefault && (
                    <button
                      type="button"
                      className="btn btn-sm settings-action-btn"
                      onClick={() => onForgetNotebook(notebook.notebookPath)}
                    >
                      remove from list
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
      </div>
    </>
  )
}

function TrashDataSection({
  settingsDaysDraft,
  onAutoRemoveDaysChange,
}: Pick<DataSettingsPanelProps, 'settingsDaysDraft' | 'onAutoRemoveDaysChange'>) {
  return (
    <>
      <p>automatically remove deleted items after:</p>
      <div className="settings-field-row">
        <input
          type="number"
          className="settings-number-input settings-number-input-half"
          min={MIN_AUTO_REMOVE_DAYS}
          max={MAX_AUTO_REMOVE_DAYS}
          step={1}
          value={settingsDaysDraft}
          onChange={(event) => onAutoRemoveDaysChange(event.target.value)}
          onBlur={() => onAutoRemoveDaysChange(settingsDaysDraft, true)}
        />
        <span className="settings-field-suffix">days</span>
      </div>
    </>
  )
}

export function DataSettingsPanel(props: DataSettingsPanelProps) {
  return (
    <div className="settings-section-panel" role="tabpanel">
      <DataSectionSwitch dataSection={props.dataSection} onDataSectionChange={props.onDataSectionChange} />
      {props.dataSection === 'transfer' && <TransferDataSection {...props} />}
      {props.dataSection === 'storage' && <StorageDataSection {...props} />}
      {props.dataSection === 'trash' && <TrashDataSection {...props} />}
    </div>
  )
}
