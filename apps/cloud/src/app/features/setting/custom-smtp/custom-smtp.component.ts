import { Component, computed, effect, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router'
import { RequestScopeLevel, routeAnimations, Store } from '../../../@core'
import { TranslationBaseComponent } from '../../../@shared/language'
import { distinctUntilChanged, filter, map, startWith } from 'rxjs/operators'

@Component({
  standalone: false,
  selector: 'pac-tenant-custom-smtp',
  templateUrl: './custom-smtp.component.html',
  styleUrls: ['./custom-smtp.component.scss'],
  animations: [routeAnimations],
})
export class CustomSmtpComponent extends TranslationBaseComponent {
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly store = inject(Store)
  readonly activeScope = toSignal(this.store.selectActiveScope(), {
    initialValue: this.store.activeScope
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
    super()

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
}
