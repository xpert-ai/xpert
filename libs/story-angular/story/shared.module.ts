import { DragDropModule } from '@angular/cdk/drag-drop'
import { LayoutModule } from '@angular/cdk/layout'
import { PortalModule } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { ZardAccordionImports, ZardButtonComponent, ZardCardImports, ZardCheckboxComponent, ZardDialogModule, ZardFormImports, ZardIconComponent, ZardInputDirective, ZardTabsImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatTableModule } from '@angular/material/table'

const MAT_MODULES = [
  ZardIconComponent,
  ZardButtonComponent,
  MatListModule,
  ...ZardTabsImports,
  ...ZardFormImports,
  ZardInputDirective,
  ZardDialogModule,
  MatSidenavModule,
  MatTableModule,
  ZardCheckboxComponent,
  ...ZardTooltipImports,
  MatProgressBarModule,
  DragDropModule,
  PortalModule,
  LayoutModule,
  MatProgressSpinnerModule,
  ...ZardCardImports,
  ...ZardAccordionImports
]
@NgModule({
  declarations: [],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...MAT_MODULES],
  exports: [CommonModule, FormsModule, ReactiveFormsModule, ...MAT_MODULES]
})
export class NxStorySharedModule {}
