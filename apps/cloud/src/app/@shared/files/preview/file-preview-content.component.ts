import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core'
import { SafePipe } from '@xpert-ai/core'
import { NgmSpinComponent, NgmTableComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { FilePreviewKind, SpreadsheetPreview } from './file-preview.utils'

@Component({
  standalone: true,
  selector: 'pac-file-preview-content',
  templateUrl: './file-preview-content.component.html',
  imports: [TranslateModule, MarkdownModule, SafePipe, NgmSpinComponent, NgmTableComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FilePreviewContentComponent {
  readonly previewKind = input<FilePreviewKind>('unsupported')
  readonly content = input<string | null>(null)
  readonly downloadable = input(false)
  readonly error = input<string | null>(null)
  readonly fileName = input<string>('')
  readonly loading = input(false)
  readonly spreadsheet = input<SpreadsheetPreview | null>(null)
  readonly url = input<string | null>(null)

  readonly download = output<void>()

  readonly selectedSheetIndex = signal(0)
  readonly activeSheet = computed(() => this.spreadsheet()?.sheets[this.selectedSheetIndex()] ?? null)
  readonly showUnsupportedState = computed(
    () =>
      !this.loading() &&
      (this.previewKind() === 'unsupported' ||
        !!this.error() ||
        (this.previewKind() === 'spreadsheet' && !this.activeSheet()))
  )

  readonly #resetSheetSelectionEffect = effect(() => {
    this.spreadsheet()
    this.selectedSheetIndex.set(0)
  })
}
