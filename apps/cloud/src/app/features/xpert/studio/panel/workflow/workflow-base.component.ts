import { Component, computed, inject, input } from '@angular/core'
import { injectToastr, TXpertTeamNode, XpertService } from '@cloud/app/@core'
import { TXpertVariablesOptions } from '@cloud/app/@shared/agent'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'

@Component({
  selector: '',
  template: ''
})
export class XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly _toastr = injectToastr()

  readonly node = input<TXpertTeamNode>()

  readonly key = computed(() => this.node()?.key)
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)

  readonly varOptions = computed<TXpertVariablesOptions>(() => ({
    xpertId: this.xpertId(),
    workflowKey: this.key(),
    type: 'input',
    environmentId: this.studioService.environmentId()
  }))
}
