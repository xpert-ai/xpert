import { API_PREFIX } from '@cloud/app/@core/state'
import { Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { DatePipe } from '@angular/common'
import { HttpClient } from '@angular/common/http'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  AGENT_PROFILE_TABS_SLOT,
  type IXpert,
  type XpertAssistantProfile,
  type XpertExtensionViewManifest
} from '@xpert-ai/contracts'
import { XpI18nPipe, ZardButtonComponent, ZardHoverCardComponent } from '@xpert-ai/headless-ui'
import { map } from 'rxjs'
import { injectApiBaseUrl, ViewExtensionApiService } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '../../avatar/emoji-avatar/avatar.component'
import { ViewRendererComponent } from '../../view-extension/view-renderer.component'
import { ViewClientCommandRegistry } from '../../view-extension/view-client-command-registry.service'

let nextProfileId = 0

@Component({
  standalone: true,
  selector: 'xp-assistant-profile',
  imports: [
    DatePipe,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardHoverCardComponent,
    EmojiAvatarComponent,
    ViewRendererComponent
  ],
  providers: [ViewClientCommandRegistry],
  templateUrl: './assistant-profile.component.html',
  host: { class: 'block' }
})
export class AssistantProfileComponent {
  readonly id = `assistant-profile-${++nextProfileId}`
  readonly assistantId = input.required<string>()
  readonly summary = input<Partial<IXpert> | null>(null)
  readonly closed = output<void>()
  readonly holdOpen = output<boolean>()
  private readonly http = inject(HttpClient)
  private readonly api = inject(ViewExtensionApiService)
  private readonly baseUrl = injectApiBaseUrl()
  private readonly translate = inject(TranslateService)
  private readonly language = toSignal(this.translate.onLangChange.pipe(map(({ lang }) => lang)), {
    initialValue: this.translate.currentLang
  })
  private readonly commands = inject(ViewClientCommandRegistry)
  readonly profile = signal<XpertAssistantProfile | null>(null)
  readonly tabs = signal<XpertExtensionViewManifest[]>([])
  readonly selected = signal('basic')
  readonly loading = signal(true)
  readonly profileError = signal(false)
  readonly tabsError = signal(false)
  readonly mountedTabKeys = signal<string[]>([])
  readonly interactionHeld = signal(false)
  readonly actionPending = signal(false)
  readonly busy = computed(() => this.interactionHeld() || this.actionPending())
  readonly reload = signal(0)
  readonly activeTab = computed(() => this.tabs().find((tab) => tab.key === this.selected()))
  readonly title = computed(() => {
    const info = this.profile() ?? this.summary()
    return (this.language()?.startsWith('zh') ? info?.titleCN : null) || info?.title || info?.name || ''
  })
  readonly avatar = computed(() => this.profile()?.avatar ?? this.summary()?.avatar ?? undefined)
  readonly description = computed(() => this.profile()?.description ?? this.summary()?.description)

  constructor() {
    const destroyRef = inject(DestroyRef)
    effect(() => this.holdOpen.emit(this.busy()))
    effect((onCleanup) => {
      const id = this.assistantId()
      this.reload()
      this.profile.set(null)
      this.tabs.set([])
      this.mountedTabKeys.set([])
      this.selected.set('basic')
      this.interactionHeld.set(false)
      this.holdOpen.emit(false)
      this.loading.set(true)
      this.profileError.set(false)
      this.tabsError.set(false)
      const profile = this.http
        .get<XpertAssistantProfile>(`${this.baseUrl}${API_PREFIX}/xpert/${encodeURIComponent(id)}/profile`)
        .subscribe({
          next: (result) => {
            this.profile.set(result)
            this.loading.set(false)
          },
          error: () => {
            this.profileError.set(true)
            this.loading.set(false)
          }
        })
      const tabs = this.api.getSlotViews('agent', id, AGENT_PROFILE_TABS_SLOT).subscribe({
        next: (result) => this.tabs.set(result),
        error: () => this.tabsError.set(true)
      })
      onCleanup(() => {
        profile.unsubscribe()
        tabs.unsubscribe()
      })
    })
    const interaction = this.commands.register('assistant.profile.interaction', (payload, context) => {
      if (context.hostId !== this.assistantId() || context.viewKey !== this.activeTab()?.key) return { success: false }
      const busy = typeof payload === 'object' && payload !== null && Reflect.get(payload, 'busy') === true
      this.interactionHeld.set(busy)
      return { success: true }
    })
    const close = this.commands.register('assistant.profile.close', (_, context) => {
      if (context.hostId !== this.assistantId() || context.viewKey !== this.activeTab()?.key || this.busy())
        return { success: false }
      this.closed.emit()
      return { success: true }
    })
    destroyRef.onDestroy(() => {
      interaction()
      close()
    })
  }

  retry() {
    this.reload.update((value) => value + 1)
  }
  select(key: string) {
    if (this.busy()) return
    if (key !== 'basic' && this.tabs().some((tab) => tab.key === key)) {
      this.mountedTabKeys.update((keys) => (keys.includes(key) ? keys : [...keys, key]))
    }
    this.selected.set(key)
  }
  onTabKey(event: KeyboardEvent) {
    const buttons = Array.from(
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        : []
    )
    const index = buttons.findIndex((button) => button === event.target)
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % buttons.length
            : event.key === 'ArrowLeft'
              ? (index + buttons.length - 1) % buttons.length
              : -1
    if (next < 0 || this.busy()) return
    event.preventDefault()
    buttons[next]?.click()
    buttons[next]?.focus()
  }
}
