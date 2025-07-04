import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { IPoint, IRect } from '@foblex/2d'
import { nonNullable, debounceUntilChanged, linkedModel } from '@metad/core'
import { createStore, Store, withProps } from '@ngneat/elf'
import { stateHistory } from '@ngneat/elf-state-history'
import { FCanvasChangeEvent } from '@foblex/flow'
import { nonBlank } from '@metad/copilot'
import { derivedAsync } from 'ngxtension/derived-async'
import { ActivatedRoute, Router } from '@angular/router'
import { effectAction } from '@metad/ocap-angular/core'
import { calculateHash } from '@cloud/app/@shared/utils'
import { EnvironmentService, KnowledgebaseService, ToastrService, XpertService, XpertToolsetService } from 'apps/cloud/src/app/@core'
import { isEqual, isNil, negate, omit, omitBy, pick } from 'lodash-es'
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  tap
} from 'rxjs'
import {
  getErrorMessage,
  IEnvironment,
  IKnowledgebase,
  IWorkflowNode,
  IXpert,
  IXpertAgent,
  IXpertToolset,
  OrderTypeEnum,
  TXpertAgentConfig,
  TXpertOptions,
  TXpertTeamDraft,
  TXpertTeamNode,
} from '../../../../@core/types'
import { CreateConnectionHandler, CreateConnectionRequest, ToConnectionViewModelHandler } from './connection'
import { LayoutHandler, LayoutRequest } from './layout'
import {
  CreateNodeHandler,
  CreateNodeRequest,
  MoveNodeHandler,
  MoveNodeRequest,
  RemoveNodeHandler,
  RemoveNodeRequest,
  ReplaceNodeHandler,
  ReplaceNodeRequest,
  ToNodeViewModelHandler,
  UpdateAgentHandler,
  UpdateAgentRequest,
  UpdateNodeHandler,
  UpdateNodeRequest
} from './node'
import { PACCopilotService } from '../../../services'
import { EReloadReason, IStudioStore, TStateHistory } from './types'
import { XpertComponent } from '../../xpert'
import { CreateTeamHandler, CreateTeamRequest, ExpandTeamRequest, ExpandTeamHandler, UpdateXpertHandler, UpdateXpertRequest } from './xpert'
import { genWorkflowKey, injectGetXpertsByWorkspace, injectGetXpertTeam } from '../../utils'
import { CreateWorkflowNodeRequest, CreateWorkflowNodeHandler, UpdateWorkflowNodeHandler, UpdateWorkflowNodeRequest } from './workflow'


const SaveDraftDebounceTime = 1 // s

@Injectable()
export class XpertStudioApiService {
  readonly xpertService = inject(XpertService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly toolsetService = inject(XpertToolsetService)
  readonly copilotService = inject(PACCopilotService)
  readonly environmentService = inject(EnvironmentService)
  readonly #toastr = inject(ToastrService)
  readonly xpertComponent = inject(XpertComponent)
  readonly getXpertTeam = injectGetXpertTeam()
  readonly getXpertsByWorkspace = injectGetXpertsByWorkspace()
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)

  readonly store = createStore({ name: 'xpertStudio' }, withProps<IStudioStore>({ draft: null }))
  readonly #stateHistory = stateHistory<Store, IStudioStore>(this.store, {
    comparatorFn: negate(isEqual)
  })
  readonly historyHasPast = toSignal(this.#stateHistory.hasPast$)
  readonly historyHasFuture = toSignal(this.#stateHistory.hasFuture$)

  get storage(): TXpertTeamDraft {
    return this.store.getValue().draft
  }

  readonly #reload: Subject<EReloadReason | null> = new Subject<EReloadReason>()

  public get reload$(): Observable<EReloadReason> {
    return this.#reload.asObservable().pipe(filter((value) => value !== EReloadReason.MOVED))
  }
  readonly paramId$ = this.xpertComponent.paramId$

  readonly #refresh$ = new BehaviorSubject<void>(null)

  readonly team = signal<IXpert>(null)
  readonly versions = toSignal(
    this.#refresh$.pipe(
      switchMap(() => this.paramId$.pipe(distinctUntilChanged())),
      switchMap((id) => this.xpertService.getVersions(id))
    )
  )
  readonly workspaceId = computed(() => this.team()?.workspaceId)

  /**
   * pristine draft
   */
  readonly draft = signal<TXpertTeamDraft>(null)
  readonly unsaved = signal(false)
  /**
   * Operate histories
   */
  readonly stateHistories = signal<{past: TStateHistory[]; future: TStateHistory[]}>({
    past: [],
    future: []
  })
  readonly viewModel = toSignal(this.store.pipe(map((state) => state.draft)))
  readonly collaboratorDetails = signal<Record<string, IXpert>>({})
  readonly primaryAgent = computed<IXpertAgent>(() => {
    const primaryAgentKey = this.team()?.agent.key
    if (primaryAgentKey && this.viewModel()?.nodes) {
      return this.viewModel().nodes.find((_) => _.type === 'agent' && _.key === primaryAgentKey)?.entity as IXpertAgent
    }
    return null
  })
  readonly xpert = computed(() => this.viewModel()?.team)

  // knowledgebases
  readonly knowledgebases$ = toObservable(this.workspaceId).pipe(
    filter(nonBlank),
    distinctUntilChanged(),
    switchMap((id) => this.knowledgebaseService.getAllByWorkspace(id)),
    map(({ items }) => items),
    shareReplay(1)
  )
  readonly refreshToolsets$ = new BehaviorSubject<void>(null)
  readonly toolsets$ = toObservable(this.workspaceId).pipe(
    filter(nonBlank),
    distinctUntilChanged(),
    switchMap((id) => this.refreshToolsets$.pipe(switchMap(() => this.toolsetService.getAllByWorkspace(id, {relations: ['createdBy'], order: {updatedAt: OrderTypeEnum.DESC}})))),
    map(({ items }) => items),
    shareReplay(1)
  )

  readonly builtinToolProviders = derivedAsync(() => this.toolsetService.builtinToolProviders$)
  
  readonly workspace = computed(() => this.team()?.workspace, { equal: (a, b) => a?.id === b?.id })

  readonly collaborators$ = toObservable(this.team).pipe(
    map((team) => team?.workspaceId),
    filter(nonNullable),
    distinctUntilChanged(),
    switchMap((id) => this.getXpertsByWorkspace(id)),
    map(({ items }) => items.filter((_) => _.id !== this.team().id)),
    shareReplay(1)
  )

  readonly environments$ = toObservable(this.workspaceId).pipe(
    filter(nonNullable),
    switchMap((workspaceId) =>  this.environmentService.getAllInOrg({
      where: {workspaceId}
    })),
    map(({items}) => items),
    shareReplay(1)
  )

  readonly environments = toSignal(this.environments$)
  readonly environmentId = signal<string>(null)

  readonly environment = linkedModel({
    initialValue: null,
    compute: () => this.environments()?.find((_) => _.id === this.environmentId()),
    update: (env, origin) => {
      this.saveEnvironment({ id: env.id, variables: env.variables })
    }
  })

  private saveDraftSub = this.#refresh$
    .pipe(
      switchMap(() =>
        combineLatest([
          this.paramId$.pipe(
            distinctUntilChanged(),
            switchMap((id) => this.getXpertTeam(id)),
            tap((role) => {
              this.#stateHistory.clear()
              this.draft.set(role.draft)
              this.initRole(role)
              this.stateHistories.update(() => ({
                past: [
                  {
                    reason: EReloadReason.INIT,
                    cursor: this.#stateHistory.getPast().length,
                    createdAt: new Date()
                  }
                ],
                future: []
              }))
            })
          ),
          this.#reload.pipe(
            filter((event) => event !== EReloadReason.INIT),
            debounceUntilChanged(2000),
            tap((event) => {
              if (event) {
                this.stateHistories.update((state) => {
                  const last = state.past[state.past.length - 1]
                  if (this.#stateHistory.getPast().length !== last.cursor) {
                    return {
                      past: [
                        ...state.past,
                        {
                          reason: event,
                          cursor: this.#stateHistory.getPast().length,
                          createdAt: new Date()
                        }
                      ],
                      future: []
                    }
                  }
                  return state
                })
              }
            })
          )
        ])
      ),
      map(() => calculateHash(JSON.stringify(this.storage))),
      distinctUntilChanged(),
      tap(() => this.unsaved.set(true)),
      debounceTime(SaveDraftDebounceTime * 1000),
      switchMap(() => this.saveDraft().pipe(
        catchError((err) => {
          this.#toastr.error(getErrorMessage(err))
          return EMPTY
        })
      )),
    )
    .subscribe()

  constructor() {
    effect(
      () => {
        if (this.environment() == null && this.environments()?.length) {
          this.environmentId.set(
            this.environments().find((_) => _.isDefault)?.id ?? this.environments()[0]?.id)
        }
      },
      { allowSignalWrites: true }
    )
  }
  
  getInitialDraft() {
    const xpert = this.team()
    return {
      team: {
        ...omit(xpert, 'agents'),
        id: xpert.id
      },
      ...(xpert.graph ?? {
        nodes: new ToNodeViewModelHandler(xpert).handle().nodes,
        connections: new ToConnectionViewModelHandler(xpert).handle()
      }),
    } as TXpertTeamDraft
  }

  public initRole(xpert: IXpert) {
    this.team.set(xpert)

    this.store.update(() => ({
      draft: xpert.draft ? {
        team: xpert.draft.team ?? omit(xpert, 'agents'),
        nodes: xpert.draft.nodes ?? xpert.graph?.nodes ?? new ToNodeViewModelHandler(xpert).handle().nodes,
        connections: xpert.draft.connections ?? xpert.graph?.connections ?? new ToConnectionViewModelHandler(xpert).handle()
      } : this.getInitialDraft()
    }))

    this.#reload.next(EReloadReason.INIT)
  }

  public resume() {
    this.xpertService.update(this.team().id, { draft: null }).subscribe(() => {
      this.refresh()
    })
  }

  public refresh() {
    this.#refresh$.next()
  }

  saveDraft() {
    const draft = this.storage
    return this.xpertService.saveDraft(draft.team.id, draft).pipe(
      tap((draft) => {
        this.unsaved.set(false)
        this.draft.set(draft)
      })
    )
  }

  saveEnvironment = effectAction((origin: Observable<Partial<IEnvironment>>) => {
    return origin.pipe(
      debounceTime(1000),
      // tap(() => this.loading.set(true)),
      switchMap((env) => this.environmentService.update(env.id, env)),
      // tap(() => this.loading.set(false)),
      catchError(() => {
        // this.loading.set(false)
        return EMPTY
      })
    )
  })

  public getNode(key: string) {
    return this.viewModel().nodes.find((item) => item.key === key)
  }

  public reload() {
    this.#reload.next(EReloadReason.JUST_RELOAD)
  }

  getHistoryCursor() {
    return this.#stateHistory.getPast().length
  }

  gotoHistoryIndex(index: number) {
    // 更新历史记录，根据给定的索引调整过去和未来的状态
    this.stateHistories.update((state) => {
      let past: TStateHistory[]
      let future: TStateHistory[]
      // 如果索引在过去的长度范围内，调整过去和未来的状态
      if (index <= state.past.length) {
        past = state.past.slice(0, index)
        future = [...state.past.slice(index), ...state.future]
      } else {
        past = [...state.past, ...state.future.slice(0, index - state.past.length)]
        future = state.future.slice(index - state.past.length)
      }
      return {
        past,
        future
      }
    })

    // Operate on history of stateHistory
    // curor on the last history of path
    const cursor = this.stateHistories().past[index - 1].cursor
    if (cursor > this.getHistoryCursor()) {
      this.#stateHistory.jumpToFuture(cursor - this.getHistoryCursor() - 1)
    } else {
      this.#stateHistory.jumpToPast(cursor)
    }

    // Reload event
    this.#reload.next(null)
  }

  undo() {
    const cursor = this.stateHistories().past[this.stateHistories().past.length - 2]?.cursor ?? 0
    this.stateHistories.update((state) => {
      return {
        past: state.past.slice(0, state.past.length - 1),
        future: [...state.past.slice(state.past.length -1), ...state.future]
      }
    })
    this.#stateHistory.jumpToPast(cursor)
  }

  redo() {
    if (this.stateHistories().future[0]) {
      const cursor = this.stateHistories().future[0].cursor
      this.stateHistories.update((state) => {
        return {
          past: [...state.past, ...state.future.slice(0, 1)],
          future: state.future.slice(1)
        }
      })
      this.#stateHistory.jumpToFuture(cursor - this.getHistoryCursor() - 1)
    }
  }

  /**
   * Clear the histories, but keep current state as the init step
   */
  clearHistory() {
    this.#stateHistory.clear((history) => {
      return {
        past: [history.present],
        present: history.present,
        future: []
      };
    })
    this.stateHistories.set({
      past: [
        {
          reason: EReloadReason.INIT,
          cursor: this.#stateHistory.getPast().length,
          createdAt: new Date()
        }
      ],
      future: []
    })
  }

  // Connections
  public createConnection(outputId: string, inputId: string, oldFInputId?: string): void {
    new CreateConnectionHandler(this.store).handle(new CreateConnectionRequest(outputId, inputId, oldFInputId))
    this.#reload.next(EReloadReason.CONNECTION_CHANGED)
  }

  // Knowledge
  public createKnowledge(position: IPoint, knowledge: IKnowledgebase): void {
    new CreateNodeHandler(this.store).handle(new CreateNodeRequest('knowledge', position, knowledge))
    this.#reload.next(EReloadReason.KNOWLEDGE_CREATED)
  }

  // Nodes
  public moveNode(key: string, position: IPoint): void {
    new MoveNodeHandler(this.store).handle(new MoveNodeRequest(key, position))
    this.#reload.next(EReloadReason.MOVED)
  }

  public resizeNode(key: string, size: IRect) {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      const node = draft.nodes.find((node) => node.key === key)
      if (node) {
        node.size = size
      }
      return { draft }
    })
    this.#reload.next(EReloadReason.RESIZE)
  }

  public expandXpertNode(key: string) {
    new ExpandTeamHandler(this.store, this).handle(new ExpandTeamRequest(key))
    this.#reload.next(EReloadReason.JUST_RELOAD)
  }

  private updateNode(key: string, value: Partial<TXpertTeamNode>): void {
    new UpdateNodeHandler(this.store).handle(new UpdateNodeRequest(key, value))
  }
  public removeNode(key: string) {
    // Remove node
    const event = new RemoveNodeHandler(this.store).handle(new RemoveNodeRequest(key))
    event && this.#reload.next(event)
  }
  // Agent node
  public createAgent(position: IPoint, agent?: Partial<IXpertAgent>): void {
    new CreateNodeHandler(this.store).handle(new CreateNodeRequest('agent', position, agent))
    this.#reload.next(EReloadReason.AGENT_CREATED)
  }
  public async createCollaborator(position: IPoint, team: IXpert) {
    this.getXpertTeam(team.id).subscribe({
      next: (xpert) => {
        new CreateTeamHandler(this.store).handle(new CreateTeamRequest(position, xpert))
        this.#reload.next(EReloadReason.XPERT_ADDED)
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }
  // Toolset node
  public createToolset(position: IPoint, toolset: IXpertToolset): void {
    new CreateNodeHandler(this.store).handle(new CreateNodeRequest('toolset', position, toolset))
    this.#reload.next(EReloadReason.TOOLSET_CREATED)
  }
  public updateXpertAgent(key: string, entity: Partial<IXpertAgent>, options?: {emitEvent: boolean}) {
    new UpdateAgentHandler(this.store).handle(new UpdateAgentRequest(key, entity))
    if (options?.emitEvent == null || options.emitEvent) {
      this.#reload.next(EReloadReason.XPERT_UPDATED)
    }
  }

  public updateXpert(key: string, entity: IXpert, options?: {emitEvent: boolean}) {
    new UpdateXpertHandler(this.store).handle(new UpdateXpertRequest(key, entity))
    if (options?.emitEvent == null || options.emitEvent) {
      this.#reload.next(EReloadReason.XPERT_UPDATED)
    }
  }

  updateXpertTeam(fn: (state: Partial<IXpert>) => Partial<IXpert>, reason = EReloadReason.XPERT_UPDATED) {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      draft.team = fn(draft.team)
      return {
        draft
      }
    })
    this.#reload.next(reason)
  }

  public updateXpertOptions(options: Partial<TXpertOptions>, reason: EReloadReason) {
    this.updateXpertTeam((xpert) => {
      return {
        ...xpert,
        options: {
          ...(xpert.options ?? {}),
          ...options
        }
      }
    }, reason)
  }

  public updateXpertAgentConfig(config: Partial<TXpertAgentConfig>, reason = EReloadReason.XPERT_UPDATED) {
    this.updateXpertTeam((xpert) => {
      return {
        ...xpert,
        agentConfig: {
          ...(xpert.agentConfig ?? {}),
          ...config
        }
      }
    }, reason)
  }

  updateToolset(key: string, toolset: IXpertToolset) {
    this.updateNode(key, {entity: toolset})
    this.#reload.next(EReloadReason.TOOLSET_CREATED)
  }

  updateCanvas(event: FCanvasChangeEvent) {
    this.updateXpertOptions({ position: event.position, scale: event.scale }, EReloadReason.CANVAS_CHANGED)
  }

  // Logic blocks of workflow
  addBlock(position: IPoint, entity: Partial<IWorkflowNode>) {
    new CreateWorkflowNodeHandler(this.store).handle(new CreateWorkflowNodeRequest(position, entity))
    this.#reload.next(EReloadReason.XPERT_UPDATED)
  }

  /**
   * @deprecated Use updateWorkflowNode
   */
  updateBlock(key: string, node: Partial<TXpertTeamNode>) {
    new UpdateWorkflowNodeHandler(this.store).handle(new UpdateWorkflowNodeRequest(key, node))
    this.#reload.next(EReloadReason.XPERT_UPDATED)
  }

  updateWorkflowNode(key: string, fn: (source: Partial<IWorkflowNode>) => IWorkflowNode) {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      const index = draft.nodes.findIndex((item) => item.type === 'workflow' && item.key === key)
      if (index === -1) {
        throw new Error(`Workflow node with key ${key} not found`)
      }
      const node = draft.nodes[index] as TXpertTeamNode & {type: 'workflow'}
      node.entity = fn(node.entity)
      return {
        draft
      }
    })
    this.#reload.next(EReloadReason.XPERT_UPDATED)
  }

  pasteNode(node: TXpertTeamNode) {
    let entity = null
    switch(node.type) {
      case ('agent'): {
        entity = omitBy(
          {
            ...omit(node.entity, 'id', 'key', 'leaderKey', 'createdAt', 'createdById', 'updatedAt', 'updatedById'),
            copilotModel: node.entity.copilotModel ? pick(node.entity.copilotModel, 'copilotId', 'model', 'modelType', 'options') : null,
            copilotModelId: null
          },
          isNil
        )
        new CreateNodeHandler(this.store).handle(new CreateNodeRequest(node.type, node.position, entity))
        this.#reload.next(EReloadReason.XPERT_UPDATED)
        break
      }
      case ('workflow'): {
        entity = omit(node.entity, 'id', 'key')
        entity.key = genWorkflowKey(node.entity.type)
        new CreateWorkflowNodeHandler(this.store).handle(new CreateWorkflowNodeRequest(node.position, entity))
        this.#reload.next(EReloadReason.XPERT_UPDATED)
        break
      }
    }
  }

  public autoLayout() {
    new LayoutHandler(this.store).handle(new LayoutRequest('TB'))
    // this.#reload.next(EReloadReason.AUTO_LAYOUT)
  }

  gotoWorkspace() {
    this.#router.navigate(['/xpert/w', this.workspaceId()])
  }

  // Templates
  replaceToolset(key: string, toolset: IXpertToolset) {
    new ReplaceNodeHandler(this.store).handle(new ReplaceNodeRequest(key, {entity: toolset, key: toolset.id}))
    this.#reload.next(EReloadReason.TOOLSET_CREATED)
  }
  replaceKnowledgebase(key: string, knowledgebase: IKnowledgebase) {
    new ReplaceNodeHandler(this.store).handle(new ReplaceNodeRequest(key, {entity: knowledgebase, key: knowledgebase.id}))
    this.#reload.next(EReloadReason.KNOWLEDGE_CREATED)
  }

  private readonly toolsets = new Map<string, {toolset$: Observable<IXpertToolset>; refresh$: BehaviorSubject<void>}>()
  /**
   * Get toolset detail with tools from cache or remote
   */
  getToolset(id: string): {toolset$: Observable<IXpertToolset>; refresh$: BehaviorSubject<void>} {
    if (!this.toolsets.get(id)) {
      const refresh$ = new BehaviorSubject<void>(null)
      this.toolsets.set(id, {
        toolset$: refresh$.pipe(switchMap(() => this.toolsetService.getOneById(id, { relations: ['tools']})), shareReplay(1)),
        refresh$
      })
    }
    return this.toolsets.get(id)
  }
  refreshToolset(id: string) {
    this.toolsets.get(id)?.refresh$.next()
  }

  private readonly knowledgebases = new Map<string, Observable<IKnowledgebase>>()
  getKnowledgebase(id: string) {
    if (!this.knowledgebases.get(id)) {
      this.knowledgebases.set(id, this.knowledgebaseService.getOneById(id, { relations: ['tools']}).pipe(shareReplay(1)))
    }
    return this.knowledgebases.get(id)
  }

  getVariables(options: {xpertId: string; workflowKey?: string; agentKey?: string; type: 'input' | 'output'}) {
    if (options.workflowKey) {
      return this.xpertService.getWorkflowVariables(options.xpertId, options.workflowKey, this.environmentId())
    } else {
      return this.xpertService.getVariables(options.xpertId, options.type, options.agentKey, this.environmentId())
    }
  }
}
