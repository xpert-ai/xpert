
import { ChangeDetectorRef, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { I18nService } from '@cloud/app/@shared/i18n'
import { KnowledgeRetrievalSettingsComponent } from '@cloud/app/@shared/knowledge'
import { attrModel, linkedModel } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour } from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardFormImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { omit } from 'lodash-es'
import { filter, finalize, switchMap, take, timer } from 'rxjs'
import {
  AiModelTypeEnum,
  ICopilotModel,
  IKnowledgebase,
  KnowledgebasePermission,
  KnowledgebaseService,
  KnowledgebaseStatusEnum,
  ModelFeature,
  Store,
  ToastrService,
  getErrorMessage,
  routeAnimations
} from '../../../../../@core'
import { EmojiAvatarComponent } from '../../../../../@shared/avatar/'
import { KnowledgebaseComponent } from '../knowledgebase.component'

function hasRebuildingStatus(value: unknown): value is { status: KnowledgebaseStatusEnum.REBUILDING } {
  return typeof value === 'object' && value !== null && 'status' in value && value.status === KnowledgebaseStatusEnum.REBUILDING
}

@Component({
  standalone: true,
  selector: 'xpert-knowledgebase-configuration',
  templateUrl: './configuration.component.html',
  styleUrls: ['./configuration.component.scss'],
  imports: [
    RouterModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    ...ZardFormImports,
    ...ZardTooltipImports,
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
  readonly #translate = inject(I18nService)
  readonly #destroyRef = inject(DestroyRef)

  readonly organizationId = toSignal(this.#store.selectOrganizationId())
  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly rebuilding = computed(() => this.knowledgebase()?.status === KnowledgebaseStatusEnum.REBUILDING)

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
  readonly copilotModel = linkedModel<Partial<ICopilotModel> | null>({
    initialValue: null,
    compute: () => this.knowledgebase()?.copilotModel ?? null,
    update: () => {
      this.pristine.set(false)
    }
  })
  readonly embeddingModelDraftChanged = computed(() => this.embeddingModelChanged())
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
  readonly #pollingRebuild = signal(false)

  readonly #rebuildPollingEffect = effect(() => {
    if (this.rebuilding()) {
      this.pollRebuildStatus()
    }
  })

  private embeddingModelChanged() {
    const active = this.knowledgebase()?.copilotModel
    const selected = this.copilotModel()
    return (
      JSON.stringify(this.toComparableCopilotModelConfig(selected)) !==
      JSON.stringify(this.toComparableCopilotModelConfig(active))
    )
  }

  private toComparableCopilotModelConfig(model: Partial<ICopilotModel> | null | undefined) {
    return model ? { id: model.id, ...this.toCopilotModelConfig(model) } : null
  }

  private toCopilotModelConfig(model: Partial<ICopilotModel> | null | undefined) {
    if (!model) {
      return null
    }

    return {
      copilotId: model.copilotId,
      referencedId: model.referencedId,
      modelType: model.modelType,
      model: model.model,
      options: model.options
    }
  }

  save() {
    if (this.rebuilding()) {
      return
    }

    const embeddingModelChanged = this.embeddingModelDraftChanged()
    this.loading.set(true)
    const payload = omit(this.knowledgebaseModel(), 'id') as Partial<IKnowledgebase>
    if (embeddingModelChanged) {
      payload.copilotModel = this.toCopilotModelConfig(this.copilotModel())
      delete payload.copilotModelId
    } else {
      delete payload.copilotModel
      delete payload.copilotModelId
    }

    this.knowledgebaseService
      .update(this.knowledgebase().id, payload)
      .subscribe({
        next: (knowledgebase) => {
          this.loading.set(false)
          this._toastrService.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
          this.knowledgebaseComponent.refresh()
          this.pristine.set(true)
          if (hasRebuildingStatus(knowledgebase)) {
            this.pollRebuildStatus()
          }
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error))
          this.loading.set(false)
        }
      })
  }

  private pollRebuildStatus() {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId || this.#pollingRebuild()) {
      return
    }

    this.#pollingRebuild.set(true)
    timer(0, 2000)
      .pipe(
        switchMap(() =>
          this.knowledgebaseService.getOneById(knowledgebaseId, {
            relations: ['copilotModel']
          })
        ),
        filter((knowledgebase) => knowledgebase.status !== KnowledgebaseStatusEnum.REBUILDING),
        take(1),
        takeUntilDestroyed(this.#destroyRef),
        finalize(() => {
          this.#pollingRebuild.set(false)
        })
      )
      .subscribe({
        next: () => {
          this.knowledgebaseComponent.refresh()
        },
        error: (error) => {
          this._toastrService.error(getErrorMessage(error))
        }
      })
  }

  cancel() {
    this.#router.navigate(['../..'], { relativeTo: this.#route })
  }
}
