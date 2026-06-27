import path from 'node:path'

const FALLBACK_VAULT_NAME = 'Vault'
const WINDOWS_RESERVED_NAMES = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  'com1',
  'com2',
  'com3',
  'com4',
  'com5',
  'com6',
  'com7',
  'com8',
  'com9',
  'lpt1',
  'lpt2',
  'lpt3',
  'lpt4',
  'lpt5',
  'lpt6',
  'lpt7',
  'lpt8',
  'lpt9',
])

export function getStorageProfileVaultName(profileRootPath) {
  const name = path.basename(path.resolve(profileRootPath))
  return name || FALLBACK_VAULT_NAME
}

export function validateVaultName(value) {
  const rawName = typeof value === 'string' ? value : ''
  const name = rawName.trim()
  if (!name) return { ok: false, error: 'Vault name is required.' }
  if (rawName !== name) return { ok: false, error: 'Vault name cannot start or end with a space or period.' }
  if (name === '.' || name === '..') return { ok: false, error: 'Vault name is invalid.' }
  if (/[<>:"/\\|?*\u0000-\u001F]/u.test(name)) {
    return { ok: false, error: 'Vault name contains characters that cannot be used in a folder name.' }
  }
  if (/^\./u.test(name) || /\.$/u.test(name)) {
    return { ok: false, error: 'Vault name cannot start or end with a space or period.' }
  }
  const baseName = name.split('.')[0]?.toLowerCase() ?? ''
  if (WINDOWS_RESERVED_NAMES.has(baseName)) {
    return { ok: false, error: 'Vault name is reserved by the operating system.' }
  }
  return { ok: true, name }
}
