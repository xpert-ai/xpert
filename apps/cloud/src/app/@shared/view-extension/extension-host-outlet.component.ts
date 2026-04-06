import { CommonModule } from '@angular/common'
import { Component, effect, input, signal } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { XpertExtensionViewManifest } from '@metad/contracts'
import { injectViewExtensionApi } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { ViewRendererComponent } from './view-renderer.component'
import { getErrorMessage } from '@cloud/app/@core/types'

@Component({
  standalone: true,
  selector: 'xp-extension-host-outlet',
  imports: [CommonModule, TranslateModule, NgmI18nPipe, ViewRendererComponent],
  template: `
    @if (loading()) {
      <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
        {{ 'PAC.KEY_WORDS.Loading' | translate: { Default: 'Loading...' } }}
      </div>
    } @else if (error()) {
      <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
        {{ error() }}
      </div>
    } @else if (mode() === 'single-view') {
      @if (selectedView(); as view) {
        <xp-view-renderer [hostType]="hostType()" [hostId]="hostId()" [manifest]="view" [active]="true" />
      } @else {
        <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
          {{ 'PAC.ViewExtension.NotFound' | translate: { Default: 'View not found' } }}
        </div>
      }
    } @else if (!views().length) {
      <div class="rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
        {{ 'PAC.ViewExtension.Empty' | translate: { Default: 'No extension views available' } }}
      </div>
    } @else {
      <div class="flex flex-col gap-4">
        @for (view of views(); track view.key) {
          <section class="rounded-2xl border border-divider-regular bg-components-card-bg p-4">
            <div class="mb-4 flex items-start justify-between gap-3">
              <div>
                <div class="text-base font-medium text-text-primary">{{ view.title | i18n }}</div>
                @if (view.description) {
                  <div class="mt-1 text-sm text-text-tertiary">{{ view.description | i18n }}</div>
                }
              </div>
              @if (view.badge?.value !== undefined) {
                <div class="rounded-full border border-divider-regular px-3 py-1 text-xs text-text-secondary">
                  {{ view.badge?.value }}
                </div>
              }
            </div>

            @defer (on viewport) {
              <xp-view-renderer [hostType]="hostType()" [hostId]="hostId()" [manifest]="view" [active]="true" />
            } @placeholder {
              <div class="rounded-2xl border border-divider-subtle px-4 py-5 text-sm text-text-tertiary">
                {{ 'PAC.KEY_WORDS.Loading' | translate: { Default: 'Loading...' } }}
              </div>
            }
          </section>
        }
      </div>
    }
  `
})
export class ExtensionHostOutletComponent {
  readonly mode = input<'slot' | 'single-view'>('slot')
  readonly hostType = input.required<string>()
  readonly hostId = input.required<string>()
  readonly slot = input.required<string>()
  readonly viewKey = input<string | null>(null)

  readonly #api = injectViewExtensionApi()

  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly views = signal<XpertExtensionViewManifest[]>([])
  readonly selectedView = signal<XpertExtensionViewManifest | null>(null)

  private loadVersion = 0

  constructor() {
    effect(() => {
      const hostType = this.hostType()
      const hostId = this.hostId()
      const slot = this.slot()
      const mode = this.mode()
      const viewKey = this.viewKey()

      if (!hostType || !hostId || !slot) {
        return
      }

      void this.loadViews(++this.loadVersion, hostType, hostId, slot, mode, viewKey)
    })
  }

  private async loadViews(
    version: number,
    hostType: string,
    hostId: string,
    slot: string,
    mode: 'slot' | 'single-view',
    viewKey: string | null
  ) {
    this.loading.set(true)
    this.error.set(null)

    try {
      const views = await firstValueFrom(this.#api.getSlotViews(hostType, hostId, slot))
      if (version !== this.loadVersion) {
        return
      }

      this.views.set(views)
      this.selectedView.set(mode === 'single-view' ? views.find((item) => item.key === viewKey) ?? null : null)
    } catch (error) {
      if (version !== this.loadVersion) {
        return
      }

      this.error.set(getErrorMessage(error))
      this.views.set([])
      this.selectedView.set(null)
    } finally {
      if (version === this.loadVersion) {
        this.loading.set(false)
      }
    }
  }
}
