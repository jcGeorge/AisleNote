import type { TipDefinition, TipId } from '../../tips/tips'

type TipHostProps = {
  tips: TipDefinition[]
  onDismissTip: (tipId: TipId) => void
}

export function TipHost({ tips, onDismissTip }: TipHostProps) {
  if (tips.length === 0) return null

  return (
    <div className="app-tip-layer" aria-live="polite" aria-atomic="false">
      {tips.map((tip) => (
        <section key={tip.id} className="app-tip-card" aria-label={tip.label}>
          <p>{tip.message}</p>
          <button
            type="button"
            className="app-tip-dismiss"
            aria-label={`Dismiss ${tip.label} tip`}
            onClick={() => onDismissTip(tip.id)}
          >
            ×
          </button>
        </section>
      ))}
    </div>
  )
}
