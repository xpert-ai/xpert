import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { NgModule } from '@angular/core'
import { MatChipsModule } from '@angular/material/chips'
import { MatDialogModule } from '@angular/material/dialog'
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
  MatDialogModule,
  ZardButtonComponent,
  ...ZardFormImports,
  ...ZardTabsImports,
  ...ZardCardImports,
  ZardInputDirective,
  ...ZardDrawerImports,
  ZardCheckboxComponent,
  ...ZardAccordionImports,
  MatChipsModule,
  ...ZardTooltipImports,
  ZardBadgeComponent,
  ...ZardTableImports,
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
