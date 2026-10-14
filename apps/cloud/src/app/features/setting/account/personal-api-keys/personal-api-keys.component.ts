import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CommonModule, DOCUMENT } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { PersonalApiKeyCreated, PersonalApiKeyCreateInput, PersonalApiKeySummary } from '@xpert-ai/contracts'
import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardIconComponent,
  ZardSearchInputComponent,
  ZardTableImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { PersonalApiKeysService } from '../../../../@core/services/personal-api-keys.service'
import { injectToastr } from '../../../../@core/services/toastr.service'
import { API_PREFIX } from '../../../../@core/state/constants'
import { getErrorMessage } from '../../../../@core/types'
import { PersonalApiKeyDialogComponent } from './personal-api-key-dialog.component'

@Component({
  standalone: true,
  selector: 'xp-personal-api-keys',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSearchInputComponent,
    ...ZardTableImports
  ],
  templateUrl: './personal-api-keys.component.html',
  host: { class: 'flex min-w-0 w-full flex-1' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PersonalApiKeysComponent implements OnInit {
  readonly #service = inject(PersonalApiKeysService)
  readonly #dialog = inject(Dialog)
  readonly #alert = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = injectToastr()
  readonly #clipboard = inject(Clipboard)
  readonly #document = inject(DOCUMENT)
  readonly keys = signal<PersonalApiKeySummary[]>([])
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly creating = signal(false)
  readonly revoking = signal<string | null>(null)
  readonly created = signal<PersonalApiKeyCreated | null>(null)
  readonly copied = signal(false)
  readonly searchControl = new FormControl('', { nonNullable: true })
  readonly search = toSignal(this.searchControl.valueChanges, { initialValue: '' })
  readonly filteredKeys = computed(() => {
    const term = this.search().trim().toLocaleLowerCase()
    return this.keys().filter((key) => `${key.name} ${key.prefix}`.toLocaleLowerCase().includes(term))
  })
  readonly example = `curl '${this.#document.defaultView?.location.origin ?? ''}${API_PREFIX}/user/me' \\\n  -H 'Authorization: Bearer YOUR_PERSONAL_API_KEY'`

  ngOnInit() {
    void this.load()
  }

  async load() {
    if (this.loading()) return
    this.loading.set(true)
    this.failed.set(false)
    try {
      this.keys.set(await firstValueFrom(this.#service.list()))
    } catch (error) {
      this.failed.set(true)
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  async create() {
    if (this.creating() || this.created()) return
    this.creating.set(true)
    try {
      const input = await firstValueFrom(
        this.#dialog.open<PersonalApiKeyCreateInput | null>(PersonalApiKeyDialogComponent, {
          backdropClass: 'backdrop-blur-xs-black',
          panelClass: 'xp-overlay-pane-dialog'
        }).closed
      )
      if (!input) return
      const result = await firstValueFrom(this.#service.create(input))
      this.created.set(result)
      this.copied.set(false)
      this.keys.update((keys) => [result.key, ...keys])
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.creating.set(false)
    }
  }

  copy() {
    const token = this.created()?.token
    if (!token) return
    try {
      this.copied.set(this.#clipboard.copy(token))
    } catch {
      this.copied.set(false)
    }
    if (!this.copied()) this.#toastr.error(this.#translate.instant('XP.PersonalApiKeys.CopyFailed'))
  }

  dismissSecret() {
    this.created.set(null)
    this.copied.set(false)
  }

  status(key: PersonalApiKeySummary) {
    if (key.revokedAt) return 'Revoked'
    return key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now() ? 'Expired' : 'Active'
  }

  async revoke(key: PersonalApiKeySummary) {
    if (this.revoking()) return
    const confirmed = await firstValueFrom(
      this.#alert.confirm({
        layout: 'standard',
        title: this.#translate.instant('XP.PersonalApiKeys.RevokeTitle'),
        description: this.#translate.instant('XP.PersonalApiKeys.RevokeHint', { name: key.name }),
        actionText: this.#translate.instant('XP.PersonalApiKeys.Revoke'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel'),
        destructive: true
      })
    )
    if (!confirmed) return
    this.revoking.set(key.id)
    try {
      await firstValueFrom(this.#service.revoke(key.id))
      this.keys.update((keys) =>
        keys.map((item) => (item.id === key.id ? { ...item, revokedAt: new Date().toISOString() } : item))
      )
      if (this.created()?.key.id === key.id) this.dismissSecret()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.revoking.set(null)
    }
  }
}
