import { SidebarSearchResultsComponent } from './search/sidebar-search-results.component'
import { CloudSidebarPanelTriggerDirective } from './cloud-sidebar-panel-trigger.directive'
import { CloudSidebarPanelLinksComponent, SidebarPanelLink } from './cloud-sidebar-panel-links.component'
import { A11yModule } from '@angular/cdk/a11y'
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertProject, Store, getErrorMessage } from '../../@core'
import {
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  merge,
  of,
  startWith,
  Subject,
  switchMap,
  tap
} from 'rxjs'
import { XpertProjectApiService } from '../project/project-api.service'

type RecentProjectsState = { items: IXpertProject[]; loading: boolean; error: string }
const LOADING_STATE: RecentProjectsState = { items: [], loading: true, error: '' }

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-projects',
  imports: [SidebarSearchResultsComponent,
    CloudSidebarPanelTriggerDirective,
    CloudSidebarPanelLinksComponent,
    CommonModule,
    A11yModule,
    OverlayModule,
    RouterModule,
    TranslateModule
  ],
  templateUrl: './cloud-sidebar-projects.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' }
})
export class CloudSidebarProjectsComponent {
  readonly collapsed = input(false)
  readonly active = input(false)
  readonly clicked = output<void>()
  readonly expanded = signal(true)
  readonly menuOpen = signal(false)
  readonly menuPositions: ConnectedPosition[] = [
    { originX: 'end', originY: 'top', overlayX: 'start', overlayY: 'top', offsetX: 8 },
    { originX: 'end', originY: 'bottom', overlayX: 'start', overlayY: 'bottom', offsetX: 8 },
    { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top', offsetX: -8 }
  ]

  readonly #api = inject(XpertProjectApiService)
  readonly #router = inject(Router)
  readonly #store = inject(Store)
  readonly #reload = new Subject<void>()
  readonly state = toSignal(
    this.#store.selectOrganizationId().pipe(
      distinctUntilChanged(),
      tap(() => this.menuOpen.set(false)),
      switchMap(() =>
        merge(of(null), this.#reload, this.#api.projectsChanged$).pipe(
          switchMap(() =>
            this.#api.list({ status: 'active', take: 5 }).pipe(
              map(({ items }): RecentProjectsState => ({ items, loading: false, error: '' })),
              catchError((error) =>
                of<RecentProjectsState>({ items: [], loading: false, error: getErrorMessage(error) })
              ),
              startWith(LOADING_STATE)
            )
          )
        )
      )
    ),
    { initialValue: LOADING_STATE }
  )

  readonly browsing = signal(false)
  private readonly routeProjectId = toSignal(
    this.#router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        const root =
          this.#router.parseUrl(this.#router.url).root.children['primary']?.segments.map((segment) => segment.path) ??
          []
        return root[0] === 'project' && root[1] && !['execution-analysis', 'invitations'].includes(root[1])
          ? root[1]
          : null
      }),
      distinctUntilChanged()
    )
  )
  readonly currentProject = toSignal(
    combineLatest([toObservable(this.routeProjectId), this.#store.selectOrganizationId()]).pipe(
      switchMap(([id]) =>
        id
          ? this.#api.get(id).pipe(
              catchError(() => of(null)),
              startWith(null)
            )
          : of(null)
      )
    ),
    { initialValue: null }
  )
  readonly projectLinks = computed<SidebarPanelLink[]>(() => {
    const id = this.currentProject()?.id
    return id
      ? [
          ['', 'Overview', 'ri-dashboard-line'],
          ['timeline', 'TaskTimeline', 'ri-time-line'],
          ['tasks', 'Conversations', 'ri-chat-3-line'],
          ['assets', 'Assets', 'ri-folder-line'],
          ['config', 'Config', 'ri-settings-3-line']
        ].map(([path, label, icon]) => ({
          icon,
          id: path || 'overview',
          preserveQueryParams: true,
          path: '/project/' + encodeURIComponent(id) + (path ? '/' + path : ''),
          translationKey: 'XP.XProject.' + label,
          label
        }))
      : []
  })

  filteredProjects(query: string) {
    return this.state().items.filter(
      (item) => !query.trim() || item.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
    )
  }

  constructor() {
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed()
      )
      .subscribe(() => this.menuOpen.set(false))
    effect(() => {
      if (!this.collapsed()) this.menuOpen.set(false)
    })
  }

  reload() {
    this.#reload.next()
  }

  toggle() {
    if (this.collapsed()) {
      this.menuOpen.update((open) => !open)
    } else {
      this.expanded.update((expanded) => !expanded)
    }
  }

  selectProject() {
    this.menuOpen.set(false)
    this.browsing.set(false)
    this.clicked.emit()
  }

  async openDefault() {
    this.browsing.set(false)
    const id = this.currentProject()?.id
    if (await this.#router.navigate(id ? ['/project', id] : ['/project'])) this.clicked.emit()
  }
}
