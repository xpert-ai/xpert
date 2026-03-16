import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { 
  ZardAccordionImports, 
  ZardButtonComponent, 
  ZardCheckboxComponent, 
  ZardDialogModule, 
  ZardDividerComponent, 
  ZardFormImports, 
  ZardIconComponent, 
  ZardInputDirective, 
  ZardMenuImports,
  ZardTableImports 
} from '@xpert-ai/headless-ui'
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
    ZardDialogModule,
    ...ZardTableImports,
    ZardCheckboxComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ZardButtonComponent,
    ...ZardAccordionImports,
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
