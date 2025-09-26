import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { attrModel, linkedModel, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { injectIntegrationAPI, IWFNSource, IWorkflowNode, KnowledgebaseService } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

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
    JSONSchemaFormComponent
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
  readonly integrationService = computed(() => this.integration()?.service)

  readonly #integrations = myRxResource({
    request: () => this.integrationService(),
    loader: ({ request }) => request && this.integrationAPI.selectOptions({ provider: request })
  })
  readonly integrations = this.#integrations.value

  readonly selectedIntegration = computed(() =>
    this.integrations()?.find((item) => item.value === this.integrationId())
  )

  openIntegrations() {
    window.open('/settings/integration', '_blank')
  }
}
