import { CommonModule } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CopyComponent } from '@cloud/app/@shared/common'
import { FileEditorComponent } from '@cloud/app/@shared/files'
import { TChatMessageStep, TFile } from '@metad/contracts'
import { FileTypePipe, SafePipe } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { MarkdownModule } from 'ngx-markdown'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { XpertHomeService } from '../../home.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    MarkdownModule,
    SafePipe,
    CopyComponent,
    FileEditorComponent
  ],
  selector: 'chat-canvas-file-editor',
  templateUrl: './file-editor.component.html',
  styleUrl: 'file-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasFileEditorComponent {
  readonly homeService = inject(XpertHomeService)
  readonly httpClient = inject(HttpClient)

  // Inputs
  readonly step = input<TChatMessageStep<TFile>>()

  // States
  readonly preview = signal(true)
  readonly file = computed(() => this.step().data)

  readonly url = computed(() => this.file()?.url)

  readonly content = derivedAsync(() => {
    const file = this.file()
    if (file.contents) {
      return of(file.contents)
    }
    return this.url() ? this.httpClient.get(this.url(), { responseType: 'text' }) : null
  })

  readonly extension = computed(() => this.file()?.filePath?.split('.').pop()?.toLowerCase())
  readonly fileType = computed(() =>
    this.file()?.filePath ? new FileTypePipe().transform(this.file().filePath) : null
  )

  // constructor() {
  //   effect(() => {
  //     console.log(this.file())
  //   })
  // }

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
