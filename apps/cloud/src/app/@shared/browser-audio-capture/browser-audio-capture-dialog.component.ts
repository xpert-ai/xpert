import { XpDialogFrameImports, XpDialogActionGroupDirective } from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, OnDestroy, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { BrowserAudioDevices, closeAudioDevices, openAudioDevices } from './browser-audio-devices'

@Component({
  standalone: true,
  imports: [
    ...XpDialogFrameImports,
    XpDialogActionGroupDirective,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent
  ],
  template: `
    <section
      xpDialogLayout="standard"
      class="w-[min(448px,calc(100vw-32px))] max-h-[84dvh]"
      aria-labelledby="browser-capture-title"
    >
      <header xpDialogHeader>
        <h2 id="browser-capture-title" xpDialogHeading>{{ 'BrowserCapture.Title' | translate }}</h2>
        <p xpDialogDescription>{{ 'BrowserCapture.Help' | translate }}</p>
        <button
          xpDialogCloseButton
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.ACTIONS.Close' | translate: { Default: 'Close' }"
          (click)="cancel()"
        >
          <z-icon zType="x" aria-hidden="true" />
        </button>
      </header>
      <div xpDialogBody>
        <div xpDialogActionGroup="inline" class="grid gap-2">
          <button z-button zType="outline" class="w-full justify-start" [zDisabled]="busy()" (click)="start(false)">
            <z-icon zType="mic" class="shrink-0" />
            <span>{{ 'BrowserCapture.Microphone' | translate }}</span>
          </button>
          <button
            z-button
            zType="outline"
            class="w-full justify-start"
            [zDisabled]="busy() || !sharing"
            (click)="start(true)"
          >
            <z-icon zType="monitor" class="shrink-0" />
            <span>{{ 'BrowserCapture.Shared' | translate }}</span>
          </button>
        </div>
        <p class="text-xs leading-relaxed text-muted-foreground">{{ 'BrowserCapture.SharedHelp' | translate }}</p>
        <p class="text-xs leading-relaxed text-muted-foreground">{{ 'BrowserCapture.KeepOpen' | translate }}</p>
        @if (busy()) {
          <p role="status" class="text-sm text-muted-foreground">{{ 'BrowserCapture.Waiting' | translate }}</p>
        }
        @if (error()) {
          <p role="alert" class="text-sm text-destructive">{{ error() | translate }}</p>
        }
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline" type="button" (click)="cancel()">
          {{ 'BrowserCapture.Cancel' | translate }}
        </button>
      </footer>
    </section>
  `
})
export class BrowserAudioCaptureDialogComponent implements OnDestroy {
  private readonly ref = inject<DialogRef<BrowserAudioDevices>>(DialogRef)
  private readonly signal = inject<{ signal: AbortSignal }>(DIALOG_DATA).signal
  private readonly controller = new AbortController()
  readonly sharing = !!navigator.mediaDevices?.getDisplayMedia
  readonly busy = signal(false)
  readonly error = signal('')
  private transferred = false
  private readonly abort = () => this.cancel()
  constructor() {
    this.signal.addEventListener('abort', this.abort, { once: true })
  }

  async start(shared: boolean) {
    if (this.busy()) return
    this.busy.set(true)
    this.error.set('')
    try {
      const devices = await openAudioDevices(shared, this.controller.signal)
      if (this.controller.signal.aborted) {
        closeAudioDevices(devices)
        return
      }
      this.transferred = true
      this.ref.close(devices)
    } catch (error) {
      this.error.set(
        error instanceof Error && error.message === 'shared_audio_missing'
          ? 'BrowserCapture.NoSharedAudio'
          : error instanceof Error && error.name === 'NotAllowedError'
            ? 'BrowserCapture.PermissionDenied'
            : 'BrowserCapture.DeviceError'
      )
    } finally {
      this.busy.set(false)
    }
  }
  cancel() {
    this.controller.abort()
    this.ref.close()
  }
  ngOnDestroy() {
    this.signal.removeEventListener('abort', this.abort)
    if (!this.transferred) this.controller.abort()
  }
}
