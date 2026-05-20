import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { history, undo } from 'prosemirror-history'
import { describe, expect, it } from 'vitest'
import {
  applyTableControlOperationToView,
  applyTableReorderOperationToView,
  getActiveTableContext,
  getTableControlsOverlayPlacement,
  getTableReorderDragDecision,
  placeTableCaretAtCoords,
  type TableControlOperation,
  type TableReorderAxis,
} from './table-editing'

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    text: { group: 'inline' },
    paragraph: { group: 'block', content: 'inline*' },
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

function getTable(doc: any) {
  return doc.childCount > 0 && doc.child(0).type.name === 'table' ? doc.child(0) : null
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

function applyOperation(operation: TableControlOperation, rowIndex: number, columnIndex: number, doc = buildDoc()) {
  const view = createView(doc, rowIndex, columnIndex)
  expect(applyTableControlOperationToView(view, operation)).toBe(true)
  return view.state.doc
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

  it('places row and column controls on the table edge', () => {
    const tableRect = { top: 80, left: 120, width: 220, height: 72 }

    expect(getTableControlsOverlayPlacement(tableRect, 1000, 800)).toMatchObject({
      visible: true,
      columnTop: 50,
      columnLeft: 284,
      rowTop: 96,
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

  it('keeps controls outside the table when there is no room above or right', () => {
    const tableRect = { top: 18, left: 60, width: 72, height: 72 }

    expect(getTableControlsOverlayPlacement(tableRect, 150, 240)).toMatchObject({
      visible: true,
      columnTop: 94,
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

  it('reorders body rows', () => {
    const table = getTable(applyReorder('row', 1, 3, 1, 0))

    expect(getCellText(table, 0, 0)).toBe('H1')
    expect(getCellText(table, 1, 0)).toBe('B1')
    expect(getCellText(table, 2, 0)).toBe('A1')
  })

  it('reorders the header into the body and promotes the first body row', () => {
    const table = getTable(applyReorder('row', 0, 3, 0, 0))

    expect(getCellText(table, 0, 0)).toBe('A1')
    expect(getCellText(table, 1, 0)).toBe('B1')
    expect(getCellText(table, 2, 0)).toBe('H1')
  })

  it('treats same-position row reorders as no-ops', () => {
    const view = createView(buildDoc(), 1, 0)

    expect(applyTableReorderOperationToView(view, 'row', 1, 2)).toBe(false)
  })

  it('reorders columns across header and body rows', () => {
    const table = getTable(applyReorder('column', 0, 3, 1, 0))

    expect(getCellText(table, 0, 0)).toBe('H2')
    expect(getCellText(table, 0, 1)).toBe('H3')
    expect(getCellText(table, 0, 2)).toBe('H1')
    expect(getCellText(table, 1, 2)).toBe('A1')
  })

  it('treats same-position column reorders as no-ops', () => {
    const view = createView(buildDoc(), 1, 1)

    expect(applyTableReorderOperationToView(view, 'column', 1, 2)).toBe(false)
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
