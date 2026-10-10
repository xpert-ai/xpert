import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, OnDestroy, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { BrowserAudioDevices, closeAudioDevices, openAudioDevices } from './browser-audio-devices'

@Component({
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent, ZardIconComponent],
  template: `
    <section class="flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-4 p-6" aria-labelledby="browser-capture-title">
      <h2 id="browser-capture-title" class="text-lg font-semibold">{{ 'BrowserCapture.Title' | translate }}</h2>
      <p class="text-sm text-muted-foreground">{{ 'BrowserCapture.Help' | translate }}</p>
      <button
        z-button
        zType="outline"
        class="h-auto justify-start whitespace-normal py-4 text-left"
        [disabled]="busy()"
        (click)="start(false)"
      >
        <z-icon zType="mic" class="mr-3 shrink-0" />
        <span>{{ 'BrowserCapture.Microphone' | translate }}</span>
      </button>
      <button
        z-button
        zType="outline"
        class="h-auto justify-start whitespace-normal py-4 text-left"
        [disabled]="busy() || !sharing"
        (click)="start(true)"
      >
        <z-icon zType="monitor" class="mr-3 shrink-0" />
        <span>{{ 'BrowserCapture.Shared' | translate }}</span>
      </button>
      <p class="text-xs leading-relaxed text-muted-foreground">{{ 'BrowserCapture.SharedHelp' | translate }}</p>
      <p class="text-xs leading-relaxed text-muted-foreground">{{ 'BrowserCapture.KeepOpen' | translate }}</p>
      @if (busy()) {
        <p role="status" class="text-sm text-muted-foreground">{{ 'BrowserCapture.Waiting' | translate }}</p>
      }
      @if (error()) {
        <p role="alert" class="text-sm text-destructive">{{ error() | translate }}</p>
      }
      <div class="flex justify-end">
        <button z-button zType="ghost" (click)="cancel()">{{ 'BrowserCapture.Cancel' | translate }}</button>
      </div>
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
