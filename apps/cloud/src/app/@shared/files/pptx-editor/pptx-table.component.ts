import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, input, output } from '@angular/core'
import type { PptxShape } from './pptx-file.utils'

export type PptxTableCellInput = { rowIndex: number; cellIndex: number; value: string }
export type PptxTableCellEditStart = { rowIndex: number; cellIndex: number }

@Component({
  standalone: true,
  selector: 'xp-pptx-table',
  styleUrl: './pptx-table.component.css',
  template: `
    @if (shape().table; as table) {
      <table class="xp-pptx-editor__table">
        <tbody>
          @for (row of table.rows; track $index; let rowIndex = $index) {
            <tr>
              @for (cell of row; track $index; let cellIndex = $index) {
                <td
                  #cellElement
                  [attr.colspan]="cell.colSpan"
                  [attr.rowspan]="cell.rowSpan"
                  [attr.contenteditable]="editing() ? 'true' : null"
                  (dblclick)="onCellEditStart(rowIndex, cellIndex, cellElement, $event)"
                  (input)="onCellInput(rowIndex, cellIndex, $event)"
                  (focusout)="onCellFocusOut($event)"
                ></td>
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

  ngAfterViewChecked() {
    const cells = this.elementRef.nativeElement.querySelectorAll('td')
    const rows = this.shape().table?.rows.flat() ?? []
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
