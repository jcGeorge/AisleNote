import {
  createDiagnosticEntry,
  createDiagnosticSessionId,
  type DiagnosticLogDetails,
  type DiagnosticLogEntry,
  type DiagnosticLogInput,
} from './diagnostic-log'
import { appendDiagnosticLogEntry } from './diagnostic-log-store'

type DiagnosticContext = DiagnosticLogDetails
type DiagnosticContextProvider = () => DiagnosticContext
type DiagnosticCaptureProvider = () => boolean

let contextProvider: DiagnosticContextProvider | null = null
let captureProvider: DiagnosticCaptureProvider | null = null
const diagnosticSessionId = createDiagnosticSessionId()

function getDiagnosticContext(): DiagnosticContext {
  try {
    return contextProvider?.() ?? {}
  } catch {
    return {}
  }
}

export function getDiagnosticSessionId(): string {
  return diagnosticSessionId
}

function isDiagnosticCaptureEnabled(): boolean {
  try {
    return captureProvider?.() !== false
  } catch {
    return true
  }
}

export function configureDiagnosticLogging(
  provider: DiagnosticContextProvider,
  captureEnabledProvider?: DiagnosticCaptureProvider,
): () => void {
  const nextCaptureProvider = captureEnabledProvider ?? null
  contextProvider = provider
  captureProvider = nextCaptureProvider
  return () => {
    if (contextProvider === provider) contextProvider = null
    if (captureProvider === nextCaptureProvider) captureProvider = null
  }
}

export function recordDiagnosticEvent(
  area: string,
  event: string,
  input: DiagnosticLogInput = {},
): DiagnosticLogEntry | null {
  if (!isDiagnosticCaptureEnabled()) return null
  const context = getDiagnosticContext()
  const entry = createDiagnosticEntry({
    sessionId: diagnosticSessionId,
    area,
    event,
    input: {
      ...input,
      details: {
        ...context,
        ...(input.details ?? {}),
      },
    },
  })
  void appendDiagnosticLogEntry(entry)
  return entry
}

export type MainThreadHeartbeat = {
  start: () => void
  stop: () => void
}

type HeartbeatTimerApi = {
  setInterval: (handler: () => void, timeoutMs: number) => unknown
  clearInterval: (timerId: unknown) => void
}

export function createMainThreadHeartbeat({
  record = recordDiagnosticEvent,
  intervalMs = 250,
  stallThresholdMs = 750,
  throttleMs = 60_000,
  timerApi = {
    setInterval: (handler, timeoutMs) => globalThis.setInterval(handler, timeoutMs),
    clearInterval: (timerId) => globalThis.clearInterval(timerId as ReturnType<typeof globalThis.setInterval>),
  },
  now = () => Date.now(),
}: {
  record?: typeof recordDiagnosticEvent
  intervalMs?: number
  stallThresholdMs?: number
  throttleMs?: number
  timerApi?: HeartbeatTimerApi
  now?: () => number
} = {}): MainThreadHeartbeat {
  let timerId: unknown | null = null
  let expectedAt = 0
  let lastRecordedAt = Number.NEGATIVE_INFINITY

  const start = () => {
    if (timerId !== null) return
    expectedAt = now() + intervalMs
    timerId = timerApi.setInterval(() => {
      const current = now()
      const delayMs = current - expectedAt
      if (delayMs >= stallThresholdMs && current - lastRecordedAt >= throttleMs) {
        lastRecordedAt = current
        record('runtime', 'main-thread-stall', {
          level: 'warning',
          durationMs: delayMs,
          details: {
            intervalMs,
            stallThresholdMs,
            throttleMs,
          },
        })
      }
      expectedAt = current + intervalMs
    }, intervalMs)
  }

  const stop = () => {
    if (timerId === null) return
    timerApi.clearInterval(timerId)
    timerId = null
  }

  return { start, stop }
}
