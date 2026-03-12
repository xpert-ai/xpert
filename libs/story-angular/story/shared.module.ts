import { DragDropModule } from '@angular/cdk/drag-drop'
import { LayoutModule } from '@angular/cdk/layout'
import { PortalModule } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatCardModule } from '@angular/material/card'
import { MatDialogModule } from '@angular/material/dialog'
import {
  ZardButtonComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardTabsImports,
  ZardCheckboxComponent
} from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatTableModule } from '@angular/material/table'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MatExpansionModule } from '@angular/material/expansion'

const MAT_MODULES = [
  ZardIconComponent,
  ZardButtonComponent,
  MatListModule,
  ...ZardTabsImports,
  ...ZardFormImports,
  ZardInputDirective,
  MatDialogModule,
  MatSidenavModule,
  MatTableModule,
  ZardCheckboxComponent,
  MatToolbarModule,
  MatTooltipModule,
  MatProgressBarModule,
  DragDropModule,
  PortalModule,
  LayoutModule,
  MatProgressSpinnerModule,
  MatCardModule,
  MatExpansionModule
]
@NgModule({
  declarations: [],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, ...MAT_MODULES],
  exports: [CommonModule, FormsModule, ReactiveFormsModule, ...MAT_MODULES]
})
export class NxStorySharedModule {}
