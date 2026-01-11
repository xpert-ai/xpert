import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import {Clipboard} from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import {
  afterNextRender,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  HostListener,
  inject,
  model,
  signal,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { IPoint, IRect, PointExtensions } from '@foblex/2d'
import {
  EFConnectionType,
  EFMarkerType,
  EFResizeHandleType,
  FCanvasChangeEvent,
  FCanvasComponent,
  FConnectionComponent,
  FCreateConnectionEvent,
  FDropToGroupEvent,
  FFlowComponent,
  FFlowModule,
  FReassignConnectionEvent,
  FSelectionChangeEvent,
  FZoomDirective
} from '@foblex/flow'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour, isEqual } from '@metad/ocap-core'
import { effectAction } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxFloatUiModule, NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { NGXLogger } from 'ngx-logger'
import { injectParams } from 'ngxtension/inject-params'
import { Observable, Subscription } from 'rxjs'
import { debounceTime, delay, map, tap } from 'rxjs/operators'
import { JsonSchemaWidgetStrategyRegistry } from '@cloud/app/@shared/forms'
import {
  AiModelTypeEnum,
  findStartNodes,
  injectHelpWebsite,
  isWorkflowKey,
  IWFNTrigger,
  IXpertAgent,
  IXpertToolset,
  NodeEntity,
  NodeOf,
  ToastrService,
  TXpertAgentConfig,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertAPIService,
  XpertTypeEnum,
  XpertWorkspaceService,
  isXpertNodeType,
} from '../../../@core'
import {
  XpertAgentExecutionStatusComponent,
  XpertAgentExecutionLogComponent
} from '../../../@shared/xpert'
import {
  XpertStudioConnectionMenuComponent,
  XpertStudioConnectionCenterComponent,
  XpertStudioContextMenuComponent,
  XpertStudioNodeAgentComponent,
  XpertStudioNodeKnowledgeComponent,
  XpertStudioNodeToolsetComponent,
  XpertStudioNodeWorkflowComponent
} from './components'
import { EReloadReason, SelectionService, XpertStudioApiService } from './domain'
import { XpertStudioHeaderComponent } from './header/header.component'
import { XpertStudioPanelComponent } from './panel/panel.component'
import { XpertExecutionService } from './services/execution.service'
import { XpertStudioToolbarComponent } from './toolbar/toolbar.component'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { XpertStudioFeaturesComponent } from './features/features.component'
import { XpertService } from '../xpert/xpert.service'
import { GROUP_NODE_TYPES, provideJsonSchemaWidgets } from './types'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule,
    DragDropModule,
    CdkListboxModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    FFlowModule,
    NgxFloatUiModule,
    MatTooltipModule,

    NgmCommonModule,

    EmojiAvatarComponent,
    XpertStudioFeaturesComponent,
    XpertStudioToolbarComponent,
    XpertStudioContextMenuComponent,
    XpertStudioNodeAgentComponent,
    XpertStudioNodeKnowledgeComponent,
    XpertStudioNodeToolsetComponent,
    XpertStudioNodeWorkflowComponent,
    XpertStudioHeaderComponent,
    XpertStudioPanelComponent,
    XpertAgentExecutionStatusComponent,
    XpertAgentExecutionLogComponent,
    XpertStudioConnectionMenuComponent,
    XpertStudioConnectionCenterComponent
  ],
  selector: 'pac-xpert-studio',
  templateUrl: './studio.component.html',
  styleUrl: 'studio.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    XpertStudioApiService,
    SelectionService,
    XpertExecutionService,
    JsonSchemaWidgetStrategyRegistry,
    ...provideJsonSchemaWidgets()
  ]
})
export class XpertStudioComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eNgxFloatUiTriggers = NgxFloatUiTriggers
  eNgxFloatUiPlacements = NgxFloatUiPlacements
  DisplayBehaviour = DisplayBehaviour
  EFConnectionType = EFConnectionType
  eModelType = AiModelTypeEnum
  eXpertTypeEnum = XpertTypeEnum
  protected readonly eMarkerType = EFMarkerType
  public eResizeHandleType = EFResizeHandleType

  readonly router = inject(Router)
  readonly route = inject(ActivatedRoute)
  readonly logger = inject(NGXLogger)
  readonly #toastr = inject(ToastrService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly xpertRoleService = inject(XpertAPIService)
  readonly apiService = inject(XpertStudioApiService)
  readonly selectionService = inject(SelectionService)
  readonly executionService = inject(XpertExecutionService)
  readonly helpUrl = injectHelpWebsite()
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #clipboard = inject(Clipboard)
  readonly paramId = injectParams('id')
  readonly xpertService = inject(XpertService)

  // Children
  readonly fFlowComponent = viewChild(FFlowComponent)
  readonly fCanvasComponent = viewChild(FCanvasComponent)
  readonly fZoom = viewChild(FZoomDirective)

  // States
  public contextMenuPosition: IPoint = PointExtensions.initialize(0, 0)

  private subscriptions$ = new Subscription()

  /**
   * @deprecated use xpert
   */
  readonly team = computed(() => this.apiService.team())
  readonly id = computed(() => this.team()?.id)
  readonly rootAgent = computed(() => this.team()?.agent)

  readonly startNodes = computed(() => {
    return this.rootAgent() ? findStartNodes(this.viewModel(), this.rootAgent()?.key) : null
  })

  /**
   * Extract nested xpert's agents to flat nodes
   */
  readonly nodes = computed(() => {
    const viewModelNodes = this.viewModel()?.nodes ?? []
    const nodes = viewModelNodes.filter((_) => _.type !== 'xpert' && !(isXpertNodeType('workflow')(_) && GROUP_NODE_TYPES.includes(_.entity?.type)))
    const xpertNodes = viewModelNodes.filter((_) => _.type === 'xpert') as TXpertTeamNode<'xpert'>[]

    xpertNodes.forEach((node) => {
      extractXpertNodes(nodes, node)
    })
    return nodes
  })
  readonly xperts = computed(() => {
    const xperts: (NodeOf<'xpert'>)[] = []
    extractXpertGroup(xperts, this.viewModel()?.nodes)
    return xperts
  })
  readonly #connections = computed(() => {
    const viewModelConnections = [...(this.viewModel()?.connections ?? [])]
    // Add connections from external xpert nodes
    this.viewModel()
      ?.nodes?.filter(isXpertNodeType('xpert'))
      .forEach((node) => {
        node.connections?.forEach((connection) => {
          viewModelConnections.push({...connection, readonly: true})
        })
      })
    return viewModelConnections
  })

  readonly connections = computed(() => {
    const connections = this.#connections()
    const agentExecutions = this.executions()
    return this.#connections().map((conn) => {
      let running = false
      if (conn.type === 'toolset') {
        running = this.runningToolsets().some((_) => _.key === conn.to && _.agentKey === conn.from && _.running)
      } else {
        if (isWorkflowKey(conn.to)) {
          running = connections.filter((_) => _.from.startsWith(conn.to)).some((_) =>
            agentExecutions[_.to]?.some((_) => _.status === XpertAgentExecutionStatusEnum.RUNNING))
        } else {
          running = agentExecutions[conn.to]?.some((_) => _.status === XpertAgentExecutionStatusEnum.RUNNING && _.predecessor === conn.from)
        }
      }
      return {
        ...conn,
        running
      }
    })
  })

  readonly groups = computed(() => {
    const draft = this.viewModel()
    if (!draft) return []
    return draft.nodes.filter(isXpertNodeType('workflow')).filter((n) => GROUP_NODE_TYPES.includes(n.entity.type))
  })

  public isSingleSelection = true

  readonly viewModel = toSignal(this.apiService.store.pipe(map((state) => state.draft)))
  readonly xpert = computed(() => this.viewModel()?.team)
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly position = signal<IPoint>(null)
  readonly scale = signal<number>(null)

  readonly selectedNodeKey = this.selectionService.selectedNodeKey
  readonly hoverNode = signal<string>(null)

  // Agent Execution Running status
  readonly executions = this.executionService.executions
  readonly toolMessages = this.executionService.toolMessages
  readonly sidePanel = model<"preview" | "variables">()
  readonly showFeatures = model(false)

  readonly runningToolsets = computed<Array<{key: string; agentKey: string; running: boolean}>>(() => {
    const toolMessages = this.toolMessages()
    const toolsetNodes = this.viewModel()?.nodes.filter((n) => n.type === 'toolset')
    const running = []
    toolsetNodes?.forEach((node) => {
      (<IXpertToolset>node.entity).tools?.forEach((t) => {
        toolMessages?.filter((exec) => exec.data.status === XpertAgentExecutionStatusEnum.RUNNING)
          .forEach((execution) => {
            running.push({
              key: node.key,
              agentKey: execution.agentKey,
              running: true,
            })
          })
      })
    })
    return running
  }, { equal: isEqual })

  constructor() {
    effect(() => {
      if (this.paramId()) {
        this.xpertService.paramId.set(this.paramId())
      }
    }, { allowSignalWrites: true })

    afterNextRender(() => {
      this.subscriptions$.add(this.subscribeOnReloadData())
    })
  }

  private subscribeOnReloadData(): Subscription {
    return this.apiService.reload$
      .pipe(delay(100))
      .subscribe((reason: EReloadReason | null) => {
        if (reason === EReloadReason.INIT) {
          if (this.xpert().options?.position) {
            this.position.set(this.xpert().options.position)
          }
          if (this.xpert().options?.scale) {
            this.scale.set(this.xpert().options.scale)
          }
        }
        if (reason === EReloadReason.CONNECTION_CHANGED) {
          this.fFlowComponent().clearSelection()
        }

        this.#cdr.detectChanges()
      })
  }

  public onLoaded(): void {
    this.fCanvasComponent().resetScaleAndCenter(false)
  }

  public onContextMenu(event: MouseEvent): void {
    this.contextMenuPosition = this.fFlowComponent().getPositionInFlow(
      PointExtensions.initialize(event.clientX, event.clientY)
    )
  }

  public addConnection(event: FCreateConnectionEvent): void {
    if (!event.fInputId) {
      return
    }

    this.apiService.createConnection({
      sourceId: event.fOutputId,
      targetId: event.fInputId
    })
  }

  public reassignConnection(event: FReassignConnectionEvent): void {
    this.apiService.removeConnection(event.oldSourceId, event.oldTargetId)
    if (event.newTargetId) {
      this.apiService.createConnection({
        sourceId: event.newSourceId || event.oldSourceId,
        targetId: event.newTargetId,
      })
    }
  }

  public moveNode({key, point}: {point: IPoint; key: string}) {
    this.apiService.moveNode(key, point)
  }

  public moveGroup(point: IPoint, key: string): void {
    this.apiService.moveNode(key, point)
  }
  public resizeGroup(point: IRect, key: string): void {
    this.apiService.resizeNode(key, point)
  }
  public expandXpertTeam(xpert: TXpertTeamNode) {
    this.apiService.expandXpertNode(xpert.key)
  }
  public removeNode(key: string) {
    this.apiService.removeNode(key)
  }

  public selectionChanged(event: FSelectionChangeEvent): void {
    this.isSingleSelection = event.fConnectionIds.length + event.fNodeIds.length === 1
    this.selectionService.setNodes(event.fNodeIds)
    this.#cdr.markForCheck()
  }

  public onSizeChange(event: IRect, node: TXpertTeamNode) {
    this.apiService.moveNode(node.key, event)
  }

  private mousePosition = {
    x: 0,
    y: 0
  }
  public onMouseDown($event: MouseEvent) {
    this.mousePosition.x = $event.screenX
    this.mousePosition.y = $event.screenY
  }
  public onSelectNode($event: MouseEvent, node: TXpertTeamNode) {
    if (Math.abs(this.mousePosition.x - $event.screenX) < 5 && 
        Math.abs(this.mousePosition.y - $event.screenY) < 5) {
      // Execute Click when click in place
      this.selectionService.selectNode(node.key)
    }
  }

  public onFocusNode($event: FocusEvent, node: TXpertTeamNode) {
    this.selectionService.selectNode(node.key)
  }

  removeConnection(connection: FConnectionComponent) {
    this.apiService.removeConnection(connection.fOutputId, connection.fInputId)
  }

  onCanvasChange = effectAction((origin$: Observable<FCanvasChangeEvent>) => {
    return origin$.pipe(
      debounceTime(1000),
      tap((event) => {
        this.apiService.updateCanvas(event)
      })
    )
  })

  /**
   * @deprecated use agentConfig model signal
   */
  updateXpertAgentConfig(config: Partial<TXpertAgentConfig>) {
    this.apiService.updateXpertAgentConfig(config)
  }
  
  onPreview(preview: boolean) {
    this.sidePanel.set(preview ? 'preview' : null)
  }

  selectAgentStatus(key: string) {
    const executions = this.executions()[key]
    return executions ? executions[executions.length - 1]?.status : null
  }

  isDisableOutput(g: TXpertTeamNode) {
    return this.agentConfig()?.mute?.some((_) => _.length === 1 && _[0] === g.key)
  }

  copyNode(node: TXpertTeamNode) {
    this.#clipboard.copy(JSON.stringify(node))
    this.#toastr.success('PAC.Messages.CopiedToClipboard', {Default: 'Copied to clipboard'})
  }

  duplicateNode(node: TXpertTeamNode) {
    this.apiService.pasteNode({
      ...node,
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50
      }
    })
  }

  deleteNode(node: TXpertTeamNode) {
    this.apiService.removeNode(node.key)
    if (node.key === this.rootAgent().key) {
      this.apiService.updatePrimaryAgent((state) => {
        return {
          ...state,
          options: {
            ...(state?.options ?? {}),
            hidden: true
          }
        } as IXpertAgent
      })
    }

    // Remove parameters of xpert when removed chat trigger point
    if (node.type === 'workflow' && (<NodeEntity<'workflow'>>node.entity)?.type === WorkflowNodeTypeEnum.TRIGGER
      && (<IWFNTrigger>node.entity).from === 'chat') {
      this.apiService.agentConfig.update((state) => {
          return {
            ...(state ?? {}),
            parameters: null
          }
        })
    }
  }

  centerGroupOrNode(id: string,) {
    this.fCanvasComponent().centerGroupOrNode(id, true)
  }

  // Keyboard shortcuts
  #copiedNode: TXpertTeamNode = null

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // Ignore if focus is in an input element
    const target = event.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const ctrlKey = isMac ? event.metaKey : event.ctrlKey

    // Delete/Backspace - Delete selection
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      this.deleteSelection()
      return
    }

    // Ctrl+C - Copy
    if (ctrlKey && event.key === 'c') {
      this.copySelection()
      return
    }

    // Ctrl+V - Paste
    if (ctrlKey && event.key === 'v') {
      event.preventDefault()
      this.pasteSelection()
      return
    }

    // Ctrl+D - Duplicate
    if (ctrlKey && event.key === 'd') {
      event.preventDefault()
      this.duplicateSelection()
      return
    }

    // Ctrl+Z - Undo
    if (ctrlKey && event.key === 'z' && !event.shiftKey) {
      event.preventDefault()
      this.apiService.undo()
      return
    }

    // Ctrl+Y or Ctrl+Shift+Z - Redo
    if (ctrlKey && (event.key === 'y' || (event.key === 'z' && event.shiftKey))) {
      event.preventDefault()
      this.apiService.redo()
      return
    }
  }

  copySelection() {
    const selection = this.fFlowComponent().getSelection()
    if (selection.fNodeIds.length === 1) {
      const node = this.apiService.getNode(selection.fNodeIds[0])
      if (node && (node.type === 'agent' || node.type === 'workflow')) {
        this.#copiedNode = node
        this.copyNode(node)
      }
    }
  }

  pasteSelection() {
    if (this.#copiedNode) {
      this.apiService.pasteNode({
        ...this.#copiedNode,
        position: {
          x: this.#copiedNode.position.x + 50,
          y: this.#copiedNode.position.y + 50
        }
      })
    }
  }

  duplicateSelection() {
    const selection = this.fFlowComponent().getSelection()
    if (selection.fNodeIds.length === 1) {
      const node = this.apiService.getNode(selection.fNodeIds[0])
      if (node && (node.type === 'agent' || node.type === 'workflow')) {
        this.duplicateNode(node)
      }
    }
  }

  deleteSelection() {
    const selection = this.fFlowComponent().getSelection()

    // Delete selected connections
    selection.fConnectionIds.forEach(connectionKey => {
      const connection = this.connections().find(c => c.key === connectionKey)
      if (connection && !connection.readonly) {
        const sourceId = connection.from + '/' + connection.type
        const targetId = connection.to + (connection.type === 'edge' ? '/edge' : '')
        this.apiService.removeConnection(sourceId, targetId)
      }
    })

    // Delete selected nodes
    selection.fNodeIds.forEach(nodeKey => {
      const node = this.apiService.getNode(nodeKey)
      if (node && !node.readonly && !node.parentId) {
        this.deleteNode(node)
      }
    })

    // Delete selected groups (xpert nodes)
    selection.fGroupIds.forEach(groupKey => {
      const group = this.xperts().find(x => x.key === groupKey)
      if (group) {
        this.removeNode(group.key)
      }
    })

    this.fFlowComponent().clearSelection()
  }

  onDropToGroup(event: FDropToGroupEvent) {
     if (!event.fTargetNode) {
      console.warn('Drop to group without target node', event)
      return
    }
    
    console.log('Drop to group', event)
    for (const key of event.fNodes) {
      this.apiService.updateNode(key, (state) => {
        console.log('Update node parentId', state, event.fTargetNode)
        return {
          ...state,
          parentId: event.fTargetNode
        }
      })
    }
  }
}

function extractXpertNodes(nodes: TXpertTeamNode[], xpertNode: TXpertTeamNode<'xpert'>) {
  xpertNode.nodes?.forEach((node) => {
    if (node.type === 'xpert') {
      extractXpertNodes(nodes, node as TXpertTeamNode<'xpert'>)
    } else {
      nodes.push({ ...node, parentId: xpertNode.key, readonly: true })
    }
  })
}

function extractXpertGroup(results: TXpertTeamNode[], nodes: TXpertTeamNode[], parentId = null) {
  nodes?.forEach((node) => {
    if (node.type === 'xpert') {
      results.push({...node, parentId})
      extractXpertGroup(results, (node as NodeOf<'xpert'>).nodes, node.key)
    }
  })
}
