import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { ZardButtonComponent, ZardDialogModule, ZardFormImports, ZardInputDirective } from '@xpert-ai/headless-ui'
import { ButtonGroupDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmConfirmDeleteComponent } from './confirm-delete/confirm-delete.component'
import { NgmCountdownConfirmationComponent } from './countdown/countdown.component'
import { NgmCountdownModule } from '../countdown'
import { NgmConfirmOptionsComponent } from './confirm-options/confirm-options.component'

@NgModule({
  declarations: [ NgmConfirmDeleteComponent, NgmCountdownConfirmationComponent ],
  imports: [CommonModule, FormsModule, DragDropModule, ZardDialogModule, ZardButtonComponent, ...ZardFormImports, ZardInputDirective, NgmCountdownModule, TranslateModule, ButtonGroupDirective, NgmConfirmOptionsComponent],
  exports: [ NgmConfirmDeleteComponent, NgmCountdownConfirmationComponent, NgmConfirmOptionsComponent ]
})
export class NgmConfirmModule {}
