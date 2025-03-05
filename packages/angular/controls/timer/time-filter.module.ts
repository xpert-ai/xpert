import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatDialogModule } from '@angular/material/dialog'
import { MatDividerModule } from '@angular/material/divider'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
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

@NgModule({
  declarations: [
    NxQuarterFilterComponent,
    NxMonthFilterComponent,
    NxYearFilterComponent,
    
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatTableModule,
    MatCheckboxModule,
    MatInputModule,
    MatFormFieldModule,
    MatButtonModule,
    MatSelectModule,
    MatExpansionModule,
    MatIconModule,
    MatDividerModule,
    MatDatepickerModule,
    MatRadioModule,
    MatMenuModule,
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
