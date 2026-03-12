import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { RouterModule } from '@angular/router'
import { TFile, TMessageComponent } from '@cloud/app/@core'
import { ChatFilesDialogComponent } from '@cloud/app/@shared/chat'
import { ArraySlicePipe, FileTypePipe } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpertHomeService } from '../../home.service'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    ...ZardTooltipImports,
    FileTypePipe,
    ArraySlicePipe
  ],
  selector: 'chat-component-message-files',
  templateUrl: './files.component.html',
  styleUrl: 'files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentMessageFilesComponent {
  readonly homeService = inject(XpertHomeService)
  readonly #dialog = inject(Dialog)

  // Inputs
  readonly data = input<TMessageComponent<{ files?: TFile[] }>>()

  // Files
  readonly files = computed(() => this.data()?.files)

  openFileViewer(file: TFile) {
    this.homeService.canvasOpened.set({
      opened: true,
      type: 'File',
      file
    })
  }

  openAllFiles() {
    this.#dialog
      .open<TFile>(ChatFilesDialogComponent, {
        data: {
          files: this.files()
        }
      })
      .closed.subscribe((file) => {
        if (file) {
          this.openFileViewer(file)
        }
      })
  }
}
