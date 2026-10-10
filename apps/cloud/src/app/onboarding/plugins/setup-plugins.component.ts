import { FormsModule } from '@angular/forms'
import { DEFAULT_AGENT_PLUGINS_SOURCE } from '@xpert-ai/contracts'
import { DefaultAgentPluginsResultComponent } from '../../@shared/agent-plugins/default-agent-plugins-result.component'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, DestroyRef, computed, inject, signal } from '@angular/core'
import { DOCUMENT } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { ZardButtonComponent, ZardCheckboxComponent, ZardProgressBarComponent, XpI18nPipe } from '@xpert-ai/headless-ui'
import type { SetupPluginsResponse } from '@xpert-ai/contracts'
import { SetupPluginsService } from '../../@core/services/setup-plugins.service'
import { SetupPluginCatalogComponent } from './setup-plugin-catalog.component'
import { getErrorMessage } from '../../@core'

@Component({
  standalone: true,
  selector: 'xp-setup-plugins',
  host: { class: 'block w-full min-w-0 overflow-y-auto' },
  imports: [
    FormsModule,
    ZardCheckboxComponent,
    DefaultAgentPluginsResultComponent,
    TranslateModule,
    ZardButtonComponent,
    ZardProgressBarComponent,
    SetupPluginCatalogComponent,
    XpI18nPipe
  ],
  templateUrl: './setup-plugins.component.html'
})
export class SetupPluginsComponent {
  readonly #api = inject(SetupPluginsService)
  readonly #document = inject(DOCUMENT)
  readonly response = signal<SetupPluginsResponse | null>(null)
  readonly selected = signal(new Set<string>())
  readonly importDefaults = signal(true)
  readonly defaultSource = DEFAULT_AGENT_PLUGINS_SOURCE.browseUrl
  readonly error = signal<string | null>(null)
  readonly disconnected = signal(false)
  readonly waitingTooLong = signal(false)
  readonly busy = signal(false)
  readonly progress = computed(() => this.response()?.progress)
  readonly processed = computed(
    () => this.progress()?.items.filter((item) => !['pending', 'installing'].includes(item.status)).length ?? 0
  )
  readonly progressPercent = computed(() => {
    const state = this.progress()
    return state?.items.length ? (this.processed() / state.items.length) * 100 : state?.phase === 'completed' ? 100 : 0
  })
  readonly failed = computed(() => this.progress()?.items.filter((item) => item.status === 'failed').length ?? 0)
  #destroyed = false

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true
    })
    void this.load()
  }

  async load() {
    if (this.busy()) return
    this.busy.set(true)
    this.error.set(null)
    this.waitingTooLong.set(false)
    try {
      const response = await firstValueFrom(this.#api.status())
      this.response.set(response)
      if (response.progress.phase === 'installing') {
        await firstValueFrom(
          this.#api.start(
            response.progress.items.map((item) => item.packageName),
            !!response.progress.defaultAgentPlugins
          )
        )
      }
      if (response.progress.phase !== 'idle') await this.monitor()
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  async start(skip = false) {
    if (this.busy()) return
    this.busy.set(true)
    this.error.set(null)
    try {
      this.response.set(
        await firstValueFrom(this.#api.start(skip ? [] : [...this.selected()], !skip && this.importDefaults()))
      )
      await this.monitor()
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  enterOrganization() {
    // Reload the shell after process-level plugins change; preserve the stored organization scope.
    this.#document.defaultView?.location.assign('/')
  }

  private async monitor() {
    let unavailableSince: number | null = null
    while (!this.#destroyed) {
      const phase = this.progress()?.phase
      if (phase === 'completed') {
        await this.delay(1500)
        if (!this.#destroyed) this.enterOrganization()
        return
      }
      if (phase === 'attention') return
      await this.delay(2000)
      if (this.#destroyed) return
      try {
        const progress = this.progress()
        // A process can stop midway through installation without the browser observing an outage.
        // The persisted job and database lock make this resume request safe while another API owns it.
        this.response.set(
          await firstValueFrom(
            progress?.phase === 'installing'
              ? this.#api.start(
                  progress.items.map((item) => item.packageName),
                  !!progress.defaultAgentPlugins
                )
              : this.#api.status()
          )
        )
        this.disconnected.set(false)
        unavailableSince = null
      } catch (error) {
        if (!(error instanceof HttpErrorResponse) || ![0, 502, 503, 504].includes(error.status)) throw error
        this.disconnected.set(true)
        unavailableSince ??= Date.now()
        if (Date.now() - unavailableSince > 180_000) {
          this.waitingTooLong.set(true)
          return
        }
      }
    }
  }

  private delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
  }
}
