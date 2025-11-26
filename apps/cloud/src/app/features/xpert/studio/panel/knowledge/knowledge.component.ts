import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CloseSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgebase, TXpertTeamNode, KnowledgebaseService, AiModelTypeEnum, getErrorMessage, TSelectOption, STANDARD_METADATA_FIELDS, KBMetadataFieldDef, WorkflowLogicalOperator } from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertKnowledgeTestComponent } from './test/test.component'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, map, of, startWith } from 'rxjs'
import { CopilotModelSelectComponent } from 'apps/cloud/src/app/@shared/copilot'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { CdkMenuModule } from '@angular/cdk/menu'
import { omit } from 'lodash-es'
import { Router } from '@angular/router'
import { MatSliderModule } from '@angular/material/slider'
import { KnowledgeRecallParamsComponent, XpertKnowledgeCaseFormComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { NgmSelectPanelComponent } from '@cloud/app/@shared/common'
import { injectI18nService } from '@cloud/app/@shared/i18n'
import { CapitalizePipe } from '@metad/core'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'

@Component({
  selector: 'xpert-studio-panel-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatTooltipModule,
    MatSliderModule,
    CapitalizePipe,
    NgmSelectPanelComponent,
    CloseSvgComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    XpertKnowledgeTestComponent,
    KnowledgeRecallParamsComponent,
    XpertKnowledgeCaseFormComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelKnowledgeComponent {
  eModelType = AiModelTypeEnum
  readonly elementRef = inject(ElementRef)
  readonly #router = inject(Router)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly studioService = inject(XpertStudioApiService)
  readonly i18nService = injectI18nService()

  // Inputs
  readonly node = input<TXpertTeamNode>()
  
  // States
  readonly id = computed(() => this.node()?.key)
  readonly name = computed(() => (<IKnowledgebase>this.node()?.entity)?.name)
  readonly #knowledgebase = derivedAsync<{loading?: boolean; error?: string; knowledgebase?: IKnowledgebase;}>(() =>
    this.id() ? this.knowledgebaseService.getOneById(this.id(), { relations: ['copilotModel'] }).pipe(
      map((knowledgebase) => ({knowledgebase})),
      catchError((err) => of({error: getErrorMessage(err), knowledgebase: omit(this.node()?.entity, 'id') as IKnowledgebase})),
      startWith({loading: true})
    ) : of({knowledgebase: this.node()?.entity as IKnowledgebase}), {initialValue: null}
  )
  readonly knowledgebase = computed(() => this.#knowledgebase()?.knowledgebase)
  readonly loading = computed(() => this.#knowledgebase()?.loading)

  readonly copilotModel = computed(() => this.knowledgebase()?.copilotModel)
  readonly metadataFields = computed(() => {
    const schema: KBMetadataFieldDef[] = [...(this.knowledgebase()?.metadataSchema || [])]
    STANDARD_METADATA_FIELDS.forEach(({fields}) => {
      fields.forEach((field) => {
        if (!schema?.some((_) => _.key === field.key)) {
           schema.push(field)
        }
      })
    })
    return schema
  })

  readonly metadataFieldsOptions = computed(() => {
    const schema = this.metadataFields()
    return schema.map((field) => ({
      value: field.key,
      label: field.label || field.key,
      description: field.description,
    }))
  })

  readonly openedTest = signal(false)

  readonly knowledgebases = toSignal(this.studioService.knowledgebases$)

  readonly xpert = computed(() => this.studioService.xpert())
  readonly agentConfig = this.studioService.agentConfig
  readonly recalls = attrModel(this.agentConfig, 'recalls')
  readonly recall = linkedModel({
    initialValue: null,
    compute: () => this.recalls()?.[this.id()],
    update: (value) => {
      this.recalls.update((state) => ({
        ...(state ?? {}),
        [this.id()]: value
      }))
    }
  })

  readonly retrievals = attrModel(this.agentConfig, 'retrievals')
  readonly retrieval = linkedModel({
    initialValue: null,
    compute: () => this.retrievals()?.[this.id()],
    update: (value) => {
      this.retrievals.update((state) => ({
        ...(state ?? {}),
        [this.id()]: value
      }))
    }
  })
  readonly metadataFiltering = attrModel(this.retrieval, 'metadata')
  readonly filtering_mode = attrModel(this.metadataFiltering, 'filtering_mode', 'disabled')
  readonly filtering_conditions = attrModel(this.metadataFiltering, 'filtering_conditions', {caseId: '0', logicalOperator: WorkflowLogicalOperator.AND, conditions: []})
  readonly filterModeOptions: TSelectOption[] = [
    {
      value: 'disabled',
      label: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_disabled', {Default: 'Disabled'}),
      description: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_disabled_Description', {Default: 'No metadata filtering applied.'})
    },
    {
      value: 'automatic',
      label: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_automatic', {Default: 'Automatic'}),
      description: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_automatic_Description', {Default: 'Automatically apply metadata filtering based on context by Agent.'})
    },
    {
      value: 'manual',
      label: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_manual', {Default: 'Manual'}),
      description: this.i18nService.instant('PAC.Xpert.MetadataFilterMode_manual_Description', {Default: 'Manually configure metadata filtering options by user.'})
    }
  ]
  readonly #filteringFields = attrModel(this.metadataFiltering, 'fields', {})
  readonly filteringFieldNames = linkedModel({
    initialValue: [] as string[],
    compute: () => Object.keys(this.#filteringFields() || {}),
    update: (value) => {
      this.#filteringFields.set(
        (value || []).reduce((acc, field) => ({
          ...acc,
          [field]: {}
        }), {})
      )
    }
  })

  readonly filteringFields = computed(() => this.filteringFieldNames().map((field) => 
    this.metadataFields().find((f) => f.key === field)).filter((f) => f)
  )

  openTest() {
    this.openedTest.set(true)
  }

  closeTest() {
    this.openedTest.set(false)
  }

  closePanel() {
    this.panelComponent.close()
  }

  gotoKnowledgebase() {
    this.#router.navigate(['/xpert/w/', this.xpert().workspaceId ,'knowledges'])
  }

  useKnowledgebase(k: IKnowledgebase) {
    this.studioService.replaceKnowledgebase(this.id(), k)
  }

  edit() {
    window.open(['/xpert', 'knowledges', this.knowledgebase().id].join('/'), '_blank')
  }

  moveToNode() {
    this.xpertStudioComponent.centerGroupOrNode(this.id())
  }

  clearFilteringFields() {
    this.#filteringFields.set({})
  }
}
