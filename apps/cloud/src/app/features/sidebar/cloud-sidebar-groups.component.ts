import { Dialog, DialogRef } from '@angular/cdk/dialog'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { ChatGroupSummary } from '@xpert-ai/contracts'
import { combineLatest, distinctUntilChanged, filter, firstValueFrom, map } from 'rxjs'
import { RequestScopeLevel, ScopeService, Store } from '../../@core'
import { ChatGroupService } from '../../@core/services/chat-group.service'

let nextGroupSectionId = 0

@Component({
  standalone: true,
  selector: 'xp-sidebar-groups',
  imports: [TranslateModule],
  templateUrl: './cloud-sidebar-groups.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' }
})
export class CloudSidebarGroupsComponent {
  readonly query = input('')
  readonly sectionId = `sidebar-groups-${nextGroupSectionId++}`
  readonly expanded = signal(true)
  readonly archived = signal(false)
  readonly optionsId = signal<string | null>(null)
  readonly groups = signal<ChatGroupSummary[]>([])
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly actionFailed = signal(false)
  readonly busy = signal(false)
  readonly #api = inject(ChatGroupService)
  readonly #store = inject(Store)
  readonly #scope = inject(ScopeService)
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly #destroy = inject(DestroyRef)
  readonly #identity = toSignal(
    combineLatest([this.#store.user$, this.#store.selectOrganizationId()]).pipe(
      map(([user, organizationId]) => ({ userId: user?.id, organizationId })),
      distinctUntilChanged((a, b) => a.userId === b.userId && a.organizationId === b.organizationId)
    )
  )
  readonly #context = computed(() => ({ ...this.#identity(), level: this.#scope.activeScope().level }))
  readonly enabled = computed(() => {
    const context = this.#context()
    return context.level === RequestScopeLevel.ORGANIZATION && !!context.userId && !!context.organizationId
  })
  readonly currentUrl = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.#router.url)
    ),
    { initialValue: this.#router.url }
  )
  readonly visibleGroups = computed(() =>
    this.groups()
      .filter(
        (group) =>
          group.archived === this.archived() &&
          group.title.toLocaleLowerCase().includes(this.query().trim().toLocaleLowerCase())
      )
      .sort((a, b) => Number(b.pinned) - Number(a.pinned))
  )
  #request = 0
  #createDialog: DialogRef<string> | null = null

  constructor() {
    effect(() => {
      this.#context()
      untracked(() => {
        this.#createDialog?.close()
        this.expanded.set(true)
        this.archived.set(false)
        this.optionsId.set(null)
        this.busy.set(false)
        this.actionFailed.set(false)
        void this.reload()
      })
    })
    this.#destroy.onDestroy(() => this.#createDialog?.close())
  }

  isActive(group: ChatGroupSummary) {
    return this.currentUrl()
      .split('?')[0]
      .endsWith('/c/' + encodeURIComponent(group.threadId))
  }

  toggleArchived() {
    this.archived.update((value) => !value)
    this.optionsId.set(null)
  }

  async reload() {
    const context = this.#context()
    const request = ++this.#request
    this.groups.set([])
    this.failed.set(false)
    this.loading.set(this.enabled())
    if (!this.enabled()) return
    try {
      const groups = await firstValueFrom(this.#api.list().pipe(takeUntilDestroyed(this.#destroy)))
      if (!this.#destroy.destroyed && context === this.#context() && request === this.#request) this.groups.set(groups)
    } catch {
      if (!this.#destroy.destroyed && context === this.#context() && request === this.#request) this.failed.set(true)
    } finally {
      if (!this.#destroy.destroyed && context === this.#context() && request === this.#request) this.loading.set(false)
    }
  }

  async selectGroup(id: string) {
    if (!this.enabled() || this.busy()) return
    const context = this.#context()
    this.busy.set(true)
    this.actionFailed.set(false)
    try {
      const commands = await firstValueFrom(this.#api.conversationRoute(id).pipe(takeUntilDestroyed(this.#destroy)))
      if (!this.#destroy.destroyed && context === this.#context()) await this.#router.navigate(commands)
    } catch {
      if (!this.#destroy.destroyed && context === this.#context()) this.actionFailed.set(true)
    } finally {
      if (!this.#destroy.destroyed && context === this.#context()) this.busy.set(false)
    }
  }

  async preferences(group: ChatGroupSummary, preferences: { pinned?: boolean; archived?: boolean }) {
    if (!this.enabled() || this.busy() || !this.groups().some((item) => item.id === group.id)) return
    const context = this.#context()
    this.busy.set(true)
    this.actionFailed.set(false)
    try {
      await firstValueFrom(this.#api.preferences(group.id, preferences).pipe(takeUntilDestroyed(this.#destroy)))
      if (!this.#destroy.destroyed && context === this.#context()) {
        this.optionsId.set(null)
        await this.reload()
      }
    } catch {
      if (!this.#destroy.destroyed && context === this.#context()) this.actionFailed.set(true)
    } finally {
      if (!this.#destroy.destroyed && context === this.#context()) this.busy.set(false)
    }
  }

  async createGroup() {
    if (!this.enabled() || this.busy()) return
    const context = this.#context()
    this.busy.set(true)
    this.actionFailed.set(false)
    try {
      const { GroupCreateDialogComponent } = await import('../chat/groups/group-create-dialog.component')
      if (this.#destroy.destroyed || context !== this.#context()) return
      const ref = this.#dialog.open<string>(GroupCreateDialogComponent, {
        backdropClass: 'backdrop-blur-xs-black',
        panelClass: 'xp-overlay-pane-dialog',
        maxWidth: 'calc(100vw - 32px)'
      })
      this.#createDialog = ref
      const id = await firstValueFrom(ref.closed.pipe(takeUntilDestroyed(this.#destroy)))
      if (this.#destroy.destroyed || context !== this.#context()) return
      this.#createDialog = null
      this.busy.set(false)
      if (id) {
        await this.reload()
        if (context === this.#context()) await this.selectGroup(id)
      }
    } catch {
      if (!this.#destroy.destroyed && context === this.#context()) this.actionFailed.set(true)
    } finally {
      if (!this.#destroy.destroyed && context === this.#context()) this.busy.set(false)
    }
  }
}
