import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr, IUser, XpertAPIService } from '@cloud/app/@core'
import { NgmDndDirective, OverlayAnimation1 } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, CdkMenuModule, NgmDndDirective, NgmSpinComponent],
  selector: 'xpert-manager-bulk-import',
  templateUrl: './bulk-import.component.html',
  styleUrl: './bulk-import.component.scss',
  animations: [OverlayAnimation1],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertManagerBulkImportComponent {
  readonly #data = inject<{ xpertId: string }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly #xpertAPI = inject(XpertAPIService)
  readonly #toastr = injectToastr()

  readonly xpertId = signal(this.#data.xpertId)
  readonly file = signal<File>(null)
  readonly users = signal<IUser[]>([])
  readonly loading = signal(false)

  close() {
    this.#dialogRef.close()
  }

  downloadTemplate() {
    const csvContent = 'email\nuser1@example.com\nuser2@example.com\n'
    const bom = '\uFEFF'
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'managers-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async onFileDropped(event: FileList) {
    if (event.length > 0) {
      await this.onFile(event.item(0))
    }
  }

  async onFile(file: File) {
    try {
      this.loading.set(true)
      this.file.set(file)
      // Call backend API to parse CSV with proper encoding detection
      const parsedUsers = await firstValueFrom(
        this.#xpertAPI.uploadAndParseManagersCsv(this.xpertId(), file)
      )
      this.users.set(parsedUsers)
    } catch (err) {
      this.#toastr.error(getErrorMessage(err))
    } finally {
      this.loading.set(false)
    }
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
    this.#xpertAPI.bulkAddManagers(this.xpertId(), this.users().map(u => u.id)).subscribe({
      next: (response) => {
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved Successfully' })
        this.#dialogRef.close(true)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }
}
