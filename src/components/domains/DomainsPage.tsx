import type { MouseEvent } from 'react'
import type { Domain } from '../../types/app'

type DomainsPageProps = {
  domains: Domain[]
  activeDomainId: string
  editingDomainId: string | null
  onAddDomain: () => void
  onOpenDomain: (domainId: string) => void
  onCommitRename: (domainId: string, name: string) => void
  onCancelRename: (domainId: string) => void
  onShouldSkipRenameBlur: (domainId: string) => boolean
  onRenameDraftChange: (domainId: string, value: string) => void
  onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, domainId: string) => void
}

export function DomainsPage({
  domains,
  activeDomainId,
  editingDomainId,
  onAddDomain,
  onOpenDomain,
  onCommitRename,
  onCancelRename,
  onShouldSkipRenameBlur,
  onRenameDraftChange,
  onOpenContextMenu,
}: DomainsPageProps) {
  return (
    <section className="spaces-grid-wrap">
      <div className="spaces-grid">
        {domains.map((domain) =>
          editingDomainId === domain.id ? (
            <input
              key={domain.id}
              className="space-rename-input"
              defaultValue={domain.name}
              autoFocus
              onFocus={(event) => onRenameDraftChange(domain.id, event.currentTarget.value)}
              onInput={(event) => onRenameDraftChange(domain.id, event.currentTarget.value)}
              onBlur={(event) => {
                if (onShouldSkipRenameBlur(domain.id)) return
                onCommitRename(domain.id, event.target.value)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onCommitRename(domain.id, event.currentTarget.value)
                  onOpenDomain(domain.id)
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  onCancelRename(domain.id)
                }
              }}
            />
          ) : (
            <button
              key={domain.id}
              type="button"
              className={`space-card ${domain.id === activeDomainId ? 'is-active' : ''}`}
              onClick={() => onOpenDomain(domain.id)}
              onContextMenu={(event) => onOpenContextMenu(event, domain.id)}
            >
              <span className="space-card-name">{domain.name}</span>
            </button>
          ),
        )}
        <button type="button" className="space-card space-card-add" onClick={onAddDomain} aria-label="Add domain">
          +
        </button>
      </div>
    </section>
  )
}
