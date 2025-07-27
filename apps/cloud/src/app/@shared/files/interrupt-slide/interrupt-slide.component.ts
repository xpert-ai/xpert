import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { injectToastr, SandboxService } from '@cloud/app/@core/'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { uniqWith } from 'lodash-es'
import { AbstractInterruptComponent } from '../../agent'
import { injectI18nService } from '../../i18n'
import { UploadComponent, UploadFile } from '../upload/upload.component'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, UploadComponent, NgmSpinComponent],
  selector: 'xp-file-interrupt-slide',
  templateUrl: 'interrupt-slide.component.html',
  styleUrls: ['interrupt-slide.component.scss']
})
export class InterruptSlideComponent extends AbstractInterruptComponent<{ workspace?: string; path?: string; file?: string }, { filePath?: string }> {
  readonly i18nService = injectI18nService()
  readonly sandboxService = inject(SandboxService)
  readonly #toastr = injectToastr()

  readonly workspace = computed(() => this.data()?.workspace)
  readonly path = computed(() => this.data()?.path)
  readonly file = computed(() => this.data()?.file)

  readonly loading = signal(false)

  fileList: UploadFile[] = []

  async onFileListChange(files: FileList) {
    this.fileList = uniqWith([...this.fileList, ...Array.from(files).map((file) => ({ file }))], (a, b) => {
      return a.file.name === b.file.name && a.file.size === b.file.size && a.file.lastModified === b.file.lastModified
    })
  }
  removeFiles(files: UploadFile[]) {
    for (const file of files) {
      this.removeFile(this.fileList.indexOf(file))
    }
  }

  removeFile(index: number) {
    const file = this.fileList[index]
    this.fileList.splice(index, 1)
    this.fileList = [...this.fileList]
  }

  upload() {
    this.loading.set(true)
    const file = this.fileList[0]?.file
    this.sandboxService.uploadFile(file, {workspace: this.workspace(), conversationId: this.conversationId(), path: this.path()}).subscribe({
      next: (result) => {
        this.loading.set(false)
        if (result) {
          this.value.set({ filePath: result.filePath })
        }
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(this.i18nService.t('PAC.MODEL.UploadFailed', { Default: 'Upload failed' }))
      }
    })
  }
}
