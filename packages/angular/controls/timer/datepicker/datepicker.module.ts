import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import {
  NgmDatepickerComponent,
  NgmMonthpickerComponent,
  NgmQuarterpickerComponent,
  NgmYearpickerComponent,
  ZardButtonComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { NgmMemberDatepickerComponent } from './datepicker.component'
import { CdkMenuModule } from '@angular/cdk/menu'

@NgModule({
  declarations: [NgmMemberDatepickerComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    ...ZardFormImports,
    ZardButtonComponent,
    ZardInputDirective,
    ZardIconComponent,
    TranslateModule,
    NgmMonthpickerComponent,
    NgmQuarterpickerComponent,
    NgmYearpickerComponent,
    NgmDatepickerComponent
  ],
  exports: [
    NgmMemberDatepickerComponent,
    NgmMonthpickerComponent,
    NgmQuarterpickerComponent,
    NgmYearpickerComponent,
    NgmDatepickerComponent
  ]
})
export class NgmMemberDatepickerModule {}
