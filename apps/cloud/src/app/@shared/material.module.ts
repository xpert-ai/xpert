import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { NgModule } from '@angular/core'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatButtonToggleModule } from '@angular/material/button-toggle'
import { MatCardModule } from '@angular/material/card'
import { MatChipsModule } from '@angular/material/chips'
import { MatNativeDateModule, MatRippleModule } from '@angular/material/core'
import { MatDialogModule } from '@angular/material/dialog'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardDividerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardTabsImports,
  ZardCheckboxComponent
} from '@xpert-ai/headless-ui'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatSliderModule } from '@angular/material/slider'
import { MatSnackBarModule } from '@angular/material/snack-bar'
import { MatStepperModule } from '@angular/material/stepper'
import { MatTableModule } from '@angular/material/table'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatTreeModule } from '@angular/material/tree'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatBottomSheetModule } from '@angular/material/bottom-sheet'
import { MatPaginatorModule } from '@angular/material/paginator'

const MATERIAL_MODULES = [
  DragDropModule,
  CdkListboxModule,
  ZardIconComponent,
  ZardDividerComponent,
  MatMenuModule,
  MatDialogModule,
  MatToolbarModule,
  ZardButtonComponent,
  MatButtonToggleModule,
  ...ZardFormImports,
  ...ZardTabsImports,
  MatStepperModule,
  MatSnackBarModule,
  ZardInputDirective,
  MatCardModule,
  MatSlideToggleModule,
  MatProgressBarModule,
  MatSidenavModule,
  ZardCheckboxComponent,
  MatExpansionModule,
  MatAutocompleteModule,
  MatChipsModule,
  MatTooltipModule,
  MatRippleModule,
  MatTreeModule,
  ZardBadgeComponent,
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
