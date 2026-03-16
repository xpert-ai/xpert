import { Component, inject, OnInit } from '@angular/core'
import { NgmPrismHighlightComponent } from '@metad/ocap-angular/prism'
import { convertQueryResultColumns, nonNullable } from '@metad/core'
import { NgmCopyComponent, NgmTableComponent } from '@metad/ocap-angular/common'
import { OcapCoreModule, OmitBlankPipe } from '@metad/ocap-angular/core'
import { isDataSettings } from '@metad/ocap-core'
import { uuid } from '@metad/story/core'
import { TranslateModule } from '@ngx-translate/core'
import { DragDropModule } from '@angular/cdk/drag-drop'

import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'

import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    TranslateModule,
    DragDropModule,
    ZardIconComponent,
    ZardButtonComponent,
    ...ZardTooltipImports,
    NgmTableComponent,
    NgmPrismHighlightComponent,
    OcapCoreModule,
    OmitBlankPipe,
    NgxJsonViewerModule,
    NgmCopyComponent
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
