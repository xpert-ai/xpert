import {
  AbstractDataSource,
  AggregationRole,
  Catalog,
  Cube,
  DBCatalog,
  DBTable,
  Dimension,
  EntitySemantics,
  EntityService,
  EntitySet,
  EntityType,
  IDimensionMember,
  IntrinsicMemberProperties,
  isEntityType,
  isEqual,
  MDCube,
  pick,
  PropertyHierarchy,
  QueryReturn,
  uuid,
} from '@metad/ocap-core'
import { t } from 'i18next'
import { catchError, combineLatest, distinctUntilChanged, filter, from, map, Observable, shareReplay, switchMap } from 'rxjs'
import { compileCubeSchema } from './cube'
import { compileDimensionSchema, DimensionMembers } from './dimension'
import { SQLEntityService } from './entity.service'
import { C_MEASURES_ROW_COUNT, SQLDataSourceOptions, SQLQueryResult, SQLSchema, SQLTableSchema } from './types'
import { decideRole, getErrorMessage, isCaseInsensitive, serializeUniqueName, serializeWrapCatalog } from './utils'


export class SQLDataSource extends AbstractDataSource<SQLDataSourceOptions> {
  private _catalogs$: Observable<Array<Catalog>>
  private _entitySets$: Observable<Array<EntitySet>>

  discoverDBCatalogs(options?): Observable<DBCatalog[]> {
    return from(
      this.agent.request(this.options, { method: 'get', url: 'catalogs' }).catch((error) => {
        this.agent.error(error)
        if (options?.throwError) {
          throw error
        }
        return []
      })
    )
  }

  discoverDBTables(): Observable<DBTable[]> {
    return from(this.fetchSchema(this.options.name, this.options.catalog || '')).pipe(
      map((schemas: SQLSchema[]) => {
        const entitySets: DBTable[] = []
        schemas
          .forEach((schema) => {
            schema.tables.forEach((table) => {
              entitySets.push({
                catalog: schema.schema,
                name: table.name,
                label: table.label,
                caption: table.label,
                visible: true
              })
            })
          })
        return entitySets
      })
    )
  }

  discoverMDCubes(): Observable<MDCube[]> {
    return this.selectSchema().pipe(
      map((schema) => {
        return schema?.cubes?.map((cube) => {
          return {
            name: cube.name,
            caption: cube.caption
            // entityType: null
          }
        })
      }),
      distinctUntilChanged(isEqual)
    )
  }

  discoverMDMembers(entity: string, dimension: Dimension) {
    return this.getMembers(entity, dimension)
  }

  /**
   * @deprecated use discoverDBCatalogs
   *
   * Should correspond to what object in the database?
   */
  getCatalogs(refresh?: boolean): Observable<Catalog[]> {
    if (!this._catalogs$ || refresh) {
      this._catalogs$ = from(
        this.agent.request(this.options, { method: 'get', url: 'catalogs' }).catch((error) => {
          this.agent.error(error)
          return []
        })
      )
    }
    return this._catalogs$
  }

  /**
   * Get a list of database tables
   *
   * @TODO Should I use cache? If I do, how do I refresh the cache?
   *
   */
  getEntitySets(refresh?: boolean): Observable<EntitySet[]> {
    return this.selectEntitySets(refresh)
  }

  override selectEntitySets(refresh?: boolean): Observable<EntitySet[]> {
    if (!this._entitySets$ || refresh) {
      this._entitySets$ = from(this.fetchSchema(this.options.name, this.options.catalog || '')).pipe(
        // Don't give the Client a chance to handle the error
        catchError((err) => {
          this.agent.error(err)
          return []
        }),
        map((schemas: SQLSchema[]) => {
          const entitySets = []
          schemas
            /**
             * Filter out the tables of the current catalog (corresponding to the schema in the three-part format, 
             * which will be changed to schema later), because some DB drivers will bring out the tables under all catalogs
             */
            .filter((schema) => (this.options.catalog ? schema.schema === this.options.catalog : true))
            .forEach((schema) => {
              schema.tables.forEach((table) => {
                // I feel like only table label should be used here
                entitySets.push({
                  catalog: schema.schema,
                  name: table.name,
                  caption: table.label
                })
              })
            })
          return entitySets
        }),
        shareReplay(1)
      )
    }

    return this._entitySets$
  }

  override getMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]> {
    return this.selectMembers(entity, dimension)
  }

  protected async fetchSchema(modelName: string, catalog: string): Promise<Array<SQLSchema>> {
    return this.agent.request(this.options, {
        method: 'get',
        url: 'schema',
        catalog
      })
  }

  async fetchTableSchema(modelName: string, catalog: string, table: string, statement?: string): Promise<SQLSchema[]> {
    return this.agent.request(this.options, {
      method: 'get',
      url: 'schema',
      catalog,
      table,
      statement
    })
  }

  /**
   * Get the entity type from the data source
   *
   * @param entity
   * @returns
   */
  getEntityType(entity: string): Observable<EntityType | Error> {
    return this.selectSchema()
      .pipe(
        map((schema) => {
          // Find schema defination for the entity
          let cube = schema?.cubes?.find((item) => item.name === entity)
          if (cube) {
            const dimensions = cube.dimensionUsages?.map((usage) => {
              const dimension = schema.dimensions.find((item) => item.name === usage.source)
              if (!dimension) {
                throw new Error(`未找到源维度'${usage.source}'`)
              }
              return dimension
            })
            return {
              type: 'CUBE',
              cube,
              dimensions
            }
          }

          // Entity is dimension
          const dimension = schema?.dimensions?.find((item) => item.name === entity)
          if (dimension) {
            return {
              type: 'DIMENSION',
              dimension
            }
          }

          // View
          cube = schema?.cubes?.find((item) => item.fact?.type === 'view' && item.fact.view?.alias === entity)
          if (cube) {
            return {
              type: 'VIEW',
              cube
            }
          }

          return {}
        }),
        distinctUntilChanged(isEqual)
      )
      .pipe(
        switchMap(async ({ type, cube, dimension, dimensions }) => {
          try {
            // Entity is dimension, compile dimension defination to EntityType
            if (dimension) {
              // Schema dimension to EntityType
              const rtDimension = compileDimensionSchema(entity, dimension, this.options.dialect)
              return {
                visible: true,
                name: entity,
                properties: {
                  [rtDimension.name]: rtDimension,
                  [C_MEASURES_ROW_COUNT]: {
                    name: C_MEASURES_ROW_COUNT,
                    role: AggregationRole.measure,
                    entity
                  }
                }
              } as EntityType
            }

            // Entity is cube, compile cube defination to EntityType
            if (type === 'CUBE' && cube) {
              return compileCubeSchema(entity, cube, dimensions, this.options.dialect)
            }

            // Other Entity is raw table
            let schemas: SQLSchema[]
            if (type === 'VIEW') {
              schemas = await this.fetchTableSchema(this.options.name, this.options.catalog || '', entity, cube.fact?.view?.sql?.content)
            } else if (!cube) {
              schemas = await this.fetchTableSchema(this.options.name, this.options.catalog || '', entity)
            }
            
            const table = schemas[0]?.tables?.[0]

            if (!table) {
              throw new Error(t('Error.NoMetadata4Entity', {ns: 'sql', entity}))
            }

            // this.updateCube(mapTableToCube(entity, table))

            const _entityType = mapTableSchemaEntityType(entity, schemas[0]?.tables?.[0], this.options.dialect)
            return _entityType
          } catch (err: any) {
            console.error(err)
            const error: string = getErrorMessage(err)
            this.agent.error(error)
            return new Error(error)
          }
        }),
        shareReplay(1)
      )
  }

  /**
   * @param entity
   * @param dimension
   * @returns
   */
  override selectMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]> {
    return this.getEntityType(entity).pipe(
      filter(isEntityType),
      switchMap((entityType) => {
        return combineLatest(
          DimensionMembers(
            entity,
            dimension,
            entityType,
            this.options.schema,
            this.options.dialect,
            this.options.catalog
          ).map((statement) =>
            this.query({
              statement
            })
          )
        ).pipe(
          map((memberLevels) => {
            const _dimension = pick(dimension, 'dimension', 'hierarchy')
            const members = []
            memberLevels.forEach((level) => {
              members.push(
                ...level.data.map((item: any) =>
                  isCaseInsensitive(this.options.dialect)
                    ? {
                        ...item,
                        ..._dimension,
                        memberKey: item.memberkey,
                        memberCaption: item.membercaption,
                        parentKey: item.parentkey,
                        entity
                      }
                    : {
                        ...item,
                        ..._dimension,
                        entity
                      }
                )
              )
            })

            return members as IDimensionMember[]
          })
        )
      })
    )
  }

  createEntity(name: any, columns: any, { data, mergeType }: any): Observable<string> {
    return this.agent._request(this.options, {
      method: 'post',
      url: 'import',
      body: { name, columns, data, mergeType },
      catalog: this.options.catalog
    })
  }

  async dropEntity(name: string): Promise<void> {
    return this.agent.request(this.options, {
      method: 'post',
      url: 'drop',
      body: { name },
      catalog: this.options.catalog
    })
  }

  /**
   * Create service for entity (Cube Dimension or Table)
   * @param entity 
   * @returns 
   */
  createEntityService<T>(entity: string): EntityService<T> {
    return new SQLEntityService(this, entity)
  }

  query(q: { statement: string }): Observable<QueryReturn<unknown>> {
    const statement = serializeWrapCatalog(q.statement, this.options.dialect, this.options.catalog)
    return from(
      this.agent.request(this.options, {
        method: 'post',
        url: 'query',
        body: { statement },
        catalog: this.options.catalog
      })
    ).pipe(
      map((result: SQLQueryResult) => ({
        ...result,
        data: result.data,
        schema: {
          columns: result.columns
        },
        statement
      }))
    )
  }
}

/**
 * DB table type to EntityType
 * 
 * @param entity 
 * @param item 
 * @returns 
 */
function mapTableSchemaEntityType(entity: string, item: SQLTableSchema, dialect: string): EntityType {
  const cube = mapTableToCube(entity, item)
  const entityType = {
    name: entity,
    caption: item.label,
    properties: {},
    semantics: EntitySemantics.table,
    defaultMeasure: cube.defaultMeasure,
    cube: cube
  } as EntityType

  item.columns?.forEach((column) => {
    entityType.properties[column.name] = {
      entity,
      __id__: column.name,
      name: column.name,
      caption: column.label,
      dataType: column.dataType + (column.dataLength == null ? '' : ` (${column.dataLength})`),
      /**
       * Recommend roles from the backend because different database field types vary greatly
       * @todo It seems that the back-end judgment is not appropriate
       */
      role: decideRole(column.type),
      column: column.name,
    }

    if (entityType.properties[column.name].role === AggregationRole.dimension) {
      entityType.properties[column.name].hierarchies = [
        {
          name: column.name,
          caption: column.label,
          dimension: column.name,
          memberCaption: serializeUniqueName(dialect, column.name, column.name, IntrinsicMemberProperties.MEMBER_CAPTION),
          levels: [
            {
              name: column.name,
              caption: column.label,
              dimension: column.name,
              hierarchy: column.name,
              column: column.name,
              captionColumn: column.name,
            }
          ]
        } as PropertyHierarchy
      ]
    }
  })

  return entityType
}

function mapTableToCube(entity: string, table: SQLTableSchema) {
  const measures = table.columns.filter((column) => decideRole(column.type) === AggregationRole.measure)
    .map((column) => ({
      __id__: column.name,
      name: column.name,
      caption: column.label,
      column: column.name
    }))
  const defaultMeasure = measures[0]?.name
  const cube = {
    __id__: uuid(),
    name: entity,
    caption: table.label,
    defaultMeasure,
    tables: [
      {
        name: table.name,
      }
    ],
    dimensions: table.columns.filter((column) => decideRole(column.type) === AggregationRole.dimension)
      .map((column) => ({
        entity,
        __id__: column.name,
        name: column.name,
        caption: column.label,
        column: column.name,
        hierarchies: [
          {
            __id__: column.name,
            name: '',
            caption: column.label,
            levels: [
              {
                __id__: column.name,
                name: column.name,
                caption: column.label,
                column: column.name
              }
            ]
          }
        ]
      })),
    measures
  } as Cube
  
  return cube
}
