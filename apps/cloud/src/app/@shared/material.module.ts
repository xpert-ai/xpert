import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { NgModule } from '@angular/core'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatChipsModule } from '@angular/material/chips'
import { MatDialogModule } from '@angular/material/dialog'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDividerComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardMenuImports,
  ZardTabsImports,
  ZardCheckboxComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { MatExpansionModule } from '@angular/material/expansion'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatStepperModule } from '@angular/material/stepper'
import { MatTableModule } from '@angular/material/table'
import { MatTreeModule } from '@angular/material/tree'

const MATERIAL_MODULES = [
  DragDropModule,
  CdkListboxModule,
  ZardIconComponent,
  ZardDividerComponent,
  ...ZardMenuImports,
  MatDialogModule,
  ZardButtonComponent,
  ...ZardFormImports,
  ...ZardTabsImports,
  ...ZardCardImports,
  MatStepperModule,
  ZardInputDirective,
  MatProgressBarModule,
  MatSidenavModule,
  ZardCheckboxComponent,
  MatExpansionModule,
  MatAutocompleteModule,
  MatChipsModule,
  ...ZardTooltipImports,
  MatTreeModule,
  ZardBadgeComponent,
  MatTableModule,
  MatProgressSpinnerModule
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
