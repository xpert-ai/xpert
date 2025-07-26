import {
  BehaviorSubject,
  combineLatest,
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
import { Agent } from './agent'
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
  // Language
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
   * Runtime calculated measures, indexed by cube name
   */
  calculatedMeasures?: Record<string, CalculatedProperty[]>

  /**
   * Is draft semantic model
   */
  isDraft?: boolean
  /**
   * Which indicators should use draft
   */
  isDraftIndicators?: string[]

  /**
   * Key-value pairs of parameters for cube
   */
  parameters?: Record<string, Record<string, any>>
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
   * Update options of DataSource
   */
  updateOptions(fn: (options: DataSourceOptions) => DataSourceOptions): void
  /**
   * @deprecated use discoverDBCatalogs
   */
  getCatalogs(): Observable<Array<Catalog>>

  /**
   * Discover catalogs or schemas from DataSource's Database: The data service catalog is used to distinguish different data entity categories, such as Catalog of ODataService, CATALOG_NAME of XMLA, etc.
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
   */
  getEntitySets(refresh?: boolean): Observable<Array<EntitySet>>
  /**
   * Observe entity sets from DataSource
   * 
   * @param refresh Force refresh cache in browser
   */
  selectEntitySets(refresh?: boolean): Observable<Array<EntitySet>>

  /**
   * @deprecated The EntityType interface should not be exposed directly at runtime, use the selectEntitySet method
   */
  getEntityType(entity: string): Observable<EntityType | Error>
  /**
   * @deprecated use selectMembers
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
   * Observe options
   */
  selectOptions(): Observable<DataSourceOptions>
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
   * Update the schema
   * 
   * @param fn 
   */
  updateSchema(fn: (schema: Schema) => Schema): void

  /**
   * Update a single cube definition
   *
   * @param cube
   */
  updateCube(cube: Cube): void
  /**
   * Update the value of parameters in cube
   * 
   * @param cube Cube name
   * @param fn Update function
   */
  updateParameters(cube: string, fn: (state: Record<string, any>) => Record<string, any>): void
  /**
   * Insert or update a indicator by `code`
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
  query(options: { statement: string; forceRefresh?: boolean; timeout?: number; }): Observable<any>

  // /**
  //  * Observe to runtime calculated measures
  //  * 
  //  * @param cube 
  //  */
  // selectCalculatedMeasures(cube: string): Observable<CalculatedProperty[]>

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
  abstract query(options: { statement: string; forceRefresh?: boolean; timeout?: number; }): Observable<any>

  refresh() {
    this.refresh$.next()
  }

  updateOptions(fn: (options: T) => T): void {
    const options = this.options$.value
    if (options) {
      this.options$.next(fn(options))
    } else {
      console.warn('DataSource options is not initialized yet.')
    }
  }

  setSchema(schema: Schema): void {
    this.options$.next({ ...this.options$.value, schema })
  }

  updateSchema(fn: (schema: Schema) => Schema): void {
    this.updateOptions((options) => {
      const schema = options.schema ?? ({} as Schema)
      return {
        ...options,
        schema: fn(schema)
      }
    })
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

  updateParameters(cube: string, fn: (state: Record<string, any>) => Record<string, any>): void {
    this.updateOptions((options) => {
      const parameters = options.parameters ? {...options.parameters} : ({} as Record<string, Record<string, any>>)
      return {
        ...options,
        parameters: {
          ...parameters,
          [cube]: fn(parameters[cube] ?? {})
        }
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

  selectOptions(): Observable<DataSourceOptions> {
    return this.options$.pipe(distinctUntilChanged())
  }

  selectSchema(): Observable<Schema> {
    return this.selectOptions().pipe(
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
      // Merge runtime types, temporary calculation measures, indicator lists, and type enhancement definitions in the schema: Can temporary calculated measures be merged with type enhancement definitions in the schema?
      this._entitySets[entity] = combineLatest([this.getEntityType(entity), this.options$.pipe(map((options) => options?.calculatedMeasures?.[entity]))]).pipe(
        switchMap(([rtEntityType, calculatedMeasures]) => {
          if (isEntityType(rtEntityType)) {
            return this.selectSchema().pipe(
                distinctUntilChanged(),
                map((schema) => {
                  const properties = {...rtEntityType.properties}
                  const parameters = {...(rtEntityType.parameters ?? {})}
                  const cube = schema?.cubes?.find((c) => c.name === entity)
                  // Custom indicators
                  const indicators = schema?.indicators?.filter((indicator) => indicator.entity === entity)
                  indicators?.forEach((indicator) => {
                    mapIndicatorToMeasures(indicator).forEach((measure) => {
                      properties[measure.name] = {
                        ...measure,
                        role: AggregationRole.measure
                      }
                    })
                  })
                  // Custom calculations
                  cube?.calculations?.forEach((calculation) => {
                    properties[calculation.name] = {
                      ...calculation,
                      role: AggregationRole.measure,
                      visible: true,
                    }
                  })

                  // Custom parameters
                  cube?.parameters?.forEach((parameter) => {
                    parameters[parameter.name] = {
                      ...parameter,
                    }
                  })

                  // Runtime calculated measures
                  calculatedMeasures?.forEach((measure) => {
                    properties[measure.name] = measure
                  })
                  rtEntityType.properties = properties
                  rtEntityType.parameters = parameters

                  let entityType = rtEntityType
                  // User custom entity type
                  const customEntityType = schema?.entitySets?.[entity]?.entityType
                  if (!isNil(customEntityType)) {
                    // TODO merge functions are risky
                    entityType = mergeEntityType(assign({}, rtEntityType), customEntityType)
                  }

                  if (entityType) {
                    // Synchronize Data Source and Dialect into EntityType
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
          }
            
          return of(rtEntityType)
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
