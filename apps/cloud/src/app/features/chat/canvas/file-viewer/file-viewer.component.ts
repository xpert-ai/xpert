import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import { FileEditorComponent } from 'apps/cloud/src/app/@shared/files'
import { MarkdownModule } from 'ngx-markdown'
import { derivedAsync } from 'ngxtension/derived-async'
import { ChatHomeService } from '../../home.service'
import { CopyComponent } from 'apps/cloud/src/app/@shared/common'
import { FileTypePipe, SafePipe } from '@metad/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, MatTooltipModule, MarkdownModule, SafePipe, FileTypePipe, CopyComponent, FileEditorComponent],
  selector: 'chat-canvas-file-viewer',
  templateUrl: './file-viewer.component.html',
  styleUrl: 'file-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasFileViewerComponent {
  readonly homeService = inject(ChatHomeService)
  readonly httpClient = inject(HttpClient)

  // States
  readonly preview = signal(true)
  readonly file = computed(
    () => this.homeService.canvasOpened()?.type === 'File' && this.homeService.canvasOpened()?.file
  )
  readonly url = computed(() => this.file()?.url)

  readonly content = derivedAsync(() => {
    return this.url() ? this.httpClient.get(this.url(), { responseType: 'text' }) : null
  })

  readonly fileType = computed(() => this.file()?.name ? new FileTypePipe().transform(this.file().name) : null)

  constructor() {
    effect(() => {
      // console.log(this.file())
    })
  }

  exportToPdf() {
    // Check if the URL is available
    const fileUrl = this.url()
    if (fileUrl) {
      // Open the URL in a new tab
      window.open(fileUrl + '.pdf', '_blank');
    } else {
      console.error('No URL available to open.');
    }
  }

  download() {
    // Check if the URL is available
    const fileUrl = this.url()
    if (fileUrl) {
      // Open the URL in a new tab
      window.open(fileUrl, '_blank');
    } else {
      console.error('No URL available to open.');
    }
  }

  close() {
    this.homeService.canvasOpened.set(null)
  }
}
