import { Component, type ErrorInfo, type ReactNode } from 'react'
import type { NoteLocation } from '../../types/app'

export type NoteWorkspaceRecoveryDetails = {
  noteBodyId: string
  activeAisleId: string
  location: NoteLocation
  scratchpadActive: boolean
}

type NoteWorkspaceRecoveryFallbackProps = {
  message?: string
  details: NoteWorkspaceRecoveryDetails
  onRecover: () => void
}

type NoteWorkspaceErrorBoundaryProps = {
  children: ReactNode
  resetKey: string
  details: NoteWorkspaceRecoveryDetails
  onError: (error: Error, info: ErrorInfo) => void
  onRecover: () => void
}

type NoteWorkspaceErrorBoundaryState = {
  error: Error | null
}

export function NoteWorkspaceRecoveryFallback({
  message = 'This note could not be opened.',
  details,
  onRecover,
}: NoteWorkspaceRecoveryFallbackProps) {
  return (
    <section className="note-workspace-recovery" role="alert" aria-label="Note recovery">
      <div className="note-workspace-recovery-panel">
        <div className="note-workspace-recovery-title">{message}</div>
        <div className="note-workspace-recovery-meta">
          note {details.noteBodyId || 'unknown'} / aisle {details.activeAisleId || 'unknown'}
        </div>
        <button type="button" className="btn btn-sm settings-action-btn" onClick={onRecover}>
          open safe note
        </button>
      </div>
    </section>
  )
}

export class NoteWorkspaceErrorBoundary extends Component<
  NoteWorkspaceErrorBoundaryProps,
  NoteWorkspaceErrorBoundaryState
> {
  state: NoteWorkspaceErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): NoteWorkspaceErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError(error, info)
  }

  componentDidUpdate(previousProps: NoteWorkspaceErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <NoteWorkspaceRecoveryFallback
          message="This note could not be rendered."
          details={this.props.details}
          onRecover={this.props.onRecover}
        />
      )
    }

    return this.props.children
  }
}
