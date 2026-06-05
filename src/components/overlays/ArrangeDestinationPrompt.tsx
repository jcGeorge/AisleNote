import { useEffect } from 'react'

type ArrangeDestinationPromptProps = {
  message: string
  onCancel: () => void
}

export function ArrangeDestinationPrompt({
  message,
  onCancel,
}: ArrangeDestinationPromptProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [onCancel])

  return (
    <div
      className="arrange-destination-layer"
      onPointerDown={(event) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        onCancel()
      }}
    >
      <section
        className="arrange-destination-prompt"
        role="dialog"
        aria-modal="true"
        aria-label={message}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2 className="arrange-destination-title">{message}</h2>
      </section>
    </div>
  )
}
