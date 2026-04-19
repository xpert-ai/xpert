
import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CopyComponent } from '@cloud/app/@shared/common'
import { FileEditorComponent } from '@cloud/app/@shared/files'
import { TChatMessageStep, TFile } from '@xpert-ai/contracts'
import { FileTypePipe } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { ChatCanvasFilePreviewContentComponent } from '../file-preview/file-preview-content.component'
import { createCanvasFilePreviewState, toCanvasFilePreviewSource } from '../file-preview/file-preview.utils'
@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    CopyComponent,
    FileEditorComponent,
    ChatCanvasFilePreviewContentComponent
  ],
  selector: 'chat-canvas-file-editor',
  templateUrl: './file-editor.component.html',
  styleUrl: 'file-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasFileEditorComponent {
  readonly httpClient = inject(HttpClient)

  // Inputs
  readonly step = input<TChatMessageStep<TFile>>()

  // States
  readonly preview = signal(true)
  readonly file = computed(() => this.step().data)

  readonly url = computed(() => this.file()?.url)
  readonly previewSource = computed(() =>
    toCanvasFilePreviewSource({
      ...this.file(),
      name: this.file()?.filePath
    })
  )
  readonly extension = computed(() => this.previewSource()?.extension)
  readonly fileType = computed(() =>
    this.file()?.filePath ? new FileTypePipe().transform(this.file().filePath) : null
  )
  readonly previewState = createCanvasFilePreviewState(this.previewSource, async (url) => {
    const file = this.file()
    if (file?.contents) {
      return file.contents
    }

    return firstValueFrom(this.httpClient.get(url, { responseType: 'text' }))
  })
  readonly previewKind = this.previewState.previewKind
  readonly previewData = this.previewState.previewData
  readonly previewLoading = this.previewState.previewLoading
  readonly canTogglePreview = this.previewState.canTogglePreview
  readonly canCopyPreview = this.previewState.canCopyPreview
  readonly canExportToPdf = this.previewState.canExportToPdf

  constructor() {
    effect(
      () => {
        this.file()
        this.preview.set(true)
      }
    )
  }

  exportToPdf() {
    // Check if the URL is available
    const fileUrl = this.url()
    if (fileUrl) {
      // Open the URL in a new tab
      window.open(fileUrl + '.pdf', '_blank')
    } else {
      console.error('No URL available to open.')
    }
  }

  download() {
    // Check if the URL is available
    const fileUrl = this.url()
    if (fileUrl) {
      // Open the URL in a new tab
      window.open(fileUrl, '_blank')
    } else {
      console.error('No URL available to open.')
    }
  }
}
