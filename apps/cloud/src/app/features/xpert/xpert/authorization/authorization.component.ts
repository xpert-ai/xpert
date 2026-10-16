import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { TranslateModule } from '@ngx-translate/core'
import { AssistantSharingGroup, AssistantSharingState, AssistantSharingUser } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardInputDirective,
  ZardTabsImports,
  ZardTagSelectComponent,
  XpSpinComponent
} from '@xpert-ai/headless-ui'
import { debounceTime, firstValueFrom, Observable, take } from 'rxjs'
import { injectOrganizationId } from '@cloud/app/@core/state'
import { getErrorMessage, injectToastr, injectXpertAPI } from 'apps/cloud/src/app/@core'
import { UserAvatarComponent } from 'apps/cloud/src/app/@shared/user'
import { XpertComponent } from '../xpert.component'

type Panel = 'users' | 'groups' | 'inherited'
@Component({
  selector: 'xpert-authorization',
  standalone: true,
  templateUrl: './authorization.component.html',
  styleUrl: './authorization.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputDirective,
    ...ZardTabsImports,
    ZardTagSelectComponent,
    XpSpinComponent,
    UserAvatarComponent
  ]
})
export class XpertAuthorizationComponent {
  readonly #api = injectXpertAPI()
  readonly #parent = inject(XpertComponent)
  readonly #toastr = injectToastr()
  readonly #destroy = inject(DestroyRef)
  readonly #organizationId = injectOrganizationId()
  #request = 0
  #candidatesRequest = 0
  readonly xpert = this.#parent.xpert
  readonly state = signal<AssistantSharingState | null>(null)
  readonly loading = signal(true)
  readonly saving = signal(false)
  readonly error = signal('')
  readonly candidateError = signal('')
  readonly candidatesLoading = signal(false)
  readonly panel = signal<Panel>('users')
  readonly query = signal('')
  readonly users = signal<AssistantSharingUser[]>([])
  readonly groups = signal<AssistantSharingGroup[]>([])
  readonly total = signal(0)
  readonly selectedUsers = signal<string[]>([])
  readonly selectedGroups = signal<string[]>([])
  readonly canManage = computed(() => !!this.state()?.capabilities.canManageAccess)
  readonly hasGroupChanges = computed(
    () =>
      [...this.selectedGroups()].sort().join(',') !==
      (this.state()?.groups ?? [])
        .map((g) => g.id)
        .sort()
        .join(',')
  )
  readonly userOptions = computed(() =>
    this.users()
      .filter((u) => !this.state()?.users.some((shared) => shared.id === u.id))
      .map((user) => ({
        value: user.id,
        label:
          user.email && this.userLabel(user) !== user.email
            ? `${this.userLabel(user)} · ${user.email}`
            : this.userLabel(user),
        keywords: [user.email ?? '']
      }))
  )
  readonly selectedUserLabels = new Map<string, string>()
  readonly displayUser = (value: unknown) =>
    typeof value === 'string' ? (this.selectedUserLabels.get(value) ?? value) : ''

  constructor() {
    effect(() => {
      const id = this.#parent.xpertId()
      const organizationId = this.#organizationId()
      untracked(() => {
        if (id && organizationId) void this.load()
        else {
          ++this.#request
          ++this.#candidatesRequest
          this.state.set(null)
          this.loading.set(false)
        }
      })
    })
    toObservable(this.query)
      .pipe(debounceTime(250), takeUntilDestroyed(this.#destroy))
      .subscribe(() => {
        if (this.state()) void this.loadCandidates()
      })
    this.#destroy.onDestroy(() => {
      ++this.#request
      ++this.#candidatesRequest
    })
  }

  private once<T>(request: Observable<T>) {
    return firstValueFrom(request.pipe(take(1), takeUntilDestroyed(this.#destroy)))
  }
  async load() {
    const request = ++this.#request
    ++this.#candidatesRequest
    this.state.set(null)
    this.loading.set(true)
    this.saving.set(false)
    this.error.set('')
    this.query.set('')
    this.selectedUsers.set([])
    this.selectedUserLabels.clear()
    this.users.set([])
    this.groups.set([])
    this.selectedGroups.set([])
    try {
      const state = await this.once(this.#api.getSharing(this.#parent.xpertId()))
      if (request !== this.#request) return
      this.accept(state)
      await this.loadCandidates()
    } catch (error) {
      if (request === this.#request) this.error.set(getErrorMessage(error))
    } finally {
      if (request === this.#request) this.loading.set(false)
    }
  }
  private accept(state: AssistantSharingState) {
    this.state.set(state)
    this.selectedGroups.set(state.groups.map((group) => group.id))
    if (this.panel() === 'groups' && !state.capabilities.canUseGroups) this.panel.set('users')
  }
  showPanel(panel: Panel) {
    if (panel === 'groups' && !this.state()?.capabilities.canUseGroups) return
    this.panel.set(panel)
    this.query.set('')
    void this.loadCandidates()
  }
  async loadCandidates(more = false) {
    const request = ++this.#candidatesRequest
    if (!this.canManage() || this.panel() === 'inherited') {
      this.candidatesLoading.set(false)
      return
    }
    if (this.panel() === 'groups' && !this.state()?.capabilities.canUseGroups) return
    this.candidateError.set('')
    this.candidatesLoading.set(true)
    const groupMode = this.panel() === 'groups'
    const skip = more ? (groupMode ? this.groups().length : this.users().length) : 0
    try {
      if (groupMode) {
        const result = await this.once(this.#api.getShareGroupCandidates(this.#parent.xpertId(), this.query(), skip))
        if (request !== this.#candidatesRequest) return
        this.groups.set(more ? [...this.groups(), ...result.items] : result.items)
        this.total.set(result.total)
      } else {
        const result = await this.once(this.#api.getShareCandidates(this.#parent.xpertId(), this.query(), skip))
        if (request !== this.#candidatesRequest) return
        result.items.forEach((user) => this.selectedUserLabels.set(user.id, this.userLabel(user)))
        this.users.set(more ? [...this.users(), ...result.items] : result.items)
        this.total.set(result.total)
      }
    } catch (error) {
      if (request === this.#candidatesRequest) this.candidateError.set(getErrorMessage(error))
    } finally {
      if (request === this.#candidatesRequest) this.candidatesLoading.set(false)
    }
  }
  selectUsers(values: unknown[]) {
    this.selectedUsers.set(
      values.filter((value): value is string => typeof value === 'string' && this.selectedUserLabels.has(value))
    )
  }
  toggleGroup(id: string, checked: boolean) {
    if (!this.canManage() || !this.state()?.capabilities.canUseGroups) return
    this.selectedGroups.update((ids) => (checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id)))
  }
  resetGroups() {
    this.selectedGroups.set(this.state()?.groups.map((group) => group.id) ?? [])
  }
  async share() {
    if (!this.selectedUsers().length) return
    await this.mutate(() => this.#api.shareUsers(this.#parent.xpertId(), this.selectedUsers()))
  }
  async remove(userId: string) {
    await this.mutate(() => this.#api.revokeShare(this.#parent.xpertId(), userId))
  }
  async saveGroups() {
    if (!this.state()?.capabilities.canUseGroups || !this.hasGroupChanges()) return
    await this.mutate(() =>
      this.#api.saveShareGroups(this.#parent.xpertId(), this.selectedGroups(), this.state().groupRevision)
    )
  }
  private async mutate(action: () => Observable<AssistantSharingState>) {
    if (this.saving() || !this.canManage() || this.loading()) return
    const request = this.#request
    this.saving.set(true)
    try {
      const state = await this.once(action())
      if (request !== this.#request) return
      this.accept(state)
      this.selectedUsers.set([])
      this.#toastr.success('XP.Sharing.Saved')
    } catch (error) {
      if (request === this.#request) this.#toastr.error(getErrorMessage(error))
    } finally {
      if (request === this.#request) this.saving.set(false)
    }
  }
  userLabel(user: AssistantSharingUser) {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || ''
  }
}
