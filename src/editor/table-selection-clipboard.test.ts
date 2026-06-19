import { Schema } from 'prosemirror-model'
import { EditorState, TextSelection } from 'prosemirror-state'
import { describe, expect, it, vi } from 'vitest'
import {
  createTableNodeFromClipboardPayload,
  insertTableSelectionClipboardPayloadIntoView,
  readTableSelectionClipboardPayloadFromDataTransfer,
  serializeTableSelectionForClipboard,
  TABS_TABLE_SELECTION_CLIPBOARD_MIME,
  writeTableSelectionClipboardData,
} from './table-selection-clipboard'
import type { TableSelectionRange } from './table-editing'

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
      content: 'tableRow*',
      attrs: { rawHTML: { default: null } },
    },
    tableRow: {
      content: '(tableHeadCell | tableBodyCell)+',
      attrs: { rawHTML: { default: null } },
    },
    tableHeadCell: {
      content: 'paragraph+',
      attrs: { align: { default: null }, rawHTML: { default: null } },
      isolating: true,
    },
    tableBodyCell: {
      content: 'paragraph+',
      attrs: { align: { default: null }, rawHTML: { default: null } },
      isolating: true,
    },
  },
})

function paragraph(text = '') {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
}

function headCell(text: string) {
  return schema.nodes.tableHeadCell.create(null, paragraph(text))
}

function bodyCell(text: string) {
  return schema.nodes.tableBodyCell.create(null, paragraph(text))
}

function row(cells: any[]) {
  return schema.nodes.tableRow.create(null, cells)
}

function tableDoc() {
  return schema.nodes.doc.create(null, [
    schema.nodes.table.create(null, [
      schema.nodes.tableHead.create(null, row([headCell('H1'), headCell('H2'), headCell('H3')])),
      schema.nodes.tableBody.create(null, [
        row([bodyCell('A1'), bodyCell('A2'), bodyCell('A3')]),
        row([bodyCell('B1'), bodyCell('B2'), bodyCell('B3')]),
      ]),
    ]),
  ])
}

function getFirstTextSelectionPosition(doc: any) {
  let position = 1
  doc.descendants?.((node: any, pos: number) => {
    if (!node?.isTextblock) return true
    position = pos + 1
    return false
  })
  return Math.max(1, Math.min(doc.content.size, position))
}

function createView(doc = tableDoc()) {
  let state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, getFirstTextSelectionPosition(doc)),
  })
  return {
    get state() {
      return state
    },
    dispatch: vi.fn((transaction) => {
      state = state.apply(transaction)
    }),
    focus: vi.fn(),
  }
}

function getCellText(table: any, rowIndex: number, columnIndex: number) {
  const rowNode = rowIndex === 0 ? table.child(0).child(0) : table.child(1).child(rowIndex - 1)
  return rowNode.child(columnIndex).textContent
}

describe('table selection clipboard helpers', () => {
  it('serializes selected rows to private payload, html, and tsv text', () => {
    const selection: TableSelectionRange = {
      tableStart: 0,
      mode: 'rows',
      anchorRow: 1,
      headRow: 2,
      anchorColumn: 0,
      headColumn: 0,
    }

    const serialization = serializeTableSelectionForClipboard(createView(), selection)

    expect(serialization?.text).toBe('A1\tA2\tA3\nB1\tB2\tB3')
    expect(serialization?.html).toContain('<table><thead><tr><th>A1</th><th>A2</th><th>A3</th></tr></thead>')
    expect(serialization?.payload.rows).toHaveLength(2)
  })

  it('serializes selected columns across header and body rows', () => {
    const selection: TableSelectionRange = {
      tableStart: 0,
      mode: 'columns',
      anchorRow: 0,
      headRow: 0,
      anchorColumn: 1,
      headColumn: 2,
    }

    expect(serializeTableSelectionForClipboard(createView(), selection)?.text).toBe('H2\tH3\nA2\tA3\nB2\tB3')
  })

  it('writes and reads the private clipboard payload', () => {
    const store = new Map<string, string>()
    const serialization = serializeTableSelectionForClipboard(createView(), {
      tableStart: 0,
      mode: 'cells',
      anchorRow: 1,
      headRow: 1,
      anchorColumn: 0,
      headColumn: 1,
    })

    expect(serialization).not.toBeNull()
    expect(writeTableSelectionClipboardData({
      setData: (type, value) => store.set(type, value),
    }, serialization!)).toBe(true)

    expect(store.get('text/plain')).toBe('A1\tA2')
    expect(store.get('text/html')).toContain('<table>')
    expect(readTableSelectionClipboardPayloadFromDataTransfer({
      getData: (type) => store.get(type) ?? '',
    })?.rows).toHaveLength(1)
    expect(store.has(TABS_TABLE_SELECTION_CLIPBOARD_MIME)).toBe(true)
  })

  it('creates and inserts a real table node from the private payload', () => {
    const serialization = serializeTableSelectionForClipboard(createView(), {
      tableStart: 0,
      mode: 'cells',
      anchorRow: 1,
      headRow: 2,
      anchorColumn: 1,
      headColumn: 2,
    })
    const insertedView = createView(schema.nodes.doc.create(null, [paragraph('target')]))

    expect(serialization).not.toBeNull()
    const table = createTableNodeFromClipboardPayload(schema, serialization!.payload)
    expect(table?.type.name).toBe('table')
    expect(getCellText(table, 0, 0)).toBe('A2')
    expect(getCellText(table, 1, 1)).toBe('B3')

    expect(insertTableSelectionClipboardPayloadIntoView(insertedView, serialization!.payload)).toBe(true)
    expect(insertedView.state.doc.child(0).type.name).toBe('table')
  })
})
