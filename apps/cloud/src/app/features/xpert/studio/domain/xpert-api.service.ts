import { computed, effect, inject, Injectable, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { IPoint, IRect } from '@foblex/2d'
import { nonNullable, debounceUntilChanged } from '@metad/core'
import { createStore, Store, withProps } from '@ngneat/elf'
import { stateHistory } from '@ngneat/elf-state-history'
import { KnowledgebaseService, PACCopilotService, ToastrService, XpertService, XpertToolsetService } from 'apps/cloud/src/app/@core'
import { isEqual, negate, omit } from 'lodash-es'
import {
  BehaviorSubject,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  Observable,
  shareReplay,
  Subject,
  switchMap,
  tap
} from 'rxjs'
import {
  getErrorMessage,
  IKnowledgebase,
  IXpert,
  IXpertAgent,
  IXpertToolset,
  OrderTypeEnum,
  TXpertOptions,
  TXpertTeamDraft,
  TXpertTeamNode
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
  ToNodeViewModelHandler,
  UpdateAgentHandler,
  UpdateAgentRequest,
  UpdateNodeHandler,
  UpdateNodeRequest
} from './node'
import { CreateTeamHandler, CreateTeamRequest, UpdateXpertHandler, UpdateXpertRequest } from './xpert'
import { calculateHash, EReloadReason, IStudioStore, TStateHistory } from './types'
import { ExpandTeamHandler } from './xpert/expand/expand.handler'
import { ExpandTeamRequest } from './xpert/expand/expand.request'
import { injectGetXpertsByWorkspace, injectGetXpertTeam } from '../../utils'
import { XpertComponent } from '../../xpert'
import { FCanvasChangeEvent } from '@foblex/flow'
import { nonBlank } from '@metad/copilot'


@Injectable()
export class XpertStudioApiService {
  readonly xpertRoleService = inject(XpertService)
  readonly knowledgebaseService = inject(KnowledgebaseService)
  readonly toolsetService = inject(XpertToolsetService)
  readonly copilotService = inject(PACCopilotService)
  readonly #toastr = inject(ToastrService)
  readonly xpertComponent = inject(XpertComponent)
  readonly getXpertTeam = injectGetXpertTeam()
  readonly getXpertsByWorkspace = injectGetXpertsByWorkspace()

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
      switchMap((id) => this.xpertRoleService.getVersions(id))
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

  // knowledgebases
  readonly knowledgebases$ = this.knowledgebaseService.getAllInOrg().pipe(
    map(({ items }) => items),
    shareReplay(1)
  )
  readonly toolsets$ = toObservable(this.workspaceId).pipe(
    filter(nonBlank),
    distinctUntilChanged(),
    switchMap((id) => this.toolsetService.getAllByWorkspace(id, {relations: ['createdBy'], order: {updatedAt: OrderTypeEnum.DESC}})),
    map(({ items }) => items),
    shareReplay(1)
  )
  
  readonly workspace = computed(() => this.team()?.workspace, { equal: (a, b) => a?.id === b?.id })

  readonly collaborators$ = toObservable(this.team).pipe(
    map((team) => team?.workspace),
    filter(nonNullable),
    distinctUntilChanged((prev, curr) => prev?.id === curr?.id),
    switchMap((workspace) => this.getXpertsByWorkspace(workspace)),
    map(({ items }) => items.filter((_) => _.id !== this.team().id)),
    shareReplay(1)
  )

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
                this.stateHistories.update((state) => ({
                  past: [
                    ...state.past,
                    {
                      reason: event,
                      cursor: this.#stateHistory.getPast().length,
                      createdAt: new Date()
                    }
                  ],
                  future: []
                }))
              }
            })
          )
        ])
      ),
      map(() => calculateHash(JSON.stringify(this.storage))),
      distinctUntilChanged(),
      map(() => this.storage),
      tap(() => this.unsaved.set(true)),
      debounceTime(5 * 1000),
      switchMap((draft) => this.xpertRoleService.saveDraft(this.storage.team.id, draft))
    )
    .subscribe((draft) => {
      this.unsaved.set(false)
      this.draft.set(draft)
    })

  constructor() {
    effect(() => {
      // console.log('API service:', this.viewModel())
    })
  }
  
  getInitialDraft() {
    const xpert = this.team()
    return {
      team: {
        ...omit(xpert, 'agents'),
        id: xpert.id
      },
      nodes: new ToNodeViewModelHandler(xpert).handle().nodes,
      connections: new ToConnectionViewModelHandler(xpert).handle()
    } as TXpertTeamDraft
  }

  public initRole(xpert: IXpert) {
    this.team.set(xpert)

    this.store.update(() => ({
      draft: xpert.draft ? {
        team: xpert.draft.team ?? omit(xpert, 'agents'),
        nodes: xpert.draft.nodes ?? new ToNodeViewModelHandler(xpert).handle().nodes,
        connections: xpert.draft.connections ?? new ToConnectionViewModelHandler(xpert).handle()
      } : this.getInitialDraft()
    }))

    this.#reload.next(EReloadReason.INIT)
  }

  public resume() {
    this.xpertRoleService.update(this.team().id, { draft: null }).subscribe(() => {
      this.refresh()
    })
  }

  public refresh() {
    this.#refresh$.next()
  }

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

  public updateNode(key: string, value: Partial<TXpertTeamNode>): void {
    new UpdateNodeHandler(this.store).handle(new UpdateNodeRequest(key, value))
  }
  public removeNode(key: string) {
    // Remove node
    const event = new RemoveNodeHandler(this.store).handle(new RemoveNodeRequest(key))
    event && this.#reload.next(event)
  }
  // Role node
  public createAgent(position: IPoint): void {
    new CreateNodeHandler(this.store).handle(new CreateNodeRequest('agent', position))
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
  public updateXpert(xpert: Partial<IXpert>) {
    new UpdateXpertHandler(this.store).handle(new UpdateXpertRequest(xpert))
    this.#reload.next(EReloadReason.XPERT_UPDATED)
  }
  public updateXpertOptions(options: Partial<TXpertOptions>, reason: EReloadReason) {
    this.store.update((state) => {
      const draft = structuredClone(state.draft)
      draft.team = {
        ...draft.team,
        options: {
          ...(draft.team.options ?? {}),
          ...options
        }
      }

      return {
        draft
      }
    })
    this.#reload.next(reason) // EReloadReason.XPERT_UPDATED)
  }

  updateCanvas(event: FCanvasChangeEvent) {
    this.updateXpertOptions({ position: event.position, scale: event.scale }, EReloadReason.CANVAS_CHANGED)
  }

  public autoLayout() {
    new LayoutHandler(this.store).handle(new LayoutRequest('TB'))
    // this.#reload.next(EReloadReason.AUTO_LAYOUT)
  }

  // Get toolset detail from cache or remote
  private readonly toolsets = new Map<string, Observable<IXpertToolset>>()
  getToolset(id: string) {
    if (!this.toolsets.get(id)) {
      this.toolsets.set(id, this.toolsetService.getOneById(id, { relations: ['tools']}).pipe(shareReplay(1)))
    }
    return this.toolsets.get(id)
  }
}
