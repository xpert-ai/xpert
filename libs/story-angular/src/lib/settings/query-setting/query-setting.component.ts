import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, HostBinding, OnInit } from '@angular/core'

import { MatDialogModule } from '@angular/material/dialog'
import { ZardButtonComponent, ZardDividerComponent, ZardFormImports, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, DragDropModule, MatDialogModule, ZardButtonComponent, ZardIconComponent, MatListModule, ZardDividerComponent, MatTooltipModule, ...ZardFormImports, ZardInputDirective, MatSlideToggleModule, TranslateModule, NgmCommonModule],
  selector: 'ngm-settings-query-setting',
  templateUrl: './query-setting.component.html',
  styleUrls: ['./query-setting.component.scss']
})
export class QuerySettingComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  ngOnInit() {
    //
  }

  onApply() {
    //
  }
}
