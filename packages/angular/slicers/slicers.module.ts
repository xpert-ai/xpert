import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { MatMenuModule } from '@angular/material/menu'
import { NgmSelectComponent } from '@metad/ocap-angular/common'
import { OcapCoreModule } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { SlicerSelectComponent } from './select/select.component'
import { NgmSlicerPipe } from './slicer/slicer.pipe'
import { SortByComponent } from './sort-by/sort-by.component'
import { ZardButtonComponent, ZardFormImports } from '@xpert-ai/headless-ui'

@NgModule({
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, ...ZardFormImports, ZardButtonComponent, MatMenuModule, MatIconModule, OcapCoreModule, NgmSlicerPipe, NgmSelectComponent],
  exports: [SlicerSelectComponent, SortByComponent, NgmSlicerPipe],
  declarations: [SlicerSelectComponent, SortByComponent],
  providers: []
})
export class SlicersModule {}
