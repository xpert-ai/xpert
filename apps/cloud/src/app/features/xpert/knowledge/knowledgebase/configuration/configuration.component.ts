import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { I18nService } from '@cloud/app/@shared/i18n'
import { KnowledgeRetrievalSettingsComponent } from '@cloud/app/@shared/knowledge'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { omit } from 'lodash-es'
import {
  AiModelTypeEnum,
  IKnowledgebase,
  KnowledgebasePermission,
  KnowledgebaseService,
  ModelFeature,
  Store,
  ToastrService,
  getErrorMessage,
  routeAnimations
} from '../../../../../@core'
import { EmojiAvatarComponent } from '../../../../../@shared/avatar/'
import { PACCopilotService } from '../../../../services'
import { KnowledgebaseComponent } from '../knowledgebase.component'

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase-configuration',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    MatTooltipModule,
    NgmSelectComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    KnowledgeRetrievalSettingsComponent
  ],
  animations: [routeAnimations]
})
export class KnowledgeConfigurationComponent {
  KnowledgebasePermission = KnowledgebasePermission
  DisplayBehaviour = DisplayBehaviour
  eModelType = AiModelTypeEnum
  eModelFeature = ModelFeature

  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly _toastrService = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly copilotService = inject(PACCopilotService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #translate = inject(I18nService)

  readonly organizationId = toSignal(this.#store.selectOrganizationId())
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase

  readonly pristine = signal(true)
  readonly knowledgebaseModel = linkedModel({
    initialValue: null,
    compute: () => this.knowledgebase(),
    update: (knowledgebase) => {
      this.pristine.set(false)
    }
  })

  readonly avatar = attrModel(this.knowledgebaseModel, 'avatar')
  readonly name = attrModel(this.knowledgebaseModel, 'name')
  readonly description = attrModel(this.knowledgebaseModel, 'description')
  readonly visionModel = attrModel(this.knowledgebaseModel, 'visionModel')
  readonly copilotModel = attrModel(this.knowledgebaseModel, 'copilotModel')
  readonly permission = attrModel(this.knowledgebaseModel, 'permission')
  readonly parserConfig = attrModel(this.knowledgebaseModel, 'parserConfig')
  readonly chunkSize = attrModel(this.parserConfig, 'chunkSize')
  readonly chunkOverlap = attrModel(this.parserConfig, 'chunkOverlap')
  readonly embeddingBatchSize = attrModel(this.parserConfig, 'embeddingBatchSize')

  readonly retrieval = linkedModel({
    initialValue: null,
    compute: () => this.knowledgebase(),
    update: (retrieval) => {
      this.knowledgebaseModel.update((kb) => {
        kb.recall = retrieval?.recall
        kb.rerankModel = retrieval?.rerankModel
        kb.rerankModelId = retrieval?.rerankModelId
        return { ...kb }
      })
    }
  })

  readonly permissions = computed(() => {
    const language = this.#translate.language()
    return [
      {
        value: KnowledgebasePermission.Private,
        label: this.#translate.instant('PAC.Knowledgebase.Permission_Private', { Default: 'Private' })
      },
      {
        value: KnowledgebasePermission.Organization,
        label: this.#translate.instant('PAC.Knowledgebase.Permission_Organization', { Default: 'Organization' })
      },
      {
        value: KnowledgebasePermission.Public,
        label: this.#translate.instant('PAC.Knowledgebase.Permission_Public', { Default: 'Public' })
      }
    ]
  })

  readonly loading = signal(false)


  save() {
    this.loading.set(true)
    this.knowledgebaseService
      .update(this.knowledgebase().id, omit(this.knowledgebaseModel(), 'id') as Partial<IKnowledgebase>)
      .subscribe({
        next: () => {
          this.loading.set(false)
          this._toastrService.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
          this.knowledgebaseComponent.refresh()
          this.pristine.set(true)
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }

  cancel() {
    this.#router.navigate(['../..'], { relativeTo: this.#route })
  }
}
