import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, output, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  PluginApplicationSetupInput,
  PluginApplicationUpdateProgress,
  PluginMarketplaceAppAssistantSuite
} from '@xpert-ai/contracts'
import { PluginApplicationService, getErrorMessage } from '@cloud/app/@core'
import { ZardButtonComponent, XpI18nPipe } from '@xpert-ai/headless-ui'

/** The server owns execution and receipts; leaving this page does not cancel a release. */
@Component({
  selector: 'xp-application-update',
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent, XpI18nPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mt-5 space-y-3">
      <button z-button zType="outline" type="button" [zDisabled]="busy() || loading()" (click)="update()">
        {{
          (progress() && progress().status !== 'completed'
            ? 'XP.Explore.Application.Update.Resume'
            : 'XP.Explore.Application.Update.Action'
          ) | translate
        }}
      </button>
      <p class="max-w-2xl text-sm text-muted-foreground">
        {{ 'XP.Explore.Application.Update.Description' | translate }}
      </p>
      @if (progress(); as release) {
        <div class="max-w-2xl space-y-2" aria-live="polite" role="status">
          <p class="text-sm">
            {{ 'XP.Explore.Application.Update.' + release.status | translate }} · {{ release.completed }} /
            {{ release.total }}
          </p>
          @if (release.errorCode) {
            <p class="text-sm text-destructive">{{ 'XP.Explore.Application.Update.FailureHint' | translate }}</p>
          }
          <progress
            class="h-2 w-full accent-primary"
            [value]="release.completed"
            [max]="release.total || 1"
            [attr.aria-label]="'XP.Explore.Application.Update.Progress' | translate"
          ></progress>
          <ul class="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            @for (entry of release.entries; track entry.key) {
              <li>
                {{
                  entry.key === '@main'
                    ? ('XP.Explore.Application.Update.Main' | translate)
                    : (roleTitle(entry.key) | i18n)
                }}
                ·
                {{ 'XP.Explore.Application.Update.' + entry.stage | translate }}
              </li>
            }
          </ul>
        </div>
      }
      @if (error()) {
        <p role="alert" class="text-sm text-destructive">{{ error() }}</p>
      }
    </div>
  `
})
export class ApplicationUpdateComponent {
  readonly application = input.required<PluginApplicationSetupInput>()
  readonly suite = input<PluginMarketplaceAppAssistantSuite | undefined>()
  readonly completed = output<void>()
  readonly progress = signal<PluginApplicationUpdateProgress | null>(null)
  readonly busy = signal(false)
  readonly loading = signal(true)
  readonly error = signal<string | null>(null)
  readonly #applications = inject(PluginApplicationService)
  #generation = 0
  #timer: ReturnType<typeof setTimeout> | undefined
  #reportedOperation: string | null = null

  constructor() {
    effect(() => {
      const application = this.application()
      const generation = ++this.#generation
      clearTimeout(this.#timer)
      this.progress.set(null)
      this.error.set(null)
      this.busy.set(false)
      this.loading.set(true)
      void this.refresh(application, generation)
    })
    inject(DestroyRef).onDestroy(() => {
      ++this.#generation
      clearTimeout(this.#timer)
    })
  }

  roleTitle(key: string) {
    const suite = this.suite()
    return (
      [...(suite?.roles ?? []), ...(suite?.standaloneAssistants ?? [])].find((role) => role.key === key)?.title ?? key
    )
  }

  private async refresh(application: PluginApplicationSetupInput, generation: number) {
    try {
      const release = await firstValueFrom(this.#applications.getUpdateProgress(application))
      if (generation !== this.#generation) return
      this.progress.set(release)
      if (release?.status === 'completed' && this.#reportedOperation !== release.operationId) {
        this.#reportedOperation = release.operationId
        this.completed.emit()
      }
    } catch (error) {
      if (generation === this.#generation) this.error.set(getErrorMessage(error))
    } finally {
      if (generation === this.#generation) {
        this.loading.set(false)
        if (this.busy() || this.progress()?.status === 'running') {
          clearTimeout(this.#timer)
          this.#timer = setTimeout(() => void this.refresh(application, generation), 2000)
        }
      }
    }
  }

  async update() {
    if (this.busy() || this.loading()) return
    const application = this.application(),
      generation = this.#generation
    const previous = this.progress()
    const resume = !!previous && previous.status !== 'completed'
    this.busy.set(true)
    this.error.set(null)
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => void this.refresh(application, generation), 1000)
    try {
      const release = await firstValueFrom(
        this.#applications.updateApplication({
          ...application,
          operationId: resume ? previous.operationId : crypto.randomUUID(),
          resume
        })
      )
      if (generation !== this.#generation) return
      this.progress.set(release)
    } catch (error) {
      if (generation === this.#generation) this.error.set(getErrorMessage(error))
    } finally {
      if (generation === this.#generation) {
        this.busy.set(false)
        clearTimeout(this.#timer)
        await this.refresh(application, generation)
      }
    }
  }
}
