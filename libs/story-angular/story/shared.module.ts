import { DragDropModule } from '@angular/cdk/drag-drop'
import { LayoutModule } from '@angular/cdk/layout'
import { PortalModule } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatDialogModule } from '@angular/material/dialog'
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
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatProgressBarModule } from '@angular/material/progress-bar'

const MAT_MODULES = [
  ZardIconComponent,
  ZardButtonComponent,
  MatListModule,
  ...ZardTabsImports,
  ...ZardFormImports,
  ZardInputDirective,
  ZardDialogModule,
  ...ZardDrawerImports,
  ...ZardTableImports,
  ZardCheckboxComponent,
  ...ZardTooltipImports,
  MatProgressBarModule,
  DragDropModule,
  PortalModule,
  LayoutModule,
  ...ZardCardImports,
  ...ZardAccordionImports
]
@NgModule({
  declarations: [],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...MAT_MODULES],
  exports: [CommonModule, FormsModule, ReactiveFormsModule, ...MAT_MODULES]
})
export class NxStorySharedModule {}
