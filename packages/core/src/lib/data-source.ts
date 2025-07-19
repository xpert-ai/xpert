import {
  BehaviorSubject,
  distinctUntilChanged,
  EMPTY,
  filter,
  map,
  Observable,
  of,
  ReplaySubject,
  shareReplay,
  switchMap,
  takeUntil
} from 'rxjs'
import { Agent, OcapCache } from './agent'
import { EntityService } from './entity'
import {
  AggregationRole,
  CalculatedProperty,
  CalculationType,
  Catalog,
  convertSlicerToDimension,
  Cube,
  DataType,
  Entity,
  EntitySet,
  EntityType,
  getIndicatorMeasureName,
  IDimensionMember,
  Indicator,
  isEntitySet,
  isEntityType,
  MDCube,
  mergeEntityType,
  RestrictedMeasureProperty,
  Schema,
  SemanticModel
} from './models'
import { Dimension, uuid } from './types'
import { assign, isEqual, isNil, Type } from './utils/index'

export type DataSourceFactory = () => Promise<Type<DataSource>>

export enum AuthenticationMethod {
  none = 'none',
  basic = 'basic',
  saml = 'saml',
  independent = 'independent'
}

/**
 * Property settings related to data source type
 */
export interface DataSourceSettings {
  dataSourceId?: string
  // modelId?: string
  // catalog
  database?: string
  // 语言
  language?: string

  // ignoreUnknownProperty
  ignoreUnknownProperty?: boolean
}

export interface DataSources {
  [name: string]: DataSourceOptions
}

/**
 * Data source configuration items
 * Actually corresponds to a semantic model rather than a data source
 *
 * @TODO needs to be redefined using the CSDL concept
 * * entityTypes configures multiple entities under this data source
 * * entityType configures the type field of each entity
 * * annotations configures the annotations of each entity
 */
export interface DataSourceOptions extends SemanticModel {
  settings?: DataSourceSettings
  authMethod?: string
  useLocalAgent?: boolean
  /**
   * Default: client
   * - client: in client send query options to server
   * - server: query xmla
   */
  mode?: 'client' | 'server'
  /**
   * Runtime calculated measures
   */
  calculatedMeasures?: Record<string, CalculatedProperty[]>

  /**
   * Is draft semantic model
   */
  isDraft: boolean
}

/**
 * Abstract interface of data source
 * - options configuration items
 * - createEntityService creates entityService
 * - getAnnotation gets annotation
 */
export interface DataSource {
  id: string
  options: DataSourceOptions
  agent: Agent

  refresh(): void
  /**
   *
   * @deprecated use discoverDBCatalogs
   *
   * 获取数据源的数据服务目录, 数据服务目录用于区分不同的数据实体类别, 如 ODataService 的 Catalog, XMLA 的 CATALOG_NAME 等
   */
  getCatalogs(): Observable<Array<Catalog>>

  /**
   * Discover catalogs or schemas from DataSource's Database
   */
  discoverDBCatalogs(options?: {throwError?: boolean}): Observable<Array<DBCatalog>>
  /**
   * Discover tables from DataSource's Database
   */
  discoverDBTables(refresh?: boolean): Observable<Array<DBTable>>

  /**
   * Discover cubes from api or schema defination of DataSource
   */
  discoverMDCubes(refresh?: boolean): Observable<Array<MDCube>>

  /**
   * Discover members of dimension
   *
   * @param entity
   * @param dimension
   */
  discoverMDMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]>

  /**
   * @deprecated use selectEntitySets
   * 获取源实体集合
   *
   * @param refresh 是否跳过缓存进行重新获取数据
   */
  getEntitySets(refresh?: boolean): Observable<Array<EntitySet>>
  /**
   * Observe entity sets from DataSource
   * 
   * @param refresh Force refresh cache in browser
   */
  selectEntitySets(refresh?: boolean): Observable<Array<EntitySet>>

  /**
   * @deprecated 运行时 EntityType 接口不应该直接暴露, 使用 selectEntitySet 方法
   *
   * 获取运行时 EntityType
   */
  getEntityType(entity: string): Observable<EntityType | Error>

  /**
   * @deprecated use selectMembers
   * 获取维度成员
   *
   * @param entity 实体
   * @param dimension 维度
   */
  getMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]>
  /**
   * Observe members of dimension in entity (cube) from DataSource
   * 
   * @param entity Cube name
   * @param dimension Dimension, include name and hierarchy
   */
  selectMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]>

  /**
   * Creates a corresponding entityService based on the specified entitySet name
   */
  createEntityService<T>(entity: string): EntityService<T>

  /**
   * Observe runtime schema
   */
  selectSchema(): Observable<Schema>

  /**
   * Setting a custom Schema
   *
   * @param schema EDMSchema
   */
  setSchema(schema: Schema): void

  /**
   * Update a single cube definition
   *
   * @param cube
   */
  updateCube(cube: Cube): void
  /**
   * Insert or update a indicator by code
   */
  upsertIndicator(indicator: Indicator): void

  /**
   * Observe to Entity type definition changes, merge runtime and user enhancements
   *
   * @param entity
   */
  selectEntitySet(entity: string): Observable<EntitySet | Error>

  /**
   * Set up EntityType individually
   *
   * @param entityType EntityType
   */
  setEntityType(entityType: EntityType): void

  /**
   * Observe type defination of entity (or Error) (combine runtime type and custom types)
   *
   * @param entity
   */
  selectEntityType(entity: string): Observable<EntityType | Error>

  /**
   * Observe indicators of entity
   *
   * @param entitySet 实体
   */
  selectIndicators(entity: string): Observable<Array<Indicator>>

  /**
   * Get an indicator by id from entity
   *
   * @param idOrCode Indicator `ID` or `Code`
   * @param cube Cube name
   */
  getIndicator(idOrCode: string, cube?: string): Indicator

  /**
   * Create DB Table
   *
   * @param name
   * @param columns
   * @param data
   */
  createEntity(name: string, columns, data?): Observable<string>

  /**
   * Drop DB Table
   * 
   * @param name 
   */
  dropEntity(name: string): Promise<void>

  /**
   * Use statement query
   *
   * @param statement
   */
  query(options: { statement: string; forceRefresh?: boolean }): Observable<any>

  /**
   * Observe to runtime calculated measures
   * 
   * @param cube 
   */
  selectCalculatedMeasures(cube: string): Observable<CalculatedProperty[]>

  /**
   * Clear the browser cache
   * 
   * @deprecated
   */
  clearCache(): Promise<void>

  /** Completes all relevant Observable streams. */
  onDestroy(): void
}

/**
 * Implement common functions of the data source model, including obtaining metadata, executing some operations and queries unrelated to specific model entities, creating entity services, etc.
 *
 */
export abstract class AbstractDataSource<T extends DataSourceOptions> implements DataSource {
  id = uuid()

  // Should be used only in onDestroy.
  protected readonly destroySubject$ = new ReplaySubject<void>(1)
  // Exposed to any extending service to be used for the teardown.
  readonly destroy$ = this.destroySubject$.asObservable()

  private options$ = new BehaviorSubject<T>(null)
  get options() {
    return this.options$.value
  }

  // Runtime calculated measures
  readonly calculatedMeasures$ = this.options$.pipe(map((options) => options?.calculatedMeasures))

  protected _entitySets = {}
  constructor(options: T, public agent: Agent, /*public cacheService: OcapCache*/) {
    this.options$.next(options)
  }
  
  readonly refresh$ = new BehaviorSubject<void>(null)

  abstract discoverDBCatalogs(): Observable<Array<DBCatalog>>
  abstract discoverDBTables(): Observable<Array<DBTable>>
  abstract discoverMDCubes(refresh?: boolean): Observable<Array<EntitySet>>
  abstract discoverMDMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]>
  abstract createEntityService<T>(entity: string): EntityService<T>
  abstract getEntitySets(refresh?: boolean): Observable<Array<EntitySet>>
  abstract selectEntitySets(refresh?: boolean): Observable<Array<EntitySet>>
  abstract getEntityType(entity: string): Observable<EntityType | Error>
  abstract getCatalogs(): Observable<Array<Catalog>>
  abstract getMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]>
  abstract selectMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]>
  abstract createEntity(name: string, columns: any[], data?: any[]): Observable<string>
  abstract dropEntity(name: string): Promise<void>
  abstract query(options: { statement: string; forceRefresh?: boolean }): Observable<any>

  refresh() {
    this.refresh$.next()
  }

  setSchema(schema: Schema): void {
    this.options$.next({ ...this.options$.value, schema })
  }

  updateCube(cube: Cube) {
    const schema = this.options.schema ?? ({} as Schema)
    const cubes = schema.cubes ? [...schema.cubes] : []
    const index = cubes.findIndex((item) => item.__id__ === cube.__id__)
    if (index > -1) {
      cubes.splice(index, 1, cube)
    } else {
      cubes.push(cube)
    }

    this.options$.next({
      ...this.options$.value,
      schema: {
        ...schema,
        cubes
      }
    })
  }

  upsertIndicator(indicator: Indicator) {
    const indicators = this.options.schema?.indicators ? [...this.options.schema.indicators] : []
    const index = indicators.findIndex((item) => item.code === indicator.code)
    if (index > -1) {
      indicators[index] = {
        ...indicators[index],
        ...indicator
      }
    } else {
      indicators.push({...indicator})
    }
    const schema = this.options.schema ? {...this.options.schema} : {} as Schema
    schema.indicators = indicators
    this.setSchema(schema)
  }

  selectSchema(): Observable<Schema> {
    return this.options$.pipe(
      distinctUntilChanged(),
      map((options) => options?.schema),
      distinctUntilChanged(isEqual)
    )
  }

  setEntityType(entityType: EntityType) {
    const schema = this.options.schema ?? ({} as Schema)

    const entitySets = schema.entitySets ?? {}
    entitySets[entityType.name] = entitySets[entityType.name] ?? ({ name: entityType.name } as EntitySet)
    entitySets[entityType.name].entityType = entityType

    this.options$.next({
      ...this.options,
      schema: {
        ...schema,
        entitySets
      }
    })
  }

  /**
   * This is only responsible for the EntitySet setting during merge runtime, not for Cube type compilation,
   *  which is done when getEntityType gets the original type.
   *
   * @param entity
   * @returns
   */
  selectEntitySet(entity: string): Observable<EntitySet | Error> {
    if (!this._entitySets[entity]) {
      this._entitySets[entity] = this.getEntityType(entity).pipe(
        switchMap((rtEntityType) => {
          return isEntityType(rtEntityType)
            ? this.selectSchema().pipe(
                distinctUntilChanged(),
                map((schema) => {
                  const indicators = schema?.indicators?.filter((indicator) => indicator.entity === entity)

                  indicators?.forEach((indicator) => {
                    mapIndicatorToMeasures(indicator).forEach((measure) => {
                      rtEntityType.properties[measure.name] = {
                        ...measure,
                        role: AggregationRole.measure
                      }
                    })
                  })

                  const customEntityType = schema?.entitySets?.[entity]?.entityType
                  let entityType = rtEntityType

                  if (!isNil(customEntityType)) {
                    // TODO merge 函数有风险
                    entityType = mergeEntityType(assign({}, rtEntityType), customEntityType)
                  }

                  if (entityType) {
                    // 将数据源方言同步到 EntityType
                    entityType.dialect = this.options.dialect
                    entityType.syntax = this.options.syntax
                  }

                  return {
                    name: entityType.name,
                    caption: entityType.caption,
                    entityType,
                    indicators
                  } as EntitySet
                })
              )
            : of(rtEntityType)
        }),
        takeUntil(this.destroy$),
        shareReplay(1)
      )
    }
    return this._entitySets[entity]
  }

  selectEntityType(entity: string): Observable<EntityType | Error> {
    if (!entity) {
      return EMPTY
    }
    return this.selectEntitySet(entity).pipe(
      map((entitySet) => (isEntitySet(entitySet) ? entitySet.entityType : entitySet))
    )
  }

  selectIndicators(entity: string): Observable<Indicator[]> {
    return this.selectEntitySet(entity).pipe(
      filter(isEntitySet),
      map((entitySet) => entitySet.indicators),
      distinctUntilChanged()
    )
  }

  getIndicator(id: string, entity?: string): Indicator {
    return this.options.schema?.indicators?.find(
      (indicator) => (indicator.id === id || indicator.code === id) && (entity ? indicator.entity === entity : true)
    )
  }

  selectCalculatedMeasures(cube: string) {
    return this.calculatedMeasures$.pipe(map((measures) => measures?.[cube]), distinctUntilChanged())
  }

  async clearCache(key = ''): Promise<void> {
    return // await this.cacheService.clear(key)
  }

  onDestroy() {
    this.destroySubject$.next()
    this.destroySubject$.complete()
  }
}

/**
 * Compile indicator to measures
 * 
 * @param indicator 
 * @returns 
 */
export function mapIndicatorToMeasures(indicator: Indicator) {
  const measures = []
  const name = indicator.code || indicator.name
  const measureName = getIndicatorMeasureName(indicator)
  if (indicator.formula) {
    measures.push({
      name: measureName,
      caption: indicator.name,
      dataType: indicator.dataType || DataType.Unknown,
      role: AggregationRole.measure,
      calculationType: CalculationType.Calculated,
      formula: indicator.formula,
      aggregator: indicator.aggregator,
      hidden: true,
      visible: false
    } as CalculatedProperty)
  }

  measures.push({
    name,
    caption: indicator.name,
    dataType: indicator.dataType || DataType.Unknown,
    role: AggregationRole.measure,
    calculationType: CalculationType.Indicator,
    measure: measureName,
    dimensions: indicator.filters?.map(convertSlicerToDimension),
    slicers: indicator.filters,
    enableConstantSelection: true,
    formatting: {
      unit: indicator.unit
    },
    aggregator: indicator.aggregator,
    visible: indicator.visible
  } as RestrictedMeasureProperty)

  return measures
}

export interface DBCatalog {
  name: string
  label: string
}

export interface DBTable extends Entity {
  catalog?: string
  name: string
  /**
   * @deprecated use caption
   */
  label?: string
  columns?: DBColumn[]
}

export interface DBColumn {
  name: string
  label?: string
  type: string
  dbType?: string
  nullable?: boolean
  position?: number
  /**
   * 应该等同于 label
   */
  comment?: string
}
