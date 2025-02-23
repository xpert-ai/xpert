import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  IWFNIterating,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { catchError, of } from 'rxjs'
import { derivedAsync } from 'ngxtension/derived-async'
import { StateVariableSelectComponent } from 'apps/cloud/src/app/@shared/workflow'
import { FormsModule } from '@angular/forms'
import { NgmSlideToggleComponent } from '@metad/ocap-angular/common'
import { MatSliderModule } from '@angular/material/slider'
import { NgmDensityDirective, TSelectOption } from '@metad/ocap-angular/core'
import { NgmSelectComponent } from 'apps/cloud/src/app/@shared/common'

@Component({
  selector: 'xpert-studio-panel-workflow-iterating',
  templateUrl: './iterating.component.html',
  styleUrls: ['./iterating.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, MatSliderModule, NgmSlideToggleComponent, NgmDensityDirective, NgmSelectComponent, StateVariableSelectComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowIteratingComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly key = computed(() => this.node()?.key)
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly iteratingEntity = computed(() => this.entity() as IWFNIterating)
  readonly inputVariable = computed(() => this.iteratingEntity()?.inputVariable)
  readonly outputVariable = computed(() => this.iteratingEntity()?.outputVariable)
  readonly parallel = computed(() => this.iteratingEntity()?.parallel)
  readonly maximum = computed(() => this.iteratingEntity()?.maximum)
  readonly errorMode = computed(() => this.iteratingEntity()?.errorMode)

   // Fetch avaiable variables for this agent from server
   readonly variables = derivedAsync(() => {
    const xpertId = this.xpertId()
    const nodeKey = this.key()
    return xpertId && nodeKey ? this.xpertService.getWorkflowVariables(xpertId, nodeKey).pipe(
      catchError((error) => {
        this.#toastr.error(getErrorMessage(error))
        return of([])
      })
    ) : of(null)
  })

  readonly errorModeOptions: TSelectOption<IWFNIterating['errorMode']>[] = [
    {
      value: 'terminate',
      label: {
        en_US: 'Terminate on error',
        zh_Hans: '错误时终止'
      }
    },
    {
      value: 'ignore',
      label: {
        en_US: 'Ignore error and continue',
        zh_Hans: '忽略错误并继续'
      }
    },
    {
      value: 'remove',
      label: {
        en_US: 'Remove error output',
        zh_Hans: '移除错误输出'
      }
    }
  ]

  constructor() {
    // effect(() => console.log(this.variables()))
  }

  updateEntity(name: string, value: string | number) {
    const entity = {...(this.iteratingEntity() ?? {})} as IWFNIterating
    entity[name] = value
    this.studioService.updateBlock(this.key(), { entity })
  }
}
