import React from 'react'

void React

type DecoupleCautionStripeProps = {
  label?: string
}

export function DecoupleCautionStripe({ label = 'DE-COUPLED' }: DecoupleCautionStripeProps) {
  return (
    <span className="decouple-caution-stripe" aria-hidden="true">
      <span className="decouple-caution-stripe-text">{label}</span>
    </span>
  )
}
