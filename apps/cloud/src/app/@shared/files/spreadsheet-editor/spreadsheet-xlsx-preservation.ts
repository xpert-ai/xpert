import type { ICellData, IStyleData, IWorkbookData } from '@univerjs/presets'
import { cellAddress, patchXlsx, position, readXlsx } from '@xpert-ai/artifact-tool/xlsx'
import type { CellEdit, Scalar } from '@xpert-ai/artifact-tool/xlsx'

export interface XlsxEditSession {
  source: Uint8Array
  baseline: IWorkbookData
}

export async function spreadsheetBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      reader.result instanceof ArrayBuffer
        ? resolve(new Uint8Array(reader.result))
        : reject(new Error('Invalid spreadsheet bytes'))
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(blob)
  })
}

export async function hydrateXlsxSnapshot(blob: Blob, snapshot: IWorkbookData) {
  const source = await spreadsheetBytes(blob)
  const data = await readXlsx(source)
  data.sheets.forEach((sheet, index) => {
    const target = snapshot.sheets[snapshot.sheetOrder[index]]
    if (!target || target.name !== sheet.name) throw new Error('Worksheet import mismatch')
    target.hidden = sheet.hidden === 'visible' ? 0 : 1
    target.freeze = {
      xSplit: sheet.freeze.columns,
      ySplit: sheet.freeze.rows,
      startRow: sheet.freeze.rows || -1,
      startColumn: sheet.freeze.columns || -1
    }
    for (const [address, cell] of Object.entries(sheet.cells)) {
      const { row, column } = position(address)
      const targetCell = target.cellData[row]?.[column]
      if (targetCell) {
        const existing = typeof targetCell.s === 'string' ? snapshot.styles[targetCell.s] : targetCell.s
        targetCell.s = { ...existing, ...cell.style } as IStyleData
      }
    }
  })
  return source
}

function resolvedStyle(cell: ICellData | undefined, snapshot: IWorkbookData) {
  return cell?.s ? (typeof cell.s === 'string' ? snapshot.styles[cell.s] : cell.s) : undefined
}

function scalar(cell?: ICellData): Scalar {
  // Univer may keep plain text in a rich-text document after editing a formatted cell.
  const document = cell?.p
  if (document && document.body?.dataStream) return document.body.dataStream.replace(/\r\n$/, '')
  const value = cell?.v
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return value
  throw new Error('Unsupported spreadsheet cell value')
}

function structure(snapshot: IWorkbookData) {
  return JSON.stringify(
    snapshot.sheetOrder.map((id) => {
      const sheet = snapshot.sheets[id]
      return {
        id,
        name: sheet.name,
        hidden: sheet.hidden,
        mergeData: sheet.mergeData,
        freeze: sheet.freeze,
        rowData: sheet.rowData,
        columnData: sheet.columnData
      }
    })
  )
}

export async function exportXlsxEdits(
  session: XlsxEditSession,
  snapshot: IWorkbookData,
  fileName: string
): Promise<File> {
  if (structure(session.baseline) !== structure(snapshot))
    throw new Error(
      'This XLSX editor saves cell values and formulas. Undo sheet, row, column, merge or freeze changes before saving.'
    )
  const edits: CellEdit[] = []
  const results: CellEdit[] = []
  for (const id of snapshot.sheetOrder) {
    const sheet = snapshot.sheets[id],
      before = session.baseline.sheets[id]
    const rows = new Set([...Object.keys(sheet.cellData), ...Object.keys(before.cellData)])
    for (const r of rows) {
      const row = Number(r)
      const columns = new Set([...Object.keys(sheet.cellData[row] ?? {}), ...Object.keys(before.cellData[row] ?? {})])
      for (const c of columns) {
        const column = Number(c)
        const cell = sheet.cellData[row]?.[column]
        const old = before.cellData[row]?.[column]
        if (JSON.stringify(resolvedStyle(cell, snapshot)) !== JSON.stringify(resolvedStyle(old, session.baseline)))
          throw new Error('This XLSX editor preserves existing formatting. Undo formatting changes before saving.')
        const value = scalar(cell)
        const formula = cell?.f || undefined
        const address = cellAddress(row, column)
        if (formula !== (old?.f || undefined) || (!formula && value !== scalar(old)))
          edits.push({ sheet: sheet.name, cell: address, value: formula ? { formula } : value })
        if (formula) {
          if (
            value == null ||
            (typeof value === 'string' &&
              /^#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?|NUM!|NULL!|SPILL!|CYCLE!|CALC!)/.test(value))
          )
            throw new Error(`Resolve the formula error at ${sheet.name}!${address} before saving.`)
          results.push({ sheet: sheet.name, cell: address, formula, value })
        }
      }
    }
  }
  if (!edits.length) return new File([session.source.slice().buffer], fileName, { type: XLSX_MIME })
  const result = await patchXlsx(session.source, edits, results)
  return new File([result.slice().buffer], fileName, { type: XLSX_MIME })
}

export function assertUnchangedSpreadsheet(source: Uint8Array, current: Uint8Array) {
  if (source.length !== current.length || source.some((byte, i) => byte !== current[i]))
    throw new Error('The workspace file changed after it was opened. Reopen it before saving your edits.')
}
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
