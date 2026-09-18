import { Clipboard } from '@angular/cdk/clipboard'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { HttpErrorResponse } from '@angular/common/http'
import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import {
  TIntegrationProvider,
  TIntegrationQrCompletion,
  TIntegrationQrCreateInput,
  TIntegrationQrSession
} from '@xpert-ai/contracts'
import { XpI18nPipe, ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, IntegrationService, Store } from '../../../../@core'
import { QRCodeComponent } from '../../../../@shared/qrcode'

export interface IntegrationQrDialogData {
  provider: TIntegrationProvider
  input: TIntegrationQrCreateInput
  organizationId: string
  userId: string
}

@Component({
  standalone: true,
  selector: 'xp-integration-qr-dialog',
  imports: [TranslateModule, XpI18nPipe, QRCodeComponent, ZardButtonComponent, ZardIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex w-[440px] max-w-[calc(100vw-32px)] flex-col">
      <header class="flex items-center justify-between gap-3 border-b border-border px-6 py-5">
        <div class="min-w-0">
          <h2 id="integration-qr-title" class="text-lg font-semibold">{{ 'XP.Integration.Qr.Title' | translate }}</h2>
          <p class="mt-1 text-sm text-muted-foreground">{{ data.provider.label | i18n }} · {{ data.input.name }}</p>
        </div>
        <button
          z-button
          zType="ghost"
          zSize="icon-sm"
          type="button"
          [zDisabled]="state() === 'saving'"
          [attr.aria-label]="'XP.Integration.Qr.Close' | translate"
          (click)="dialogRef.close()"
        >
          <z-icon zType="x" />
        </button>
      </header>
      <div class="flex min-h-72 flex-col items-center gap-4 px-6 py-6 text-center">
        <p class="text-sm leading-6 text-muted-foreground">{{ 'XP.Integration.Qr.Intro' | translate }}</p>
        @if (state() === 'waiting' && session(); as qr) {
          <qrcode [qrdata]="qr.authorizationUrl" [width]="220" />
          <p role="status" class="text-sm">{{ 'XP.Integration.Qr.Waiting' | translate }}</p>
          <button z-button zType="outline" type="button" (click)="copyLink()">
            {{ (copied() ? 'XP.Integration.Qr.Copied' : 'XP.Integration.Qr.Copy') | translate }}
          </button>
        }
        @if (state() === 'loading' || state() === 'saving') {
          <z-icon zType="loader-circle" class="animate-spin" />
          <p role="status" class="text-sm">
            {{ (state() === 'loading' ? 'XP.Integration.Qr.Loading' : 'XP.Integration.Qr.Saving') | translate }}
          </p>
        }
        @if (error()) {
          <p role="alert" class="text-sm text-destructive">{{ error() }}</p>
        }
        @if (state() === 'expired' || state() === 'failed') {
          @if (!error()) {
            <p role="status" class="text-sm">
              {{ (state() === 'expired' ? 'XP.Integration.Qr.Expired' : 'XP.Integration.Qr.Failed') | translate }}
            </p>
          }
          <button z-button type="button" (click)="authorized ? complete() : start()">
            {{ 'XP.Integration.Qr.Retry' | translate }}
          </button>
        }
      </div>
      <p class="border-t border-border px-6 py-4 text-xs leading-5 text-muted-foreground">
        {{ 'XP.Integration.Qr.BindingHint' | translate }}
      </p>
    </section>
  `
})
export class IntegrationQrDialogComponent implements OnInit, OnDestroy {
  readonly data = inject<IntegrationQrDialogData>(DIALOG_DATA)
  readonly dialogRef = inject<DialogRef<TIntegrationQrCompletion>>(DialogRef)
  private readonly api = inject(IntegrationService)
  private readonly store = inject(Store)
  private readonly clipboard = inject(Clipboard)
  private readonly organizationId = toSignal(this.store.selectOrganizationId())
  private readonly user = toSignal(this.store.user$)
  readonly state = signal<'loading' | 'waiting' | 'saving' | 'expired' | 'failed'>('loading')
  readonly session = signal<TIntegrationQrSession | null>(null)
  readonly error = signal<string | null>(null)
  readonly copied = signal(false)
  authorized = false
  private generation = 0
  private destroyed = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor() {
    effect(() => {
      if (this.organizationId() !== this.data.organizationId || this.user()?.id !== this.data.userId)
        this.dialogRef.close()
    })
  }

  ngOnInit() {
    void this.start()
  }

  async start() {
    if (this.state() === 'saving' || this.destroyed) return
    this.stop()
    const generation = this.generation
    this.authorized = false
    this.copied.set(false)
    this.error.set(null)
    this.state.set('loading')
    try {
      const session = await firstValueFrom(this.api.beginQrAuthorization(this.data.provider.name, this.data.input))
      if (!this.current(generation)) {
        void this.cancel(session.id)
        return
      }
      this.session.set(session)
      this.state.set('waiting')
      this.schedule(generation)
    } catch (error) {
      this.fail(error, generation)
    }
  }

  async poll(generation = this.generation) {
    const session = this.session()
    if (!session || !this.current(generation)) return
    if (Date.now() >= session.expiresAt) {
      this.state.set('expired')
      return
    }
    try {
      const result = await firstValueFrom(this.api.pollQrAuthorization(session.id))
      if (!this.current(generation)) return
      if (result.status === 'authorized') {
        this.authorized = true
        await this.complete()
      } else if (result.status === 'waiting') this.schedule(generation)
      else this.state.set(result.status === 'expired' ? 'expired' : 'failed')
    } catch (error) {
      this.fail(error, generation)
    }
  }

  async complete() {
    const session = this.session()
    if (!session || !this.authorized || !this.current(this.generation) || this.state() === 'saving') return
    const generation = this.generation
    this.state.set('saving')
    this.error.set(null)
    this.dialogRef.disableClose = true
    try {
      const result = await firstValueFrom(this.api.completeQrAuthorization(session.id))
      if (this.current(generation)) this.dialogRef.close(result)
    } catch (error) {
      this.fail(error, generation)
    } finally {
      this.dialogRef.disableClose = false
    }
  }

  copyLink() {
    const link = this.session()?.authorizationUrl
    if (link) this.copied.set(this.clipboard.copy(link))
  }

  private fail(error: unknown, generation: number) {
    if (!this.current(generation)) return
    if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 410)) {
      this.authorized = false
      this.state.set('expired')
    } else {
      this.error.set(getErrorMessage(error))
      this.state.set('failed')
    }
  }

  private schedule(generation: number) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.poll(generation), (this.session()?.intervalSeconds ?? 3) * 1000)
  }

  private current(generation: number) {
    return (
      !this.destroyed &&
      this.generation === generation &&
      this.store.organizationId === this.data.organizationId &&
      this.store.userId === this.data.userId
    )
  }

  private async cancel(id: string) {
    try {
      await firstValueFrom(this.api.cancelQrAuthorization(id))
    } catch {
      /* Expired sessions need no cleanup. */
    }
  }

  private stop() {
    this.generation++
    clearTimeout(this.timer)
    const session = this.session()
    this.session.set(null)
    if (session) void this.cancel(session.id)
  }

  ngOnDestroy() {
    this.destroyed = true
    this.stop()
  }
}
