import { NgStyle } from '@angular/common'
import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, input, output } from '@angular/core'
import type { PptxShape, PptxTableCell } from './pptx-file.utils'

export type PptxTableCellInput = { rowIndex: number; cellIndex: number; value: string }
export type PptxTableCellEditStart = { rowIndex: number; cellIndex: number }

@Component({
  standalone: true,
  selector: 'xp-pptx-table',
  imports: [NgStyle],
  styleUrl: './pptx-table.component.css',
  template: `
    @if (shape().table; as table) {
      <table class="xp-pptx-editor__table" [attr.dir]="table.rtl ? 'rtl' : 'ltr'">
        <colgroup>
          @for (column of table.columns; track $index) {
            <col [style.width]="columnWidth(table.columns, $index)" />
          }
        </colgroup>
        <tbody>
          @for (row of table.rows; track $index; let rowIndex = $index) {
            <tr [ngStyle]="rowStyle(table.rowHeights, rowIndex)">
              @for (cell of row; track $index; let cellIndex = $index) {
                @if (!cell.merged) {
                  <td
                    #cellElement
                    [attr.colspan]="cell.colSpan"
                    [attr.rowspan]="cell.rowSpan"
                    [ngStyle]="cellStyle(cell)"
                    [attr.contenteditable]="editing() ? 'true' : null"
                    (dblclick)="onCellEditStart(rowIndex, cellIndex, cellElement, $event)"
                    (input)="onCellInput(rowIndex, cellIndex, $event)"
                    (focusout)="onCellFocusOut($event)"
                  ></td>
                }
              }
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PptxTableComponent implements AfterViewChecked {
  readonly shape = input.required<PptxShape>()
  readonly editing = input(false)
  readonly cellEditStart = output<PptxTableCellEditStart>()
  readonly cellInput = output<PptxTableCellInput>()
  readonly cellEditEnd = output<void>()

  constructor(private readonly elementRef: ElementRef<HTMLElement>) {}

  columnWidth(columns: number[], index: number) {
    const total = columns.reduce((sum, width) => sum + Math.max(width, 0), 0)
    if (!total) return `${100 / Math.max(columns.length, 1)}%`
    return `${(Math.max(columns[index] ?? 0, 0) / total) * 100}%`
  }

  rowStyle(rowHeights: number[] | undefined, index: number) {
    if (!rowHeights?.length) return {}
    const total = rowHeights.reduce((sum, height) => sum + Math.max(height, 0), 0)
    if (!total) return {}
    return { height: `${(Math.max(rowHeights[index] ?? 0, 0) / total) * 100}%` }
  }

  cellStyle(cell: PptxTableCell) {
    const fontSize = cell.fontSizePt ?? this.shape().fontSizePt
    const margin = cell.margin
    const em = (value: number | undefined, fallback: number) =>
      `${Math.max(0, (value ?? fallback) / 12700 / Math.max(fontSize, 1))}em`
    return {
      background: cell.fill ?? 'transparent',
      color: cell.textColor,
      'font-size': `${((cell.fontSizePt ?? this.shape().fontSizePt) / Math.max(this.shape().fontSizePt, 1)) * 100}%`,
      'font-family': cell.fontFamily || 'inherit',
      'font-weight': cell.bold ? '700' : '400',
      'font-style': cell.italic ? 'italic' : 'normal',
      'text-align': cell.textAlign || 'left',
      'vertical-align': cell.verticalAlign || 'middle',
      padding: margin
        ? `${em(margin.top, 45720)} ${em(margin.right, 91440)} ${em(margin.bottom, 45720)} ${em(margin.left, 91440)}`
        : undefined,
      'border-top-color': cell.borderTopColor ?? cell.borderColor ?? 'transparent',
      'border-top-width': `${Math.max(0, cell.borderTopWidth ?? cell.borderWidth ?? 0)}px`,
      'border-right-color': cell.borderRightColor ?? cell.borderColor ?? 'transparent',
      'border-right-width': `${Math.max(0, cell.borderRightWidth ?? cell.borderWidth ?? 0)}px`,
      'border-bottom-color': cell.borderBottomColor ?? cell.borderColor ?? 'transparent',
      'border-bottom-width': `${Math.max(0, cell.borderBottomWidth ?? cell.borderWidth ?? 0)}px`,
      'border-left-color': cell.borderLeftColor ?? cell.borderColor ?? 'transparent',
      'border-left-width': `${Math.max(0, cell.borderLeftWidth ?? cell.borderWidth ?? 0)}px`
    }
  }

  ngAfterViewChecked() {
    const cells = this.elementRef.nativeElement.querySelectorAll('td')
    const rows = this.shape().table?.rows.flatMap((row) => row.filter((cell) => !cell.merged)) ?? []
    const activeElement = this.elementRef.nativeElement.ownerDocument.activeElement
    cells.forEach((cell, index) => {
      const model = rows[index]
      if (model && cell !== activeElement && cell.textContent !== model.text) cell.textContent = model.text
    })
  }

  onCellInput(rowIndex: number, cellIndex: number, event: Event) {
    const target = event.target
    if (target instanceof HTMLElement) this.cellInput.emit({ rowIndex, cellIndex, value: target.textContent ?? '' })
  }

  onCellEditStart(rowIndex: number, cellIndex: number, cellElement: HTMLElement, event: MouseEvent) {
    event.stopPropagation()
    cellElement.focus()
    this.cellEditStart.emit({ rowIndex, cellIndex })
  }

  onCellFocusOut(event: FocusEvent) {
    const currentTarget = event.currentTarget
    const nextTarget = event.relatedTarget
    const table = currentTarget instanceof HTMLElement ? currentTarget.closest('table') : null
    if (table && nextTarget instanceof Node && table.contains(nextTarget)) return
    this.cellEditEnd.emit()
  }
}
