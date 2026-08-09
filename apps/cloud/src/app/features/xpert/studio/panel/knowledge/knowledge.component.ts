import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core'
import { CloseSvgComponent, ZardButtonComponent, ZardCheckboxComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import {
  IKnowledgebase,
  TXpertTeamNode,
  KnowledgebaseService,
  AiModelTypeEnum,
  getErrorMessage,
  KBMetadataFieldDef,
  KnowledgeFilterNode
} from 'apps/cloud/src/app/@core'
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
import { KnowledgeRecallParamsComponent, XpertKnowledgeFilterFormComponent } from 'apps/cloud/src/app/@shared/knowledge'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { attrModel, linkedModel } from '@xpert-ai/headless-ui'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  selector: 'xpert-studio-panel-knowledge',
  templateUrl: './knowledge.component.html',
  styleUrls: ['./knowledge.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    CloseSvgComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    EmojiAvatarComponent,
    CopilotModelSelectComponent,
    XpertKnowledgeTestComponent,
    KnowledgeRecallParamsComponent,
    XpertKnowledgeFilterFormComponent
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

  // Inputs
  readonly node = input<TXpertTeamNode>()

  // States
  readonly id = computed(() => this.node()?.key)
  readonly name = computed(() => (<IKnowledgebase>this.node()?.entity)?.name)
  readonly #knowledgebase = derivedAsync<{ loading?: boolean; error?: string; knowledgebase?: IKnowledgebase }>(
    () =>
      this.id()
        ? this.knowledgebaseService.getOneById(this.id(), { relations: ['copilotModel'] }).pipe(
            map((knowledgebase) => ({ knowledgebase })),
            catchError((err) =>
              of({ error: getErrorMessage(err), knowledgebase: omit(this.node()?.entity, 'id') as IKnowledgebase })
            ),
            startWith({ loading: true })
          )
        : of({ knowledgebase: this.node()?.entity as IKnowledgebase }),
    { initialValue: null }
  )
  readonly knowledgebase = computed(() => this.#knowledgebase()?.knowledgebase)
  readonly loading = computed(() => this.#knowledgebase()?.loading)

  readonly copilotModel = computed(() => this.knowledgebase()?.copilotModel)
  readonly filterFields = computed<KBMetadataFieldDef[]>(() => [
    ...SYSTEM_KNOWLEDGE_FILTER_FIELDS,
    ...(this.knowledgebase()?.metadataSchema ?? []).map((field) => ({
      ...field,
      scope: field.scope ?? 'document',
      key: `${field.scope === 'chunk' ? 'chunk.metadata' : 'metadata'}.${field.key}`
    }))
  ])

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
  readonly retrievalMode = attrModel(this.retrieval, 'mode', 'vector')
  readonly filtering = attrModel(this.retrieval, 'filtering')
  readonly fixedFilter = attrModel(this.filtering, 'fixed')
  readonly agentFiltering = attrModel(this.filtering, 'agent')
  readonly agentFilteringEnabled = attrModel(this.agentFiltering, 'enabled', false)
  readonly fixedConditionCount = computed(() => countFilterConditions(this.fixedFilter()))

  filterFieldOperators(field: KBMetadataFieldDef) {
    return filterFieldOperators(field)
  }

  constructor() {
    effect(() => {
      const id = this.id()
      if (id && !this.retrieval()) {
        this.retrieval.set({ mode: 'vector', filtering: { agent: { enabled: false } } })
      }
    })
  }

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
    this.#router.navigate(['/xpert/w/', this.xpert().workspaceId, 'knowledges'])
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
}

const SYSTEM_KNOWLEDGE_FILTER_FIELDS: KBMetadataFieldDef[] = [
  { key: 'document.fileName', type: 'string', scope: 'document', description: 'Document file name' },
  { key: 'document.folderPath', type: 'string', scope: 'document', description: 'Logical folder path' },
  { key: 'document.fileExtension', type: 'string', scope: 'document', description: 'Normalized extension' },
  { key: 'document.mimeType', type: 'string', scope: 'document', description: 'MIME type' },
  {
    key: 'document.category',
    type: 'enum',
    scope: 'document',
    enumValues: ['text', 'image', 'audio', 'video', 'sheet', 'other'],
    description: 'Document category'
  },
  {
    key: 'document.sourceType',
    type: 'enum',
    scope: 'document',
    enumValues: ['local-file', 'file-system', 'online-document', 'web-crawl', 'database', 'folder', 'file'],
    description: 'Document source type'
  },
  { key: 'document.createdAt', type: 'datetime', scope: 'document', description: 'Creation time in UTC' },
  { key: 'document.updatedAt', type: 'datetime', scope: 'document', description: 'Last update time in UTC' }
]

function countFilterConditions(node?: KnowledgeFilterNode): number {
  if (!node) return 0
  if (node.kind === 'condition') return 1
  return node.children.reduce((count, child) => count + countFilterConditions(child), 0)
}

function filterFieldOperators(field: KBMetadataFieldDef) {
  if (field.key === 'document.folderPath') return 'eq, neq, in, notIn, contains, startsWith, endsWith, under, exists'
  if (field.type === 'number' || field.type === 'datetime') return 'eq, neq, in, gt, gte, lt, lte, between, exists'
  if (field.type === 'boolean') return 'eq, neq, exists'
  if (field.type === 'string[]' || field.type === 'number[]')
    return 'contains, containsAny, containsAll, isEmpty, exists'
  if (field.type === 'object') return 'jsonContains, exists'
  if (field.type === 'enum') return 'eq, neq, in, notIn, exists'
  return 'eq, neq, in, notIn, contains, notContains, startsWith, endsWith, exists'
}
