import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { FeatureService, RequestScopeLevel, Store, getErrorMessage, injectToastr, routeAnimations } from '../../../@core'
import { SharedModule } from '../../../@shared/shared.module'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators'

type FeatureToggleOutletComponent = {
  reloadFeatures: () => void
}

function canReloadFeatures(component: unknown): component is FeatureToggleOutletComponent {
  if (typeof component !== 'object' || component === null || !('reloadFeatures' in component)) {
    return false
  }

  return typeof component.reloadFeatures === 'function'
}

@Component({
  standalone: true,
  imports: [SharedModule, NgmSpinComponent],
  providers: [FeatureService],
  selector: 'pac-features',
  templateUrl: './features.component.html',
  styleUrls: ['./features.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [routeAnimations]
})
export class PACFeaturesComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  readonly #store = inject(Store)
  readonly #featureService = inject(FeatureService)
  readonly #toastr = injectToastr()

  readonly loading = signal(false)
  readonly #activeFeatureToggle = signal<FeatureToggleOutletComponent | null>(null)
  readonly activeScope = toSignal(this.#store.selectActiveScope(), {
    initialValue: this.#store.activeScope
  })
  readonly activeChildPath = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.getActiveChildPath()),
      distinctUntilChanged()
    ),
    {
      initialValue: null
    }
  )
  readonly targetChildPath = computed(() =>
    this.activeScope().level === RequestScopeLevel.TENANT ? 'tenant' : 'organization'
  )

  constructor() {
    effect(() => {
      const activeChildPath = this.activeChildPath()
      const targetChildPath = this.targetChildPath()

      if (activeChildPath === targetChildPath) {
        return
      }

      queueMicrotask(() => {
        void this.router.navigate([targetChildPath], {
          relativeTo: this.route,
          replaceUrl: true
        })
      })
    })
  }

  private getActiveChildPath() {
    return this.route.snapshot.firstChild?.routeConfig?.path ?? null
  }

  onChildActivate(component: unknown) {
    this.#activeFeatureToggle.set(canReloadFeatures(component) ? component : null)
  }

  onChildDeactivate(component: unknown) {
    if (component === this.#activeFeatureToggle()) {
      this.#activeFeatureToggle.set(null)
    }
  }

  upgrade() {
    this.loading.set(true)
    this.#featureService.upgrade().subscribe({
      next: () => {
        this.#activeFeatureToggle()?.reloadFeatures()
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', {Default: 'Updated successfully'})
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
