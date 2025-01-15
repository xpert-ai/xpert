import { DragDropModule } from '@angular/cdk/drag-drop'
import { NgModule } from '@angular/core'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatBadgeModule } from '@angular/material/badge'
import { MatButtonModule } from '@angular/material/button'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCardModule } from '@angular/material/card'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatChipsModule } from '@angular/material/chips'
import { MatNativeDateModule, MatRippleModule } from '@angular/material/core'
import { MatDialogModule } from '@angular/material/dialog'
import { MatDividerModule } from '@angular/material/divider'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatListModule } from '@angular/material/list'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatRadioModule } from '@angular/material/radio'
import { MatSelectModule } from '@angular/material/select'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatSliderModule } from '@angular/material/slider'
import { MatSnackBarModule } from '@angular/material/snack-bar'
import { MatStepperModule } from '@angular/material/stepper'
import { MatTableModule } from '@angular/material/table'
import { MatTabsModule } from '@angular/material/tabs'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatTreeModule } from '@angular/material/tree'
import {MatDatepickerModule} from '@angular/material/datepicker'
import { MatBottomSheetModule } from '@angular/material/bottom-sheet'
import { MatPaginatorModule } from '@angular/material/paginator'

const MATERIAL_MODULES = [
  DragDropModule,
  MatIconModule,
  MatDividerModule,
  MatMenuModule,
  MatDialogModule,
  MatToolbarModule,
  MatButtonModule,
  MatButtonToggleModule,
  MatFormFieldModule,
  MatSelectModule,
  MatListModule,
  MatTabsModule,
  MatStepperModule,
  MatSnackBarModule,
  MatInputModule,
  MatCardModule,
  MatSlideToggleModule,
  MatProgressBarModule,
  MatSidenavModule,
  MatCheckboxModule,
  MatRadioModule,
  MatExpansionModule,
  MatAutocompleteModule,
  MatChipsModule,
  MatTooltipModule,
  MatRippleModule,
  MatTreeModule,
  MatBadgeModule,
  MatSliderModule,
  MatTableModule,
  MatProgressSpinnerModule,
  MatDatepickerModule,
  MatBottomSheetModule,
  MatNativeDateModule,
  MatPaginatorModule
]

/**
 * @deprecated Use separate modules so they can be deprecated in the future.
 */
@NgModule({
  imports: [...MATERIAL_MODULES],
  exports: [...MATERIAL_MODULES],
  declarations: []
})
export class MaterialModule {}
