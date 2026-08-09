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
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardEmptyComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective,
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
    RouterModule,
    ReactiveFormsModule,
    TranslateModule,
    XpSpinComponent,
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
      min-width: 0;
      min-height: 0;
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
  readonly #ngZone = inject(NgZone)
  readonly #destroyRef = inject(DestroyRef)
  readonly knowledgebaseComponent = inject(KnowledgebaseComponent)
  readonly graphCanvas = viewChild<ElementRef<HTMLElement>>('graphCanvas')

  #cy: cytoscape.Core | null = null
  #graphDataKey = ''
  #loadedKnowledgebaseId: string | null = null
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
  readonly activeFilterCount = computed(
    () =>
      [this.search().trim(), this.entityType(), this.relationType(), this.origin(), this.focusEntityId()].filter(
        Boolean
      ).length + (this.visibility() === 'hidden' ? 1 : 0)
  )
  readonly totalEntityCount = computed(
    () => this.status()?.entityCount ?? this.view()?.totalNodes ?? this.nodes().length
  )
  readonly totalRelationCount = computed(
    () => this.status()?.relationCount ?? this.view()?.totalEdges ?? this.edges().length
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
      if (knowledgebaseId && knowledgebaseId !== this.#loadedKnowledgebaseId) {
        this.#loadedKnowledgebaseId = knowledgebaseId
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
    return `${this.entityName(relation.sourceEntityId)} ${relation.type} ${this.entityName(relation.targetEntityId)}`
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
    const entity = this.selectedEntity()
    if (!entity) {
      return
    }
    this.focusEntityId.set(entity.id)
    this.depth.set(Math.max(1, this.depth()))
    await this.loadGraph()
    this.focusGraphElement(entity.id)
  }

  fitGraph() {
    this.#cy?.fit(this.#cy.elements(), 64)
  }

  runGraphLayout() {
    if (!this.#cy) {
      return
    }
    this.#cy
      .layout({
        name: 'cose',
        animate: true,
        animationDuration: 420,
        fit: true,
        padding: 64,
        randomize: true,
        nodeRepulsion: 6800,
        idealEdgeLength: 128,
        edgeElasticity: 90,
        gravity: 0.18,
        numIter: 850
      })
      .run()
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
    return this.cssVar(palette[index % palette.length], '--color-primary')
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
      ...nodes.map((node) => `${node.id}:${node.type}:${node.symbolSize ?? node.value ?? ''}`),
      ...edges.map((edge) => `${edge.id}:${edge.source}:${edge.target}:${edge.type}`)
    ].join('|')

    if (this.#cy?.container() === container && dataKey === this.#graphDataKey) {
      return
    }

    this.destroyGraph()
    this.#graphDataKey = dataKey
    const elements: cytoscape.ElementDefinition[] = [
      ...nodes.map((node) => ({
        group: 'nodes' as const,
        data: {
          id: node.id,
          label: node.name,
          type: node.type,
          color: this.entityColor(node.type),
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
          weight: Math.max(1, Math.min(4, (edge.weight ?? 0.45) * 2.4))
        }
      }))
    ]

    this.#cy = cytoscape({
      container,
      elements,
      style: this.cytoscapeStyles(),
      layout: {
        name: 'cose',
        animate: nodes.length <= 100,
        animationDuration: 420,
        animationEasing: 'ease-out',
        fit: true,
        padding: 64,
        randomize: true,
        componentSpacing: 72,
        nodeRepulsion: 6800,
        nodeOverlap: 18,
        idealEdgeLength: 128,
        edgeElasticity: 90,
        gravity: 0.18,
        numIter: 850
      },
      minZoom: 0.18,
      maxZoom: 3.2,
      wheelSensitivity: 0.22,
      selectionType: 'single',
      boxSelectionEnabled: false
    })

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
    this.#cy.style(this.cytoscapeStyles()).update()
  }

  private cytoscapeStyles(): cytoscape.StylesheetJson {
    const textPrimary = this.cssVar('--color-text-primary', '--foreground')
    const textSecondary = this.cssVar('--color-text-secondary', '--muted-foreground')
    const textTertiary = this.cssVar('--color-text-tertiary', '--muted-foreground')
    const border = this.cssVar('--color-components-panel-border', '--border')
    const background = this.cssVar('--color-components-card-bg', '--background')
    const primary = this.cssVar('--color-primary', '--primary')
    const fontFamily = window.getComputedStyle(document.body).fontFamily

    return [
      {
        selector: 'node',
        style: {
          'background-color': 'data(color)',
          'border-color': background,
          'border-width': 3,
          width: 'data(size)',
          height: 'data(size)',
          label: 'data(label)',
          color: textSecondary,
          'font-family': fontFamily,
          'font-size': 12,
          'font-weight': 500,
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 9,
          'text-wrap': 'ellipsis',
          'text-max-width': '132px',
          'text-background-color': background,
          'text-background-opacity': 0.86,
          'text-background-padding': '3px',
          'overlay-opacity': 0,
          'transition-property': 'opacity, border-width, border-color',
          'transition-duration': 160
        }
      },
      {
        selector: 'edge',
        style: {
          width: 'data(weight)',
          'line-color': border,
          'target-arrow-color': border,
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.76,
          'curve-style': 'bezier',
          'control-point-step-size': 54,
          label: 'data(label)',
          color: textTertiary,
          'font-family': fontFamily,
          'font-size': 10,
          'font-weight': 500,
          'text-rotation': 'autorotate',
          'text-background-color': background,
          'text-background-opacity': 0.94,
          'text-background-padding': '3px',
          'text-opacity': 0,
          opacity: 0.72,
          'overlay-opacity': 0,
          'transition-property': 'opacity, line-color, target-arrow-color, text-opacity, width',
          'transition-duration': 160
        }
      },
      {
        selector: 'node:selected',
        style: {
          'border-color': primary,
          'border-width': 5,
          color: textPrimary,
          'font-weight': 700
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'line-color': primary,
          'target-arrow-color': primary,
          'text-opacity': 1,
          opacity: 1,
          width: 3
        }
      },
      {
        selector: '.is-contextual',
        style: {
          opacity: 1
        }
      },
      {
        selector: '.is-hovered',
        style: {
          'text-opacity': 1,
          opacity: 1
        }
      },
      {
        selector: '.is-muted',
        style: {
          opacity: 0.12,
          'text-opacity': 0
        }
      }
    ]
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

  private cssVar(name: string, fallbackName?: string) {
    if (typeof window === 'undefined') {
      return ''
    }
    const style = window.getComputedStyle(document.documentElement)
    const value =
      style.getPropertyValue(name).trim() || (fallbackName ? style.getPropertyValue(fallbackName).trim() : '')
    if (!value) {
      return ''
    }

    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) {
      return value
    }
    context.fillStyle = value
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data
    return `rgba(${red}, ${green}, ${blue}, ${alpha / 255})`
  }

  private selectValueToString(value: GraphSelectValue) {
    if (Array.isArray(value)) {
      return ''
    }
    const next = String(value)
    return next === ALL_SELECT_VALUE ? '' : next
  }
}
