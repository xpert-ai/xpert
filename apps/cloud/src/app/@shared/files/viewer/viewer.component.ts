import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSegmentedComponent, ZardSegmentedItemComponent } from '@xpert-ai/headless-ui'
import { MarkdownModule } from 'ngx-markdown'
import { FileEditorComponent } from '../editor/editor.component'
import { FormsModule } from '@angular/forms'

export type FilePanelMode = 'view' | 'edit'

@Component({
  standalone: true,
  selector: 'pac-file-viewer',
  templateUrl: './viewer.component.html',
  styleUrls: ['./viewer.component.css'],
  imports: [CommonModule, FormsModule, TranslateModule, MarkdownModule, NgmSpinComponent, ZardSegmentedComponent, ZardSegmentedItemComponent, FileEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FileViewerComponent {
  readonly filePath = input<string | null>(null)
  readonly content = input<string>('')
  readonly loading = input(false)
  readonly saving = input(false)
  readonly readable = input(false)
  readonly editable = input(false)
  readonly markdown = input(false)
  readonly dirty = input(false)
  readonly mode = model<FilePanelMode>('view')
  readonly readOnlyHint = input(
    'This file is shown in read-only mode. Only markdown, code, and selected text formats can be edited.'
  )

  readonly contentChange = output<string>()
  readonly discard = output<void>()
  readonly save = output<void>()
  readonly back = output<void>()
}
