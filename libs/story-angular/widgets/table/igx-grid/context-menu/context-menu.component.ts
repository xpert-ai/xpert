import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core'

@Component({
  standalone: false,
  selector: 'ngm-context-menu',
  templateUrl: './context-menu.component.html',
  styleUrls: ['./context-menu.component.scss'],
})
export class ContextMenuComponent {
  @Input()
  public x = 0

  @Input()
  public y = 0

  @Input()
  public cell

  @Input()
  public selectedCells

  @Output()
  public onCellValueCopy = new EventEmitter<any>()

  public selectedData: any

  constructor() {}

  public copySelectedCellData(event) {
    const selectedData = { [this.cell.column.field]: this.cell.value }
    this.copyData(JSON.stringify({ [this.cell.column.field]: this.cell.value }))
    this.onCellValueCopy.emit({ data: selectedData })
  }

  public copyRowData(event) {
    const selectedData = this.cell.row.rowData
    this.copyData(JSON.stringify(this.cell.row.rowData))
    this.onCellValueCopy.emit({ data: selectedData })
  }

  public copySelectedCells(event) {
    const selectedData = this.selectedCells.data
    this.copyData(JSON.stringify(selectedData))
    this.onCellValueCopy.emit({ data: selectedData })
  }

  public hasMultiCellSelection() {
    return this.selectedCells && Object.entries(this.selectedCells).length !== 0
  }

  private copyData(data) {
    const tempElement = document.createElement('input')
    document.body.appendChild(tempElement)
    tempElement.setAttribute('id', 'temp_id')
    ;(document.getElementById('temp_id') as HTMLInputElement).value = data
    tempElement.select()
    document.execCommand('copy')
    document.body.removeChild(tempElement)
  }
}
