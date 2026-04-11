import { DragDropModule } from '@angular/cdk/drag-drop'

import { Component, HostBinding, OnInit } from '@angular/core'

import { ZardButtonComponent, ZardDialogModule, ZardDividerComponent, ZardFormImports, ZardIconComponent, ZardInputDirective, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [
    DragDropModule,
    ZardDialogModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardDividerComponent,
    ...ZardTooltipImports,
    ...ZardFormImports,
    ZardInputDirective,
    TranslateModule,
    NgmCommonModule
],
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
