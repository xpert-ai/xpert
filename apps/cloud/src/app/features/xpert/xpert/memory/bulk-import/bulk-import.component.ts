import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr, XpertAPIService } from '@cloud/app/@core'
import { LongTermMemoryTypeEnum } from '@metad/contracts'
import { NgmDndDirective, OverlayAnimation1, readExcelWorkSheets } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CdkMenuModule, NgmDndDirective, NgmSpinComponent],
  selector: 'xpert-memory-bulk-import',
  templateUrl: './bulk-import.component.html',
  styleUrl: './bulk-import.component.scss',
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryBulkImportComponent {
  eLongTermMemoryTypeEnum = LongTermMemoryTypeEnum

  readonly #data = inject<{ xpertId: string; type: LongTermMemoryTypeEnum }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #xpertAPI = inject(XpertAPIService)
  readonly #toastr = injectToastr()

  readonly xpertId = signal(this.#data.xpertId)
  readonly type = signal(this.#data.type)
  readonly file = signal<File>(null)
  readonly rows = signal<any[]>([])

  readonly loading = signal(false)

  close() {
    this.#dialogRef.close()
  }

  downloadTemplate() {
    let csvContent = ''
    switch (this.type()) {
      case LongTermMemoryTypeEnum.QA:
        csvContent = 'question,answer\n'
        break
      case LongTermMemoryTypeEnum.PROFILE:
        csvContent = 'profile,context\n'
        break
    }

    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = this.type() + '-memory-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async onFileDropped(event: FileList) {
    if (event.length > 0) {
      await this.onFile(event.item(0))
    }
  }

  async onFile(file: File) {
    this.file.set(file)
    const sheets = await readExcelWorkSheets(file)
    this.rows.set(sheets[0]?.data)
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    if (input.files && input.files.length > 0) {
      const file = input.files[0]
      this.onFile(file)
    }
  }

  async upload() {
    this.loading.set(true)
    this.#xpertAPI.bulkCreateMemories(this.xpertId(), { type: this.type(), memories: this.rows() }).subscribe({
      next: (response) => {
        this.loading.set(false)
        this.#dialogRef.close(true)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }
}
