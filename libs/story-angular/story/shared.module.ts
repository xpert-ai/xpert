import { DragDropModule } from '@angular/cdk/drag-drop'
import { LayoutModule } from '@angular/cdk/layout'
import { PortalModule } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'

import { MatCardModule } from '@angular/material/card'
import { MatCheckboxModule } from '@angular/material/checkbox'
import { MatDialogModule } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { ZardInputDirective, ZardFormImports } from '@xpert-ai/headless-ui'
import { MatListModule } from '@angular/material/list'
import { MatProgressBarModule } from '@angular/material/progress-bar'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatSidenavModule } from '@angular/material/sidenav'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTableModule } from '@angular/material/table'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatTooltipModule } from '@angular/material/tooltip'
import {MatExpansionModule} from '@angular/material/expansion'
import { ZardButtonComponent, ZardTabsImports } from '@xpert-ai/headless-ui'

const MAT_MODULES = [MatIconModule, ZardButtonComponent, MatListModule, ...ZardTabsImports, ...ZardFormImports, ZardInputDirective, MatDialogModule, MatSidenavModule, MatTableModule, MatCheckboxModule, MatToolbarModule, MatTooltipModule, MatProgressBarModule, DragDropModule, PortalModule, LayoutModule, MatSlideToggleModule, MatProgressSpinnerModule, MatCardModule, MatExpansionModule]
@NgModule({
  declarations: [],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ...MAT_MODULES,
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ...MAT_MODULES,
  ]
})
export class NxStorySharedModule {}
