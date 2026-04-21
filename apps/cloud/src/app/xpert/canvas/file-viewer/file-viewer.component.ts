
import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { FileTypePipe } from '@xpert-ai/core'
import { TranslateModule } from '@ngx-translate/core'
import { FileEditorComponent } from '@cloud/app/@shared/files'
import { CopyComponent } from '@cloud/app/@shared/common'
import { XpertHomeService } from '../../home.service'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
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
  selector: 'chat-canvas-file-viewer',
  templateUrl: './file-viewer.component.html',
  styleUrl: 'file-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasFileViewerComponent {
  readonly homeService = inject(XpertHomeService)
  readonly httpClient = inject(HttpClient)

  // States
  readonly preview = signal(true)
  readonly file = computed(
    () => this.homeService.canvasOpened()?.type === 'File' && this.homeService.canvasOpened()?.file
  )
  readonly url = computed(() => this.file()?.url)
  readonly previewSource = computed(() => toCanvasFilePreviewSource(this.file()))
  readonly extension = computed(() => this.previewSource()?.extension)
  readonly fileType = computed(() => (this.file()?.name ? new FileTypePipe().transform(this.file().name) : null))
  readonly previewState = createCanvasFilePreviewState(this.previewSource, (url) =>
    firstValueFrom(this.httpClient.get(url, { responseType: 'text' }))
  )
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

  close() {
    this.homeService.canvasOpened.set(null)
  }
}
