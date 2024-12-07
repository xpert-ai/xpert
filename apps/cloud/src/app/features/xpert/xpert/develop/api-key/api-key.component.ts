import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { MaskPipe } from '@metad/core'
import { CdkConfirmDeleteComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ApiKeyService, getErrorMessage, IApiKey, injectToastr } from 'apps/cloud/src/app/@core'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { map, switchMap } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTooltipModule,
    NgmSpinComponent,
    MaskPipe
  ],
  selector: 'xpert-develop-api-key',
  templateUrl: './api-key.component.html',
  styleUrl: 'api-key.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertDevelopApiKeyComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #dialog = inject(Dialog)
  readonly #data = inject<{ xpertId: string }>(DIALOG_DATA)
  readonly apiKeyService = inject(ApiKeyService)
  readonly #clipboard = inject(Clipboard)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly refresh$ = new BehaviorSubject<void>(null)
  readonly keys = toSignal<Array<IApiKey & { copied?: boolean }>>(
    this.refresh$.pipe(
      switchMap(() => this.apiKeyService.getAll({ where: { type: 'xpert', entityId: this.#data.xpertId } })),
      map(({ items }) => items)
    )
  )

  readonly loading = signal(false)

  createApiKey() {
    this.loading.set(true)
    this.apiKeyService.create({ type: 'xpert', entityId: this.#data.xpertId }).subscribe({
      next: (result) => {
        this.loading.set(false)
        this.refresh$.next()
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  delete(key: IApiKey & { copied?: boolean }) {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          title: this.#translate.instant('PAC.Xpert.DeleteApiKey', {Default: 'Delete this api key?'}),
          information: this.#translate.instant('PAC.Xpert.ActionUndone', {Default: 'This action cannot be undone.'})
        }
      })
      .closed.pipe(
        switchMap((confirm) => {
          if (confirm) {
            this.loading.set(true)
            return this.apiKeyService.delete(key.id)
          }
          return EMPTY
        })
      )
      .subscribe({
        next: (result) => {
          this.loading.set(false)
          this.refresh$.next()
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  copy(key: IApiKey & { copied?: boolean }) {
    this.#clipboard.copy(key.token)
    this.#toastr.info({ code: 'PAC.KEY_WORDS.Copied', default: 'Copied' })
    key.copied = true
  }

  close() {
    this.#dialogRef.close()
  }
}
