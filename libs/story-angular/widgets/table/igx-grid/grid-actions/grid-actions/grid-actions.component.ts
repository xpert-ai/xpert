import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core'
import { IgxGridActionsBaseDirective } from 'igniteui-angular'
import { RowAction } from '../../types'

@Component({
  standalone: false,
  selector: 'smart-grid-actions',
  templateUrl: './grid-actions.component.html',
  styleUrls: ['./grid-actions.component.scss'],
  providers: [{ provide: IgxGridActionsBaseDirective, useExisting: SmartGridActionsComponent }]
})
export class SmartGridActionsComponent extends IgxGridActionsBaseDirective implements OnInit {
  @Input() actions: RowAction[]
  @Output() actionClick = new EventEmitter()

  ngOnInit(): void {
    //
  }

  onActionClick(event, action) {
    if (event) {
      event.stopPropagation()
    }
    if (!this.isRow(this.strip.context)) {
      return
    }
    const context = this.strip.context
    // TODO
    // this.actionClick.emit({
    //   action,
    //   rowID: context.rowID,
    //   rowData: context.rowData
    // })
  }
}
