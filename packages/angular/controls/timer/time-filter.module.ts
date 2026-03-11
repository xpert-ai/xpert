import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatDialogModule } from '@angular/material/dialog'
import { ZardDividerComponent } from '@xpert-ai/headless-ui'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatIconModule } from '@angular/material/icon'
import { ZardInputDirective, ZardFormImports } from '@xpert-ai/headless-ui'
import { MatMenuModule } from '@angular/material/menu'
import { MatRadioModule } from '@angular/material/radio'
import { MatSelectModule } from '@angular/material/select'
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
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@NgModule({
  declarations: [
    NxQuarterFilterComponent,
    NxMonthFilterComponent,
    NxYearFilterComponent,
    
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, MatDialogModule, MatTableModule, MatCheckboxModule, ZardInputDirective, ...ZardFormImports, ZardButtonComponent, MatSelectModule, MatExpansionModule, MatIconModule, ZardDividerComponent, MatDatepickerModule, MatRadioModule, MatMenuModule, DragDropModule, TranslateModule, DensityDirective, ButtonGroupDirective, AppearanceDirective, NgmMonthpickerComponent, NgmQuarterpickerComponent, NgmYearpickerComponent, NgmDatepickerComponent, NgmTimeFilterEditorComponent, NgmTodayFilterComponent],
  exports: [NgmTimeFilterEditorComponent, NgmTodayFilterComponent, NxYearFilterComponent]
})
export class NgmTimeFilterModule {}
