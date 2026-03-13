import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatDialogModule } from '@angular/material/dialog'
import {
  ZardButtonComponent,
  ZardDividerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardCheckboxComponent,
  ZardMenuImports
} from '@xpert-ai/headless-ui'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatTableModule } from '@angular/material/table'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  NgmDatepickerComponent,
  NgmMonthpickerComponent,
  NgmQuarterpickerComponent,
  NgmYearpickerComponent
} from './datepicker/index'
import { NgmTimeFilterEditorComponent } from './time-filter-editor/time-filter-editor.component'
import {
  NxMonthFilterComponent,
  NxQuarterFilterComponent,
  NgmTodayFilterComponent,
  NxYearFilterComponent
} from './today-filter/today-filter.component'

@NgModule({
  declarations: [NxQuarterFilterComponent, NxMonthFilterComponent, NxYearFilterComponent],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatTableModule,
    ZardCheckboxComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ZardButtonComponent,
    MatExpansionModule,
    ZardIconComponent,
    ZardDividerComponent,
    ...ZardMenuImports,
    DragDropModule,
    TranslateModule,
    DensityDirective,
    ButtonGroupDirective,
    AppearanceDirective,
    NgmMonthpickerComponent,
    NgmQuarterpickerComponent,
    NgmYearpickerComponent,
    NgmDatepickerComponent,
    NgmTimeFilterEditorComponent,
    NgmTodayFilterComponent
  ],
  exports: [NgmTimeFilterEditorComponent, NgmTodayFilterComponent, NxYearFilterComponent]
})
export class NgmTimeFilterModule {}
