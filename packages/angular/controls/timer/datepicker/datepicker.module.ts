import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatNativeDateModule } from '@angular/material/core'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatRadioModule } from '@angular/material/radio'
import { TranslateModule } from '@ngx-translate/core'
import { NgmMemberDatepickerComponent } from './datepicker.component'
import { NgmDatepickerComponent } from './datepicker/datepicker.component'
import { NgmMonthpickerComponent } from './monthpicker/monthpicker.component'
import { NgmQuarterpickerComponent } from './quarterpicker/quarterpicker.component'
import { NgmYearpickerComponent } from './yearpicker/yearpicker.component'
import { CdkMenuModule } from '@angular/cdk/menu'

@NgModule({
  declarations: [NgmMemberDatepickerComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,

    CdkMenuModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatFormFieldModule,
    MatButtonModule,
    MatInputModule,
    MatRadioModule,
    MatIconModule,

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
