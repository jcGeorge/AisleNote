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
  onImportVault: () => void
  onImportUserSettings: () => void
  onImportUserSettingsFromVaultFolder: () => void
  onRevealUserSettingsFolder: () => void
  onResetUserSettingsFolder: () => void
  onResetUserSettingsToDefaults: () => void
  onCreateVault: () => void
  onRenameVault: () => void
  onOpenVault: () => void
  onSwitchVault: (selector: { vaultId?: string; vaultPath?: string }) => void
  onForgetVault: (selector: { vaultId?: string; vaultPath?: string }) => void
  onDeleteVault: () => void
  onMoveStorageProfile: () => void
  onRevealStorageProfile: () => void
  onRetryStorageProfile: () => void
}

function TransferDataSection({
  dataCapabilities,
  exportStatus,
  importStatus,
  onExportUserSettings,
  onImportVault,
  onImportUserSettings,
  onImportUserSettingsFromVaultFolder,
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
  | 'onImportVault'
  | 'onImportUserSettings'
  | 'onImportUserSettingsFromVaultFolder'
  | 'userSettingsLocationStatus'
  | 'onRevealUserSettingsFolder'
  | 'onResetUserSettingsFolder'
  | 'onResetUserSettingsToDefaults'
>) {
  const showCustomSettingsFolder = Boolean(userSettingsLocationStatus && !userSettingsLocationStatus.isDefault)

  return (
    <>
      <p>vault import:</p>
      <div className="settings-page-actions">
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onImportVault}>
          import
        </button>
      </div>
      <p className="settings-help">
        Imports add a new folder to the current vault. AisleNote vault files, Markdown folders, and ZIP files import without replacing existing notes.
      </p>
      <p>app settings transfer:</p>
      <div className="settings-page-actions">
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onExportUserSettings}>
          export user settings
        </button>
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onImportUserSettings}>
          import user settings
        </button>
        {dataCapabilities.vaultFolders && (
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onImportUserSettingsFromVaultFolder}>
            import from vault folder
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
  onCreateVault,
  onRenameVault,
  onOpenVault,
  onSwitchVault,
  onForgetVault,
  onDeleteVault,
  onMoveStorageProfile,
  onRevealStorageProfile,
  onRetryStorageProfile,
}: Pick<
  DataSettingsPanelProps,
  | 'dataCapabilities'
  | 'storageProfileStatus'
  | 'onCreateVault'
  | 'onRenameVault'
  | 'onOpenVault'
  | 'onSwitchVault'
  | 'onForgetVault'
  | 'onDeleteVault'
  | 'onMoveStorageProfile'
  | 'onRevealStorageProfile'
  | 'onRetryStorageProfile'
>) {
  const storageHealth =
    storageProfileStatus?.health ?? (storageProfileStatus?.status === 'ready' ? 'healthy' : 'error')
  const storageIssues = storageProfileStatus?.issues ?? []
  const knownVaults = storageProfileStatus?.knownVaults ?? []
  const activeVaultPath = storageProfileStatus?.vaultPath ?? storageProfileStatus?.profileRootPath ?? ''
  const activeVaultKey = storageProfileStatus?.activeVaultId ?? activeVaultPath
  const showRetry = Boolean(storageProfileStatus && (storageProfileStatus.status === 'error' || storageHealth !== 'healthy'))
  const storageProfileCardClassName = [
    'storage-profile-card',
    storageHealth === 'error' ? 'is-error' : '',
    storageHealth === 'warning' ? 'is-warning' : '',
  ].filter(Boolean).join(' ')

  if (!dataCapabilities.vaultFolders) {
    return (
      <>
        <p>{dataCapabilities.runtime === 'mobile' ? 'local app data:' : 'local browser cache:'}</p>
        <p className="settings-help">
          {dataCapabilities.runtime === 'mobile'
            ? 'Mobile and tablet vault storage is not part of this desktop release target.'
            : 'Browser builds use local cache persistence only; desktop vault folders are unsupported.'}
        </p>
        <div className="storage-profile-card">
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">storage</span>
            <span>{dataCapabilities.runtime === 'mobile' ? 'app cache' : 'browser cache'}</span>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">folder controls</span>
            <span>desktop only</span>
          </div>
          <p className="settings-help">
            Live vault folders, live settings folders, and folder switching are desktop features.
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <p>vault:</p>
      <p className="settings-help">
        The vault is this folder on disk. To use iCloud, Dropbox, OneDrive, or another sync service, store the vault folder in that synced location.
      </p>
      <div className={storageProfileCardClassName}>
        <div className="storage-profile-row">
          <label className="settings-hotkey-label" htmlFor="settings-vault-select">Current vault</label>
          <select
            id="settings-vault-select"
            className="settings-select-input"
            value={activeVaultKey}
            onChange={(event) => {
              if (event.target.value && event.target.value !== activeVaultKey) {
                const selected = knownVaults.find((vault) =>
                  (vault.vaultId ?? vault.vaultPath) === event.target.value
                )
                onSwitchVault({
                  vaultId: selected?.vaultId ?? undefined,
                  vaultPath: selected?.vaultPath ?? event.target.value,
                })
              }
            }}
          >
            {(knownVaults.length > 0
              ? knownVaults
              : [{
                  vaultPath: activeVaultPath,
                  vaultName: storageProfileStatus?.vaultName ?? 'desktop vault unavailable',
                  vaultId: storageProfileStatus?.activeVaultId,
                  available: Boolean(activeVaultPath),
                }]
            ).map((vault) => (
              <option
                key={vault.vaultId ?? vault.vaultPath}
                value={vault.vaultId ?? vault.vaultPath}
                disabled={!vault.available}
              >
                {vault.vaultName}{vault.available ? '' : ' (folder missing)'}
              </option>
            ))}
          </select>
        </div>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">folder</span>
          <code className="storage-profile-path">
            {activeVaultPath || 'desktop vault folder unavailable'}
          </code>
        </div>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">status</span>
          <span>{storageProfileStatus?.status ?? 'local cache'}</span>
        </div>
        <div className="storage-profile-row">
          <span className="settings-hotkey-label">writable</span>
          <span>{storageProfileStatus ? (storageProfileStatus.canWrite ? 'yes' : 'paused') : 'local cache'}</span>
        </div>
        {storageProfileStatus?.error && <p className="settings-help storage-profile-error">{storageProfileStatus.error}</p>}
        {storageIssues.length > 0 && (
          <div className="storage-profile-issues" aria-label="vault folder health issues">
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
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onCreateVault}>
            new vault
          </button>
          <button type="button" className="btn btn-sm settings-action-btn" onClick={onOpenVault}>
            open vault...
          </button>
        </div>
        <details>
          <summary>vault details</summary>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">folder</span>
            <code className="storage-profile-path">
              {activeVaultPath || 'desktop vault folder unavailable'}
            </code>
          </div>
          <div className="storage-profile-row">
            <span className="settings-hotkey-label">status</span>
            <span>{storageProfileStatus?.status ?? 'local cache'}</span>
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
            <span>{storageProfileStatus ? (storageProfileStatus.canWrite ? 'yes' : 'paused') : 'local cache'}</span>
          </div>
          <div className="settings-page-actions">
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onRenameVault}>
              rename
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onMoveStorageProfile}>
              move folder
            </button>
            <button type="button" className="btn btn-sm settings-action-btn" onClick={onRevealStorageProfile}>
              open vault folder
            </button>
            {storageProfileStatus?.activeVaultId && (
              <button type="button" className="btn btn-sm settings-action-btn" onClick={onDeleteVault}>
                delete vault
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
          {knownVaults.length > 0 && (
            <div className="storage-profile-issues" aria-label="remembered vaults">
              {knownVaults.map((vault) => (
                <div key={vault.vaultId ?? vault.vaultPath} className="storage-profile-row">
                  <span className="settings-hotkey-label">
                    {vault.vaultName}{vault.isActive ? ' (current)' : vault.available ? '' : ' (folder missing)'}
                  </span>
                  <code className="storage-profile-path">{vault.vaultPath}</code>
                  {!vault.isActive && (
                    <button
                      type="button"
                      className="btn btn-sm settings-action-btn"
                      onClick={() => onForgetVault({
                        vaultId: vault.vaultId ?? undefined,
                        vaultPath: vault.vaultPath,
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
