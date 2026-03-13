import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { NgModule } from '@angular/core'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatChipsModule } from '@angular/material/chips'
import { MatNativeDateModule, MatRippleModule } from '@angular/material/core'
import { MatDialogModule } from '@angular/material/dialog'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDividerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardTabsImports,
  ZardCheckboxComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatMenuModule } from '@angular/material/menu'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatSnackBarModule } from '@angular/material/snack-bar'
import { MatStepperModule } from '@angular/material/stepper'
import { MatTableModule } from '@angular/material/table'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatTreeModule } from '@angular/material/tree'
import { MatDatepickerModule } from '@angular/material/datepicker'
import { MatBottomSheetModule } from '@angular/material/bottom-sheet'

const MATERIAL_MODULES = [
  DragDropModule,
  CdkListboxModule,
  ZardIconComponent,
  ZardDividerComponent,
  MatMenuModule,
  MatDialogModule,
  MatToolbarModule,
  ZardButtonComponent,
  ...ZardFormImports,
  ...ZardTabsImports,
  ...ZardCardImports,
  MatStepperModule,
  MatSnackBarModule,
  ZardInputDirective,
  MatProgressBarModule,
  MatSidenavModule,
  ZardCheckboxComponent,
  MatExpansionModule,
  MatAutocompleteModule,
  MatChipsModule,
  ...ZardTooltipImports,
  MatRippleModule,
  MatTreeModule,
  ZardBadgeComponent,
  MatTableModule,
  MatProgressSpinnerModule,
  MatDatepickerModule,
  MatBottomSheetModule,
  MatNativeDateModule
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
