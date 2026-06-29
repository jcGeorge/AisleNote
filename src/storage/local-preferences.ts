function getLocalPreferenceStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage
    if (typeof localStorage !== 'undefined') return localStorage
  } catch {
    return null
  }
  return null
}

export function readLocalJsonPreference<T>(
  key: string,
  fallback: T,
  normalize: (value: unknown) => T = (value) => value as T,
): T {
  try {
    const raw = getLocalPreferenceStorage()?.getItem(key)
    if (!raw) return fallback
    return normalize(JSON.parse(raw))
  } catch {
    return fallback
  }
}

export function writeLocalJsonPreference<T>(
  key: string,
  value: T,
  normalize: (value: T) => unknown = (nextValue) => nextValue,
): void {
  try {
    getLocalPreferenceStorage()?.setItem(key, JSON.stringify(normalize(value)))
  } catch {
    // Device-local preferences are best-effort.
  }
}

export function readLocalStringPreference(key: string, fallback = ''): string {
  try {
    return getLocalPreferenceStorage()?.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function writeLocalStringPreference(key: string, value: string): void {
  try {
    getLocalPreferenceStorage()?.setItem(key, value)
  } catch {
    // Device-local preferences are best-effort.
  }
}
