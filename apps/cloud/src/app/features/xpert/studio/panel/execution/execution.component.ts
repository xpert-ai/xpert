import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertAgent, XpertAgentExecutionService, XpertAgentExecutionStatusEnum } from 'apps/cloud/src/app/@core'
import { XpertAgentExecutionAccordionComponent, XpertAgentExecutionComponent } from 'apps/cloud/src/app/@shared/xpert'
import { derivedFrom } from 'ngxtension/derived-from'
import { interval, of, pipe, Subscription, switchMap, tap } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'

@Component({
  selector: 'xpert-studio-panel-execution',
  templateUrl: './execution.component.html',
  styleUrls: ['./execution.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    NgmSpinComponent,
    XpertAgentExecutionComponent,
    XpertAgentExecutionAccordionComponent
  ]
})
export class XpertStudioPanelExecutionComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum

  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly studioService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly #destroyRef = inject(DestroyRef)

  // Inputs
  readonly id = input<string>()

  // Output
  readonly close = output<void>()

  // States
  readonly loading = signal(false)
  // Refresh trigger signal for polling
  readonly #refreshTrigger = signal(0)
  readonly #execution = derivedFrom(
    [this.id, this.#refreshTrigger],
    pipe(
      tap(() => this.loading.set(true)),
      switchMap(([id]) => (id ? this.agentExecutionService.getOneLog(id) : of(null))),
      tap(() => this.loading.set(false))
    ),
    { initialValue: null }
  )

  readonly nodes = computed(() => this.studioService.viewModel()?.nodes)

  readonly pageType = signal<'overview' | 'steps'>('overview')

  // Main execution
  readonly execution = computed(() => {
    const execution = this.#execution()
    return execution
      ? {
          ...execution,
          agent: this.nodes()?.find((node) => node.type === 'agent' && node.key === execution.agentKey)
            ?.entity as IXpertAgent
        }
      : null
  })

  // Sub executions
  readonly executions = computed(() =>
    this.#execution()?.subExecutions?.map((exec) => ({
      ...exec,
      agent: exec.agent ?? this.nodes()?.find((node) => node.type === 'agent' && node.key === exec.agentKey)?.entity as IXpertAgent
    }))
  )

  // Polling subscription for real-time status updates
  #pollingSubscription: Subscription | null = null

  constructor() {
    effect(
      () => {
        this.executionService.clear()
        if (this.#execution()) {
          this.executionService.setAgentExecution(this.#execution().agentKey, this.#execution())
        }
      },
      { allowSignalWrites: true }
    )

    // Watch execution status and start/stop polling accordingly
    effect(() => {
      const execution = this.execution()
      if (execution?.status === XpertAgentExecutionStatusEnum.RUNNING) {
        this.#startPolling()
      } else {
        this.#stopPolling()
      }
    }, { allowSignalWrites: true })

    // Stop polling when component is destroyed
    this.#destroyRef.onDestroy(() => {
      this.#stopPolling()
    })
  }

  #startPolling() {
    if (this.#pollingSubscription) {
      return // Already polling
    }
    // Refresh every 2 seconds
    this.#pollingSubscription = interval(2000).subscribe(() => {
      this.#refreshTrigger.update(v => v + 1)
    })
  }

  #stopPolling() {
    if (this.#pollingSubscription) {
      this.#pollingSubscription.unsubscribe()
      this.#pollingSubscription = null
    }
  }
}
