import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatNativeDateModule } from '@angular/material/core'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatIconModule } from '@angular/material/icon'
import { ZardInputDirective, ZardFormImports } from '@xpert-ai/headless-ui'
import { MatRadioModule } from '@angular/material/radio'
import { TranslateModule } from '@ngx-translate/core'
import { NgmMemberDatepickerComponent } from './datepicker.component'
import { NgmDatepickerComponent } from './datepicker/datepicker.component'
import { NgmMonthpickerComponent } from './monthpicker/monthpicker.component'
import { NgmQuarterpickerComponent } from './quarterpicker/quarterpicker.component'
import { NgmYearpickerComponent } from './yearpicker/yearpicker.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [NgmMemberDatepickerComponent],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CdkMenuModule, MatDatepickerModule, MatNativeDateModule, ...ZardFormImports, ZardButtonComponent, ZardInputDirective, MatRadioModule, MatIconModule, TranslateModule, NgmMonthpickerComponent, NgmQuarterpickerComponent, NgmYearpickerComponent, NgmDatepickerComponent],
  exports: [
    NgmMemberDatepickerComponent,
    NgmMonthpickerComponent,
    NgmQuarterpickerComponent,
    NgmYearpickerComponent,
    NgmDatepickerComponent
  ]
})
export class NgmMemberDatepickerModule {}
