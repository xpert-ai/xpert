import {
  ChangeDetectionStrategy,
  Component,
  OnChanges,
  SimpleChanges,
  TemplateRef,
  effect,
  input,
  output,
  untracked,
  viewChild
} from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { FileViewerComponent, FileViewerSurface } from '../viewer/viewer.component'
import { FileDocumentState } from './file-document-state'

@Component({
  standalone: true,
  selector: 'xp-file-document',
  imports: [TranslateModule, ZardButtonComponent, FileViewerComponent],
  templateUrl: './file-document.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full min-h-0 min-w-0' }
})
export class FileDocumentComponent implements OnChanges {
  readonly document = input.required<FileDocumentState>()
  readonly active = input(true)
  readonly surface = input<FileViewerSurface>('plain')
  readonly sideMenuToggleVisible = input(false)
  readonly sideMenuVisible = input(true)
  readonly backVisible = input(false)
  readonly sideMenuToggle = output<void>()
  readonly back = output<void>()
  readonly fileViewer = viewChild(FileViewerComponent)
  readonly unsavedChangesDialog = viewChild<TemplateRef<unknown>>('unsavedChangesDialog')

  ngOnChanges(changes: SimpleChanges) {
    if (changes['active']) {
      if (this.active()) this.document().resumeView()
      else this.document().suspendView()
    }
  }

  constructor() {
    effect(() => {
      const state = this.document()
      const viewer = this.fileViewer()
      const dialog = this.unsavedChangesDialog()
      untracked(() => {
        state.fileViewer.set(viewer)
        state.unsavedChangesDialog.set(dialog)
      })
    })
  }
}
