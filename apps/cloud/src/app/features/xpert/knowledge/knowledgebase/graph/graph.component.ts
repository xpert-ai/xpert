import { graphStyles, graphCssVar } from './graph-canvas-style'
import { CommonModule } from '@angular/common'
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  model,
  NgZone,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
  ZardSearchInputComponent,
  ZardComboboxComponent,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import cytoscape from 'cytoscape'
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
  KnowledgeGraphCatalog,
  KnowledgeGraphVisibility,
  KnowledgeGraphVisualizationQuery,
  KnowledgebaseService,
  ToastrService
} from '../../../../../@core'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeGraphIndexActionsComponent } from './graph-index-actions.component'
import { KnowledgeGraphIndexErrorComponent } from './graph-index-error.component'
import { KnowledgeGraphPropertiesComponent } from './graph-properties.component'

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

type InspectorTab = 'overview' | 'entities' | 'relations'

type GraphSelectValue = string | number | Array<string | number>

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
    ReactiveFormsModule,
    TranslateModule,
    XpSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardEmptyComponent,
    ZardIconComponent,
    ZardInputDirective,
    ZardSearchInputComponent,
    KnowledgeGraphIndexActionsComponent,
    KnowledgeGraphIndexErrorComponent,
    KnowledgeGraphPropertiesComponent,
    ...ZardCardImports,
    ...ZardFormImports,
    ZardComboboxComponent,
    ...ZardSelectImports
  ],
  styles: `
    :host {
      display: block;
      width: 100%;
      min-width: 0;
      min-height: 0;
    }
  `
})
export class KnowledgeGraphComponent {
  readonly KnowledgeGraphStatus = KnowledgeGraphStatus
  readonly allSelectValue = ALL_SELECT_VALUE
  readonly origins: Array<KnowledgeGraphItemOrigin | ''> = ['', 'extracted', 'structured', 'manual', 'curated']
  readonly visibilities: KnowledgeGraphVisibility[] = ['active', 'hidden']

  readonly #fb = inject(FormBuilder)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #toastr = inject(ToastrService)
  readonly #ngZone = inject(NgZone)
  readonly #destroyRef = inject(DestroyRef)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly graphCanvas = viewChild<ElementRef<HTMLElement>>('graphCanvas')

  #requestId = 0
  #expandFrom: string | null = null
  #cy: cytoscape.Core | null = null
  #graphDataKey = ''
  #loadedKnowledgebaseId: string | null = null
  #loadedGraphEnabled: boolean | undefined
  #resizeObserver: ResizeObserver | null = null
  #themeObserver: MutationObserver | null = null

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
  readonly sourceDocumentId = model('')
  readonly loadAll = signal(false)
  readonly expandedEntityIds = signal<string[]>([])
  readonly retainedEntityIds = signal<string[]>([])
  readonly hierarchical = model(false)
  readonly includeHidden = model(false)
  readonly hiddenCounts = signal({ nodes: 0, relations: 0 })
  readonly sources = signal<KnowledgeGraphCatalog['sources']>([])
  readonly focusOptions = computed(() =>
    this.entityOptions().map((entity) => ({ value: entity.id, label: `${entity.name} · ${entity.type}` }))
  )
  readonly sourceOptions = computed(() => this.sources().map((source) => ({ value: source.id, label: source.name })))
  readonly unloadedNeighbors = computed(
    () => this.nodes().find((node) => node.id === this.selected()?.id)?.unloadedNeighborCount ?? 0
  )

  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly status = signal<KnowledgeGraphStatusResponse | null>(null)
  readonly view = signal<KnowledgeGraphViewResponse | null>(null)
  readonly relations = signal<IKnowledgeGraphRelation[]>([])
  readonly entityOptions = signal<KnowledgeGraphCatalog['entities']>([])
  readonly mentions = signal<IKnowledgeGraphMention[]>([])
  readonly selected = signal<GraphSelection | null>(null)
  readonly selectedEntity = signal<IKnowledgeGraphEntity | null>(null)
  readonly selectedRelation = signal<IKnowledgeGraphRelation | null>(null)
  readonly relatedRelations = signal<IKnowledgeGraphRelation[]>([])
  readonly editorMode = signal<GraphEditorMode | null>(null)
  readonly inspectorTab = signal<InspectorTab>('overview')
  readonly graphZoom = signal(100)
  readonly themeRevision = signal(0)

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
    take: this.take(),
    sourceDocumentId: this.sourceDocumentId() || null,
    includeHidden: this.includeHidden(),
    loadAll: this.loadAll(),
    expandedEntityIds: this.expandedEntityIds(),
    visibleEntityIds: this.retainedEntityIds()
  }))

  readonly nodes = computed(() => this.view()?.nodes ?? [])
  readonly edges = computed(() => this.view()?.edges ?? [])
  readonly entityTypes = computed(() => this.view()?.entityTypes ?? [])
  readonly relationTypes = computed(() => this.view()?.relationTypes ?? [])
  readonly disabled = computed(
    () => this.status()?.status === KnowledgeGraphStatus.DISABLED || this.status()?.enabled === false
  )
  readonly empty = computed(() => !this.loading() && !this.disabled() && !this.nodes().length)
  readonly activeFilterCount = computed(
    () =>
      [
        this.search().trim(),
        this.entityType(),
        this.relationType(),
        this.origin(),
        this.focusEntityId(),
        this.sourceDocumentId()
      ].filter(Boolean).length + (this.visibility() === 'hidden' ? 1 : 0)
  )
  readonly totalEntityCount = computed(
    () => this.view()?.totalNodes ?? this.status()?.entityCount ?? this.nodes().length
  )
  readonly totalRelationCount = computed(
    () => this.view()?.totalEdges ?? this.status()?.relationCount ?? this.edges().length
  )
  readonly legendItems = computed(() => {
    this.themeRevision()
    return this.entityTypes().map((type, index) => ({
      type,
      color: this.entityColor(type, index)
    }))
  })

  constructor() {
    this.#destroyRef.onDestroy(() => this.destroyGraph())

    effect(() => {
      const knowledgebaseId = this.knowledgebase()?.id
      const graphEnabled = this.knowledgebase()?.graphRag?.enabled === true
      if (
        knowledgebaseId &&
        (knowledgebaseId !== this.#loadedKnowledgebaseId || graphEnabled !== this.#loadedGraphEnabled)
      ) {
        this.#loadedKnowledgebaseId = knowledgebaseId
        this.#loadedGraphEnabled = graphEnabled
        untracked(() => void this.loadGraph())
      }
    })

    effect(() => {
      const container = this.graphCanvas()?.nativeElement
      const nodes = this.nodes()
      const edges = this.edges()
      const selected = this.selected()
      untracked(() => {
        if (!container || !nodes.length) {
          this.destroyGraph()
          return
        }
        this.renderGraph(container, nodes, edges)
        this.syncGraphSelection(selected)
      })
    })
  }

  async loadGraph(preserve = false) {
    const requestId = ++this.#requestId
    if (!preserve) {
      this.loadAll.set(false)
      this.expandedEntityIds.set([])
      this.retainedEntityIds.set([])
      this.#expandFrom = null
    }
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return
    }

    this.loading.set(true)
    try {
      const status = await firstValueFrom(this.#knowledgebaseService.getGraphStatus(knowledgebaseId))
      if (requestId !== this.#requestId) return
      this.status.set(status)
      if (!status.enabled) {
        this.view.set(null)
        this.relations.set([])
        this.entityOptions.set([])
        return
      }

      const query = this.query()
      const [view, catalog] = await Promise.all([
        firstValueFrom(this.#knowledgebaseService.getGraphVisualization(knowledgebaseId, query)),
        firstValueFrom(this.#knowledgebaseService.getGraphCatalog(knowledgebaseId, query))
      ])
      if (requestId !== this.#requestId) return
      this.view.set(view)
      this.relations.set(view.relations ?? [])
      this.entityOptions.set(catalog.entities)
      this.sources.set(catalog.sources)
      this.hiddenCounts.set({ nodes: catalog.hiddenNodes, relations: catalog.hiddenRelations })
      this.restoreSelection()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      if (requestId === this.#requestId) this.loading.set(false)
    }
  }

  async selectEntity(entityId: string) {
    const knowledgebaseId = this.knowledgebase()?.id
    if (!knowledgebaseId) {
      return
    }
    this.selected.set({ kind: 'entity', id: entityId })
    this.inspectorTab.set('overview')
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
    this.inspectorTab.set('overview')
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
    if (next === 'structured' || next === 'extracted' || next === 'manual' || next === 'curated') {
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
      this.#toastr.success('XP.Messages.SavedSuccessfully', { Default: 'Saved successfully' })
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
        return 'XP.Knowledgebase.GraphStatus_Indexing'
      case KnowledgeGraphStatus.READY:
        return 'XP.Knowledgebase.GraphStatus_Ready'
      case KnowledgeGraphStatus.FAILED:
        return 'XP.Knowledgebase.GraphStatus_Failed'
      case KnowledgeGraphStatus.REBUILD_REQUIRED:
        return 'XP.Knowledgebase.GraphStatus_RebuildRequired'
      case KnowledgeGraphStatus.DISABLED:
        return 'XP.Knowledgebase.GraphStatus_Disabled'
      default:
        return 'XP.Knowledgebase.GraphStatus_Pending'
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
    return `${relation.sourceEntity?.name ?? this.entityName(relation.sourceEntityId)} ${relation.type} ${relation.targetEntity?.name ?? this.entityName(relation.targetEntityId)}`
  }

  setInspectorTab(tab: InspectorTab) {
    this.inspectorTab.set(tab)
  }

  async clearFilters() {
    this.search.set('')
    this.entityType.set('')
    this.relationType.set('')
    this.origin.set('')
    this.visibility.set('active')
    this.focusEntityId.set('')
    this.sourceDocumentId.set('')
    this.includeHidden.set(false)
    this.depth.set(1)
    this.take.set(80)
    await this.loadGraph()
  }

  clearSelection() {
    this.selected.set(null)
    this.selectedEntity.set(null)
    this.selectedRelation.set(null)
    this.relatedRelations.set([])
    this.mentions.set([])
  }

  async exploreSelectedEntity() {
    const id = this.selectedEntity()?.id
    if (!id || this.loading()) return
    this.#expandFrom = id
    this.retainedEntityIds.set(this.nodes().map((node) => node.id))
    this.expandedEntityIds.update((ids) => [...new Set([...ids, id])])
    await this.loadGraph(true)
  }

  async loadAllNodes() {
    this.loadAll.set(true)
    this.#expandFrom = null
    await this.loadGraph(true)
  }

  async selectSource(id: string | null) {
    this.sourceDocumentId.set(id ?? '')
    this.focusEntityId.set('')
    this.clearSelection()
    await this.loadGraph()
  }

  async selectFocus(id: string | null) {
    this.focusEntityId.set(id ?? '')
    await this.loadGraph()
    if (id && this.nodes().some((node) => node.id === id)) await this.selectEntity(id)
  }

  inspectorKey(event: KeyboardEvent) {
    const tabs: InspectorTab[] = ['overview', 'entities', 'relations']
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const index = tabs.indexOf(this.inspectorTab())
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3
    this.inspectorTab.set(tabs[next])
    if (event.currentTarget instanceof HTMLElement)
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]')[next]?.focus()
  }

  fitGraph() {
    this.#cy?.fit(this.#cy.elements(), 64)
    if (this.#cy && this.#cy.zoom() > 1.2) {
      this.#cy.zoom(1.2)
      this.#cy.center()
    }
  }

  private layoutOptions(count: number): cytoscape.LayoutOptions {
    if (this.hierarchical())
      return { name: 'breadthfirst', directed: true, circle: false, spacingFactor: 1.2, padding: 64, animate: false }
    if (count > 500) return { name: 'grid', padding: 64, animate: false }
    return {
      name: 'cose',
      animate: false,
      fit: true,
      padding: 64,
      randomize: true,
      nodeRepulsion: 6800,
      idealEdgeLength: 128,
      numIter: 300
    }
  }

  runGraphLayout() {
    this.#cy?.layout(this.layoutOptions(this.nodes().length)).run()
    this.fitGraph()
  }

  zoomGraph(factor: number) {
    if (!this.#cy) {
      return
    }
    const nextZoom = Math.min(this.#cy.maxZoom(), Math.max(this.#cy.minZoom(), this.#cy.zoom() * factor))
    this.#cy.zoom(nextZoom)
    this.#cy.center()
  }

  focusGraphElement(id?: string) {
    const elementId = id ?? this.selected()?.id
    if (!elementId || !this.#cy) {
      return
    }
    const element = this.#cy.getElementById(elementId)
    if (!element.length) {
      return
    }
    this.#cy.animate({
      center: { eles: element },
      zoom: Math.max(this.#cy.zoom(), 1.15),
      duration: 260
    })
  }

  entityColor(type: string, fallbackIndex?: number) {
    const palette = ['--color-chart-1', '--color-chart-2', '--color-chart-3', '--color-chart-4', '--color-chart-5']
    const typeIndex = this.entityTypes().indexOf(type)
    const index = typeIndex >= 0 ? typeIndex : (fallbackIndex ?? 0)
    return graphCssVar(palette[index % palette.length], '--color-primary')
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

  private renderGraph(
    container: HTMLElement,
    nodes: KnowledgeGraphViewResponse['nodes'],
    edges: KnowledgeGraphViewResponse['edges']
  ) {
    const dataKey = [
      ...nodes.map(
        (node) => `${node.id}:${node.name}:${node.type}:${node.visibility}:${node.symbolSize ?? node.value ?? ''}`
      ),
      ...edges.map((edge) => `${edge.id}:${edge.source}:${edge.target}:${edge.type}:${edge.visibility}`)
    ].join('|')

    if (this.#cy?.container() === container && dataKey === this.#graphDataKey) {
      return
    }

    const elements: cytoscape.ElementDefinition[] = [
      ...nodes.map((node) => ({
        group: 'nodes' as const,
        data: {
          id: node.id,
          label: node.name,
          type: node.type,
          color: this.entityColor(node.type),
          visibility: node.visibility,
          size: Math.max(30, Math.min(56, node.symbolSize ?? 30 + Math.min(node.mentionCount ?? 0, 13)))
        }
      })),
      ...edges.map((edge) => ({
        group: 'edges' as const,
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.type,
          visibility: edge.visibility,
          weight: Math.max(1, Math.min(4, (edge.weight ?? 0.45) * 2.4))
        }
      }))
    ]

    if (this.#expandFrom && this.#cy?.container() === container) {
      const center = this.#cy.getElementById(this.#expandFrom).position()
      const additions = elements.filter((item) => !this.#cy.getElementById(item.data.id).length)
      this.#cy.batch(() => {
        const added = this.#cy.add(additions)
        const nodes = added.nodes()
        nodes.forEach((node, index) => {
          node.position({
            x: center.x + 150 * Math.cos((index * Math.PI * 2) / Math.max(1, nodes.length)),
            y: center.y + 150 * Math.sin((index * Math.PI * 2) / Math.max(1, nodes.length))
          })
        })
      })
      this.#graphDataKey = dataKey
      this.#expandFrom = null
      return
    }
    this.destroyGraph()
    this.#graphDataKey = dataKey
    this.#cy = cytoscape({
      container,
      elements,
      style: graphStyles(),
      layout: this.layoutOptions(nodes.length),
      minZoom: 0.005,
      maxZoom: 3.2,
      wheelSensitivity: 0.22,
      selectionType: 'single',
      boxSelectionEnabled: false
    })

    this.fitGraph()
    this.#cy.on('tap', 'node', (event) => {
      this.#ngZone.run(() => void this.selectEntity(event.target.id()))
    })
    this.#cy.on('tap', 'edge', (event) => {
      this.#ngZone.run(() => void this.selectRelation(event.target.id()))
    })
    this.#cy.on('tap', (event) => {
      if (event.target === this.#cy) {
        this.#ngZone.run(() => this.clearSelection())
      }
    })
    this.#cy.on('mouseover', 'node, edge', (event) => event.target.addClass('is-hovered'))
    this.#cy.on('mouseout', 'node, edge', (event) => event.target.removeClass('is-hovered'))
    this.#cy.on('zoom', () => {
      const zoom = this.#cy?.zoom()
      if (zoom) {
        this.#ngZone.run(() => this.graphZoom.set(Math.round(zoom * 100)))
      }
    })

    this.#resizeObserver = new ResizeObserver(() => this.#cy?.resize())
    this.#resizeObserver.observe(container)

    this.#themeObserver = new MutationObserver(() => {
      this.#ngZone.run(() => this.themeRevision.update((revision) => revision + 1))
      this.applyGraphTheme()
    })
    this.#themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme']
    })
  }

  private syncGraphSelection(selection: GraphSelection | null) {
    if (!this.#cy) {
      return
    }
    this.#cy.elements().removeClass('is-muted is-contextual')
    this.#cy.elements().unselect()
    if (!selection) {
      return
    }
    const element = this.#cy.getElementById(selection.id)
    if (!element.length) {
      return
    }
    element.select()
    const context = element.closedNeighborhood()
    this.#cy.elements().not(context).addClass('is-muted')
    context.addClass('is-contextual')
  }

  private applyGraphTheme() {
    if (!this.#cy) {
      return
    }
    this.#cy.nodes().forEach((node) => {
      const type = node.data('type')
      if (typeof type === 'string') {
        node.data('color', this.entityColor(type))
      }
    })
    this.#cy.style(graphStyles()).update()
  }

  private destroyGraph() {
    this.#resizeObserver?.disconnect()
    this.#resizeObserver = null
    this.#themeObserver?.disconnect()
    this.#themeObserver = null
    this.#cy?.destroy()
    this.#cy = null
    this.#graphDataKey = ''
    this.graphZoom.set(100)
  }

  private selectValueToString(value: GraphSelectValue) {
    if (Array.isArray(value)) {
      return ''
    }
    const next = String(value)
    return next === ALL_SELECT_VALUE ? '' : next
  }
}
