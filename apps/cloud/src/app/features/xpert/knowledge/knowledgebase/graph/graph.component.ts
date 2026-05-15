import { CommonModule } from '@angular/common'
import { Component, computed, inject, model, signal } from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  NgmSpinComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { EChartsOption } from 'echarts'
import { NgxEchartsDirective } from 'ngx-echarts'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgeGraphEntity,
  IKnowledgeGraphMention,
  IKnowledgeGraphRelation,
  KnowledgeGraphEntityCreateInput,
  KnowledgeGraphItemOrigin,
  KnowledgeGraphRelationCreateInput,
  KnowledgeGraphStatus,
  KnowledgeGraphStatusResponse,
  KnowledgeGraphViewResponse,
  KnowledgeGraphVisibility,
  KnowledgeGraphVisualizationQuery,
  KnowledgebaseService,
  ToastrService
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'

type GraphSelection =
  | {
      kind: 'entity'
      id: string
    }
  | {
      kind: 'relation'
      id: string
    }

type GraphEditorMode = 'create-entity' | 'edit-entity' | 'create-relation' | 'edit-relation'

type GraphSelectValue = string | number | Array<string | number>

type ChartEventPayload = {
  dataType?: unknown
  data?: unknown
}

type ChartDatumPayload = {
  id?: unknown
}

function toChartEventPayload(value: unknown): ChartEventPayload | null {
  if (typeof value !== 'object' || value === null || !('data' in value)) {
    return null
  }
  return value as ChartEventPayload
}

function toChartDatumPayload(value: unknown): ChartDatumPayload | null {
  if (typeof value !== 'object' || value === null || !('id' in value)) {
    return null
  }
  return value as ChartDatumPayload
}

function parseAliases(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const ALL_SELECT_VALUE = '__all__'

@Component({
  standalone: true,
  selector: 'xpert-knowledge-graph',
  templateUrl: './graph.component.html',
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    NgmSpinComponent,
    NgxEchartsDirective,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardCardImports,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  styles: `
    :host {
      display: block;
      width: 100%;
    }
  `
})
export class KnowledgeGraphComponent {
  readonly KnowledgeGraphStatus = KnowledgeGraphStatus
  readonly allSelectValue = ALL_SELECT_VALUE
  readonly origins: Array<KnowledgeGraphItemOrigin | ''> = ['', 'extracted', 'manual', 'curated']
  readonly visibilities: KnowledgeGraphVisibility[] = ['active', 'hidden']

  readonly #fb = inject(FormBuilder)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)

  readonly knowledgebase = this.knowledgebaseComponent.knowledgebase
  readonly chatModelName = computed(() => {
    const chatModel = this.knowledgebase()?.chatModel
    return chatModel?.model || chatModel?.copilot?.copilotModel?.model || null
  })
  readonly search = model('')
  readonly entityType = model('')
  readonly relationType = model('')
  readonly origin = model<KnowledgeGraphItemOrigin | ''>('')
  readonly visibility = model<KnowledgeGraphVisibility>('active')
  readonly focusEntityId = model('')
  readonly depth = model(1)
  readonly take = model(80)

  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly status = signal<KnowledgeGraphStatusResponse | null>(null)
  readonly view = signal<KnowledgeGraphViewResponse | null>(null)
  readonly relations = signal<IKnowledgeGraphRelation[]>([])
  readonly entityOptions = signal<IKnowledgeGraphEntity[]>([])
  readonly mentions = signal<IKnowledgeGraphMention[]>([])
  readonly selected = signal<GraphSelection | null>(null)
  readonly selectedEntity = signal<IKnowledgeGraphEntity | null>(null)
  readonly selectedRelation = signal<IKnowledgeGraphRelation | null>(null)
  readonly relatedRelations = signal<IKnowledgeGraphRelation[]>([])
  readonly editorMode = signal<GraphEditorMode | null>(null)

  readonly entityForm = this.#fb.nonNullable.group({
    name: ['', Validators.required],
    type: ['', Validators.required],
    aliases: [''],
    description: [''],
    visibility: ['active' as KnowledgeGraphVisibility, Validators.required]
  })

  readonly relationForm = this.#fb.nonNullable.group({
    sourceEntityId: ['', Validators.required],
    targetEntityId: ['', Validators.required],
    type: ['', Validators.required],
    description: [''],
    weight: [1, [Validators.min(0), Validators.max(1)]],
    visibility: ['active' as KnowledgeGraphVisibility, Validators.required]
  })

  readonly query = computed<KnowledgeGraphVisualizationQuery>(() => ({
    search: this.search().trim() || null,
    entityType: this.entityType() || null,
    relationType: this.relationType() || null,
    origin: this.origin() || null,
    visibility: this.visibility(),
    focusEntityId: this.focusEntityId() || null,
    depth: this.depth(),
    take: this.take()
  }))

  readonly nodes = computed(() => this.view()?.nodes ?? [])
  readonly edges = computed(() => this.view()?.edges ?? [])
  readonly entityTypes = computed(() => this.view()?.entityTypes ?? [])
  readonly relationTypes = computed(() => this.view()?.relationTypes ?? [])
  readonly disabled = computed(
    () => this.status()?.status === KnowledgeGraphStatus.DISABLED || this.status()?.enabled === false
  )
  readonly empty = computed(() => !this.loading() && !this.disabled() && !this.nodes().length)

  readonly chartOptions = computed<EChartsOption>(() => {
    const nodes = this.nodes()
    const edges = this.edges()
    const categories = this.entityTypes().map((name) => ({ name }))
    const textColor = this.cssVar('--color-text-secondary')
    const borderColor = this.cssVar('--color-components-panel-border')

    return {
      tooltip: {
        trigger: 'item'
      },
      legend: {
        show: categories.length > 0,
        bottom: 8,
        textStyle: {
          color: textColor
        },
        data: categories.map((category) => category.name)
      },
      series: [
        {
          type: 'graph',
          layout: 'force',
          roam: true,
          draggable: true,
          categories,
          data: nodes.map((node) => ({
            id: node.id,
            name: node.name,
            value: node.value,
            symbolSize: node.symbolSize,
            category: node.type,
            label: {
              show: true,
              formatter: node.name,
              color: textColor
            }
          })),
          links: edges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            value: edge.weight ?? edge.evidenceCount ?? 1,
            label: {
              show: true,
              formatter: edge.type,
              color: textColor
            }
          })),
          edgeLabel: {
            show: true,
            fontSize: 11
          },
          lineStyle: {
            color: borderColor,
            opacity: 0.7,
            width: 1.4,
            curveness: 0.08
          },
          force: {
            repulsion: 180,
            edgeLength: 100
          },
          emphasis: {
            focus: 'adjacency'
          }
        }
      ]
    }
  })

  constructor() {
    void this.loadGraph()
  }

  async loadGraph() {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return
    }

    this.loading.set(true)
    try {
      const status = await firstValueFrom(this.#knowledgebaseService.getGraphStatus(knowledgebaseId))
      this.status.set(status)
      if (!status.enabled) {
        this.view.set(null)
        this.relations.set([])
        this.entityOptions.set([])
        return
      }

      const query = this.query()
      const view = await firstValueFrom(this.#knowledgebaseService.getGraphVisualization(knowledgebaseId, query))
      const relations = await firstValueFrom(this.#knowledgebaseService.getGraphRelations(knowledgebaseId, query))
      const entities = await firstValueFrom(
        this.#knowledgebaseService.getGraphEntities(knowledgebaseId, {
          where: {
            visibility: 'active'
          },
          take: 200
        })
      )

      this.view.set(view)
      this.relations.set(relations.items)
      this.entityOptions.set(entities.items)
      this.restoreSelection()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }

  async selectEntity(entityId: string) {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return
    }
    this.selected.set({ kind: 'entity', id: entityId })
    this.selectedRelation.set(null)
    try {
      const neighborhood = await firstValueFrom(
        this.#knowledgebaseService.getGraphNeighborhood(knowledgebaseId, entityId)
      )
      this.selectedEntity.set(neighborhood.entity)
      this.relatedRelations.set(neighborhood.relations)
      this.mentions.set(neighborhood.mentions)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async selectRelation(relationId: string) {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return
    }
    const relation = this.relations().find((item) => item.id === relationId)
    this.selected.set({ kind: 'relation', id: relationId })
    this.selectedEntity.set(null)
    this.selectedRelation.set(relation ?? null)
    this.relatedRelations.set([])
    try {
      const mentions = await firstValueFrom(
        this.#knowledgebaseService.getGraphMentions(knowledgebaseId, {
          relationId,
          take: 30
        })
      )
      this.mentions.set(mentions.items)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  selectFilterValue(value?: string | null) {
    return value || ALL_SELECT_VALUE
  }

  setEntityTypeFilter(value: GraphSelectValue) {
    this.entityType.set(this.selectValueToString(value))
  }

  setRelationTypeFilter(value: GraphSelectValue) {
    this.relationType.set(this.selectValueToString(value))
  }

  setOriginFilter(value: GraphSelectValue) {
    const next = this.selectValueToString(value)
    if (next === 'extracted' || next === 'manual' || next === 'curated') {
      this.origin.set(next)
      return
    }
    this.origin.set('')
  }

  setVisibilityFilter(value: GraphSelectValue) {
    const next = this.selectValueToString(value)
    this.visibility.set(next === 'hidden' ? 'hidden' : 'active')
  }

  setFocusEntityFilter(value: GraphSelectValue) {
    this.focusEntityId.set(this.selectValueToString(value))
  }

  selectChartItem(event: unknown) {
    const payload = toChartEventPayload(event)
    const datum = toChartDatumPayload(payload?.data)
    if (!datum || typeof datum.id !== 'string') {
      return
    }
    if (payload?.dataType === 'edge') {
      void this.selectRelation(datum.id)
      return
    }
    void this.selectEntity(datum.id)
  }

  openCreateEntity() {
    this.entityForm.reset({
      name: '',
      type: '',
      aliases: '',
      description: '',
      visibility: 'active'
    })
    this.editorMode.set('create-entity')
  }

  openEditEntity(entity?: IKnowledgeGraphEntity | null) {
    const target = entity ?? this.selectedEntity()
    if (!target) {
      return
    }
    this.entityForm.reset({
      name: target.name,
      type: target.type,
      aliases: target.aliases?.join(', ') ?? '',
      description: target.description ?? '',
      visibility: target.visibility ?? 'active'
    })
    this.editorMode.set('edit-entity')
  }

  openCreateRelation() {
    this.relationForm.reset({
      sourceEntityId: this.selectedEntity()?.id ?? '',
      targetEntityId: '',
      type: '',
      description: '',
      weight: 1,
      visibility: 'active'
    })
    this.editorMode.set('create-relation')
  }

  openEditRelation(relation?: IKnowledgeGraphRelation | null) {
    const target = relation ?? this.selectedRelation()
    if (!target) {
      return
    }
    this.selectedRelation.set(target)
    this.relationForm.reset({
      sourceEntityId: target.sourceEntityId ?? '',
      targetEntityId: target.targetEntityId ?? '',
      type: target.type,
      description: target.description ?? '',
      weight: target.weight ?? 1,
      visibility: target.visibility ?? 'active'
    })
    this.editorMode.set('edit-relation')
  }

  closeEditor() {
    this.editorMode.set(null)
  }

  async saveEditor() {
    const mode = this.editorMode()
    if (!mode) {
      return
    }
    if (
      (mode.includes('entity') && this.entityForm.invalid) ||
      (mode.includes('relation') && this.relationForm.invalid)
    ) {
      return
    }

    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return
    }
    this.saving.set(true)
    try {
      if (mode === 'create-entity' || mode === 'edit-entity') {
        const value = this.entityForm.getRawValue()
        const payload: KnowledgeGraphEntityCreateInput = {
          name: value.name,
          type: value.type,
          aliases: parseAliases(value.aliases),
          description: value.description || null,
          visibility: value.visibility
        }
        const saved =
          mode === 'create-entity'
            ? await firstValueFrom(this.#knowledgebaseService.createGraphEntity(knowledgebaseId, payload))
            : await firstValueFrom(
                this.#knowledgebaseService.updateGraphEntity(knowledgebaseId, this.selectedEntity().id, payload)
              )
        await this.loadGraph()
        await this.selectEntity(saved.id)
      } else {
        const value = this.relationForm.getRawValue()
        const weight = Number(value.weight)
        const payload: KnowledgeGraphRelationCreateInput = {
          sourceEntityId: value.sourceEntityId,
          targetEntityId: value.targetEntityId,
          type: value.type,
          description: value.description || null,
          weight: Number.isFinite(weight) ? weight : null,
          visibility: value.visibility
        }
        const saved =
          mode === 'create-relation'
            ? await firstValueFrom(this.#knowledgebaseService.createGraphRelation(knowledgebaseId, payload))
            : await firstValueFrom(
                this.#knowledgebaseService.updateGraphRelation(knowledgebaseId, this.selectedRelation().id, payload)
              )
        await this.loadGraph()
        await this.selectRelation(saved.id)
      }
      this.closeEditor()
      this.#toastr.success('PAC.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  async hideSelectedEntity() {
    const entity = this.selectedEntity()
    const knowledgebaseId = this.knowledgebase()?.id
    if (!entity || !knowledgebaseId) {
      return
    }
    try {
      await firstValueFrom(this.#knowledgebaseService.deleteGraphEntity(knowledgebaseId, entity.id))
      this.selected.set(null)
      this.selectedEntity.set(null)
      this.mentions.set([])
      await this.loadGraph()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async hideSelectedRelation() {
    const relation = this.selectedRelation()
    const knowledgebaseId = this.knowledgebase()?.id
    if (!relation || !knowledgebaseId) {
      return
    }
    try {
      await firstValueFrom(this.#knowledgebaseService.deleteGraphRelation(knowledgebaseId, relation.id))
      this.selected.set(null)
      this.selectedRelation.set(null)
      this.mentions.set([])
      await this.loadGraph()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  statusLabel(status?: KnowledgeGraphStatus | null) {
    switch (status) {
      case KnowledgeGraphStatus.INDEXING:
        return 'PAC.Knowledgebase.GraphStatus_Indexing'
      case KnowledgeGraphStatus.READY:
        return 'PAC.Knowledgebase.GraphStatus_Ready'
      case KnowledgeGraphStatus.FAILED:
        return 'PAC.Knowledgebase.GraphStatus_Failed'
      case KnowledgeGraphStatus.REBUILD_REQUIRED:
        return 'PAC.Knowledgebase.GraphStatus_RebuildRequired'
      case KnowledgeGraphStatus.DISABLED:
        return 'PAC.Knowledgebase.GraphStatus_Disabled'
      default:
        return 'PAC.Knowledgebase.GraphStatus_Pending'
    }
  }

  entityName(entityId?: string | null) {
    if (!entityId) {
      return ''
    }
    return (
      this.entityOptions().find((entity) => entity.id === entityId)?.name ??
      this.nodes().find((entity) => entity.id === entityId)?.name ??
      entityId
    )
  }

  relationLabel(relation: IKnowledgeGraphRelation) {
    return `${this.entityName(relation.sourceEntityId)} ${relation.type} ${this.entityName(relation.targetEntityId)}`
  }

  trackById(_: number, item: { id: string }) {
    return item.id
  }

  private restoreSelection() {
    const selected = this.selected()
    if (!selected) {
      return
    }
    if (selected.kind === 'entity' && this.nodes().some((node) => node.id === selected.id)) {
      void this.selectEntity(selected.id)
      return
    }
    if (selected.kind === 'relation' && this.edges().some((edge) => edge.id === selected.id)) {
      void this.selectRelation(selected.id)
      return
    }
    this.selected.set(null)
    this.selectedEntity.set(null)
    this.selectedRelation.set(null)
    this.mentions.set([])
  }

  private cssVar(name: string) {
    if (typeof window === 'undefined') {
      return undefined
    }
    const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    return value || undefined
  }

  private selectValueToString(value: GraphSelectValue) {
    if (Array.isArray(value)) {
      return ''
    }
    const next = String(value)
    return next === ALL_SELECT_VALUE ? '' : next
  }
}
