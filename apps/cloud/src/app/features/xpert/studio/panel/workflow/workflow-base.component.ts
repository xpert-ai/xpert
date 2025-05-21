import { Component, computed, inject, input } from "@angular/core"
import { XpertStudioApiService } from "../../domain"
import { getErrorMessage, injectToastr, TXpertTeamNode, XpertService } from "@cloud/app/@core"
import { derivedAsync } from "ngxtension/derived-async"
import { XpertStudioComponent } from "../../studio.component"
import { catchError, of } from "rxjs"

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
  
  readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    const nodeKey = this.key()
    return xpertId && nodeKey
      ? this.studioService.getVariables({workflowKey: nodeKey, type: 'input'}).pipe(
          catchError((error) => {
            this._toastr.error(getErrorMessage(error))
            return of([])
          })
        )
      : of(null)
  })
}
