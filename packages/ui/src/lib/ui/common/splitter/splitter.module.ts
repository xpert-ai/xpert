import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { SplitterPaneComponent } from './splitter-pane/splitter-pane.component'
import { SplitterBarComponent, SplitterComponent } from './splitter.component'

@NgModule({
  declarations: [SplitterPaneComponent, SplitterBarComponent, SplitterComponent],
  imports: [CommonModule, DragDropModule],
  exports: [SplitterPaneComponent, SplitterBarComponent, SplitterComponent]
})
export class SplitterModule {}
