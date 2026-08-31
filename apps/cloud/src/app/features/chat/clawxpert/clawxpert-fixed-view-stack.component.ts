import { Component, computed, effect, input, signal } from '@angular/core'
import type { IconDefinition, XpertViewQuery, XpertViewRuntimeScopeInput } from '@xpert-ai/contracts'
import { ExtensionHostOutletComponent } from '../../../@shared/view-extension'

export type ClawXpertFixedViewTab = {
  id: string
  kind: 'fixed-view'
  viewKey: string
  title: string
  icon: IconDefinition | null
  query: XpertViewQuery | null
}

@Component({
  standalone: true,
  selector: 'xp-clawxpert-fixed-view-stack',
  imports: [ExtensionHostOutletComponent],
  template: `
    @for (tab of mountedTabs(); track tab.id) {
      <xp-extension-host-outlet
        class="block h-full min-h-0 overflow-hidden"
        [class.hidden]="tab.id !== activeTabId()"
        [attr.aria-hidden]="tab.id === activeTabId() ? null : 'true'"
        [attr.data-fixed-view-tab-id]="tab.id"
        mode="single-view"
        [hostType]="hostType()"
        [hostId]="hostId()"
        [slot]="slot()"
        [viewKey]="tab.viewKey"
        [query]="tab.query"
        [fillAvailableHeight]="true"
        [runtimeScope]="runtimeScope()"
        [runtimeUserId]="runtimeUserId()"
      />
    }
  `
})
export class ClawXpertFixedViewStackComponent {
  readonly tabs = input.required<ClawXpertFixedViewTab[]>()
  readonly activeTabId = input.required<string>()
  readonly hostType = input.required<string>()
  readonly hostId = input.required<string>()
  readonly slot = input.required<string>()
  readonly runtimeScope = input<XpertViewRuntimeScopeInput | null>(null)
  readonly runtimeUserId = input<string | null>(null)

  readonly #mountedTabIds = signal<ReadonlySet<string>>(new Set())
  readonly mountedTabs = computed(() => {
    const activeTabId = this.activeTabId()
    const mountedTabIds = this.#mountedTabIds()

    return this.tabs().filter((tab) => mountedTabIds.has(tab.id) || tab.id === activeTabId)
  })

  constructor() {
    effect(() => {
      const tabs = this.tabs()
      const activeTabId = this.activeTabId()
      const availableTabIds = new Set(tabs.map((tab) => tab.id))

      this.#mountedTabIds.update((currentIds) => {
        const nextIds = new Set([...currentIds].filter((tabId) => availableTabIds.has(tabId)))
        if (availableTabIds.has(activeTabId)) {
          nextIds.add(activeTabId)
        }

        const unchanged = nextIds.size === currentIds.size && [...nextIds].every((tabId) => currentIds.has(tabId))
        return unchanged ? currentIds : nextIds
      })
    })
  }
}
