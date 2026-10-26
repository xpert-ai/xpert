import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { catchError, map, of, startWith, switchMap } from 'rxjs'
import { injectActiveScope } from '@cloud/app/@core/state'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { EvolutionDetailKind, EvolutionDetailResource, findEvolutionResource } from '../evolution-resource-lookup'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { EvolutionBaselinePanelComponent } from './evolution-baseline-panel.component'

type ResourceState = { loading: boolean; error: boolean; item: EvolutionDetailResource | null }

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-detail',
  imports: [
    EvolutionBaselinePanelComponent,
    CommonModule,
    RouterLink,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ...ZardCardImports
  ],
  templateUrl: './agent-evolution-detail.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionDetailComponent {
  readonly #route = inject(ActivatedRoute)
  readonly facade = inject(AgentEvolutionFacade)
  private readonly router = inject(Router)
  readonly kind = this.#route.snapshot.data['kind'] as EvolutionDetailKind
  readonly resourceId = toSignal(this.#route.paramMap.pipe(map((params) => params.get('resourceId') ?? '')), {
    initialValue: ''
  })
  private readonly scope = injectActiveScope()
  private readonly api = inject(AgentEvolutionApiService)
  private readonly request = computed(() => ({ id: this.resourceId(), scope: this.scope() }))
  readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ id }) =>
        id
          ? findEvolutionResource(this.api, this.kind, id).pipe(
              map((item): ResourceState => ({ item, error: false, loading: false })),
              catchError(() => of<ResourceState>({ item: null, error: true, loading: false })),
              startWith<ResourceState>({ item: null, error: false, loading: true })
            )
          : of<ResourceState>({ item: null, error: false, loading: false })
      )
    ),
    { initialValue: { item: null, error: false, loading: true } }
  )
  constructor() {
    effect(() => {
      const record = this.facade.lifecycleRecords().find((item) => item.id === this.resourceId())
      if (this.kind === 'candidate' && record) {
        void this.router.navigate(['/agent-evolution/evaluation'], {
          queryParams: { changeId: record.id },
          replaceUrl: true
        })
      }
    })
  }
  readonly item = computed(() => this.state().item)
}
