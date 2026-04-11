import { Inject, Injectable, InjectionToken, OnDestroy } from '@angular/core'
import { Agent, AgentStatus, AgentStatusEnum, AgentType, DataSourceOptions, SemanticModel } from '@xpert-ai/ocap-core'
import { BehaviorSubject, filter, Observable, ReplaySubject, switchMap, takeUntil } from 'rxjs'

export const NGM_WASM_AGENT_WORKER = new InjectionToken<string>('NgmWASMAgentWorkerUrl')

@Injectable()
export class WasmAgentService implements Agent, OnDestroy {
  type = AgentType.Wasm

  // Should be used only in ngOnDestroy.
  protected readonly destroySubject$ = new ReplaySubject<void>(1)
  // Exposed to any extending Store to be used for the teardown.
  readonly destroy$ = this.destroySubject$.asObservable()

  get agent() {
    return this.agent$.value
  }
  set agent(value) {
    this.agent$.next(value)
  }
  private agent$ = new BehaviorSubject<Agent>(null)

  constructor(
    @Inject(NGM_WASM_AGENT_WORKER)
    private workerUrl: string
  ) {}

  selectStatus(): Observable<AgentStatus | AgentStatusEnum> {
    return this.agent$.pipe(
      filter((agent) => !!agent),
      switchMap((agent) => agent.selectStatus()),
      takeUntil(this.destroy$)
    )
  }
  selectError(): Observable<any> {
    return this.agent$.pipe(
      filter((agent) => !!agent),
      switchMap((agent) => agent.selectError()),
      takeUntil(this.destroy$)
    )
  }
  error(err: any): void {
    this.getWASMAgent().then((agent) => agent.error(err))
  }

  async request(dataSource: DataSourceOptions, options: any): Promise<any> {
    await this.getWASMAgent()
    return this.agent.request(dataSource, options)
  }

  async registerModel(model: SemanticModel) {
    await this.getWASMAgent()
    await (this.agent as any).registerModel(model)
  }

  async getWASMAgent() {
    if (!this.agent) {
      const { DuckdbWasmAgent } = await import('@xpert-ai/ocap-duckdb')
      this.agent = new DuckdbWasmAgent([], this.workerUrl)
    }

    return this.agent
  }

  ngOnDestroy(): void {
    this.destroySubject$.next()
    this.destroySubject$.complete()
  }
}
