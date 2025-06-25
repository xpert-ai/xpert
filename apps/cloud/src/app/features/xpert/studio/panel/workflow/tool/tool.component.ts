import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { injectConfigureBuiltin } from '@cloud/app/features/xpert/tools'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  getEnabledTools,
  getToolLabel,
  IToolProvider,
  IWFNTool,
  IWorkflowNode,
  IXpertToolset,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum
} from 'apps/cloud/src/app/@core'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioToolsetMenuComponent } from '../../../components/toolset-menu/toolset.component'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { Dialog } from '@angular/cdk/dialog'
import { XpertWorkflowErrorHandlingComponent } from '@cloud/app/@shared/workflow'


@Component({
  selector: 'xpert-workflow-tool',
  templateUrl: './tool.component.html',
  styleUrls: ['./tool.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    TranslateModule,
    NgmI18nPipe,
    EmojiAvatarComponent,
    StateVariableSelectComponent,
    XpertStudioToolsetMenuComponent,
    XpertWorkflowErrorHandlingComponent,
  ]
})
export class XpertWorkflowToolComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly #dialog = inject(Dialog)
  readonly configureBuiltin = injectConfigureBuiltin()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)

  readonly toolEntity = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNTool,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly toolsetId = attrModel(this.toolEntity, 'toolsetId')
  readonly toolName = attrModel(this.toolEntity, 'toolName')
  readonly parameterVariable = attrModel(this.toolEntity, 'parameterVariable')
  readonly errorHandling = attrModel(this.toolEntity, 'errorHandling')

  // Refresh toolset details
  readonly toolsetDetail = derivedAsync(() => {
    return this.toolsetId()
      ? this.studioService.getToolset(this.toolsetId()).toolset$.pipe(catchError((err) => of(null)))
      : of(null)
  })

  readonly tools = computed(() =>
    getEnabledTools(this.toolsetDetail())?.map((tool) => ({
      value: tool.name,
      tool,
      label: getToolLabel(tool)
    }))
  )
  readonly tool = computed(() => {
    const tool = this.tools()?.find((t) => t.value === this.toolName())?.tool
    if (tool) {
      return {
        ...tool,
        label: getToolLabel(tool),
      }
    }
    return null
  })
  readonly schema = computed(() => this.tool()?.schema)

  readonly xpertCopilotModel = computed(() => this.xpert()?.copilotModel)

  readonly expandOutputVariables = signal(false)

  // constructor() {
  //   super()
  //   effect(() => {
  //     console.log(this.tool())
  //   })
  // }

  toggleOutput() {
    this.expandOutputVariables.update((state) => !state)
  }

  onSelectToolset({ toolset, provider }: { toolset?: IXpertToolset; provider?: IToolProvider }) {
    if (toolset) {
      this.toolsetId.set(toolset.id)
    }
    if (provider) {
      this.configureToolBuiltin(provider)
    }
  }

  configureToolBuiltin(provider: IToolProvider) {
    const providerName = provider.name
    this.configureBuiltin(providerName, this.xpert().workspaceId).subscribe((toolset) => {
      if (toolset && toolset.id) {
        this.toolsetId.set(toolset.id)
        this.studioService.refreshToolsets$.next()
      }
    })
  }

  onSelectTool(name: string) {
    this.toolName.set(name)
  }

  createMCPTool() {
    let toolset: Partial<IXpertToolset> = null
    this.#dialog
      .open<{toolset: IXpertToolset}>(XpertMCPManageComponent, {
        backdropClass: 'backdrop-blur-lg-white',
        disableClose: true,
        data: {
          workspaceId: this.workspaceId(),
          toolset,
        }
      })
      .closed.subscribe({
        next: ({toolset}) => {
          if (toolset) {
            this.toolsetId.set(toolset.id)
            this.studioService.refreshToolsets$.next()
          }
        }
      })
    }
}
