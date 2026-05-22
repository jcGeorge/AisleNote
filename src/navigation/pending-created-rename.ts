import {
  projectActiveDomainState,
  removeDomain,
  removeSpaceFromActiveDomain,
  setActiveDomain,
  setActiveSpaceInActiveDomain,
} from '../state/domains'
import type { AppState, PendingCreatedEdit } from '../types/app'

type PendingCreatedSpaceEdit = Extract<PendingCreatedEdit, { type: 'space' }>
type PendingCreatedDomainEdit = Extract<PendingCreatedEdit, { type: 'domain' }>

export function discardPendingCreatedSpaceEdit(
  state: AppState,
  pending: PendingCreatedSpaceEdit,
): AppState {
  const projected = projectActiveDomainState(state)
  if (!projected.domains.some((domain) => domain.id === pending.sourceDomainId)) return projected

  let next = setActiveDomain(projected, pending.sourceDomainId)
  const activeSource = projectActiveDomainState(next)
  if (!activeSource.spaces.some((space) => space.id === pending.id)) return activeSource

  next = removeSpaceFromActiveDomain(activeSource, pending.id)
  const afterRemove = projectActiveDomainState(next)
  return afterRemove.spaces.some((space) => space.id === pending.previousActiveSpaceId)
    ? setActiveSpaceInActiveDomain(afterRemove, pending.previousActiveSpaceId)
    : afterRemove
}

export function discardPendingCreatedDomainEdit(
  state: AppState,
  pending: PendingCreatedDomainEdit,
): AppState {
  const projected = projectActiveDomainState(state)
  if (!projected.domains.some((domain) => domain.id === pending.id)) return projected

  let next = removeDomain(projected, pending.id)
  const afterRemove = projectActiveDomainState(next)
  if (!afterRemove.domains.some((domain) => domain.id === pending.previousActiveDomainId)) return afterRemove

  next = setActiveDomain(afterRemove, pending.previousActiveDomainId)
  const restoredDomain = projectActiveDomainState(next)
  return restoredDomain.spaces.some((space) => space.id === pending.previousActiveSpaceId)
    ? setActiveSpaceInActiveDomain(restoredDomain, pending.previousActiveSpaceId)
    : restoredDomain
}
