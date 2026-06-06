import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'

const DEFAULT_SLOW_OPERATION_THRESHOLD_MS = 50

function isPerformanceLoggingEnabled(): boolean {
  return Boolean(import.meta.env?.DEV)
}

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function logSlowOperation(label: string, durationMs: number, thresholdMs = DEFAULT_SLOW_OPERATION_THRESHOLD_MS) {
  if (durationMs < thresholdMs) return
  if (isPerformanceLoggingEnabled()) {
    console.warn(`[tabs perf] ${label} took ${durationMs.toFixed(1)}ms`)
  }
  recordDiagnosticEvent('performance', 'slow-operation', {
    level: 'warning',
    durationMs,
    message: label,
    details: {
      label,
      thresholdMs,
    },
  })
}

export function measureSlowOperation<T>(label: string, operation: () => T, thresholdMs = DEFAULT_SLOW_OPERATION_THRESHOLD_MS): T {
  const startedAt = nowMs()
  try {
    return operation()
  } finally {
    logSlowOperation(label, nowMs() - startedAt, thresholdMs)
  }
}

export async function measureSlowAsyncOperation<T>(
  label: string,
  operation: () => Promise<T>,
  thresholdMs = DEFAULT_SLOW_OPERATION_THRESHOLD_MS,
): Promise<T> {
  const startedAt = nowMs()
  try {
    return await operation()
  } finally {
    logSlowOperation(label, nowMs() - startedAt, thresholdMs)
  }
}
