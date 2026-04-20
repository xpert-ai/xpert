import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog, DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MaskPipe } from '@xpert-ai/core'
import { CdkConfirmDeleteComponent, NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ApiKeyBindingType,
  ApiKeyService,
  DateFormatPipe,
  DateRelativePipe,
  getErrorMessage,
  IApiKey,
  injectToastr
} from 'apps/cloud/src/app/@core'
import { EMPTY, firstValueFrom } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { derivedAsync } from 'ngxtension/derived-async'

type ApiKeyListItem = IApiKey & { copied?: boolean }

const EMPTY_API_KEYS: ApiKeyListItem[] = []

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    NgmSpinComponent,
    MaskPipe,
    DateFormatPipe,
    DateRelativePipe
  ],
  selector: 'xpert-develop-api-key',
  templateUrl: './api-key.component.html',
  styleUrl: 'api-key.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertDevelopApiKeyComponent {
  readonly #dialogRef = inject(DialogRef, { optional: true })
  readonly #dialog = inject(Dialog)
  readonly #data = inject<{ type: ApiKeyBindingType; id: string } | null>(DIALOG_DATA, { optional: true })
  readonly apiKeyService = inject(ApiKeyService)
  readonly #clipboard = inject(Clipboard)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly bindingType = input<ApiKeyBindingType | null>(null)
  readonly bindingId = input<string | null>(null)
  readonly subjectName = input<string | null>(null)
  readonly showCloseButton = input(true)

  readonly resolvedBindingType = computed(() => this.bindingType() ?? this.#data?.type ?? null)
  readonly resolvedBindingId = computed(() => this.bindingId() ?? this.#data?.id ?? null)
  readonly isWorkspaceBinding = computed(() => this.resolvedBindingType() === ApiKeyBindingType.WORKSPACE)

  readonly refreshVersion = signal(0)
  readonly keys = derivedAsync<ApiKeyListItem[]>(
    async () => {
      this.refreshVersion()

      const type = this.resolvedBindingType()
      const entityId = this.resolvedBindingId()
      if (!type || !entityId) {
        return EMPTY_API_KEYS
      }

      const { items } = await firstValueFrom(this.apiKeyService.getAll({ where: { type, entityId } }))
      return items.map((item) => ({ ...item }))
    },
    { initialValue: EMPTY_API_KEYS }
  )

  readonly loading = signal(false)

  createApiKey() {
    const type = this.resolvedBindingType()
    const entityId = this.resolvedBindingId()
    if (!type || !entityId) {
      return
    }

    this.loading.set(true)
    this.apiKeyService.create({ type, entityId }).subscribe({
      next: () => {
        this.loading.set(false)
        this.refreshVersion.update((value) => value + 1)
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  delete(key: ApiKeyListItem) {
    this.#dialog
      .open(CdkConfirmDeleteComponent, {
        data: {
          title: this.#translate.instant('PAC.Xpert.DeleteApiKey', { Default: 'Delete this api key?' }),
          information: this.#translate.instant('PAC.Xpert.ActionUndone', { Default: 'This action cannot be undone.' })
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
        next: () => {
          this.loading.set(false)
          this.refreshVersion.update((value) => value + 1)
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  copy(key: ApiKeyListItem) {
    this.#clipboard.copy(key.token)
    this.#toastr.info({ code: 'PAC.KEY_WORDS.Copied', default: 'Copied' })
    key.copied = true
  }

  close() {
    this.#dialogRef?.close()
  }
}
