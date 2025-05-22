import { Component, computed, inject, input } from "@angular/core"
import { getErrorMessage, injectToastr, TXpertTeamNode, XpertService } from "@cloud/app/@core"
import { derivedAsync } from "ngxtension/derived-async"
import { catchError, of } from "rxjs"
import { XpertStudioApiService } from "../../domain"
import { XpertStudioComponent } from "../../studio.component"

@Component({
  selector: '',
  template: '',
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
  
  /**
   * The state variables of the subgraph where the `key` is located
   */
  readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    const nodeKey = this.key()
    return xpertId && nodeKey
      ? this.studioService.getVariables({xpertId, workflowKey: nodeKey, type: 'input'}).pipe(
          catchError((error) => {
            this._toastr.error(getErrorMessage(error))
            return of([])
          })
        )
      : of(null)
  })
}
