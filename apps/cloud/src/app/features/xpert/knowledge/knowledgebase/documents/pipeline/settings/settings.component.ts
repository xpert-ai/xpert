import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, computed, effect, inject, input, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import {
  getErrorMessage,
  IDocumentChunkerProvider,
  IKnowledgebase,
  IKnowledgebaseTask,
  IKnowledgeDocument,
  IWFNChunker,
  IWFNSource,
  IXpert,
  KDocumentSourceType,
  KnowledgebaseService,
  ToastrService,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from '@cloud/app/@core'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { KnowledgeChunkComponent } from '@cloud/app/@shared/knowledge'
import {
  buildJsonSchemaDefaults,
  jsonSchemaHasConfigFields
} from '@cloud/app/@shared/workflow/trigger-config/trigger-config.util'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Subscription } from 'rxjs'
import { startWith, switchMap } from 'rxjs/operators'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-knowledge-document-pipeline-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss'],
  imports: [
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    ContentLoaderModule,
    NgmI18nPipe,
    IconComponent,
    JSONSchemaFormComponent,
    KnowledgeChunkComponent
]
})
export class KnowledgeDocumentPipelineSettingsComponent {
  eKDocumentSourceType = KDocumentSourceType

  readonly kbAPI = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  // Inputs
  readonly knowledgebase = input<IKnowledgebase>()
  readonly pipeline = input<IXpert>()
  readonly taskId = input<string>()
  readonly selectedSource = input<TXpertTeamNode & { type: 'workflow'; entity: IWFNSource }>()
  readonly documents = model<Partial<IKnowledgeDocument>[]>()

  // Models
  readonly parametersValue = model<Partial<Record<string, unknown>>>({})

  // States
  readonly textSplitterStrategies = toSignal(
    this.#translate.onLangChange.pipe(
      startWith({ lang: this.#translate.currentLang }),
      switchMap(() => this.kbAPI.getTextSplitterStrategies())
    ),
    {
      initialValue: [] as IDocumentChunkerProvider[]
    }
  )
  readonly chunkerNode = computed(() => {
    const graph = this.pipeline()?.graph
    const sourceKey = this.selectedSource()?.key
    const workflowNodes = graph?.nodes?.filter(
      (node): node is TXpertTeamNode & { type: 'workflow'; entity: IWFNChunker } => node.type === 'workflow'
    )

    if (!workflowNodes?.length) {
      return null
    }

    if (sourceKey) {
      const nodeMap = new Map(workflowNodes.map((node) => [node.key, node]))
      const visited = new Set<string>()
      const queue = [sourceKey]

      while (queue.length) {
        const key = queue.shift()
        if (!key || visited.has(key)) {
          continue
        }

        visited.add(key)
        const node = nodeMap.get(key)
        if (key !== sourceKey && node?.entity.type === WorkflowNodeTypeEnum.CHUNKER) {
          return node
        }

        graph.connections
          ?.filter((connection) => connection.type === 'edge' && connection.from === key)
          .forEach((connection) => {
            if (!visited.has(connection.to)) {
              queue.push(connection.to)
            }
          })
      }
    }

    return (
      workflowNodes.find(
        (node): node is TXpertTeamNode & { type: 'workflow'; entity: IWFNChunker } =>
          node.entity.type === WorkflowNodeTypeEnum.CHUNKER
      ) ?? null
    )
  })
  readonly chunkerStrategy = computed(() =>
    this.textSplitterStrategies().find((strategy) => strategy.name === this.chunkerNode()?.entity.provider)
  )
  readonly chunkerConfigSchema = computed(() => this.chunkerStrategy()?.configSchema ?? null)
  readonly hasChunkerConfigFields = computed(() => jsonSchemaHasConfigFields(this.chunkerConfigSchema()))
  readonly chunkerConfig = computed(() => ({
    ...(buildJsonSchemaDefaults(this.chunkerConfigSchema()) ?? {}),
    ...(this.chunkerNode()?.entity.config ?? {})
  }))
  readonly previewing = signal(false)
  private previewSub: Subscription
  readonly previewDocName = signal('')
  readonly previewDocChunks = computed(() => {
    const docs = this._documents()
    if (!docs?.length) {
      return []
    }
    if (this.previewDocName()) {
      const doc = docs.find((d) => d.name === this.previewDocName())
      return doc?.draft.chunks || doc?.chunks || []
    }
    return docs[0]?.chunks || []
  })

  readonly task = signal<IKnowledgebaseTask>(null)
  readonly _documents = computed(() => this.task()?.context?.documents)

  readonly taskError = computed(() => this.task()?.error)

  constructor() {
    effect(
      () => {
        if (!this.previewDocName() && this.documents()?.length) {
          this.previewDocName.set(this.documents()[0].name)
        }
      }
    )
  }

  previewChunks() {
    this.previewing.set(true)
    this.task.set(null)
    this.previewSub?.unsubscribe()

    this.kbAPI
      .processTask(this.knowledgebase().id, this.taskId(), {
        sources: {
          [this.selectedSource().key]: {
            documents: this.documents().map((d) => d.id)
          }
        },
        stage: 'preview'
      })
      .subscribe({
        next: () => {
          this.previewSub = this.kbAPI.pollTaskStatus(this.knowledgebase().id, this.taskId()).subscribe({
            next: (res) => {
              this.task.set(res)
              if (res.status === 'success' || res.status === 'failed') {
                this.previewing.set(false)
              }
            },
            error: (err) => {
              this.previewing.set(false)
              this.#toastr.error(getErrorMessage(err))
            }
          })
        },
        error: (error) => {
          this.previewing.set(false)
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }
}
