import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
  viewChild
} from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
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
import { Observable, of, Subscription } from 'rxjs'
import { debounceTime, delay, map, tap } from 'rxjs/operators'
import {
  AiModelTypeEnum,
  isWorkflowKey,
  IXpertToolset,
  ToastrService,
  TXpertAgentConfig,
  TXpertTeamNode,
  XpertAgentExecutionStatusEnum,
  XpertService,
  XpertTypeEnum,
  XpertWorkspaceService
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
  providers: [XpertStudioApiService, SelectionService, XpertExecutionService]
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
  readonly #dialog = inject(MatDialog)
  readonly #toastr = inject(ToastrService)
  readonly workspaceService = inject(XpertWorkspaceService)
  readonly xpertRoleService = inject(XpertService)
  readonly apiService = inject(XpertStudioApiService)
  readonly selectionService = inject(SelectionService)
  readonly executionService = inject(XpertExecutionService)
  readonly #cdr = inject(ChangeDetectorRef)

  readonly fFlowComponent = viewChild(FFlowComponent)
  readonly fCanvasComponent = viewChild(FCanvasComponent)
  readonly fZoom = viewChild(FZoomDirective)

  public contextMenuPosition: IPoint = PointExtensions.initialize(0, 0)

  private subscriptions$ = new Subscription()

  /**
   * @deprecated use xpert
   */
  readonly team = computed(() => this.apiService.team())
  readonly id = computed(() => this.team()?.id)
  readonly rootAgent = computed(() => this.team()?.agent)
  /**
   * Extract nested xpert's agents to flat nodes
   */
  readonly nodes = computed(() => {
    const viewModelNodes = this.viewModel()?.nodes ?? []
    const nodes = viewModelNodes.filter((_) => _.type !== 'xpert')
    const xpertNodes = viewModelNodes.filter((_) => _.type === 'xpert') as any

    xpertNodes.forEach((node) => {
      extractXpertNodes(nodes, node)
    })
    return nodes
  })
  readonly xperts = computed(() => {
    const xperts: (TXpertTeamNode & {type: 'xpert'})[] = []
    extractXpertGroup(xperts, this.viewModel()?.nodes)
    return xperts
  })
  readonly #connections = computed(() => {
    const viewModelConnections = [...(this.viewModel()?.connections ?? [])]
    this.viewModel()
      ?.nodes?.filter((_) => _.type === 'xpert')
      .forEach((node: any) => {
        if (node.connections) {
          viewModelConnections.push(...node.connections)
        }
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

  public isSingleSelection: boolean = true

  readonly viewModel = toSignal(this.apiService.store.pipe(map((state) => state.draft)))
  readonly xpert = computed(() => this.viewModel()?.team)
  readonly agentConfig = computed(() => this.xpert()?.agentConfig)
  readonly position = signal<IPoint>(null)
  readonly scale = signal<number>(null)

  readonly selectedNodeKey = this.selectionService.selectedNodeKey
  readonly hoverNode = signal<string>(null)

  // Agent Execution Running status
  readonly executions = this.executionService.executions
  readonly toolExecutions = this.executionService.toolExecutions
  readonly sidePanel = model<"preview" | "variables">()

  readonly runningToolsets = computed<Array<{key: string; agentKey: string; running: boolean}>>(() => {
    const executions = this.toolExecutions()
    const toolsetNodes = this.viewModel()?.nodes.filter((n) => n.type === 'toolset')
    const running = []
    toolsetNodes?.forEach((node) => {
      (<IXpertToolset>node.entity).tools?.forEach((t) => {
        Object.values(executions[t.name] ?? {}).filter((exec) => exec.status === XpertAgentExecutionStatusEnum.RUNNING)
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
      // console.log('Agent Executions:', this.executions())
    })
  }

  public ngOnInit(): void {
    this.subscriptions$.add(this.subscribeOnReloadData())
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

    this.apiService.createConnection(event.fOutputId, event.fInputId)
  }

  public reassignConnection(event: FReassignConnectionEvent): void {
    this.apiService.createConnection(event.fOutputId, event.newFInputId, event.oldFInputId)
  }

  public moveNode({key, point}: {point: IPoint; key: string}) {
    this.apiService.moveNode(key, point)
  }

  public moveXpertGroup(point: IPoint, key: string): void {
    this.apiService.moveNode(key, point)

  }
  public resizeXpertGroup(point: IRect, key: string): void {
    this.apiService.resizeNode(key, point)
  }
  public expandXpertTeam(xpert: TXpertTeamNode) {
    this.apiService.expandXpertNode(xpert.key)
  }
  public removeNode(key: string) {
    this.apiService.removeNode(key)
  }

  public selectionChanged(event: FSelectionChangeEvent): void {
    this.isSingleSelection = event.connections.length + event.nodes.length === 1
    this.selectionService.setNodes(event.nodes)
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
      // Execute Click when 原地点击
      this.selectionService.selectNode(node.key)
    }
  }

  public onFocusNode($event: FocusEvent, node: TXpertTeamNode) {
    this.selectionService.selectNode(node.key)
  }

  removeConnection(connection: FConnectionComponent) {
    this.apiService.createConnection(connection.fOutputId, null, connection.fInputId)
  }

  onCanvasChange = effectAction((origin$: Observable<FCanvasChangeEvent>) => {
    return origin$.pipe(
      debounceTime(1000),
      tap((event) => {
        this.apiService.updateCanvas(event)
      })
    )
  })

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
    return this.agentConfig()?.disableOutputs?.includes(g.key)
  }
}

function extractXpertNodes(nodes: TXpertTeamNode[], xpertNode: TXpertTeamNode & { type: 'xpert' }) {
  xpertNode.nodes?.forEach((node) => {
    if (node.type === 'xpert') {
      extractXpertNodes(nodes, node)
    } else {
      nodes.push({ ...node, parentId: xpertNode.key })
    }
  })
}

function extractXpertGroup(results: TXpertTeamNode[], nodes: TXpertTeamNode[], parentId = null) {
  nodes?.forEach((node) => {
    if (node.type === 'xpert') {
      results.push({...node, parentId})
      extractXpertGroup(results, node.nodes, node.key)
    }
  })
}
