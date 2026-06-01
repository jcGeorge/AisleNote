export type StorageAlert = {
  signature: string
  label: string
  message: string
  detail?: string
}

type StorageAlertHostProps = {
  alerts: StorageAlert[]
  onDismissAlert: (signature: string) => void
}

export function StorageAlertHost({ alerts, onDismissAlert }: StorageAlertHostProps) {
  if (alerts.length === 0) return null

  return (
    <div className="app-tip-layer app-storage-alert-layer" aria-live="assertive" aria-atomic="false">
      {alerts.map((alert) => (
        <section key={alert.signature} className="app-tip-card app-storage-alert-card" role="alert" aria-label={alert.label}>
          <p>{alert.message}</p>
          {alert.detail ? <p className="app-storage-alert-detail">{alert.detail}</p> : null}
          <button
            type="button"
            className="app-tip-dismiss"
            aria-label={`Close ${alert.label}`}
            onClick={() => onDismissAlert(alert.signature)}
          >
            ×
          </button>
        </section>
      ))}
    </div>
  )
}
