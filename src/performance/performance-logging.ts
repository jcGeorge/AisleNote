import { recordDiagnosticEvent } from '../diagnostics/diagnostic-logger'

const DEFAULT_SLOW_OPERATION_THRESHOLD_MS = 50
const SLOW_OPERATION_DIAGNOSTIC_THROTTLE_MS = 10_000

type SlowOperationDiagnosticState = {
  recordedAtMs: number
  suppressedCount: number
  maxSuppressedDurationMs: number
}

const slowOperationDiagnosticsByKey = new Map<string, SlowOperationDiagnosticState>()

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
  const currentTime = nowMs()
  const diagnosticKey = `${label}:${thresholdMs}`
  const previousDiagnostic = slowOperationDiagnosticsByKey.get(diagnosticKey)
  if (previousDiagnostic && currentTime - previousDiagnostic.recordedAtMs < SLOW_OPERATION_DIAGNOSTIC_THROTTLE_MS) {
    previousDiagnostic.suppressedCount += 1
    previousDiagnostic.maxSuppressedDurationMs = Math.max(previousDiagnostic.maxSuppressedDurationMs, durationMs)
    return
  }
  const suppressedCount = previousDiagnostic?.suppressedCount ?? 0
  const maxSuppressedDurationMs = previousDiagnostic?.maxSuppressedDurationMs ?? 0
  slowOperationDiagnosticsByKey.set(diagnosticKey, {
    recordedAtMs: currentTime,
    suppressedCount: 0,
    maxSuppressedDurationMs: 0,
  })
  if (isPerformanceLoggingEnabled()) {
    console.warn(`[aislenote perf] ${label} took ${durationMs.toFixed(1)}ms`)
  }
  recordDiagnosticEvent('performance', 'slow-operation', {
    level: 'warning',
    durationMs,
    message: label,
    details: {
      label,
      thresholdMs,
      ...(suppressedCount > 0
        ? {
            suppressedRepeatedDiagnostics: suppressedCount,
            maxSuppressedDurationMs: Number(maxSuppressedDurationMs.toFixed(1)),
          }
        : {}),
    },
  })
}

export function resetSlowOperationDiagnosticRateLimitForTest(): void {
  slowOperationDiagnosticsByKey.clear()
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
