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
 * 与数据源类型相关的属性设置
 */
export interface DataSourceSettings {
  dataSourceId?: string
  // modelId?: string
  // catalog
  database?: string
  // 语言
  language?: string

  // ignoreUnknownProperty
  ignoreUnknownProperty: boolean
}

export interface DataSources {
  [name: string]: DataSourceOptions
}

/**
 * 数据源配置项
 * 其实对应一个语义模型而不是一个数据源
 *
 * @TODO 需要使用 CSDL 的概念进行重新定义
 * * entityTypes 配置此数据源下多个 entity
 *    * entityType 每个 entity 的类型字段配置
 *    * annotations 每个 entity 的 annotations 配置
 */
export interface DataSourceOptions extends SemanticModel {
  settings?: DataSourceSettings
  authMethod?: string
  useLocalAgent?: boolean
}

/**
 * 数据源的抽象接口
 * * options 配置项
 * * createEntityService 创建 entityService
 * * getAnnotation 获取 annotation
 */
export interface DataSource {
  id: string
  options: DataSourceOptions
  agent: Agent

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
  discoverDBCatalogs(): Observable<Array<DBCatalog>>
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
   * 根据指定的 entitySet 名称创建相应的 entityService
   */
  createEntityService<T>(entity: string): EntityService<T>

  /**
   * 监听运行时 EDM Schema 配置变化
   */
  selectSchema(): Observable<Schema>

  /**
   * 设置自定义的 Schema
   *
   * @param schema EDMSchema
   */
  setSchema(schema: Schema): void

  /**
   * 更新单个 Cube 定义
   *
   * @param cube
   */
  updateCube(cube: Cube): void
  /**
   * Insert or update a indicator by code
   */
  upsertIndicator(indicator: Indicator): void

  /**
   * 订阅 Entity 的类型定义变化， 合并运行时和用户增强后的
   *
   * @param entity
   */
  selectEntitySet(entity: string): Observable<EntitySet | Error>

  /**
   * 单独设置一个 EntityType
   *
   * @param entityType EntityType
   */
  setEntityType(entityType: EntityType): void

  /**
   * Subscribe type defination of entity (combine runtime type and custom types)
   *
   * @param entity
   */
  selectEntityType(entity: string): Observable<EntityType | Error>

  /**
   * Subscribe indicators of entity
   *
   * @param entitySet 实体
   */
  selectIndicators(entity: string): Observable<Array<Indicator>>

  /**
   * Get an indicator by id from entity
   *
   * @param idOrCode Indicator `ID` or `Code`
   * @param entity
   */
  getIndicator(idOrCode: string, entity?: string): Indicator

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
   * 使用语句查询
   *
   * @param statement
   */
  query(options: { statement: string; forceRefresh?: boolean }): Observable<any>

  /**
   * 清除浏览器端缓存
   */
  clearCache(): Promise<void>

  /** Completes all relevant Observable streams. */
  onDestroy(): void
}

/**
 * 数据源模型的通用功能实现, 包含元数据的获取, 执行一些与具体模型 Entity 无关的操作查询, 创建 Entity Service 等
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

  protected _entitySets = {}
  constructor(options: T, public agent: Agent, public cacheService: OcapCache) {
    this.options$.next(options)
  }
  

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
   * 这里只负责 merge 运行时的 EntitySet 设置, 不负责 Cube 的类型编译, Cube 类型编译放在 getEntityType 获取原始类型时.
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
      (indicator) => (indicator.id === id || indicator.code === id) && indicator.entity === entity
    )
  }

  async clearCache(key = ''): Promise<void> {
    return await this.cacheService.clear(key)
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
