import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { NgModule } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { PlaceholderAddComponent } from '@xpert-ai/story/story'
import { EditorModule } from '@tinymce/tinymce-angular'
import { NxWidgetDocumentComponent } from './document.component'

@NgModule({
  declarations: [NxWidgetDocumentComponent],
  imports: [
    CommonModule,
    FormsModule,
    EditorModule,
    TranslateModule,
    DragDropModule,
    ContentLoaderModule,
    PlaceholderAddComponent
  ],
  exports: [NxWidgetDocumentComponent]
})
export class NxWidgetDocumentModule {}
