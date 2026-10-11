import { XpDialogFrameImports } from '@xpert-ai/headless-ui'
import { ASSISTANT_SETTINGS_CONTEXT } from '../../../@shared/xpert/assistant-settings/assistant-settings-context'
import { Clipboard } from '@angular/cdk/clipboard'
import { HttpErrorResponse } from '@angular/common/http'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { TIntegrationQrSession } from '@xpert-ai/contracts'
import { XpI18nPipe, ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { getErrorMessage } from '../../../@core'
import { QRCodeComponent } from '../../../@shared/qrcode'
import { ClawXpertFacade } from '../../chat/clawxpert/clawxpert.facade'
import { AssistantTriggerDialogData } from './assistant-trigger-dialog.component'
import { AssistantTriggerConnectionService } from './assistant-trigger-connection.service'

@Component({
  standalone: true,
  selector: 'xp-assistant-trigger-qr',
  imports: [
    ...XpDialogFrameImports,
    TranslateModule,
    XpI18nPipe,
    QRCodeComponent,
    ZardButtonComponent,
    ZardIconComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section xpDialogLayout="wide" class="w-[min(440px,calc(100vw-32px))] max-h-[84dvh]">
      <header xpDialogHeader>
        <h2 xpDialogHeading>{{ data.card.provider.label | i18n }}</h2>
        <p xpDialogDescription>
          {{ 'XP.AssistantSettings.DirectQrIntro' | translate: { provider: (data.card.provider.label | i18n) } }}
        </p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [zDisabled]="state() === 'activating'"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="dialogRef.close()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>
      <div xpDialogBody>
        <div class="flex min-h-64 flex-col items-center gap-4 text-center">
          @if (state() === 'waiting' && session(); as qr) {
            <qrcode [qrdata]="qr.authorizationUrl" [width]="220" />
            <p role="status" class="text-sm">
              {{ 'XP.AssistantSettings.DirectQrWaiting' | translate: { provider: (data.card.provider.label | i18n) } }}
            </p>
          }
          @if (state() === 'loading' || state() === 'activating') {
            <z-icon zType="loader-circle" class="animate-spin" />
            <p role="status" class="text-sm">
              {{
                (state() === 'loading'
                  ? 'XP.AssistantSettings.DirectQrLoading'
                  : 'XP.AssistantSettings.DirectQrActivating'
                ) | translate
              }}
            </p>
          }
          @if (error()) {
            <p role="alert" class="text-sm text-destructive">{{ error() }}</p>
          }
          @if (state() === 'expired' || state() === 'failed') {
            @if (state() === 'expired') {
              <p class="text-sm">{{ 'XP.AssistantSettings.DirectQrExpired' | translate }}</p>
            }
          }
        </div>
      </div>
      <footer xpDialogFooter>
        @if (state() === 'waiting' && session()) {
          <button z-button zType="outline" type="button" (click)="copyLink()">
            {{ (copied() ? 'XP.AssistantSettings.DirectQrCopied' : 'XP.AssistantSettings.DirectQrCopy') | translate }}
          </button>
        }
        @if (state() === 'expired' || state() === 'failed') {
          <button z-button type="button" (click)="authorized ? activate() : start()">
            {{ 'XP.AssistantSettings.DirectQrRetry' | translate }}
          </button>
        }
      </footer>
    </section>
  `
})
export class AssistantTriggerQrComponent implements OnInit, OnDestroy {
  readonly data = inject<AssistantTriggerDialogData>(DIALOG_DATA)
  readonly dialogRef = inject<DialogRef<boolean>>(DialogRef)
  private readonly api = inject(AssistantTriggerConnectionService)
  private readonly facade = inject(ASSISTANT_SETTINGS_CONTEXT, { optional: true }) ?? inject(ClawXpertFacade)
  private readonly clipboard = inject(Clipboard)
  readonly state = signal<'loading' | 'waiting' | 'activating' | 'expired' | 'failed'>('loading')
  readonly session = signal<TIntegrationQrSession | null>(null)
  readonly error = signal<string | null>(null)
  readonly copied = signal(false)
  authorized = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private destroyed = false

  constructor() {
    effect(() => {
      if (this.facade.organizationId() !== this.data.organizationId || this.facade.xpertId() !== this.data.xpertId) {
        this.dialogRef.close()
      }
    })
  }

  ngOnInit() {
    void this.start()
  }

  async start() {
    if (this.state() === 'activating' || this.destroyed) return
    this.stop()
    const generation = this.generation
    this.authorized = false
    this.error.set(null)
    this.copied.set(false)
    this.state.set('loading')
    try {
      const qr = await this.api.begin(this.data.xpertId, this.data.card.provider.name)
      if (!this.current(generation)) {
        void this.api.cancel(this.data.xpertId, this.data.card.provider.name, qr.id).catch(() => undefined)
        return
      }
      this.session.set(qr)
      this.state.set('waiting')
      this.schedule(generation)
    } catch (error) {
      if (this.current(generation)) {
        this.error.set(getErrorMessage(error))
        this.state.set('failed')
      }
    }
  }

  private schedule(generation: number) {
    this.timer = setTimeout(() => void this.poll(generation), (this.session()?.intervalSeconds ?? 3) * 1000)
  }

  async poll(generation = this.generation) {
    const qr = this.session()
    if (!qr || !this.current(generation)) return
    if (Date.now() >= qr.expiresAt) {
      this.state.set('expired')
      return
    }
    try {
      const result = await this.api.poll(this.data.xpertId, this.data.card.provider.name, qr.id)
      if (!this.current(generation)) return
      if (result.status === 'authorized') {
        this.authorized = true
        await this.activate()
      } else if (result.status === 'waiting') this.schedule(generation)
      else this.state.set(result.status === 'expired' ? 'expired' : 'failed')
    } catch (error) {
      if (this.current(generation)) {
        this.error.set(getErrorMessage(error))
        this.state.set('failed')
      }
    }
  }

  async activate() {
    const qr = this.session()
    if (!qr || !this.current(this.generation) || this.state() === 'activating') return
    const generation = this.generation
    this.state.set('activating')
    this.error.set(null)
    this.dialogRef.disableClose = true
    try {
      const result = await this.api.complete(this.data.xpertId, this.data.card.provider.name, qr.id)
      if (this.current(generation) && result.connected) this.dialogRef.close(true)
      else if (this.current(generation)) this.state.set('failed')
    } catch (error) {
      if (this.current(generation)) {
        if (error instanceof HttpErrorResponse && (error.status === 404 || error.status === 410)) {
          this.authorized = false
          this.state.set('expired')
        } else {
          this.error.set(getErrorMessage(error))
          this.state.set('failed')
        }
      }
    } finally {
      this.dialogRef.disableClose = false
    }
  }

  copyLink() {
    const link = this.session()?.authorizationUrl
    if (link) this.copied.set(this.clipboard.copy(link))
  }

  private current(generation: number) {
    return (
      !this.destroyed &&
      this.generation === generation &&
      this.facade.organizationId() === this.data.organizationId &&
      this.facade.xpertId() === this.data.xpertId
    )
  }

  private stop() {
    this.generation++
    clearTimeout(this.timer)
    const qr = this.session()
    this.session.set(null)
    if (qr) void this.api.cancel(this.data.xpertId, this.data.card.provider.name, qr.id).catch(() => undefined)
  }

  ngOnDestroy() {
    this.destroyed = true
    this.stop()
  }
}
