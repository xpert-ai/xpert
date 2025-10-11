import { Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { injectToastr, TXpertTeamNode, XpertAPIService } from '@cloud/app/@core'
import { TXpertVariablesOptions } from '@cloud/app/@shared/agent'
import { myRxResource } from '@metad/ocap-angular/core'
import { isEqual } from 'lodash-es'
import { of } from 'rxjs'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'

@Component({
  selector: '',
  template: ''
})
export class XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertAPI = inject(XpertAPIService)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly _toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()

  // States
  readonly key = computed(() => this.node()?.key)
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)

  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly connections = toSignal(
    this.studioService.savedEvent$.pipe(
      filter((value) => value),
      map(() => {
        return this.studioService
          .viewModel()
          .connections.filter((c) => c.from.startsWith(this.key()) || c.to.startsWith(this.key()))
          .map((c) => c.key)
      }),
      distinctUntilChanged(isEqual)
    )
  )

  readonly #variables = myRxResource({
    request: () => ({
    xpertId: this.xpertId(),
    workflowKey: this.key(),
    type: 'input',
    environmentId: this.studioService.environmentId(),
    connections: this.connections()
  } as TXpertVariablesOptions),
    loader: ({ request }) => {
      return request ? this.xpertAPI.getNodeVariables(request) : of(null)
    }
  })
  readonly loading = computed(() => this.#variables.status() === 'loading')
  readonly variables = this.#variables.value
}
