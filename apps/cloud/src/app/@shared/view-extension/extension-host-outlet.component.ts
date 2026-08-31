import { CommonModule } from '@angular/common'
import { Component, computed, effect, input, signal, untracked } from '@angular/core'
import { firstValueFrom } from 'rxjs'
import { XpertExtensionViewManifest, XpertViewQuery, XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import { injectViewExtensionApi } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
import { ViewRendererComponent } from './view-renderer.component'
import { getErrorMessage } from '@cloud/app/@core/types'

@Component({
  standalone: true,
  selector: 'xp-extension-host-outlet',
  imports: [CommonModule, TranslateModule, XpI18nPipe, ViewRendererComponent],
  template: `
    @if (loading()) {
      <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
        {{ 'XP.KEY_WORDS.Loading' | translate: { Default: 'Loading...' } }}
      </div>
    } @else if (error() && !hasRenderedView()) {
      <div class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary">
        {{ error() }}
      </div>
    } @else if (mode() === 'single-view') {
      @if (selectedView(); as view) {
        <xp-view-renderer
          class="block min-h-0"
          [class.h-full]="fillAvailableHeight()"
          [class.overflow-hidden]="fillAvailableHeight()"
          [hostType]="hostType()"
          [hostId]="hostId()"
          [manifest]="view"
          [runtimeScope]="runtimeScope()"
          [runtimeUserId]="runtimeUserId()"
          [initialQuery]="query() ?? emptyQuery"
          [active]="true"
          [fillAvailableHeight]="fillAvailableHeight()"
        />
      } @else {
        <div
          class="rounded-2xl border border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary"
        >
          {{ 'XP.ViewExtension.NotFound' | translate: { Default: 'View not found' } }}
        </div>
      }
    } @else if (!views().length) {
      <div
        class="rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-4 py-5 text-sm text-text-tertiary"
      >
        {{ 'XP.ViewExtension.Empty' | translate: { Default: 'No extension views available' } }}
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
              <xp-view-renderer
                [hostType]="hostType()"
                [hostId]="hostId()"
                [manifest]="view"
                [runtimeScope]="runtimeScope()"
                [runtimeUserId]="runtimeUserId()"
                [initialQuery]="emptyQuery"
                [active]="true"
              />
            } @placeholder {
              <div class="rounded-2xl border border-divider-subtle px-4 py-5 text-sm text-text-tertiary">
                {{ 'XP.KEY_WORDS.Loading' | translate: { Default: 'Loading...' } }}
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
  readonly query = input<XpertViewQuery | null>(null)
  readonly fillAvailableHeight = input(false)
  readonly runtimeScope = input<XpertViewRuntimeScopeInput | null>(null)
  readonly runtimeUserId = input<string | null>(null)
  readonly emptyQuery: XpertViewQuery = {}

  readonly #api = injectViewExtensionApi()

  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly views = signal<XpertExtensionViewManifest[]>([])
  readonly selectedView = signal<XpertExtensionViewManifest | null>(null)
  readonly hasRenderedView = computed(() =>
    this.mode() === 'single-view' ? Boolean(this.selectedView()) : this.views().length > 0
  )

  private loadVersion = 0

  constructor() {
    effect(() => {
      const hostType = this.hostType()
      const hostId = this.hostId()
      const slot = this.slot()
      const mode = this.mode()
      const viewKey = this.viewKey()
      const runtimeScope = this.runtimeScope()
      const runtimeUserId = this.runtimeUserId()

      if (!hostType || !hostId || !slot) {
        return
      }

      void untracked(() =>
        this.loadViews(++this.loadVersion, hostType, hostId, slot, mode, viewKey, runtimeScope, runtimeUserId)
      )
    })
  }

  private async loadViews(
    version: number,
    hostType: string,
    hostId: string,
    slot: string,
    mode: 'slot' | 'single-view',
    viewKey: string | null,
    runtimeScope: XpertViewRuntimeScopeInput | null,
    runtimeUserId: string | null
  ) {
    const viewIdentity = JSON.stringify([hostType, hostId, slot, mode, viewKey, runtimeUserId])
    const preserveRenderedView =
      viewIdentity === this.#loadedViewIdentity &&
      (mode === 'single-view' ? Boolean(this.selectedView()) : this.views().length > 0)

    if (preserveRenderedView) {
      this.failClosedProjectActions(runtimeScope, mode)
    } else {
      this.views.set([])
      this.selectedView.set(null)
    }

    this.loading.set(!preserveRenderedView)
    this.error.set(null)

    try {
      const views = await firstValueFrom(
        this.#api.getSlotViews(hostType, hostId, slot, runtimeScope ? { runtimeScope } : {})
      )
      if (version !== this.loadVersion) {
        return
      }

      this.#loadedViewIdentity = viewIdentity
      this.views.set(views)
      this.selectedView.set(mode === 'single-view' ? (views.find((item) => item.key === viewKey) ?? null) : null)
    } catch (error) {
      if (version !== this.loadVersion) {
        return
      }

      this.error.set(getErrorMessage(error))
      if (!preserveRenderedView) {
        this.views.set([])
        this.selectedView.set(null)
      }
    } finally {
      if (version === this.loadVersion) {
        this.loading.set(false)
      }
    }
  }

  private failClosedProjectActions(runtimeScope: XpertViewRuntimeScopeInput | null, mode: 'slot' | 'single-view') {
    if (!runtimeScope?.projectId) {
      return
    }

    const failClosed = (manifest: XpertExtensionViewManifest) => {
      const actions = manifest.actions?.filter(
        (action) => action.requiredHostAccess !== 'edit' && action.requiredHostAccess !== 'manage'
      )
      return actions?.length === manifest.actions?.length ? manifest : { ...manifest, actions }
    }

    if (mode === 'single-view') {
      this.selectedView.update((manifest) => (manifest ? failClosed(manifest) : manifest))
      return
    }

    this.views.update((views) => views.map(failClosed))
  }

  #loadedViewIdentity: string | null = null
}
