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
  onExportNotebook: () => void
  onExportUserSettings: () => void
  onImportNotebook: () => void
  onImportUserSettings: () => void
  onImportUserSettingsFromNotebookFolder: () => void
  onChooseUserSettingsFolder: () => void
  onRevealUserSettingsFolder: () => void
  onRetryUserSettingsSync: () => void
  onResetUserSettingsFolder: () => void
  onResetUserSettingsToDefaults: () => void
  onCreateNotebook: () => void
  onRenameNotebook: () => void
  onSwitchNotebook: () => void
  onMoveStorageProfile: () => void
  onRevealStorageProfile: () => void
  onRetryStorageProfile: () => void
}

function TransferDataSection({
  dataCapabilities,
  exportStatus,
  importStatus,
  onExportNotebook,
  onImportNotebook,
}: Pick<
  DataSettingsPanelProps,
  | 'exportStatus'
  | 'importStatus'
  | 'dataCapabilities'
  | 'onExportNotebook'
  | 'onImportNotebook'
>) {
  return (
    <>
      <p>notebook transfer:</p>
      <div className="settings-page-actions">
        <button
          type="button"
          className="btn btn-sm settings-action-btn"
          onClick={onExportNotebook}
          disabled={!dataCapabilities.notebookFolders}
        >
          export notebook folder
        </button>
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onImportNotebook}>
          import notebook/markdown
        </button>
      </div>
      <p className="settings-help">
        export creates a native notebook folder on desktop. import appends remapped Tabs notebook folders or ZIPs and Markdown folders or ZIPs; user settings stay separate.
      </p>
      {!dataCapabilities.notebookFolders && (
        <p className="settings-help">notebook folder export is desktop only.</p>
      )}
      {exportStatus && <p className="settings-help">{exportStatus}</p>}
      {importStatus && <p className="settings-help">{importStatus}</p>}
    </>
  )
}

function UserSettingsDataSection({
  dataCapabilities,
  exportStatus,
  importStatus,
  userSettingsLocationStatus,
  onExportUserSettings,
  onImportUserSettings,
  onImportUserSettingsFromNotebookFolder,
  onChooseUserSettingsFolder,
  onRevealUserSettingsFolder,
  onRetryUserSettingsSync,
  onResetUserSettingsFolder,
  onResetUserSettingsToDefaults,
}: Pick<
  DataSettingsPanelProps,
  | 'exportStatus'
  | 'importStatus'
  | 'dataCapabilities'
  | 'userSettingsLocationStatus'
  | 'onExportUserSettings'
  | 'onImportUserSettings'
  | 'onImportUserSettingsFromNotebookFolder'
  | 'onChooseUserSettingsFolder'
  | 'onRevealUserSettingsFolder'
  | 'onRetryUserSettingsSync'
  | 'onResetUserSettingsFolder'
  | 'onResetUserSettingsToDefaults'
>) {
  const settingsLocationClassName = [
    'storage-profile-card',
    userSettingsLocationStatus?.status === 'error' ? 'is-error' : '',
    userSettingsLocationStatus?.status === 'warning' ? 'is-warning' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <p>user settings:</p>
      {dataCapabilities.settingsFolders ? (
        <div className={settingsLocationClassName}>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">current settings folder</span>
            <code className="storage-profile-path">
              {userSettingsLocationStatus?.settingsRootPath ?? 'desktop settings folder unavailable'}
            </code>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">status</span>
            <span>{userSettingsLocationStatus?.status ?? 'browser local'}</span>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">sync</span>
            <span>{userSettingsLocationStatus?.syncStatus ?? 'local'}</span>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">settings file</span>
            <code className="storage-profile-path">
              {userSettingsLocationStatus?.settingsPath ?? 'settings/app-settings.json'}
            </code>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">local cache</span>
            <code className="storage-profile-path">
              {userSettingsLocationStatus?.localSettingsPath ?? 'desktop local cache unavailable'}
            </code>
          </div>
          {userSettingsLocationStatus?.error && (
            <p className="settings-help storage-profile-error">{userSettingsLocationStatus.error}</p>
          )}
          <div className="settings-page-actions">
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onChooseUserSettingsFolder}>
              choose settings folder
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onRevealUserSettingsFolder}>
              reveal settings folder
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onRetryUserSettingsSync}>
              retry settings sync
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onResetUserSettingsFolder}>
              reset to local settings
            </button>
          </div>
          <p className="settings-help">
            choose a cloud-synced settings folder to read and write settings/app-settings.json there. notebook folders cannot be used for live user settings.
          </p>
        </div>
      ) : (
        <p className="settings-help">
          {dataCapabilities.runtime === 'mobile'
            ? 'mobile and tablet store live user settings inside this app. transfer settings by exporting or importing app-settings.json.'
            : 'browser stores live user settings with local browser data. transfer settings by downloading or uploading app-settings.json.'}
        </p>
      )}
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
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onResetUserSettingsToDefaults}>
          reset user settings to defaults
        </button>
      </div>
      <p className="settings-help">user settings are stored in app-settings.json. importing overwrites current theme, hotkeys, shortcuts, toolbar layouts, and app preferences after confirmation.</p>
      {exportStatus && <p className="settings-help">{exportStatus}</p>}
      {importStatus && <p className="settings-help">{importStatus}</p>}
    </>
  )
}

function StorageDataSection({
  dataCapabilities,
  exportStatus,
  importStatus,
  storageProfileStatus,
  onCreateNotebook,
  onRenameNotebook,
  onSwitchNotebook,
  onMoveStorageProfile,
  onRevealStorageProfile,
  onRetryStorageProfile,
}: Pick<
  DataSettingsPanelProps,
  | 'exportStatus'
  | 'importStatus'
  | 'dataCapabilities'
  | 'storageProfileStatus'
  | 'onCreateNotebook'
  | 'onRenameNotebook'
  | 'onSwitchNotebook'
  | 'onMoveStorageProfile'
  | 'onRevealStorageProfile'
  | 'onRetryStorageProfile'
>) {
  const storageHealth =
    storageProfileStatus?.health ?? (storageProfileStatus?.status === 'error' ? 'error' : 'healthy')
  const storageIssues = storageProfileStatus?.issues ?? []
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
            ? 'mobile and tablet store notebook content inside this app.'
            : 'browser stores notebook content in local browser storage.'}
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
            live notebook folders, live settings folders, and folder switching are desktop features.
          </p>
        </div>
        {exportStatus && <p className="settings-help">{exportStatus}</p>}
        {importStatus && <p className="settings-help">{importStatus}</p>}
      </>
    )
  }

  return (
    <>
      <p>notebook:</p>
      <p className="settings-help">the notebook folder is the named folder that contains this notebook's manifest, notes, and assets. user settings stay with this app and transfer only through app-settings.json import/export.</p>
      <div className={storageProfileCardClassName}>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">notebook name</span>
          <span>{storageProfileStatus?.notebookName ?? 'desktop notebook unavailable'}</span>
        </div>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">notebook folder</span>
          <code className="storage-profile-path">
            {storageProfileStatus?.notebookPath ?? storageProfileStatus?.profileRootPath ?? 'desktop notebook folder unavailable'}
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
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onRenameNotebook}>
            rename notebook
          </button>
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onSwitchNotebook}>
            switch notebook
          </button>
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onMoveStorageProfile}>
            move notebook folder
          </button>
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onRevealStorageProfile}>
            reveal folder
          </button>
          <button
            type="button"
            className="btn btn-sm settings-action-btn"
            onClick={onRetryStorageProfile}
          >
            retry
          </button>
        </div>
        <p className="settings-help">
          choose a local or cloud-synced notebook folder. Tabs stores notebook content directly inside that folder.
        </p>
      </div>
      {exportStatus && <p className="settings-help">{exportStatus}</p>}
      {importStatus && <p className="settings-help">{importStatus}</p>}
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
      {props.dataSection === 'settings' && <UserSettingsDataSection {...props} />}
      {props.dataSection === 'storage' && <StorageDataSection {...props} />}
      {props.dataSection === 'trash' && <TrashDataSection {...props} />}
    </div>
  )
}
