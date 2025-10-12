import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { IntegrationSelectComponent } from '@cloud/app/@shared/integration'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IWFNProcessor, IWorkflowNode, KnowledgebaseService, TSelectOption } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-processor',
  templateUrl: './processor.component.html',
  styleUrls: ['./processor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    IconComponent,
    NgmI18nPipe,
    JSONSchemaFormComponent,
    StateVariableSelectComponent,
    NgmSelectComponent,
    IntegrationSelectComponent
  ]
})
export class XpertWorkflowProcessorComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly processor = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNProcessor,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly input = attrModel(this.processor, 'input')
  readonly provider = attrModel(this.processor, 'provider')
  readonly documentTransformerStrategies = toSignal(this.knowledgebaseAPI.documentTransformerStrategies$)
  readonly transformerStrategy = computed(() =>
    this.documentTransformerStrategies()?.find((item) => item.meta.name === this.provider())
  )
  readonly transformerConfigSchema = computed(() => this.transformerStrategy()?.meta.configSchema)
  readonly transformer = attrModel(this.processor, 'config')
  readonly integrationId = attrModel(this.processor, 'integrationId')
  readonly integration = computed(() => this.transformerStrategy()?.integration)
  readonly integrationProvider = computed(() => this.integration()?.service)

  // Auth
  readonly authMode = linkedModel({
    initialValue: 'default',
    compute: () => (this.integrationId() ? 'integration' : 'default'),
    update: (value) => {
      if (value === 'default') {
        this.integrationId.set(null)
      }
    }
  })

  readonly authModeOptions = computed(() => {
    const options: TSelectOption[] = [
      {
        value: 'default',
        label: {
          en_US: 'Local',
          zh_Hans: '本地部署'
        },
        description: {
          en_US: 'In local deployment mode, use environment variables to configure authentication information.',
          zh_Hans: '本地部署模式，使用环境变量配置认证信息。'
        }
      }
    ]
    if (this.integration()) {
      options.push({
        value: 'integration',
        label: {
          en_US: 'Integration',
          zh_Hans: '集成模式'
        },
        description: {
          en_US: 'In integration mode, use system integration to configure authentication information.',
          zh_Hans: '使用集成模式，通过系统集成配置认证信息。'
        }
      })
    }
    return options
  })
}
