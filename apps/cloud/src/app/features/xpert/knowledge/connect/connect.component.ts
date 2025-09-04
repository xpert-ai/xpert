import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { injectWorkspace } from '@metad/cloud/state'
import { NgmSlideToggleComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  getErrorMessage,
  IKnowledgebase,
  injectHelpWebsite,
  injectIntegrationAPI,
  IntegrationFeatureEnum,
  KnowledgebaseService,
  KnowledgebaseTypeEnum,
  ToastrService,
  XpertTypeEnum
} from '../../../../@core'

@Component({
  selector: 'xpert-connect-knowledge',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule, CdkMenuModule, NgmI18nPipe, NgmSpinComponent, NgmSlideToggleComponent],
  templateUrl: './connect.component.html',
  styleUrl: './connect.component.scss'
})
export class XpertConnectKnowledgeComponent {
  eXpertTypeEnum = XpertTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum
  readonly #toastr = inject(ToastrService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly integrationAPI = injectIntegrationAPI()
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly selectedWorkspace = injectWorkspace()
  readonly helpUrl = injectHelpWebsite('/docs/ai/knowledge/external-knowledge-base')
  readonly learnMoreUrl = injectHelpWebsite('/docs/ai/knowledge/external-knowledge-base')

  readonly loading = signal(false)

  readonly #integrations = myRxResource({
    request: () => [IntegrationFeatureEnum.KNOWLEDGE],
    loader: ({ request }) => this.integrationAPI.selectOptions({ features: request })
  })

  readonly integrations = this.#integrations.value

  // Models
  readonly knowledgebase = model<Partial<IKnowledgebase>>({ type: KnowledgebaseTypeEnum.External })
  readonly name = attrModel(this.knowledgebase, 'name')
  readonly description = attrModel(this.knowledgebase, 'description')
  readonly integrationId = attrModel(this.knowledgebase, 'integrationId')
  readonly extKnowledgebaseId = attrModel(this.knowledgebase, 'extKnowledgebaseId')
  readonly recall = attrModel(this.knowledgebase, 'recall')
  readonly topK = attrModel(this.recall, 'topK')
  readonly score = attrModel(this.recall, 'score')

  readonly enabledScore = linkedModel({
    initialValue: null,
    compute: () => this.score() != null,
    update: (value) => {
      this.score.set(value ? 0.5 : null)
    }
  })

  // Status
  readonly integration = computed(() => this.integrations()?.find((item) => item.value === this.integrationId()))


  create() {
    this.loading.set(true)
    this.knowledgebaseService
      .createExternal({
        workspaceId: this.#route.snapshot.queryParams['workspaceId'] || this.selectedWorkspace()?.id,
        ...this.knowledgebase()
      })
      .subscribe({
        next: (knowledgebase) => {
          this.loading.set(false)
          this.close(knowledgebase)
        },
        error: (err) => {
          this.loading.set(false)
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  close(value?: IKnowledgebase) {
    if (value) {
      this.#router.navigate(['/xpert/knowledges/', value.id, 'test'])
    }
  }

  goBack() {
    history.back()
  }

  openIntegrations() {
    window.open('/settings/integration', '_blank')
  }
}
