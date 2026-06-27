import type { AppState, VaultTreeItem } from '../types/app'

export type IdGenerator = () => string

const MAX_UNIQUE_ID_ATTEMPTS = 100

function createUuidFromRandomValues(cryptoSource: Crypto): string | null {
  if (typeof cryptoSource.getRandomValues !== 'function') return null
  const bytes = new Uint8Array(16)
  cryptoSource.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function createRandomId(): string {
  const cryptoSource = globalThis.crypto
  const uuid = cryptoSource?.randomUUID?.() ?? (cryptoSource ? createUuidFromRandomValues(cryptoSource) : null)
  if (uuid) return uuid
  return `${Date.now()}-${Math.random().toString(36).slice(2, 14)}`
}

export function ensureUniqueId(existingIds: ReadonlySet<string>, generator: IdGenerator = createRandomId): string {
  for (let attempt = 0; attempt < MAX_UNIQUE_ID_ATTEMPTS; attempt += 1) {
    const id = generator()
    if (!existingIds.has(id)) return id
  }
  throw new Error(`Unable to generate a unique id after ${MAX_UNIQUE_ID_ATTEMPTS} attempts.`)
}

export function createReservedIdAllocator(existingIds: Iterable<string>, generator: IdGenerator = createRandomId): IdGenerator {
  const reservedIds = new Set(existingIds)
  return () => {
    const id = ensureUniqueId(reservedIds, generator)
    reservedIds.add(id)
    return id
  }
}

function addId(ids: Set<string>, id: unknown) {
  if (typeof id === 'string' && id) ids.add(id)
}

function collectVaultItemIds(item: VaultTreeItem, ids: Set<string>) {
  addId(ids, item.id)
  if (item.type === 'folder') {
    item.children.forEach((child) => collectVaultItemIds(child, ids))
    return
  }
  addId(ids, item.noteBodyId)
}

export function collectAppNavigationEntityIds(state: AppState): Set<string> {
  const ids = new Set<string>()
  addId(ids, state.vault.activeNoteId)
  state.vault.items.forEach((item) => collectVaultItemIds(item, ids))
  state.vault.deletedItems.forEach((entry) => {
    addId(ids, entry.id)
    collectVaultItemIds(entry.item, ids)
  })
  state.noteBodies.forEach((body) => {
    addId(ids, body.id)
    body.aisles.forEach((aisle) => {
      addId(ids, aisle.id)
      addId(ids, aisle.aisleBodyId)
    })
  })
  state.noteAisleBodies?.forEach((body) => addId(ids, body.id))
  state.frontmatter.templates.forEach((template) => {
    addId(ids, template.id)
    template.fields.forEach((field) => addId(ids, field.id))
  })
  state.ui.toolbarLayouts?.forEach((layout) => {
    addId(ids, layout.id)
    layout.items.forEach((item) => addId(ids, item.id))
  })
  return ids
}
