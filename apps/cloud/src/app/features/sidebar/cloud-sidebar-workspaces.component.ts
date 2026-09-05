import { A11yModule } from '@angular/cdk/a11y'
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, combineLatest, distinctUntilChanged, filter, map, of, startWith, Subject, switchMap } from 'rxjs'
import { IXpertWorkspace, OrderTypeEnum, Store, XpertWorkspaceService, getErrorMessage } from '../../@core'
import { WorkspaceHistoryService } from '../../@core/services/workspace-history.service'

type WorkspaceListState = { items: IXpertWorkspace[]; loading: boolean; error: string }
const LOADING_STATE: WorkspaceListState = { items: [], loading: true, error: '' }

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-workspaces',
  imports: [CommonModule, A11yModule, OverlayModule, RouterModule, TranslateModule],
  templateUrl: './cloud-sidebar-workspaces.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' }
})
export class CloudSidebarWorkspacesComponent {
  readonly collapsed = input(false)
  readonly active = input(false)
  readonly clicked = output<void>()
  readonly expanded = signal(true)
  readonly menuOpen = signal(false)
  readonly showAll = signal(false)
  readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 8 },
    { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: 8 },
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -8 }
  ]
  readonly #api = inject(XpertWorkspaceService)
  readonly #store = inject(Store)
  readonly #history = inject(WorkspaceHistoryService)
  readonly #router = inject(Router)
  readonly #reload = new Subject<void>()
  readonly #recentIds = signal<string[]>([])
  readonly #selectedWorkspace = toSignal(this.#store.selectedWorkspace$)
  readonly #scopeChanges = combineLatest([this.#store.user$, this.#store.selectOrganizationId()]).pipe(
    map(([user, organizationId]) => ({ userId: user?.id ?? null, organizationId: organizationId ?? null })),
    distinctUntilChanged((a, b) => a.userId === b.userId && a.organizationId === b.organizationId)
  )
  readonly #scope = toSignal(this.#scopeChanges, { initialValue: { userId: null, organizationId: null } })
  readonly state = toSignal(
    this.#scopeChanges.pipe(
      switchMap(({ userId }) =>
        userId
          ? this.#reload.pipe(
              startWith(null),
              switchMap(() =>
                this.#api.getAllMy({ order: { updatedAt: OrderTypeEnum.DESC } }, { purpose: 'authoring' }).pipe(
                  map(
                    ({ items }): WorkspaceListState => ({
                      items: items.filter((item) => item.status !== 'archived'),
                      loading: false,
                      error: ''
                    })
                  ),
                  catchError((error) =>
                    of<WorkspaceListState>({ items: [], loading: false, error: getErrorMessage(error) })
                  ),
                  startWith(LOADING_STATE)
                )
              )
            )
          : of<WorkspaceListState>({ items: [], loading: false, error: '' })
      )
    ),
    { initialValue: LOADING_STATE }
  )
  readonly recentWorkspaces = computed(() => {
    const available = new Map(this.state().items.map((workspace) => [workspace.id, workspace]))
    return this.#recentIds()
      .map((id) => available.get(id))
      .filter((workspace): workspace is IXpertWorkspace => !!workspace)
      .slice(0, 5)
  })
  readonly visibleWorkspaces = computed(() => (this.showAll() ? this.state().items : this.recentWorkspaces()))

  constructor() {
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.menuOpen.set(false))
    effect(() => {
      if (!this.collapsed()) {
        this.menuOpen.set(false)
        untracked(() => this.captureRecentWorkspaces())
      }
    })
    effect(() => {
      this.#scope()
      this.menuOpen.set(false)
      this.showAll.set(false)
      untracked(() => this.captureRecentWorkspaces())
    })
    effect(() => {
      const { userId, organizationId } = this.#scope()
      const selected = this.#selectedWorkspace()
      if (selected && this.state().items.some((workspace) => workspace.id === selected.id)) {
        untracked(() => {
          this.#history.remember(userId, organizationId, selected.id)
          if (!this.#recentIds().length) this.captureRecentWorkspaces()
        })
      }
    })
  }

  reload() {
    this.captureRecentWorkspaces()
    this.#reload.next()
  }

  toggle() {
    if (this.collapsed() ? !this.menuOpen() : !this.expanded()) this.captureRecentWorkspaces()
    if (this.collapsed()) this.menuOpen.update((open) => !open)
    else this.expanded.update((expanded) => !expanded)
  }

  selectWorkspace() {
    this.menuOpen.set(false)
    this.clicked.emit()
  }

  private captureRecentWorkspaces() {
    const { userId, organizationId } = this.#scope()
    // Keep the visible order stable during navigation; apply new history when the list is reopened.
    this.#recentIds.set([...this.#history.recent(userId, organizationId)])
  }
}
