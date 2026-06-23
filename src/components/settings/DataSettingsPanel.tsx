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
import type { SyncedUiBooleanSettingKey } from '../../settings/synced-ui-settings-registry.js'
import { DataSectionSwitch } from './DataSectionSwitch'

type DataSettingsPanelProps = {
  dataSection: DataSettingsSection
  settingsDaysDraft: string
  exportStatus: string
  importStatus: string
  dataCapabilities: DataPlatformCapabilities
  storageProfileStatus: StorageProfileStatus | null
  userSettingsLocationStatus: UserSettingsLocationStatus | null
  trashDeleteForRealRequiresConfirmation: boolean
  onDataSectionChange: (section: DataSettingsSection) => void
  onAutoRemoveDaysChange: (value: string, commit?: boolean) => void
  onSyncedUiBooleanSettingChange: (key: SyncedUiBooleanSettingKey, enabled: boolean) => void
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
  onSwitchNotebook: (selector: { notebookId?: string; notebookPath?: string }) => void
  onForgetNotebook: (selector: { notebookId?: string; notebookPath?: string }) => void
  onDeleteNotebook: () => void
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
        Import replaces the current notebook with an AisleNote notebook, notebook ZIP, Markdown folder, or Markdown ZIP; user settings stay separate.
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
  onDeleteNotebook,
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
  | 'onDeleteNotebook'
  | 'onMoveStorageProfile'
  | 'onRevealStorageProfile'
  | 'onRetryStorageProfile'
>) {
  const storageHealth =
    storageProfileStatus?.health ?? (storageProfileStatus?.status === 'ready' ? 'healthy' : 'error')
  const storageIssues = storageProfileStatus?.issues ?? []
  const knownNotebooks = storageProfileStatus?.knownNotebooks ?? []
  const activeNotebookPath = storageProfileStatus?.notebookPath ?? storageProfileStatus?.profileRootPath ?? ''
  const activeNotebookKey = storageProfileStatus?.activeNotebookId ?? activeNotebookPath
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
      <p className="settings-help">
        The notebook is this folder on disk. To use iCloud, Dropbox, OneDrive, or another sync service, store the notebook folder in that synced location.
      </p>
      <div className={storageProfileCardClassName}>
        <div className="storage-profile-row">
          <label className="settings-hotkey-label" htmlFor="settings-notebook-select">current notebook</label>
          <select
            id="settings-notebook-select"
            className="settings-select-input"
            value={activeNotebookKey}
            onChange={(event) => {
              if (event.target.value && event.target.value !== activeNotebookKey) {
                const selected = knownNotebooks.find((notebook) =>
                  (notebook.notebookId ?? notebook.notebookPath) === event.target.value
                )
                onSwitchNotebook({
                  notebookId: selected?.notebookId ?? undefined,
                  notebookPath: selected?.notebookPath ?? event.target.value,
                })
              }
            }}
          >
            {(knownNotebooks.length > 0
              ? knownNotebooks
              : [{
                  notebookPath: activeNotebookPath,
                  notebookName: storageProfileStatus?.notebookName ?? 'desktop notebook unavailable',
                  notebookId: storageProfileStatus?.activeNotebookId,
                  available: Boolean(activeNotebookPath),
                }]
            ).map((notebook) => (
              <option
                key={notebook.notebookId ?? notebook.notebookPath}
                value={notebook.notebookId ?? notebook.notebookPath}
                disabled={!notebook.available}
              >
                {notebook.notebookName}{notebook.available ? '' : ' (folder missing)'}
              </option>
            ))}
          </select>
        </div>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">folder</span>
          <code className="storage-profile-path">
            {activeNotebookPath || 'desktop notebook folder unavailable'}
          </code>
        </div>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">status</span>
          <span>{storageProfileStatus?.status ?? 'browser local'}</span>
        </div>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">writable</span>
          <span>{storageProfileStatus ? (storageProfileStatus.canWrite ? 'yes' : 'paused') : 'browser local'}</span>
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
            <span className="settings-hotkey-label">folder</span>
            <code className="storage-profile-path">
              {activeNotebookPath || 'desktop notebook folder unavailable'}
            </code>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">status</span>
            <span>{storageProfileStatus?.status ?? 'browser local'}</span>
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
            {storageProfileStatus?.activeNotebookId && (
              <button type="button" className="btn btn-sm settings-action-btn" onClick={onDeleteNotebook}>
                delete notebook
              </button>
            )}
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
                <div key={notebook.notebookId ?? notebook.notebookPath} className="storage-profile-row">
                  <span className="settings-hotkey-label">
                    {notebook.notebookName}{notebook.isActive ? ' (current)' : notebook.available ? '' : ' (folder missing)'}
                  </span>
                  <code className="storage-profile-path">{notebook.notebookPath}</code>
                  {!notebook.isActive && (
                    <button
                      type="button"
                      className="btn btn-sm settings-action-btn"
                      onClick={() => onForgetNotebook({
                        notebookId: notebook.notebookId ?? undefined,
                        notebookPath: notebook.notebookPath,
                      })}
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
  trashDeleteForRealRequiresConfirmation,
  onAutoRemoveDaysChange,
  onSyncedUiBooleanSettingChange,
}: Pick<
  DataSettingsPanelProps,
  'settingsDaysDraft' | 'trashDeleteForRealRequiresConfirmation' | 'onAutoRemoveDaysChange' | 'onSyncedUiBooleanSettingChange'
>) {
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
      <div className="settings-hotkey-row">
        <label className="settings-hotkey-label" htmlFor="settings-trash-delete-confirmation">
          confirm delete for real
        </label>
        <div className="form-check form-switch settings-switch">
          <input
            id="settings-trash-delete-confirmation"
            className="form-check-input"
            type="checkbox"
            role="switch"
            checked={trashDeleteForRealRequiresConfirmation}
            onChange={(event) =>
              onSyncedUiBooleanSettingChange('trashDeleteForRealRequiresConfirmation', event.target.checked)
            }
          />
        </div>
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
