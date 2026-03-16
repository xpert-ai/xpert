import { DragDropModule } from '@angular/cdk/drag-drop'
import { LayoutModule } from '@angular/cdk/layout'
import { PortalModule } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  ZardAccordionImports,
  ZardButtonComponent,
  ZardCardImports,
  ZardDrawerImports,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardTableImports,
  ZardDialogModule,
  ZardTabsImports,
  ZardCheckboxComponent,
  ZardProgressBarComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'

const SHARED_IMPORTS = [
  ZardIconComponent,
  ZardButtonComponent,
  ...ZardTabsImports,
  ...ZardFormImports,
  ZardInputDirective,
  ZardDialogModule,
  ...ZardDrawerImports,
  ...ZardTableImports,
  ZardCheckboxComponent,
  ...ZardTooltipImports,
  ZardProgressBarComponent,
  DragDropModule,
  PortalModule,
  LayoutModule,
  ...ZardCardImports,
  ...ZardAccordionImports
]
@NgModule({
  declarations: [],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...SHARED_IMPORTS],
  exports: [CommonModule, FormsModule, ReactiveFormsModule, ...SHARED_IMPORTS]
})
export class NxStorySharedModule {}
