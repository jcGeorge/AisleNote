import { Schema } from 'prosemirror-model'
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { history, undo } from 'prosemirror-history'
import { describe, expect, it } from 'vitest'
import {
  applyTableControlOperationToView,
  applyTableRangeReorderOperationToView,
  applyTableReorderOperationToView,
  createTableNodeFromSelection,
  getAdjustedRangeMoveIndex,
  getActiveTableContext,
  getActiveTableRange,
  getTableColumnReorderMarkerStyle,
  getTableControlsOverlayPlacement,
  getTableRowReorderMarkerStyle,
  getTableReorderDragDecision,
  getTableSelectionCellClassNames,
  isEditorRootFocused,
  isTableRangeMoveNoop,
  isSelectedTableNode,
  moveTableCellSelectionByEnter,
  moveTableCellSelectionByTab,
  moveSelectedTableBoundaryCaret,
  normalizeTableSelectionRange,
  placeCaretOutsideTableAtCoords,
  placeTableCaretAtCoords,
  replaceSelectedTextWithTable,
  selectFirstTableCellAfterPosition,
  selectTableCellAtPosition,
  selectTableNodeAtPosition,
  type TableControlOperation,
  type TableReorderAxis,
  type TableSelectionRange,
} from './table-editing'
import type { TableControlTargetMode } from '../types/app'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
    hardBreak: { inline: true, group: 'inline', selectable: false },
    thematicBreak: { group: 'block' },
    table: {
      group: 'block',
      content: 'tableHead tableBody',
      attrs: { rawHTML: { default: null } },
    },
    tableHead: {
      content: 'tableRow',
      attrs: { rawHTML: { default: null } },
    },
    tableBody: {
      content: 'tableRow+',
      attrs: { rawHTML: { default: null } },
    },
    tableRow: {
      content: '(tableHeadCell | tableBodyCell)+',
      attrs: { rawHTML: { default: null } },
    },
    tableHeadCell: {
      content: 'paragraph+',
      attrs: {
        align: { default: null },
        className: { default: null },
        rawHTML: { default: null },
        colspan: { default: null },
        extended: { default: null },
      },
      isolating: true,
    },
    tableBodyCell: {
      content: 'paragraph+',
      attrs: {
        align: { default: null },
        className: { default: null },
        rawHTML: { default: null },
        colspan: { default: null },
        rowspan: { default: null },
        extended: { default: null },
      },
      isolating: true,
    },
  },
  marks: {
    link: {
      attrs: { linkUrl: {} },
      inclusive: false,
      toDOM: (mark) => ['a', { href: mark.attrs.linkUrl }, 0],
    },
    strong: {
      toDOM: () => ['strong', 0],
    },
  },
})

function paragraph(text = '') {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function headCell(text: string, align: string | null = null) {
  return schema.nodes.tableHeadCell.create({ align }, paragraph(text))
}

function bodyCell(text: string, align: string | null = null) {
  return schema.nodes.tableBodyCell.create({ align }, paragraph(text))
}

function row(cells: any[]) {
  return schema.nodes.tableRow.create(null, cells)
}

function buildDoc({
  header = ['H1', 'H2'],
  body = [
    ['A1', 'A2'],
    ['B1', 'B2'],
  ],
}: {
  header?: string[]
  body?: string[][]
} = {}) {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(null, [
      schema.nodes.tableHead.create(null, row(header.map((text, index) => headCell(text, index === 0 ? 'left' : null)))),
      schema.nodes.tableBody.create(null, body.map((bodyRow) => row(bodyRow.map((text) => bodyCell(text))))),
    ]),
  ])
}

function buildTableBlock() {
  return buildDoc().child(0)
}

function buildDocWithBlocks(blocks: any[]) {
  return schema.nodes.doc.create(null, blocks)
}

function getTable(doc: any) {
  return doc.childCount > 0 && doc.child(0).type.name === 'table' ? doc.child(0) : null
}

function getFirstTable(doc: any) {
  let found: any | null = null
  doc.descendants((node: any) => {
    if (node?.type?.name !== 'table') return true
    found = node
    return false
  })
  return found
}

function getChildTypes(doc: any) {
  const names: string[] = []
  for (let index = 0; index < doc.childCount; index += 1) {
    names.push(doc.child(index).type.name)
  }
  return names
}

function getFirstTableStart(doc: any) {
  let position = 0
  for (let index = 0; index < doc.childCount; index += 1) {
    const child = doc.child(index)
    if (child.type.name === 'table') return position
    position += child.nodeSize
  }
  throw new Error('expected table')
}

function getBodyRows(table: any) {
  const body = table.child(1)
  const rows: any[] = []
  for (let index = 0; index < body.childCount; index += 1) {
    rows.push(body.child(index))
  }
  return rows
}

function getCellText(table: any, rowIndex: number, columnIndex: number) {
  const rowNode = rowIndex === 0 ? table.child(0).child(0) : table.child(1).child(rowIndex - 1)
  return rowNode.child(columnIndex).textContent
}

function getCellAlign(table: any, rowIndex: number, columnIndex: number) {
  const rowNode = rowIndex === 0 ? table.child(0).child(0) : table.child(1).child(rowIndex - 1)
  return rowNode.child(columnIndex).attrs.align
}

function getCellTextPosition(doc: any, rowIndex: number, columnIndex: number) {
  const table = getTable(doc)
  if (!table) throw new Error('expected table')
  const tableStart = 0
  const tableHead = table.child(0)
  const tableBody = table.child(1)
  let rowNode: any
  let rowStart = tableStart + 2
  if (rowIndex === 0) {
    rowNode = tableHead.child(0)
  } else {
    rowStart = tableStart + 1 + tableHead.nodeSize + 1
    for (let index = 0; index < rowIndex - 1; index += 1) {
      rowStart += tableBody.child(index).nodeSize
    }
    rowNode = tableBody.child(rowIndex - 1)
  }
  let cellStart = rowStart + 1
  for (let index = 0; index < columnIndex; index += 1) {
    cellStart += rowNode.child(index).nodeSize
  }
  return cellStart + 2
}

function createView(doc: any, rowIndex: number, columnIndex: number, options: { withHistory?: boolean } = {}) {
  const view: any = {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, getCellTextPosition(doc, rowIndex, columnIndex)),
      plugins: options.withHistory ? [history()] : [],
    }),
    dispatch(transaction: any) {
      view.state = view.state.apply(transaction)
    },
  }
  return view
}

function createTableSelectionView(doc: any, options: { withHistory?: boolean } = {}) {
  const tableStart = getFirstTableStart(doc)
  const view: any = {
    state: EditorState.create({
      doc,
      selection: NodeSelection.create(doc, tableStart),
      plugins: options.withHistory ? [history()] : [],
    }),
    dispatch(transaction: any) {
      view.state = view.state.apply(transaction)
    },
  }
  return view
}

function createSelectedTextView(doc: any, from = 1, to = doc.content.size - 1) {
  const view: any = {
    state: EditorState.create({
      doc,
      selection: TextSelection.create(doc, from, to),
    }),
    dispatch(transaction: any) {
      view.state = view.state.apply(transaction)
    },
    focus: () => undefined,
  }
  return view
}

function getCellNode(table: any, rowIndex: number, columnIndex: number) {
  const rowNode = rowIndex === 0 ? table.child(0).child(0) : table.child(1).child(rowIndex - 1)
  return rowNode.child(columnIndex)
}

function getCellParagraph(table: any, rowIndex: number, columnIndex: number) {
  return getCellNode(table, rowIndex, columnIndex).child(0)
}

function expectSelectionInCell(view: any, rowIndex: number, columnIndex: number) {
  expect(view.state.selection.from).toBe(getCellTextPosition(view.state.doc, rowIndex, columnIndex))
}

function applyOperation(
  operation: TableControlOperation,
  rowIndex: number,
  columnIndex: number,
  doc = buildDoc(),
  targetMode: TableControlTargetMode = 'active-cell',
) {
  const view = createView(doc, rowIndex, columnIndex)
  expect(applyTableControlOperationToView(view, operation, targetMode)).toBe(true)
  return view.state.doc
}

function applyOperationView(
  operation: TableControlOperation,
  rowIndex: number,
  columnIndex: number,
  doc = buildDoc(),
  targetMode: TableControlTargetMode = 'active-cell',
) {
  const view = createView(doc, rowIndex, columnIndex)
  expect(applyTableControlOperationToView(view, operation, targetMode)).toBe(true)
  return view
}

function applyReorder(
  axis: TableReorderAxis,
  sourceIndex: number,
  insertIndex: number,
  rowIndex: number,
  columnIndex: number,
  doc = buildDoc({ header: ['H1', 'H2', 'H3'], body: [['A1', 'A2', 'A3'], ['B1', 'B2', 'B3']] }),
) {
  const view = createView(doc, rowIndex, columnIndex)
  expect(applyTableReorderOperationToView(view, axis, sourceIndex, insertIndex)).toBe(true)
  return view.state.doc
}

function applyRangeReorder(
  axis: TableReorderAxis,
  sourceStart: number,
  sourceEnd: number,
  insertIndex: number,
  rowIndex: number,
  columnIndex: number,
  doc = buildDoc({
    header: ['H1', 'H2', 'H3', 'H4'],
    body: [
      ['A1', 'A2', 'A3', 'A4'],
      ['B1', 'B2', 'B3', 'B4'],
      ['C1', 'C2', 'C3', 'C4'],
    ],
  }),
) {
  const view = createView(doc, rowIndex, columnIndex)
  expect(applyTableRangeReorderOperationToView(view, axis, sourceStart, sourceEnd, insertIndex)).toBe(true)
  return view.state.doc
}

describe('table editing controls', () => {
  it('detects the active table cell context', () => {
    const view = createView(buildDoc(), 2, 1)
    const context = getActiveTableContext(view)

    expect(context).toMatchObject({
      rowIndex: 2,
      bodyRowIndex: 1,
      columnIndex: 1,
      columnCount: 2,
      bodyRowCount: 2,
      inHeader: false,
    })
  })

  it('adds a column after the active column', () => {
    const table = getTable(applyOperation('add-column', 1, 0))

    expect(table.child(0).child(0).childCount).toBe(3)
    expect(getBodyRows(table)[0].childCount).toBe(3)
    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 0, 1)).toBe('')
    expect(getCellText(table, 0, 2)).toBe('H2')
  })

  it('keeps active-cell mode scoped to the active row or column', () => {
    const addedRowTable = getTable(applyOperation('add-row', 0, 0, buildDoc(), 'active-cell'))
    const removedColumnTable = getTable(applyOperation('remove-column', 1, 0, buildDoc(), 'active-cell'))

    expect(getCellText(addedRowTable, 1, 0)).toBe('')
    expect(getCellText(addedRowTable, 2, 0)).toBe('A1')
    expect(getCellText(removedColumnTable, 0, 0)).toBe('H2')
  })

  it('applies table controls to an explicit source context instead of the active table', () => {
    const firstTable = buildTableBlock()
    const spacer = paragraph('between')
    const secondTable = buildTableBlock()
    const doc = buildDocWithBlocks([firstTable, spacer, secondTable])
    const view = createView(doc, 1, 0)
    const firstTableContext = getActiveTableContext(view)
    const secondTableStart = firstTable.nodeSize + spacer.nodeSize
    const secondTableCellPosition = secondTableStart + getCellTextPosition(buildDoc(), 1, 0)

    view.state = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, secondTableCellPosition)))

    expect(firstTableContext?.tableStart).toBe(0)
    expect(getActiveTableContext(view)?.tableStart).toBe(secondTableStart)
    expect(applyTableControlOperationToView(view, 'add-column', 'active-cell', firstTableContext)).toBe(true)

    const updatedFirstTable = view.state.doc.child(0)
    const updatedSecondTable = view.state.doc.child(2)
    expect(updatedFirstTable.child(0).child(0).childCount).toBe(3)
    expect(updatedSecondTable.child(0).child(0).childCount).toBe(2)
    expect(getActiveTableContext(view)).toMatchObject({ tableStart: 0, rowIndex: 1, columnIndex: 0 })
  })

  it('keeps the caret in the source cell after adding rows or columns', () => {
    const addedColumnView = applyOperationView('add-column', 1, 0)
    const addedRowView = applyOperationView('add-row', 1, 0)

    expectSelectionInCell(addedColumnView, 1, 0)
    expect(getActiveTableContext(addedColumnView)).toMatchObject({ rowIndex: 1, columnIndex: 0 })
    expectSelectionInCell(addedRowView, 1, 0)
    expect(getActiveTableContext(addedRowView)).toMatchObject({ rowIndex: 1, columnIndex: 0 })
  })

  it('adds at the table edge without moving the caret in bottom-right mode', () => {
    const addedColumnView = applyOperationView('add-column', 1, 0, buildDoc(), 'bottom-right')
    const addedRowView = applyOperationView('add-row', 1, 0, buildDoc(), 'bottom-right')

    expect(getCellText(getTable(addedColumnView.state.doc), 0, 2)).toBe('')
    expectSelectionInCell(addedColumnView, 1, 0)
    expect(getCellText(getTable(addedRowView.state.doc), 3, 0)).toBe('')
    expectSelectionInCell(addedRowView, 1, 0)
  })

  it('removes at the table edge without moving the caret when the source cell survives', () => {
    const removedColumnView = applyOperationView('remove-column', 1, 0, buildDoc(), 'bottom-right')
    const removedRowView = applyOperationView('remove-row', 1, 0, buildDoc(), 'bottom-right')

    expect(getCellText(getTable(removedColumnView.state.doc), 1, 0)).toBe('A1')
    expectSelectionInCell(removedColumnView, 1, 0)
    expect(getCellText(getTable(removedRowView.state.doc), 1, 0)).toBe('A1')
    expectSelectionInCell(removedRowView, 1, 0)
  })

  it('adds a row at the table bottom in bottom-right mode', () => {
    const table = getTable(applyOperation('add-row', 0, 0, buildDoc(), 'bottom-right'))

    expect(getBodyRows(table)).toHaveLength(3)
    expect(getCellText(table, 1, 0)).toBe('A1')
    expect(getCellText(table, 2, 0)).toBe('B1')
    expect(getCellText(table, 3, 0)).toBe('')
  })

  it('adds a column at the table right edge in bottom-right mode', () => {
    const table = getTable(applyOperation('add-column', 1, 0, buildDoc(), 'bottom-right'))

    expect(table.child(0).child(0).childCount).toBe(3)
    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 0, 1)).toBe('H2')
    expect(getCellText(table, 0, 2)).toBe('')
  })

  it('removes the bottom row in bottom-right mode', () => {
    const table = getTable(applyOperation('remove-row', 0, 0, buildDoc(), 'bottom-right'))

    expect(getBodyRows(table)).toHaveLength(1)
    expect(getCellText(table, 1, 0)).toBe('A1')
  })

  it('removes the rightmost column in bottom-right mode', () => {
    const table = getTable(applyOperation('remove-column', 1, 0, buildDoc(), 'bottom-right'))

    expect(table.child(0).child(0).childCount).toBe(1)
    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 1, 0)).toBe('A1')
  })

  it('removes a column normally', () => {
    const table = getTable(applyOperation('remove-column', 1, 0))

    expect(table.child(0).child(0).childCount).toBe(1)
    expect(getCellText(table, 0, 0)).toBe('H2')
    expect(getCellText(table, 1, 0)).toBe('A2')
  })

  it('deletes the table when removing the only column', () => {
    const doc = buildDoc({ header: ['H1'], body: [['A1']] })
    const nextDoc = applyOperation('remove-column', 1, 0, doc)

    expect(getTable(nextDoc)).toBeNull()
  })

  it('adds a body row after the active row', () => {
    const table = getTable(applyOperation('add-row', 1, 0))

    expect(getBodyRows(table)).toHaveLength(3)
    expect(getCellText(table, 1, 0)).toBe('A1')
    expect(getCellText(table, 2, 0)).toBe('')
    expect(getCellText(table, 3, 0)).toBe('B1')
  })

  it('removes a body row normally', () => {
    const table = getTable(applyOperation('remove-row', 1, 0))

    expect(getBodyRows(table)).toHaveLength(1)
    expect(getCellText(table, 1, 0)).toBe('B1')
  })

  it('keeps a one-row table when removing the only body row', () => {
    const doc = buildDoc({ header: ['H1', 'H2'], body: [['A1', 'A2']] })
    const nextDoc = applyOperation('remove-row', 1, 0, doc)
    const table = getTable(nextDoc)

    expect(table).not.toBeNull()
    expect(getBodyRows(table)).toHaveLength(0)
    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 0, 1)).toBe('H2')
  })

  it('adds a body row from a one-row table', () => {
    const doc = buildDoc({ header: ['H1', 'H2'], body: [] })
    const table = getTable(applyOperation('add-row', 0, 0, doc))

    expect(getBodyRows(table)).toHaveLength(1)
    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 1, 0)).toBe('')
  })

  it('deletes the table when removing the only visual row', () => {
    const doc = buildDoc({ header: ['H1', 'H2'], body: [] })
    const nextDoc = applyOperation('remove-row', 0, 0, doc)

    expect(getTable(nextDoc)).toBeNull()
  })

  it('promotes the first body row when removing the header row', () => {
    const table = getTable(applyOperation('remove-row', 0, 0))

    expect(getCellText(table, 0, 0)).toBe('A1')
    expect(getCellText(table, 0, 1)).toBe('A2')
    expect(getCellText(table, 1, 0)).toBe('B1')
  })

  it('keeps a promoted one-row table when removing the header from a two-row table', () => {
    const doc = buildDoc({ header: ['H1', 'H2'], body: [['A1', 'A2']] })
    const table = getTable(applyOperation('remove-row', 0, 0, doc))

    expect(getBodyRows(table)).toHaveLength(0)
    expect(getCellText(table, 0, 0)).toBe('A1')
    expect(getCellText(table, 0, 1)).toBe('A2')
  })

  it('keeps compatible cell alignment when replacing rows', () => {
    const table = getTable(applyOperation('remove-row', 0, 0))

    expect(getCellAlign(table, 0, 0)).toBeNull()
  })

  it('places row controls top-right and column controls bottom-right', () => {
    const tableRect = { top: 80, left: 120, width: 220, height: 72 }

    expect(getTableControlsOverlayPlacement(tableRect, 1000, 800)).toMatchObject({
      visible: true,
      columnTop: 156,
      columnLeft: 284,
      rowTop: 80,
      rowLeft: 344,
    })
  })

  it('keeps table-edge controls stable across active cells in the same table', () => {
    const topLeftCell = { top: 80, left: 120, width: 55, height: 24 }
    const bottomRightCell = { top: 128, left: 285, width: 55, height: 24 }
    const tableRect = { top: 80, left: 120, width: 220, height: 72 }

    expect(getTableControlsOverlayPlacement(tableRect, 1000, 800)).toEqual(
      getTableControlsOverlayPlacement(
        {
          top: Math.min(topLeftCell.top, bottomRightCell.top),
          left: Math.min(topLeftCell.left, bottomRightCell.left),
          width: tableRect.width,
          height: tableRect.height,
        },
        1000,
        800,
      ),
    )
  })

  it('keeps controls outside the table when there is no room right', () => {
    const tableRect = { top: 18, left: 60, width: 72, height: 72 }

    expect(getTableControlsOverlayPlacement(tableRect, 150, 240)).toMatchObject({
      visible: true,
      columnTop: 94,
      rowTop: 18,
      rowLeft: 30,
    })
  })

  it('classifies table reorder drags by dominant movement axis', () => {
    expect(getTableReorderDragDecision(1, 1)).toEqual({ shouldSuppressSelection: false, axis: null })
    expect(getTableReorderDragDecision(3, 12)).toEqual({ shouldSuppressSelection: false, axis: null })
    expect(getTableReorderDragDecision(10, 18)).toEqual({ shouldSuppressSelection: false, axis: null })
    expect(getTableReorderDragDecision(8, 22)).toEqual({ shouldSuppressSelection: true, axis: 'row' })
    expect(getTableReorderDragDecision(22, 8)).toEqual({ shouldSuppressSelection: true, axis: 'column' })
    expect(getTableReorderDragDecision(22, 14)).toEqual({ shouldSuppressSelection: false, axis: null })
  })

  it('normalizes table cell, row, and column selections to rectangular ranges', () => {
    const cellSelection: TableSelectionRange = {
      tableStart: 0,
      mode: 'cells',
      anchorRow: 2,
      anchorColumn: 1,
      headRow: 0,
      headColumn: 3,
    }
    const rowSelection: TableSelectionRange = {
      tableStart: 0,
      mode: 'rows',
      anchorRow: 3,
      anchorColumn: 2,
      headRow: 1,
      headColumn: 0,
    }
    const columnSelection: TableSelectionRange = {
      tableStart: 0,
      mode: 'columns',
      anchorRow: 3,
      anchorColumn: 2,
      headRow: 1,
      headColumn: 0,
    }

    expect(normalizeTableSelectionRange(cellSelection, 4, 4)).toMatchObject({
      mode: 'cells',
      rowStart: 0,
      rowEnd: 2,
      columnStart: 1,
      columnEnd: 3,
    })
    expect(normalizeTableSelectionRange(rowSelection, 4, 4)).toMatchObject({
      mode: 'rows',
      rowStart: 1,
      rowEnd: 3,
      columnStart: 0,
      columnEnd: 3,
    })
    expect(normalizeTableSelectionRange(columnSelection, 4, 4)).toMatchObject({
      mode: 'columns',
      rowStart: 0,
      rowEnd: 3,
      columnStart: 0,
      columnEnd: 2,
    })
  })

  it('computes selected table cell boundary classes', () => {
    const selection: TableSelectionRange = {
      tableStart: 0,
      mode: 'cells',
      anchorRow: 1,
      anchorColumn: 1,
      headRow: 2,
      headColumn: 2,
    }

    expect(getTableSelectionCellClassNames(selection, 0, 0, 4, 4)).toEqual([])
    expect(getTableSelectionCellClassNames(selection, 1, 1, 4, 4)).toEqual([
      'table-selected-cell',
      'table-selected-cells-cell',
      'table-selected-cell-top',
      'table-selected-cell-left',
    ])
    expect(getTableSelectionCellClassNames(selection, 2, 2, 4, 4)).toEqual([
      'table-selected-cell',
      'table-selected-cells-cell',
      'table-selected-cell-bottom',
      'table-selected-cell-right',
    ])
  })

  it('adjusts range move indexes and detects no-op range drops', () => {
    expect(getAdjustedRangeMoveIndex(1, 2, 4)).toBe(2)
    expect(getAdjustedRangeMoveIndex(2, 3, 0)).toBe(0)
    expect(isTableRangeMoveNoop(1, 2, 1)).toBe(true)
    expect(isTableRangeMoveNoop(1, 2, 3)).toBe(true)
    expect(isTableRangeMoveNoop(1, 2, 4)).toBe(false)
  })

  it('extends and nudges table row reorder markers away from the table edge', () => {
    expect(getTableRowReorderMarkerStyle({ top: 80, left: 120, width: 220, height: 72 }, 96)).toEqual({
      width: '230px',
      height: '',
      transform: 'translate(110px, 98px) translateY(-50%)',
    })
  })

  it('extends and nudges table column reorder markers away from the table edge', () => {
    expect(getTableColumnReorderMarkerStyle({ top: 80, left: 120, width: 220, height: 72 }, 176)).toEqual({
      width: '',
      height: '82px',
      transform: 'translate(178px, 70px) translateX(-50%)',
    })
  })

  it('places the caret at a coordinate-mapped table cell position', () => {
    const doc = buildDoc()
    const targetPosition = getCellTextPosition(doc, 2, 1)
    const view = createView(doc, 1, 0) as any
    view.posAtCoords = () => ({ pos: targetPosition })

    expect(placeTableCaretAtCoords(view, { left: 120, top: 80 })).toBe(true)
    expect(view.state.selection.from).toBe(targetPosition)
  })

  it('does not place a table caret when coordinates miss the table', () => {
    const view = createView(buildDoc(), 1, 0) as any
    view.posAtCoords = () => null

    expect(placeTableCaretAtCoords(view, { left: 120, top: 80 })).toBe(false)
  })

  it('selects a table cell by table position without adding history', () => {
    const view = createView(buildDoc(), 1, 0) as any

    expect(selectTableCellAtPosition(view, 0, 2, 1)).toBe(true)
    expect(view.state.selection.from).toBe(getCellTextPosition(view.state.doc, 2, 1))
    expect(getActiveTableContext(view)).toMatchObject({ tableStart: 0, rowIndex: 2, columnIndex: 1 })
  })

  it('requires browser focus inside the editor root before showing table controls', () => {
    const activeElement = { id: 'cell' }
    const root = {
      ownerDocument: { activeElement },
      contains: (node: unknown) => node === activeElement,
    }

    expect(isEditorRootFocused(root)).toBe(true)
    expect(isEditorRootFocused(root, { id: 'outside' })).toBe(false)
    expect(isEditorRootFocused(null, activeElement)).toBe(false)
  })

  it('selects the whole table node for explicit table actions', () => {
    const view = createView(buildDoc(), 1, 0)

    expect(selectTableNodeAtPosition(view, 0)).toBe(true)
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect(view.state.selection.from).toBe(0)
    expect((view.state.selection as NodeSelection).node.type.name).toBe('table')
  })

  it('detects when a specific table node is selected', () => {
    const view = createView(buildDoc(), 1, 0)

    expect(isSelectedTableNode(view)).toBe(false)
    expect(selectTableNodeAtPosition(view, 0)).toBe(true)
    expect(isSelectedTableNode(view)).toBe(true)
    expect(isSelectedTableNode(view, 0)).toBe(true)
    expect(isSelectedTableNode(view, 1)).toBe(false)
  })

  it('repairs a stuck table selection to an outside coordinate', () => {
    const table = buildTableBlock()
    const doc = buildDocWithBlocks([table, paragraph('after')])
    const view = createView(doc, 1, 0) as any
    const range = getActiveTableRange(view)
    const targetPosition = table.nodeSize + 1
    view.posAtCoords = () => ({ pos: targetPosition })

    expect(range).not.toBeNull()
    expect(placeCaretOutsideTableAtCoords(view, { left: 120, top: 240 }, range!)).toBe(true)
    expect(view.state.selection).toBeInstanceOf(TextSelection)
    expect(view.state.selection.from).toBe(targetPosition)
  })

  it('does not repair a table exit click after native selection already left the table', () => {
    const table = buildTableBlock()
    const doc = buildDocWithBlocks([table, paragraph('after')])
    const view = createView(doc, 1, 0) as any
    const range = getActiveTableRange(view)
    const targetPosition = table.nodeSize + 1
    view.state = view.state.apply(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetPosition)))
    view.posAtCoords = () => ({ pos: targetPosition })

    expect(range).not.toBeNull()
    expect(placeCaretOutsideTableAtCoords(view, { left: 120, top: 240 }, range!)).toBe(false)
    expect(view.state.selection.from).toBe(targetPosition)
  })

  it('does not repair a table exit click when coordinates still resolve inside the table', () => {
    const table = buildTableBlock()
    const doc = buildDocWithBlocks([table, paragraph('after')])
    const view = createView(doc, 1, 0) as any
    const range = getActiveTableRange(view)
    view.posAtCoords = () => ({ pos: getCellTextPosition(doc, 1, 0) })

    expect(range).not.toBeNull()
    expect(placeCaretOutsideTableAtCoords(view, { left: 120, top: 240 }, range!)).toBe(false)
  })

  it('can repair a table exit click from an outside DOM target when coordinate mapping is stale', () => {
    const table = buildTableBlock()
    const doc = buildDocWithBlocks([table, paragraph('after')])
    const view = createView(doc, 1, 0) as any
    const range = getActiveTableRange(view)
    const paragraphTarget = {
      closest: (selector: string) => {
        if (selector === 'table') return null
        return selector.includes('p') ? paragraphTarget : null
      },
    } as Element
    view.posAtCoords = () => ({ pos: getCellTextPosition(doc, 1, 0) })
    view.dom = { contains: (target: Element) => target === paragraphTarget }
    view.posAtDOM = () => table.nodeSize

    expect(range).not.toBeNull()
    expect(placeCaretOutsideTableAtCoords(view, { left: 120, top: 240 }, range!, paragraphTarget)).toBe(true)
    expect(view.state.selection.from).toBe(table.nodeSize + 1)
  })

  it('moves after a selected table by inserting a following paragraph when needed', () => {
    const view = createTableSelectionView(buildDoc())
    const tableSize = view.state.doc.child(0).nodeSize

    expect(moveSelectedTableBoundaryCaret(view, 'after')).toBe(true)
    expect(getChildTypes(view.state.doc)).toEqual(['table', 'paragraph'])
    expect(view.state.selection).toBeInstanceOf(TextSelection)
    expect(view.state.selection.from).toBe(tableSize + 1)
  })

  it('moves before a selected table by inserting a preceding paragraph when needed', () => {
    const view = createTableSelectionView(buildDoc())

    expect(moveSelectedTableBoundaryCaret(view, 'before')).toBe(true)
    expect(getChildTypes(view.state.doc)).toEqual(['paragraph', 'table'])
    expect(view.state.selection).toBeInstanceOf(TextSelection)
    expect(view.state.selection.from).toBe(1)
  })

  it('uses existing adjacent paragraphs instead of duplicating them', () => {
    const table = buildTableBlock()
    const before = paragraph('before')
    const after = paragraph('after')
    const viewBefore = createTableSelectionView(buildDocWithBlocks([before, table]))
    const viewAfter = createTableSelectionView(buildDocWithBlocks([table, after]))

    expect(moveSelectedTableBoundaryCaret(viewBefore, 'before')).toBe(true)
    expect(getChildTypes(viewBefore.state.doc)).toEqual(['paragraph', 'table'])
    expect(viewBefore.state.selection.from).toBe(before.nodeSize - 1)

    expect(moveSelectedTableBoundaryCaret(viewAfter, 'after')).toBe(true)
    expect(getChildTypes(viewAfter.state.doc)).toEqual(['table', 'paragraph'])
    expect(viewAfter.state.selection.from).toBe(table.nodeSize + 1)
  })

  it('moves from the end of a paragraph directly into the first cell of the next table', () => {
    const before = paragraph('before')
    const table = buildTableBlock()
    const doc = buildDocWithBlocks([before, table])
    const view: any = {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, before.nodeSize - 1),
      }),
      dispatch(transaction: any) {
        view.state = view.state.apply(transaction)
      },
      focus: () => undefined,
    }

    expect(moveSelectedTableBoundaryCaret(view, 'after')).toBe(true)
    expect(getChildTypes(view.state.doc)).toEqual(['paragraph', 'table'])
    expect(view.state.selection.from).toBe(before.nodeSize + getCellTextPosition(buildDoc(), 0, 0))
  })

  it('moves from the start of a paragraph directly into the last cell of the previous table', () => {
    const table = buildTableBlock()
    const after = paragraph('after')
    const doc = buildDocWithBlocks([table, after])
    const view: any = {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, table.nodeSize + 1),
      }),
      dispatch(transaction: any) {
        view.state = view.state.apply(transaction)
      },
      focus: () => undefined,
    }

    expect(moveSelectedTableBoundaryCaret(view, 'before')).toBe(true)
    expect(getChildTypes(view.state.doc)).toEqual(['table', 'paragraph'])
    expect(view.state.selection.from).toBe(getCellTextPosition(buildDoc(), 2, 1))
  })

  it('inserts a paragraph between a selected table and adjacent non-text blocks', () => {
    const table = buildTableBlock()
    const rule = schema.nodes.thematicBreak.create()
    const afterView = createTableSelectionView(buildDocWithBlocks([table, rule]))
    const beforeView = createTableSelectionView(buildDocWithBlocks([rule, table]))

    expect(moveSelectedTableBoundaryCaret(afterView, 'after')).toBe(true)
    expect(getChildTypes(afterView.state.doc)).toEqual(['table', 'paragraph', 'thematicBreak'])

    expect(moveSelectedTableBoundaryCaret(beforeView, 'before')).toBe(true)
    expect(getChildTypes(beforeView.state.doc)).toEqual(['thematicBreak', 'paragraph', 'table'])
  })

  it('ignores non-table selections for table boundary movement', () => {
    const view = createView(buildDoc(), 1, 0)

    expect(moveSelectedTableBoundaryCaret(view, 'after')).toBe(false)
  })

  it('records inserted table boundary paragraphs in ProseMirror history', () => {
    const view = createTableSelectionView(buildDoc(), { withHistory: true })
    const before = view.state.doc.toJSON()

    expect(moveSelectedTableBoundaryCaret(view, 'after')).toBe(true)
    expect(view.state.doc.toJSON()).not.toEqual(before)
    expect(undo(view.state, view.dispatch, view)).toBe(true)
    expect(view.state.doc.toJSON()).toEqual(before)
  })

  it('moves table tab navigation forward within a row', () => {
    const view = createView(buildDoc(), 1, 0)

    expect(moveTableCellSelectionByTab(view, 'forward')).toEqual({ handled: true, changed: false })
    expectSelectionInCell(view, 1, 1)
  })

  it('moves table enter navigation to the next row in the same column', () => {
    const view = createView(buildDoc(), 1, 1)

    expect(moveTableCellSelectionByEnter(view)).toEqual({ handled: true, changed: false })
    expectSelectionInCell(view, 2, 1)
  })

  it('appends a row for table enter navigation at the last row', () => {
    const view = createView(buildDoc(), 2, 1)

    expect(moveTableCellSelectionByEnter(view)).toEqual({ handled: true, changed: true })
    expect(getBodyRows(getTable(view.state.doc))).toHaveLength(3)
    expectSelectionInCell(view, 3, 1)
  })

  it('selects the first cell in the inserted table after a command anchor', () => {
    const before = paragraph('before')
    const table = buildTableBlock()
    const doc = buildDocWithBlocks([before, table])
    const view: any = {
      state: EditorState.create({
        doc,
        selection: TextSelection.create(doc, 1),
      }),
      dispatch(transaction: any) {
        view.state = view.state.apply(transaction)
      },
      focus: () => undefined,
    }

    expect(selectFirstTableCellAfterPosition(view, before.nodeSize)).toBe(true)
    expect(view.state.selection.from).toBe(before.nodeSize + getCellTextPosition(buildDoc(), 0, 0))
  })

  it('replaces selected lines with table rows and tab-separated columns', () => {
    const doc = buildDocWithBlocks([
      paragraph('one\thttps://example.com/one'),
      paragraph('two\thttps://example.com/two'),
    ])
    const view = createSelectedTextView(doc)

    expect(replaceSelectedTextWithTable(view)).toBe(true)
    const table = getFirstTable(view.state.doc)

    expect(getCellText(table, 0, 0)).toBe('one')
    expect(getCellText(table, 0, 1)).toBe('https://example.com/one')
    expect(getCellText(table, 1, 0)).toBe('two')
    expect(getCellText(table, 1, 1)).toBe('https://example.com/two')
    expect(getActiveTableContext(view)).toMatchObject({ rowIndex: 0, columnIndex: 0 })
  })

  it('preserves leading, consecutive, and trailing tab cells', () => {
    const doc = buildDocWithBlocks([paragraph('\tleft\t\tlast\t')])
    const view = createSelectedTextView(doc)

    expect(replaceSelectedTextWithTable(view)).toBe(true)
    const table = getFirstTable(view.state.doc)

    expect(table.child(0).child(0).childCount).toBe(5)
    expect(getBodyRows(table)[0].childCount).toBe(5)
    expect(getCellText(table, 0, 0)).toBe('')
    expect(getCellText(table, 0, 1)).toBe('left')
    expect(getCellText(table, 0, 2)).toBe('')
    expect(getCellText(table, 0, 3)).toBe('last')
    expect(getCellText(table, 0, 4)).toBe('')
    expect(getCellText(table, 1, 4)).toBe('')
  })

  it('treats hard breaks as selected table row boundaries', () => {
    const doc = buildDocWithBlocks([
      schema.nodes.paragraph.create(null, [
        schema.text('one'),
        schema.nodes.hardBreak.create(),
        schema.text('two'),
      ]),
    ])
    const view = createSelectedTextView(doc)

    expect(replaceSelectedTextWithTable(view)).toBe(true)
    const table = getFirstTable(view.state.doc)

    expect(getCellText(table, 0, 0)).toBe('one')
    expect(getCellText(table, 1, 0)).toBe('two')
  })

  it('trims leading and trailing blank selected rows while preserving internal blanks', () => {
    const doc = buildDocWithBlocks([
      paragraph(''),
      paragraph('one'),
      paragraph(''),
      paragraph('two'),
      paragraph(''),
    ])
    const view = createSelectedTextView(doc)

    expect(replaceSelectedTextWithTable(view)).toBe(true)
    const table = getFirstTable(view.state.doc)

    expect(getCellText(table, 0, 0)).toBe('one')
    expect(getCellText(table, 1, 0)).toBe('')
    expect(getCellText(table, 2, 0)).toBe('two')
  })

  it('preserves selected inline marks in converted table cells', () => {
    const linkMark = schema.marks.link.create({ linkUrl: 'https://example.com' })
    const strongMark = schema.marks.strong.create()
    const doc = buildDocWithBlocks([
      schema.nodes.paragraph.create(null, [
        schema.text('Name '),
        schema.text('Link', [linkMark]),
        schema.text('\t'),
        schema.text('Bold', [strongMark]),
      ]),
    ])
    const view = createSelectedTextView(doc)

    expect(replaceSelectedTextWithTable(view)).toBe(true)
    const table = getFirstTable(view.state.doc)
    const firstCellParagraph = getCellParagraph(table, 0, 0)
    const secondCellParagraph = getCellParagraph(table, 0, 1)

    expect(firstCellParagraph.textContent).toBe('Name Link')
    expect(firstCellParagraph.child(1).marks[0].attrs).toEqual({ linkUrl: 'https://example.com' })
    expect(secondCellParagraph.textContent).toBe('Bold')
    expect(secondCellParagraph.child(0).marks[0].type.name).toBe('strong')
  })

  it('adds an empty body row when a one-line selection becomes the header row', () => {
    const view = createSelectedTextView(buildDocWithBlocks([paragraph('only row')]))

    expect(replaceSelectedTextWithTable(view)).toBe(true)
    const table = getFirstTable(view.state.doc)

    expect(getCellText(table, 0, 0)).toBe('only row')
    expect(getBodyRows(table)).toHaveLength(1)
    expect(getCellText(table, 1, 0)).toBe('')
  })

  it('does not convert collapsed or blank selections into tables', () => {
    const collapsedView = createSelectedTextView(buildDocWithBlocks([paragraph('only row')]), 1, 1)
    const blankView = createSelectedTextView(buildDocWithBlocks([paragraph(''), paragraph('')]))

    expect(createTableNodeFromSelection(collapsedView.state)).toBeNull()
    expect(replaceSelectedTextWithTable(collapsedView)).toBe(false)
    expect(createTableNodeFromSelection(blankView.state)).toBeNull()
    expect(replaceSelectedTextWithTable(blankView)).toBe(false)
  })

  it('wraps forward table tab navigation to the next row', () => {
    const view = createView(buildDoc(), 1, 1)

    expect(moveTableCellSelectionByTab(view, 'forward')).toEqual({ handled: true, changed: false })
    expectSelectionInCell(view, 2, 0)
  })

  it('moves table shift-tab navigation backward within a row', () => {
    const view = createView(buildDoc(), 2, 1)

    expect(moveTableCellSelectionByTab(view, 'backward')).toEqual({ handled: true, changed: false })
    expectSelectionInCell(view, 2, 0)
  })

  it('wraps backward table shift-tab navigation to the previous row', () => {
    const view = createView(buildDoc(), 2, 0)

    expect(moveTableCellSelectionByTab(view, 'backward')).toEqual({ handled: true, changed: false })
    expectSelectionInCell(view, 1, 1)
  })

  it('appends a row from the final table cell and selects the new first cell', () => {
    const view = createView(buildDoc(), 2, 1)

    expect(moveTableCellSelectionByTab(view, 'forward')).toEqual({ handled: true, changed: true })
    const table = getTable(view.state.doc)
    expect(getBodyRows(table)).toHaveLength(3)
    expectSelectionInCell(view, 3, 0)
  })

  it('inserts a row above the first table cell and selects the new last cell', () => {
    const view = createView(buildDoc(), 0, 0)

    expect(moveTableCellSelectionByTab(view, 'backward')).toEqual({ handled: true, changed: true })
    const table = getTable(view.state.doc)
    expect(table.child(0).child(0).child(0).type.name).toBe('tableHeadCell')
    expect(table.child(1).child(0).child(0).type.name).toBe('tableBodyCell')
    expect(getCellText(table, 0, 0)).toBe('')
    expect(getCellText(table, 1, 0)).toBe('H1')
    expect(getCellText(table, 1, 1)).toBe('H2')
    expectSelectionInCell(view, 0, 1)
  })

  it('reorders body rows', () => {
    const table = getTable(applyReorder('row', 1, 3, 1, 0))

    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 1, 0)).toBe('B1')
    expect(getCellText(table, 2, 0)).toBe('A1')
  })

  it('reorders contiguous row ranges', () => {
    const table = getTable(applyRangeReorder('row', 1, 2, 4, 1, 0))

    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 1, 0)).toBe('C1')
    expect(getCellText(table, 2, 0)).toBe('A1')
    expect(getCellText(table, 3, 0)).toBe('B1')
  })

  it('reorders the header into the body and promotes the first body row', () => {
    const table = getTable(applyReorder('row', 0, 3, 0, 0))

    expect(getCellText(table, 0, 0)).toBe('A1')
    expect(getCellText(table, 1, 0)).toBe('B1')
    expect(getCellText(table, 2, 0)).toBe('H1')
  })

  it('reorders a row range containing the header and preserves header/body roles by visual position', () => {
    const table = getTable(applyRangeReorder('row', 0, 1, 4, 0, 0))

    expect(getCellText(table, 0, 0)).toBe('B1')
    expect(getCellText(table, 1, 0)).toBe('C1')
    expect(getCellText(table, 2, 0)).toBe('H1')
    expect(getCellText(table, 3, 0)).toBe('A1')
    expect(table.child(0).child(0).child(0).type.name).toBe('tableHeadCell')
    expect(table.child(1).child(1).child(0).type.name).toBe('tableBodyCell')
  })

  it('treats same-position row reorders as no-ops', () => {
    const view = createView(buildDoc(), 1, 0)

    expect(applyTableReorderOperationToView(view, 'row', 1, 2)).toBe(false)
  })

  it('treats row range drops inside the selected range as no-ops', () => {
    const view = createView(buildDoc({
      header: ['H1', 'H2', 'H3', 'H4'],
      body: [
        ['A1', 'A2', 'A3', 'A4'],
        ['B1', 'B2', 'B3', 'B4'],
        ['C1', 'C2', 'C3', 'C4'],
      ],
    }), 1, 0)

    expect(applyTableRangeReorderOperationToView(view, 'row', 1, 2, 2)).toBe(false)
  })

  it('reorders columns across header and body rows', () => {
    const table = getTable(applyReorder('column', 0, 3, 1, 0))

    expect(getCellText(table, 0, 0)).toBe('H2')
    expect(getCellText(table, 0, 1)).toBe('H3')
    expect(getCellText(table, 0, 2)).toBe('H1')
    expect(getCellText(table, 1, 2)).toBe('A1')
  })

  it('reorders contiguous column ranges across header and body rows', () => {
    const table = getTable(applyRangeReorder('column', 1, 2, 4, 1, 1))

    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 0, 1)).toBe('H4')
    expect(getCellText(table, 0, 2)).toBe('H2')
    expect(getCellText(table, 0, 3)).toBe('H3')
    expect(getCellText(table, 1, 2)).toBe('A2')
    expect(getCellText(table, 1, 3)).toBe('A3')
  })

  it('treats same-position column reorders as no-ops', () => {
    const view = createView(buildDoc(), 1, 1)

    expect(applyTableReorderOperationToView(view, 'column', 1, 2)).toBe(false)
  })

  it('treats column range drops inside the selected range as no-ops', () => {
    const view = createView(buildDoc({
      header: ['H1', 'H2', 'H3', 'H4'],
      body: [
        ['A1', 'A2', 'A3', 'A4'],
        ['B1', 'B2', 'B3', 'B4'],
      ],
    }), 1, 1)

    expect(applyTableRangeReorderOperationToView(view, 'column', 1, 2, 3)).toBe(false)
  })

  it('records table changes in ProseMirror history', () => {
    const view = createView(buildDoc(), 1, 0, { withHistory: true })
    const before = view.state.doc.toJSON()

    expect(applyTableReorderOperationToView(view, 'column', 0, 2)).toBe(true)
    expect(view.state.doc.toJSON()).not.toEqual(before)
    expect(undo(view.state, view.dispatch, view)).toBe(true)
    expect(view.state.doc.toJSON()).toEqual(before)
  })
})
