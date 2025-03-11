import { ComponentStore } from '@metad/store'
import { combineLatest, filter, map, Observable, shareReplay, switchMap } from 'rxjs'
import { Agent, AgentType, OcapCache } from './agent'
import { DataSource, DataSourceFactory, DataSourceOptions } from './data-source'
import { EntitySet, isEntitySet } from './models'
import { TimeGranularity } from './models/index'

/**
 * State type of DataSource core service
 */
export interface DSState {
  dataSources: DataSourceOptions[]
  today?: Date
  timeGranularity?: TimeGranularity
}

/**
 * DataSource core store
 * 
 * - Register semantic model
 * - Create data source object for model
 * - Create entity service for cube
 */
export class DSCoreService extends ComponentStore<DSState> {
  public readonly timeGranularity$ = this.select((state) => state.timeGranularity)
  public readonly currentTime$ = combineLatest([this.select((state) => state.today), this.timeGranularity$]).pipe(
    map(([today, timeGranularity]) => ({ today, timeGranularity }))
  )

  private _dataSources = new Map<string, Observable<DataSource>>()
  readonly #dataSources = new Map<string, DataSource>()

  constructor(
    public agents: Array<Agent>,
    dataSources: Array<DataSourceOptions>,
    public factories: Array<{ type: string; factory: DataSourceFactory }>,
    public cacheService?: OcapCache
  ) {
    super({ dataSources })
  }

  registerModel = this.updater((state, model: DataSourceOptions) => {
    // Backward compatibility
    if (model.useLocalAgent) {
      model.agentType = model.agentType ?? AgentType.Local
    }

    state.dataSources = state.dataSources ?? []
    // Use `key` as primary to determine duplication
    const index = state.dataSources.findIndex((item) => item.key === model.key)
    if (index > -1) {
      state.dataSources.splice(index, 1, model)
    } else {
      state.dataSources.push(model)
    }
  })

  /**
   * @todo 共用 DataSource 对象
   *
   * @param key The key of data source
   * @returns
   */
  getDataSource(key: string): Observable<DataSource> {
    if (!this._dataSources.get(key)) {
      this._dataSources.set(
        key,
        this.select((state) => state.dataSources?.find((item) => item.key === key)).pipe(
          filter((value) => !!value),
          switchMap((options) => this.createDataSource(options)),
          shareReplay(1)
        )
      )
    }

    return this._dataSources.get(key)
  }

  /**
   * New async method to get DataSource object
   * 
   * @deprecated 慎用 _dataSources 与 #dataSources 不一致问题
   * 
   * @param key
   * @returns 
   */
  async _getDataSource(key: string): Promise<DataSource> {
    if (!this.#dataSources.has(key)) {
      const options = this.get((state) => state.dataSources?.find((item) => item.key === key))
      if (!options) {
        throw new Error(`Can't found dataSource for: '${key}'`)
      }
      
      this.#dataSources.set(key, await this.createDataSource(options))
    }
    
    return this.#dataSources.get(key)
  }

  private async createDataSource(options: DataSourceOptions) {
    const provider = this.factories.find(({ type }) => type === options?.type)
    if (!provider) {
      throw new Error(`Can't found provider for dataSource type: '${options.type}'`)
    }

    const agent = this.agents.find((item) => item.type === options.agentType)

    if (!agent) {
      throw new Error(`Can't found Agent for type '${options.agentType}'`)
    }

    const DataSourceType = await provider.factory()

    return new DataSourceType(options, agent, this.cacheService)
  }

  getEntityService(dataSource: string, entitySet: string) {
    return this.getDataSource(dataSource).pipe(map((dataSource) => dataSource.createEntityService(entitySet)))
  }
  /**
   * @deprecated use `selectEntitySet`
   */
  getEntitySet(dataSource: string, entity: string): Observable<EntitySet> {
    return this.selectEntitySet(dataSource, entity)
  }
  selectEntitySet(dataSource: string, entity: string): Observable<EntitySet> {
    return this.getDataSource(dataSource).pipe(
      switchMap((dataSource) => dataSource.selectEntitySet(entity).pipe(filter(isEntitySet)))
    )
  }

  setTimeGranularity(timeGranularity: TimeGranularity) {
    this.patchState({ timeGranularity })
  }

  setToday(today: Date) {
    this.patchState({ today })
  }

  getToday() {
    return this.get((state) => ({ today: state.today, timeGranularity: state.timeGranularity }))
  }
}
