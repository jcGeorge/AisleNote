import type { ArrangeDragItem } from '../types/app'
import type { ArrangeDestinationPromptState } from './arrange-guided-prompt'
import type { ArrangeGuidedTransferResolution } from './arrange-guided-transfer'

export type ArrangeDragSession = {
  item: ArrangeDragItem
}

export type ArrangeGuidedCarrySession = {
  prompt: ArrangeDestinationPromptState
}

export type ArrangeInteractionState =
  | { mode: 'idle' }
  | { mode: 'live-drag'; drag: ArrangeDragSession }
  | { mode: 'guided-carry'; carry: ArrangeGuidedCarrySession }

export type ArrangeDropResolution = ArrangeGuidedTransferResolution

export function getArrangeInteractionState(
  draggingItem: ArrangeDragItem | null,
  guidedPrompt: ArrangeDestinationPromptState | null,
): ArrangeInteractionState {
  if (draggingItem) return { mode: 'live-drag', drag: { item: draggingItem } }
  if (guidedPrompt) return { mode: 'guided-carry', carry: { prompt: guidedPrompt } }
  return { mode: 'idle' }
}

export function isArrangeLiveDragActive(interaction: ArrangeInteractionState): boolean {
  return interaction.mode === 'live-drag'
}

export function isArrangeGuidedCarryActive(interaction: ArrangeInteractionState): boolean {
  return interaction.mode === 'guided-carry'
}

export function isArrangeTrashActionActive(interaction: ArrangeInteractionState): boolean {
  return interaction.mode === 'live-drag' || interaction.mode === 'guided-carry'
}

export function areArrangeRailControlsDisabled(interaction: ArrangeInteractionState): boolean {
  return isArrangeTrashActionActive(interaction)
}

export function areNavigationContextMenusDisabled(interaction: ArrangeInteractionState): boolean {
  return interaction.mode === 'live-drag'
}

