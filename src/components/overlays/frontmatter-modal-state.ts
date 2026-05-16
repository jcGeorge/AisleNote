import type { FrontmatterRowDraft, ModalState } from '../../types/app'

export function makeFrontmatterRowsManual(rows: FrontmatterRowDraft[]) {
  return rows.map((row) => ({
    ...row,
    computedEnabled: row.computedEnabled ?? row.computed !== 'none',
    computedLocked: Boolean(row.computed !== 'none' || row.computedLocked),
    locked: row.computed !== 'none' || row.locked,
    templateFieldId: undefined,
    derived: false,
  }))
}

export function normalizeFrontmatterModalRows(modal: Extract<ModalState, { type: 'frontmatter-note' }>, rows: FrontmatterRowDraft[]) {
  if (!modal.selectedTemplateId || rows.some((row) => row.derived)) {
    return { ...modal, rows }
  }
  return {
    ...modal,
    selectedTemplateId: '',
    templateDerived: false,
    isTemplateSuggestionDraft: false,
    rows: makeFrontmatterRowsManual(rows),
  }
}
