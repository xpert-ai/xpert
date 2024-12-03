import { Component, inject, OnInit } from '@angular/core'
import { NgmPrismHighlightComponent } from '@metad/ocap-angular/prism'
import { convertQueryResultColumns, nonNullable } from '@metad/core'
import { NgmTableComponent } from '@metad/ocap-angular/common'
import { OcapCoreModule, OmitBlankPipe } from '@metad/ocap-angular/core'
import { isDataSettings } from '@metad/ocap-core'
import { uuid } from '@metad/story/core'
import { TranslateModule } from '@ngx-translate/core'
import { MatIconModule } from '@angular/material/icon'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { MatButtonModule } from '@angular/material/button'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    MatIconModule,
    MatButtonModule,
    NgmTableComponent,
    NgmPrismHighlightComponent,
    OcapCoreModule,
    OmitBlankPipe
  ],
  selector: 'pac-story-explain',
  templateUrl: 'explain.component.html',
  styleUrls: ['explain.component.scss']
})
export class ExplainComponent implements OnInit {
  private data = inject(DIALOG_DATA)
  readonly dialogRef = inject(DialogRef)
  public explains = []
  public explain = null

  ngOnInit() {
    this.data?.filter(nonNullable).forEach((item) => {
      if (item.error) {
        this.explains.push({
          key: uuid(),
          type: 'error',
          error: item.error
        })
      }

      if (isDataSettings(item)) {
        this.explains.push({
          key: uuid(),
          type: 'dataSettings',
          data: item
        })
      }

      if (item.stats) {
        this.explains.push({
          key: uuid(),
          type: 'statements',
          statements: item.stats.statements
        })
      }
      if (item.data?.length) {
        this.explains.push({
          key: uuid(),
          type: 'data',
          data: item.data,
          columns: item.columns ?? convertQueryResultColumns(item.schema)
        })
      }

      if (item.options) {
        this.explains.push({
          key: uuid(),
          type: 'chart',
          options: item.options
        })
      }

      if (item.slicers) {
        this.explains.push({
          key: uuid(),
          type: 'slicers',
          options: item.slicers
        })
      }
    })

    if (this.explains.length) {
      this.activeLink(this.explains[0])
    }
  }

  activeLink(explain: unknown[]) {
    this.explain = explain
  }

  close() {
    this.dialogRef.close()
  }
}
