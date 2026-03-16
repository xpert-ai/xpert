import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { NgModule } from '@angular/core'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatChipsModule } from '@angular/material/chips'
import { MatNativeDateModule } from '@angular/material/core'
import { ZardAccordionImports, ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardCheckboxComponent, ZardDialogModule, ZardDividerComponent, ZardFormImports, ZardIconComponent, ZardInputDirective, ZardMenuImports, ZardTabsImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatStepperModule } from '@angular/material/stepper'
import { MatTableModule } from '@angular/material/table'
import { MatTreeModule } from '@angular/material/tree'
import { MatDatepickerModule } from '@angular/material/datepicker'

const MATERIAL_MODULES = [
  DragDropModule,
  CdkListboxModule,
  ZardIconComponent,
  ZardDividerComponent,
  ...ZardMenuImports,
  ZardDialogModule,
  ZardButtonComponent,
  ...ZardFormImports,
  ...ZardTabsImports,
  ...ZardCardImports,
  MatStepperModule,
  ZardInputDirective,
  MatSidenavModule,
  ZardCheckboxComponent,
  ...ZardAccordionImports,
  MatAutocompleteModule,
  MatChipsModule,
  ...ZardTooltipImports,
  MatTreeModule,
  ZardBadgeComponent,
  MatTableModule,
  MatProgressSpinnerModule,
  MatDatepickerModule,
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
