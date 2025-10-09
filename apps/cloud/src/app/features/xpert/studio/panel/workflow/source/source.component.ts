import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { attrModel, linkedModel, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectIntegrationAPI, IWFNSource, IWorkflowNode, KnowledgebaseService, TSelectOption } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { IntegrationSelectComponent } from '@cloud/app/@shared/integration'

@Component({
  selector: 'xpert-workflow-source',
  templateUrl: './source.component.html',
  styleUrls: ['./source.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    TranslateModule,
    NgmI18nPipe,
    JSONSchemaFormComponent,
    NgmSelectComponent,
    IntegrationSelectComponent
  ]
})
export class XpertWorkflowSourceComponent extends XpertWorkflowBaseComponent {
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly integrationAPI = injectIntegrationAPI()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly source = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNSource,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly provider = attrModel(this.source, 'provider')
  readonly integrationId = attrModel(this.source, 'integrationId')
  readonly config = attrModel(this.source, 'config')

  readonly documentSourceStrategies = toSignal(this.knowledgebaseAPI.documentSourceStrategies$)

  readonly documentSourceStrategy = computed(() =>
    this.documentSourceStrategies()?.find((item) => item.meta.name === this.provider())
  )
  readonly configSchema = computed(() => this.documentSourceStrategy()?.meta.configSchema || {})

  readonly integration = computed(() => this.documentSourceStrategy()?.integration)
  readonly integrationProvider = computed(() => this.integration()?.service)

  // readonly #integrations = myRxResource({
  //   request: () => this.integrationProvider(),
  //   loader: ({ request }) => request && this.integrationAPI.selectOptions({ provider: request })
  // })
  // readonly integrations = this.#integrations.value

  // readonly selectedIntegration = computed(() =>
  //   this.integrations()?.find((item) => item.value === this.integrationId())
  // )

  // Auth mode
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

  openIntegrations() {
    window.open('/settings/integration', '_blank')
  }
}
