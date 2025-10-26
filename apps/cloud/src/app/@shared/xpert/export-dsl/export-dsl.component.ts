import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { getErrorMessage, injectToastr, XpertAPIService } from '@cloud/app/@core'
import { SlideUpAnimation } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { tap } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmSpinComponent, MatSlideToggleModule],
  selector: 'xpert-export-dsl',
  templateUrl: './export-dsl.component.html',
  styleUrl: './export-dsl.component.scss',
  animations: [SlideUpAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertExportDslComponent {
  readonly #data = inject<{ xpertId: string; slug: string; isDraft: boolean }>(DIALOG_DATA)
  readonly #dialogRef = inject(DialogRef)
  readonly exportXpertDsl = injectExportXpertDsl()
  readonly #toastr = injectToastr()

  readonly xpertId = signal(this.#data.xpertId)
  readonly loading = signal(false)

  readonly isDraft = signal(this.#data.isDraft)
  readonly includeMemory = model(false)

  close() {
    this.#dialogRef.close()
  }

  exportDsl() {
    this.loading.set(true)
    this.exportXpertDsl(this.xpertId(), {
      isDraft: this.isDraft(),
      includeMemory: this.includeMemory(),
      slug: this.#data.slug
    }).subscribe({
      next: () => {
        this.loading.set(false)
        this.close()
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(`PAC.Xpert.ExportFailed`, getErrorMessage(err))
      }
    })
  }
}

export function injectExportXpertDsl() {
  const xpertAPI = inject(XpertAPIService)
  return (xpertId: string, params: { isDraft: boolean; includeMemory: boolean; slug?: string }) => {
    return xpertAPI.exportDSL(xpertId, { isDraft: params.isDraft, includeMemory: params.includeMemory }).pipe(
      tap((result) => {
        const blob = new Blob([result.data], { type: 'text/plain;charset=utf-8' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `xpert-${params.slug || xpertId}.yaml`
        a.click()
        window.URL.revokeObjectURL(url)
      })
    )
  }
}
