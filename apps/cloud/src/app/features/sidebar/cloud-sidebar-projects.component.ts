import { A11yModule } from '@angular/cdk/a11y'
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NavigationEnd, Router, RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertProject, Store, getErrorMessage } from '../../@core'
import { catchError, distinctUntilChanged, filter, map, merge, of, startWith, Subject, switchMap, tap } from 'rxjs'
import { XpertProjectApiService } from '../project/project-api.service'

type RecentProjectsState = { items: IXpertProject[]; loading: boolean; error: string }
const LOADING_STATE: RecentProjectsState = { items: [], loading: true, error: '' }

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-projects',
  imports: [CommonModule, A11yModule, OverlayModule, RouterModule, TranslateModule],
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
    this.clicked.emit()
  }
}
