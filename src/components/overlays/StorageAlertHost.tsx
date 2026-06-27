import React from 'react'
import { AppIcon } from '../icons/AppIcon'

export type StorageAlert = {
  signature: string
  label: string
  message: string
  detail?: string
  actionLabel?: string
}

type StorageAlertHostProps = {
  alerts: StorageAlert[]
  onDismissAlert: (signature: string) => void
  onAlertAction?: (signature: string) => void
}

export function StorageAlertHost({ alerts, onDismissAlert, onAlertAction }: StorageAlertHostProps) {
  if (alerts.length === 0) return null

  return (
    <div className="app-tip-layer app-storage-alert-layer" aria-live="assertive" aria-atomic="false">
      {alerts.map((alert) => (
        <section key={alert.signature} className="app-tip-card app-storage-alert-card" role="alert" aria-label={alert.label}>
          <p>{alert.message}</p>
          {alert.detail ? <p className="app-storage-alert-detail">{alert.detail}</p> : null}
          {alert.actionLabel && onAlertAction ? (
            <button
              type="button"
              className="app-storage-alert-action"
              onClick={() => onAlertAction(alert.signature)}
            >
              {alert.actionLabel}
            </button>
          ) : null}
          <button
            type="button"
            className="app-tip-dismiss app-close-button"
            aria-label={`Close ${alert.label}`}
            data-app-tooltip={`Close ${alert.label}`}
            onClick={() => onDismissAlert(alert.signature)}
          >
            <AppIcon iconId="x" className="app-close-button-icon" />
          </button>
        </section>
      ))}
    </div>
  )
}
