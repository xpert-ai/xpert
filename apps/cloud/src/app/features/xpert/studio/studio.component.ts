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
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { IPoint, IRect, PointExtensions } from '@foblex/2d'
import {
  EFConnectionType,
  EFResizeHandleType,
  FCanvasChangeEvent,
  FCanvasComponent,
  FCreateConnectionEvent,
  FFlowComponent,
  FFlowModule,
  FReassignConnectionEvent,
  FSelectionChangeEvent,
  FZoomDirective
} from '@foblex/flow'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { DisplayBehaviour } from '@metad/ocap-core'
import { effectAction } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxFloatUiModule, NgxFloatUiPlacements, NgxFloatUiTriggers } from 'ngx-float-ui'
import { NGXLogger } from 'ngx-logger'
import { Observable, of, Subscription, timer } from 'rxjs'
import { debounce, debounceTime, delay, map, pairwise, tap } from 'rxjs/operators'
import {
  AiModelTypeEnum,
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
  XpertStudioContextMenuComponent,
  XpertStudioNodeAgentComponent,
  XpertStudioNodeKnowledgeComponent,
  XpertStudioNodeToolsetComponent
} from './components'
import { EReloadReason, SelectionService, XpertStudioApiService } from './domain'
import { XpertStudioHeaderComponent } from './header/header.component'
import { XpertStudioPanelComponent } from './panel/panel.component'
import { XpertExecutionService } from './services/execution.service'
import { XpertStudioToolbarComponent } from './toolbar/toolbar.component'
import { MaterialModule } from '../../../@shared/material.module'


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
    MaterialModule,
    FFlowModule,
    NgxFloatUiModule,

    NgmCommonModule,

    XpertStudioToolbarComponent,
    XpertStudioContextMenuComponent,
    XpertStudioNodeAgentComponent,
    XpertStudioNodeKnowledgeComponent,
    XpertStudioNodeToolsetComponent,
    XpertStudioHeaderComponent,
    XpertStudioPanelComponent,
    XpertAgentExecutionStatusComponent,
    XpertAgentExecutionLogComponent
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
    const xperts = []
    extractXpertGroup(xperts, this.viewModel()?.nodes)
    return xperts
  })
  readonly connections = computed(() => {
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

  public isSingleSelection: boolean = true

  readonly viewModel = toSignal(this.apiService.store.pipe(map((state) => state.draft)))
  readonly xpert = computed(() => this.viewModel()?.team)
  readonly position = signal<IPoint>(null)
  readonly scale = signal<number>(null)

  readonly selectedNodeKey = this.selectionService.selectedNodeKey

  // Agent Execution Running status
  readonly agentExecutions = this.executionService.agentExecutions
  readonly preview = model(false)

  constructor() {
    effect(() => {
      // console.log('Studio:', this.viewModel())
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
    this.apiService.updateNode(node.key, { position: event })
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
