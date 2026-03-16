import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { NgModule } from '@angular/core'
import { MatAutocompleteModule } from '@angular/material/autocomplete'
import { MatChipsModule } from '@angular/material/chips'
import {
  ZardAccordionImports,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardDividerComponent,
  ZardDrawerImports,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardMenuImports,
  ZardTableImports,
  ZardTabsImports,
  ZardCheckboxComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'

const MATERIAL_MODULES = [
  DragDropModule,
  CdkListboxModule,
  ZardIconComponent,
  ZardDividerComponent,
  ...ZardMenuImports,
  ZardButtonComponent,
  ...ZardFormImports,
  ...ZardTabsImports,
  ...ZardCardImports,
  ZardInputDirective,
  ZardCheckboxComponent,
  MatAutocompleteModule,
  MatChipsModule,
  ...ZardTooltipImports,
  ZardBadgeComponent,
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
