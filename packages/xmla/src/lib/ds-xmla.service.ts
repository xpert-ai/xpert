import {
  AbstractDataSource,
  Agent,
  AggregationRole,
  AnnotationTerm,
  assignDeepOmitBlank,
  C_MEASURES,
  CalculatedMember,
  CalculatedProperty,
  CalculationType,
  CAPTION_FIELD_SUFFIX,
  DataSourceOptions,
  DataSourceSettings,
  DBCatalog,
  DBTable,
  Dimension,
  EntityProperty,
  EntitySemantics,
  EntityService,
  EntitySet,
  EntityType,
  getEntityLevel,
  getPropertyHierarchy,
  HttpHeaders,
  IDimensionMember,
  Indicator,
  isEntitySet,
  isEntityType,
  MDCube,
  MemberType,
  OcapCache,
  omit,
  omitBy,
  Property,
  PropertyDimension,
  PropertyHierarchy,
  PropertyLevel,
  PropertyMeasure,
  QueryReturn,
  RuntimeLevelType,
  Schema,
  Semantics,
  serializeArgs,
  serializeUniqueName,
  Syntax,
  VariableProperty
} from '@metad/ocap-core'
import { cloneDeep, groupBy, isArray, isEmpty, isNil, merge, mergeWith, sortBy } from 'lodash'
import { combineLatest, firstValueFrom, from, Observable, of, throwError } from 'rxjs'
import {
  catchError,
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  switchMap,
  takeUntil
} from 'rxjs/operators'
import { XmlaEntityService } from './entity.service'
import {
  convertHierarchyMemberValue,
  convertMDXProperty,
  convertXmlaMember,
  DIMENSION_TYPE,
  Hierarchy,
  isWrapBrackets,
  Level,
  MDOptions,
  MDXDialect,
  MDXDimension,
  MDXHierarchy,
  MDXLevel,
  MDXMember,
  Meaure,
  MondrianDataType,
  Rowset,
  SAPBWDataType,
  Variable,
  wrapBrackets,
  wrapHierarchyValue,
  XmlaCube,
  XmlaDimension,
  XmlaProperty,
  XmlaSchemaCatalog
} from './types/index'
import { getErrorMessage, getExceptionMessage, simplifyErrorMessage } from './utils'
import { Xmla } from './xmla'
import { NxXmlaService } from './xmla.service'
import { fetchDataFromMultidimensionalTuple } from './xmla/multidimensional'

export const XMLA_TEXT_FIELD_SUFFIX = CAPTION_FIELD_SUFFIX

export interface XmlaDataSourceSettings extends DataSourceSettings {
  dataSourceInfo: string
}
export interface XmlaDataSourceOptions extends DataSourceOptions {
  dialect: MDXDialect
  settings: XmlaDataSourceSettings
}

/**
 * DataSource for XMLA
 */
export class XmlaDataSource extends AbstractDataSource<XmlaDataSourceOptions> {
  public xmlaService: NxXmlaService
  private __entitySets = {}
  private _cubeEntityTypies = {}
  private _catalogCubes = {}
  // hierarchy members cache
  private _members = {}

  constructor(options: XmlaDataSourceOptions, agent: Agent, cacheService: OcapCache) {
    super(options, agent, cacheService)

    // 对于内置 OLAP 引擎来说 dataSourceInfo 即是语义模型 ID
    this.xmlaService = new NxXmlaService(options.settings?.dataSourceInfo ?? options.id, {
      url: `/`, // Mock
      agent: agent,
      authMethod: options.authMethod,
      semanticModel: this.options
      // auth: options.auth
    })
  }

  discoverDBCatalogs(): Observable<DBCatalog[]> {
    const headers: HttpHeaders = {}
    if (this.options.settings?.language) {
      headers['Accept-Language'] = this.options.settings.language
    }

    return this.xmlaService.discoverDBCatalogs({ headers }).pipe(
      map((rowset: Rowset) => rowset.fetchAllAsObject()),
      map((rows: Array<XmlaSchemaCatalog>) =>
        sortBy(
          rows.map((item) => ({
            name: item.CATALOG_NAME,
            label: item.DESCRIPTION,
            type: item.SCHEMA_NAME
          })),
          'name'
        )
      ),
      catchError((err) => {
        // 应该改成类型判断的方式
        let error =
          (<Xmla.Request>err).exception?.message ??
          getErrorMessage((<Xmla.Request>err).exception?.data) ??
          (<Xmla.Exception>err).message
        error = simplifyErrorMessage(error)
        this.agent.error(error)
        throw new Error(error)
      })
    )
  }

  /**
   * In xmla, db tables are cubes
   *
   * @param refresh For refresh cache
   * @returns
   */
  discoverDBTables(refresh?: boolean): Observable<DBTable[]> {
    return this.selectEntitySets(refresh) as unknown as Observable<DBTable[]>
  }
  /**
   * Observable of cubes in xmla source, then merge caption and description from custom schema
   *
   * @param refresh For refresh cache
   * @returns
   */
  discoverMDCubes(refresh?: boolean): Observable<MDCube[]> {
    return this.selectEntitySets(refresh).pipe(
      combineLatestWith(this.selectSchema()),
      map(([_cubes, schema]) => {
        const cubes = [..._cubes]
        const results: EntitySet[] = []
        // 按 Schema 定义的 Cubes 顺序优先展示
        schema?.cubes?.forEach((item) => {
          const index = cubes.findIndex((cube) => item.name === cube.name)
          if (index > -1) {
            cubes[index].caption = item.caption
            cubes[index].description = item.description
            cubes[index].visible = item.visible
            cubes[index].annotated = true
            results.push(...cubes.splice(index, 1))
          }
        })
        // 剩余 Cubes
        results.push(...cubes)
        return results
      })
    )
  }

  discoverMDMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]> {
    return this.selectMembers(entity, dimension)
  }

  selectEntitySets(refresh?: boolean): Observable<EntitySet[]> {
    const catalogName = this.options.catalog || ''
    const language = this.options.settings?.language || ''

    if (!this._catalogCubes[catalogName] || refresh) {
      // Clear cache first when force refresh
      this._catalogCubes[catalogName] = from(
        refresh ? this.clearCache(`xmla-catalog::${this.options.key}:${catalogName}:${language}`) : [true]
      ).pipe(
        switchMap(() => this.getMDCubesWithCache(this.options.key, catalogName, language)),
        catchError((err) => {
          const message = simplifyErrorMessage(
            (<Xmla.Request>err).exception?.message ??
              getErrorMessage((<Xmla.Request>err).exception?.data) ??
              (<Xmla.Exception>err).message
          )
          this.agent.error(message)
          return throwError(() => new Error(message))
        }),
        shareReplay(1)
      )
    }

    return this._catalogCubes[catalogName]
  }

  getMembers(entity: string, dimension: Dimension): Observable<IDimensionMember[]> {
    return this.selectMembers(entity, dimension)
    // throw new Error(`@deprecated use selectMembers`)
  }

  override query({
    statement,
    forceRefresh
  }: {
    statement: string
    forceRefresh?: boolean
  }): Observable<QueryReturn<unknown>> {
    const language = this.options.settings?.language || ''
    const headers: HttpHeaders = {}
    if (language) {
      headers['Accept-Language'] = language
    }

    return this.xmlaService.execute(statement, { headers, forceRefresh }).pipe(
      // 转换错误, 取出错误文本信息
      catchError((error) => throwError(() => new Error(simplifyErrorMessage(error.exception?.message)))),
      map((dataset) => fetchDataFromMultidimensionalTuple(dataset)),
      map((dataset) => ({
        results: dataset.data,
        data: dataset.data,
        schema: {
          rows: dataset.rows,
          columns: dataset.columns
        }
      }))
    )
  }

  createEntity(name: any, columns: any, data?: any): Observable<string> {
    throw new Error('Method not implemented.')
  }
  dropEntity(name: string): Promise<void> {
    throw new Error('Method not implemented.')
  }

  /**
   * @deprecated use discoverDBCatalogs
   */
  getCatalogs(): Observable<any> {
    throw new Error(`@deprecated use discoverDBCatalogs`)
  }

  getEntityType(entitySet: string): Observable<EntityType | Error> {
    return this.#selectEntitySet(entitySet).pipe(
      map((cube) => cube.entityType),
      catchError((err) => {
        return of(err)
      })
    )
  }

  getEntityRelatedPropertyList(entitySet: any): Observable<Property[]> {
    return this.getEntityType(entitySet).pipe(
      filter(isEntityType),
      map((entityType) => Object.values(entityType.properties))
    )
  }

  createEntityService<T>(entitySet: string): EntityService<T> {
    return new XmlaEntityService<T>(this, entitySet)
  }

  /**
   * @deprecated use discoverMDCubes
   */
  getEntitySets(refresh?: boolean): Observable<EntitySet[]> {
    throw new Error(`@deprecated use discoverMDCubes`)
  }

  private async _discoverMDCubes(catalogName: string, language = '') {
    const headers: HttpHeaders = {}
    if (language) {
      headers['Accept-Language'] = language
    }
    return firstValueFrom(
      this.xmlaService
        .discoverMDCubes({
          restrictions: {
            CATALOG_NAME: catalogName
          },
          headers
        })
        .pipe(
          map((rowset: Rowset) => rowset.fetchAllAsObject()),
          map((cubes: XmlaCube[]) => {
            return cubes.map((cube) => {
              return {
                ...convertMDXProperty<EntitySet>(cube),
                name: cube.CUBE_NAME,
                caption: cube.CUBE_CAPTION || cube.DESCRIPTION,
                entityType: null
              }
            })
          })
        )
    )
  }

  async getMDCubesWithCache(modelName: string, CATALOG_NAME: string, language = ''): Promise<EntitySet[]> {
    const cacheOptions = {
      key: serializeArgs('xmla-catalog:', modelName, CATALOG_NAME || '[CATALOG_NAME]', language),
      maxAge: 1000 * 60 * 60 * 24 * 30,
      level: 1,
      version: '1'
    }
    const cache = await this.cacheService?.getCache(cacheOptions)
    if (cache) {
      return cache as EntitySet[]
    }

    const result = await this._discoverMDCubes(CATALOG_NAME, language)

    this.cacheService?.setCache(cacheOptions, result)

    return result
  }

  async discoverMDCube(CATALOG_NAME: string, CUBE_NAME: string, language = ''): Promise<EntitySet> {
    const headers: HttpHeaders = {}
    if (language) {
      headers['Accept-Language'] = language
    }

    return firstValueFrom(
      this.xmlaService
        .discoverMDCubes({
          restrictions: {
            CATALOG_NAME,
            CUBE_NAME
          },
          headers
        })
        .pipe(
          map((rowset: Rowset) => rowset.fetchAllAsObject()),
          map((cubes: XmlaCube[]) => {
            return cubes.map((cube) => {
              return {
                ...convertMDXProperty<EntitySet>(cube),
                name: cube.CUBE_NAME,
                caption: cube.CUBE_CAPTION || cube.DESCRIPTION,
                entityType: null
              }
            })[0]
          })
        )
    )
  }

  #selectEntitySet(cube: string): Observable<EntitySet> {
    if (!this._cubeEntityTypies[cube]) {
      this._cubeEntityTypies[cube] = from(
        this.getEntitySetWithCache(this.options.name, cube, this.options.settings?.language || '')
      )
    }

    return this._cubeEntityTypies[cube]
  }

  private async getEntitySetWithCache(modelName: string, cube: string, language = ''): Promise<EntitySet> {
    const cacheOptions = {
      key: serializeArgs('xmla-entity:', modelName, cube, language),
      maxAge: 1000 * 60 * 60 * 24 * 30,
      level: 1,
      version: '1'
    }

    // Get cache firstly
    const cache = await this.cacheService?.getCache<EntitySet>(cacheOptions)
    if (cache) {
      return cache
    }

    // Actual fetch data
    const result = await this.#discoverEntitySet(cube, language)

    // Update cache
    if (result) {
      this.cacheService?.setCache(cacheOptions, result)
    }

    if (!result) {
      console.log(`Can't discover metadata for cube '${cube}'`)
    }

    return result
  }

  async #discoverEntitySet(cube: string, language = ''): Promise<EntitySet> {
    const CATALOG_NAME = this.options.catalog || ''
    const CUBE_NAME = cube

    const headers: HttpHeaders = {}
    if (this.options.settings?.language) {
      headers['Accept-Language'] = this.options.settings.language
    }

    try {
      const cubeEntity = await this.discoverMDCube(
        CATALOG_NAME,
        CUBE_NAME,
        this.options.settings?.language ?? ''
      )
      const [dimensions, hierarchies, measures, levels, properties, variables]: [
        XmlaDimension[],
        Hierarchy[],
        Meaure[],
        Level[],
        XmlaProperty[],
        Variable[]
      ] = await firstValueFrom(
        combineLatest([
          // Dimensions
          this.xmlaService
            .discoverMDDimensions({
              restrictions: {
                CATALOG_NAME,
                CUBE_NAME
              },
              headers
            })
            .pipe(map((rowset: Rowset) => rowset.fetchAllAsObject())),
          // Hierarchies
          this.xmlaService
            .discoverMDHierarchies({
              restrictions: {
                CATALOG_NAME,
                CUBE_NAME
              },
              headers
            } as any)
            .pipe(
              map((rowset: Rowset) => rowset.fetchAllAsObject()),
              catchError((err) => {
                // 由于后端原因查询 discoverMDHierarchies 有可能会出错, 所以不要崩溃
                this.agent.error(err.exception.message)
                return of([])
              })
            ),
          // Measures
          this.xmlaService
            .discoverMDMeasures({
              restrictions: {
                CATALOG_NAME,
                CUBE_NAME
              },
              headers
            })
            .pipe(map((rowset: Rowset) => rowset.fetchAllAsObject())),
          // Levels
          this.xmlaService
            .discoverMDLevels({
              restrictions: {
                CATALOG_NAME,
                CUBE_NAME
              }
            } as any)
            .pipe(map((rowset: Rowset) => rowset.fetchAllAsObject())),
          // Properties
          this.xmlaService
            .discoverMDProperties({
              restrictions: {
                CATALOG_NAME,
                CUBE_NAME
              },
              headers
            } as any)
            .pipe(map((rowset: Rowset) => rowset.fetchAllAsObject())),
          // SAP Variables
          this.options.dialect === MDXDialect.SAPBW
            ? this.xmlaService
                .discoverSAPVariables({
                  restrictions: {
                    CATALOG_NAME,
                    CUBE_NAME
                  },
                  headers
                })
                .pipe(map((rowset: Rowset) => rowset.fetchAllAsObject()))
            : of([])
        ])
      )

      const entityProperties: { [name: string]: EntityProperty } = {}
      const annotations = []

      const dHierarchies = groupBy(hierarchies, 'DIMENSION_UNIQUE_NAME')
      const dLevels = groupBy(levels, 'DIMENSION_UNIQUE_NAME')

      dimensions.forEach((dimension) => {
        const dName = dimension.DIMENSION_UNIQUE_NAME
        const dCaption = dimension.DIMENSION_CAPTION
        if (dimension.DIMENSION_TYPE === DIMENSION_TYPE.MD_DIMTYPE_MEASURE) {
          /**
           * DATA_TYPE: 目测在 Mondrian 引擎中的 DATA_TYPE 一般度量是 5，计算度量是 130 不知道还有没有其他类型
           */
          measures.forEach((measure) => {
            // 或者可以直接取自 measure.measureName
            const mName = measure.MEASURE_UNIQUE_NAME.replace(/\[Measures\]\.\[/g, '').replace(/\]/g, '')
            const mCaption = measure.MEASURE_CAPTION
            entityProperties[mName] = {
              ...convertMDXProperty(measure),
              dataType: MondrianDataType[measure.DATA_TYPE] ?? SAPBWDataType[measure.DATA_TYPE] ?? measure.DATA_TYPE,
              name: mName,
              caption: mCaption,
              role: AggregationRole.measure,
              rt: true,
              __id__: measure.MEASURE_UNIQUE_NAME,
              entity: measure.CUBE_NAME,
              uniqueName: measure.MEASURE_UNIQUE_NAME,
              visible: measure.MEASURE_IS_VISIBLE
            } as PropertyMeasure

            if (entityProperties[mName].dataType === 'Numeric') {
              (<PropertyMeasure>entityProperties[mName]).formatting = {
                decimal: 0
              }
            }
          })
        } else {
          // is dimension
          // entityProperties[dName + XMLA_TEXT_FIELD_SUFFIX] = {
          //   __id__: dName + XMLA_TEXT_FIELD_SUFFIX,
          //   name: dName + XMLA_TEXT_FIELD_SUFFIX,
          //   label: dCaption,
          //   semantic: Semantics.Text,
          //   role: AggregationRole.text
          // }
          entityProperties[dName] = {
            ...convertMDXProperty(dimension),
            __id__: dName,
            name: dName,
            caption: dCaption,
            // label: dCaption,
            role: AggregationRole.dimension,
            // text: dName + XMLA_TEXT_FIELD_SUFFIX, // entityProperties[dName + XMLA_TEXT_FIELD_SUFFIX],
            memberCaption: dName + XMLA_TEXT_FIELD_SUFFIX,
            entity: dimension.CUBE_NAME,
            rt: true,
            hierarchies: []
          } as MDXDimension

          // time semantic
          if (dimension.DIMENSION_TYPE === DIMENSION_TYPE.MD_DIMTYPE_TIME) {
            entityProperties[dName].semantics = { semantic: Semantics.Calendar }
          }

          const dProperty = entityProperties[dName] as MDXDimension

          // hierarchies
          const dhLevels = dLevels[dName] ? groupBy(dLevels[dName], 'HIERARCHY_UNIQUE_NAME') : {}
          dHierarchies[dName]?.map((hierarchy) => {
            const hName = hierarchy.HIERARCHY_UNIQUE_NAME
            const hCaption = hierarchy.HIERARCHY_CAPTION // `${dCaption} [${hierarchy.HIERARCHY_CAPTION}]`
            // TODO 完善 RelatedRecursiveHierarchy 注解配置
            annotations.push({
              id: `${AnnotationTerm.RelatedRecursiveHierarchy}#${hName}`,
              parentNodeProperty: 'parentKey', //hName + '.PROPERTIES.PARENT_UNIQUE_NAME',
              externalKeyProperty: 'memberUniqueName',
              valueProperty: 'memberKey',
              labelProperty: 'memberCaption',
              levelProperty: 'levelNumber',
              descendantCountProperty: 'childrenCardinality', //hName + '.PROPERTIES.CHILDREN_CARDINALITY',
              memberTypeProperty: 'memberType'
            })

            const hProperty = {
              ...convertMDXProperty(hierarchy),
              __id__: `${dName}.${hName}`,
              dimension: dName,
              name: hName,
              caption: hCaption,
              // label: hCaption,
              memberCaption: hName + XMLA_TEXT_FIELD_SUFFIX,
              role: AggregationRole.hierarchy,
              hierarchyNodeFor: dName,
              levels: [],
              allMember: convertHierarchyMemberValue(hName, hierarchy.ALL_MEMBER),
              rt: true
            } as MDXHierarchy
            dProperty.hierarchies.push(hProperty)

            if (hName !== dName) {
              // entityProperties[hName + XMLA_TEXT_FIELD_SUFFIX] = {
              //   __id__: `${dName}.${hName}` + XMLA_TEXT_FIELD_SUFFIX,
              //   name: hName + XMLA_TEXT_FIELD_SUFFIX,
              //   label: hCaption,
              //   semantic: Semantics.Text,
              //   role: AggregationRole.text
              // }
              // hProperty.text = entityProperties[hName + XMLA_TEXT_FIELD_SUFFIX]
              // // hierarchy for dimension
              // entityProperties[hName] = hProperty
            }

            const levels = dhLevels[hName]
            if (levels) {
              levels.forEach((level) => {
                const lName = level.LEVEL_UNIQUE_NAME
                const lCaption = `${hCaption} [${level.LEVEL_CAPTION}]`
                // properties[lName + XMLA_TEXT_FIELD_SUFFIX] = {
                //   name: lName + XMLA_TEXT_FIELD_SUFFIX,
                //   label: lCaption,
                //   semantic: Semantics.Text
                // }

                const levelProperties = properties
                  .filter(
                    (property) =>
                      property.DIMENSION_UNIQUE_NAME === level.DIMENSION_UNIQUE_NAME &&
                      property.HIERARCHY_UNIQUE_NAME === level.HIERARCHY_UNIQUE_NAME &&
                      property.LEVEL_UNIQUE_NAME === level.LEVEL_UNIQUE_NAME
                  )
                  .map((property) => ({
                    ...convertMDXProperty<any>(property),
                    // 将 Dimension.PropertyName 作为 Property 字段名(Mondrian 返回的 Properties 字段名不带括号, 为了统一加上中括号)
                    name: wrapHierarchyValue(property.HIERARCHY_UNIQUE_NAME, property.PROPERTY_NAME),
                    uniqueName: wrapHierarchyValue(property.LEVEL_UNIQUE_NAME, property.PROPERTY_NAME),
                    caption: property.PROPERTY_CAPTION,
                    // label: property.PROPERTY_CAPTION,
                    description: property.DESCRIPTION,
                    dataType: property.DATA_TYPE
                  }))

                const levelProperty: MDXLevel = {
                  ...convertMDXProperty(level),
                  __id__: lName,
                  name: lName,
                  caption: level.LEVEL_CAPTION,
                  // label: lCaption,
                  role: AggregationRole.level,
                  rt: true,
                  // text: properties[lName + XMLA_TEXT_FIELD_SUFFIX],
                  // hierarchyLevelFor: hName,
                  properties: levelProperties
                }
                levelProperty.dimension = levelProperty.dimensionUniqueName
                levelProperty.hierarchy = levelProperty.hierarchyUniqueName

                switch (level.LEVEL_TYPE) {
                  case RuntimeLevelType.TIME_YEAR:
                    levelProperty.semantics = {
                      semantic: Semantics['Calendar.Year']
                    }
                    break
                  case RuntimeLevelType.TIME_QUARTER:
                    levelProperty.semantics = {
                      semantic: Semantics['Calendar.Quarter']
                    }
                    break
                  case RuntimeLevelType.TIME_MONTH:
                    levelProperty.semantics = {
                      semantic: Semantics['Calendar.Month']
                    }
                    break
                  case RuntimeLevelType.TIME_WEEK:
                    levelProperty.semantics = {
                      semantic: Semantics['Calendar.Week']
                    }
                    break
                  case RuntimeLevelType.TIME_DAY:
                    levelProperty.semantics = {
                      semantic: Semantics['Calendar.Day']
                    }
                    break
                }

                hProperty.levels.push(levelProperty)
              })
            }
          })
        }
      })

      // for SAP Variables
      const parameters = {}
      variables.forEach((variable) => {
        const vName = variable.VARIABLE_NAME
        const vCaption = variable.VARIABLE_CAPTION
        parameters[vName] = {
          ...convertMDXProperty(variable),
          name: vName,
          caption: vCaption,
          defaultLow: convertHierarchyMemberValue(variable.REFERENCE_HIERARCHY, variable.DEFAULT_LOW),
          defaultHigh: convertHierarchyMemberValue(variable.REFERENCE_HIERARCHY, variable.DEFAULT_HIGH),
          dimension: variable.REFERENCE_DIMENSION,
          hierarchy: variable.REFERENCE_HIERARCHY,
          role: AggregationRole.variable
        } as VariableProperty
      })

      if (isEmpty(entityProperties)) {
        throw new Error(`Can't discover metadata for cube '${cube}'`)
      }

      return {
        name: cube,
        caption: cubeEntity.caption,
        visible: true,
        entityType: {
          ...cubeEntity,
          name: cube,
          visible: true,
          properties: entityProperties,
          parameters,
          semantics: EntitySemantics.aggregate,
          syntax: Syntax.MDX
        } as EntityType,
        annotations
      }
    } catch (err: unknown) {
      console.error(err)
      // 应该改成类型判断的方式
      let error =
        (<Xmla.Request>err).exception?.message ??
        getErrorMessage((<Xmla.Request>err).exception?.data) ??
        (<Xmla.Exception>err).message
      error = simplifyErrorMessage(error)
      this.agent.error(error)
      throw new Error(error)
    }
  }

  override selectMembers(CUBE_NAME: string, dimension: Dimension): Observable<MDXMember[]> {
    const HIERARCHY_UNIQUE_NAME = getPropertyHierarchy(dimension)
    if (!HIERARCHY_UNIQUE_NAME) {
      throw new Error(`Must specify a hierarchy or dimension for cube '${CUBE_NAME}' when selecting members`)
    }

    const CATALOG_NAME = this.options.catalog || ''
    // 如果有 Level 则要区分不同的 Level 下的成员缓存
    const uniqueName = `${CUBE_NAME}.${dimension.level || HIERARCHY_UNIQUE_NAME}`
    if (!this._members[uniqueName]) {
      this._members[uniqueName] = from(
        this.getMembersWithCache(
          this.options.key,
          CATALOG_NAME,
          CUBE_NAME,
          dimension.dimension,
          HIERARCHY_UNIQUE_NAME,
          dimension.level ?? '',
          this.options.settings?.language || ''
        )
      ).pipe(
        map((results) => {
          const calcMembers = this.options.schema?.cubes?.find((item) => item.name === CUBE_NAME)?.calculatedMembers

          calcMembers?.forEach((calcMember) => {
            if (
              wrapBrackets(calcMember.hierarchy || calcMember.dimension) === HIERARCHY_UNIQUE_NAME &&
              calcMember.visible
            ) {
              results.push({
                hierarchy: HIERARCHY_UNIQUE_NAME,
                memberCaption: calcMember.caption,
                visible: calcMember.visible,
                memberKey: calcMember.name,
                memberUniqueName: calcMember.name,
                memberType: MemberType.MDMEMBER_TYPE_FORMULA
              } as MDXMember)
            }
          })
          return results
        }),
        catchError((error, caught) => {
          return throwError(
            () =>
              new Error(
                simplifyErrorMessage(
                  error.exception
                    ? getExceptionMessage(error.exception) ?? getErrorMessage(error)
                    : getErrorMessage(error)
                )
              )
          )
        }),
        takeUntil(this.destroy$),
        shareReplay(1)
      )
    }
    return this._members[uniqueName]
  }

  private async getMembersWithCache(
    modelName: string,
    CATALOG_NAME: string,
    CUBE_NAME: string,
    DIMENSION: string,
    HIERARCHY_UNIQUE_NAME: string,
    LEVEL_UNIQUE_NAME: string,
    language = ''
  ): Promise<MDXMember[]> {
    const headers: HttpHeaders = {}
    if (language) {
      headers['Accept-Language'] = language
    }

    const cacheOptions = {
      key: serializeArgs(
        'xmla-members:',
        modelName,
        CATALOG_NAME || '[CATALOG_NAME]',
        CUBE_NAME,
        DIMENSION,
        HIERARCHY_UNIQUE_NAME,
        LEVEL_UNIQUE_NAME,
        language
      ),
      maxAge: 1000 * 60 * 60 * 24 * 30,
      level: 2,
      version: '1'
    }

    // Get cache firstly
    const cache = await this.cacheService?.getCache<MDXMember[]>(cacheOptions)
    if (cache) {
      return cache
    }

    const entityType = await firstValueFrom(this.selectEntityType(CUBE_NAME))
    if (!isEntityType(entityType)) {
      throw new Error(`Can't discover metadata for cube '${CUBE_NAME}'`)
    }
    const level = getEntityLevel(entityType, {
      dimension: DIMENSION,
      hierarchy: HIERARCHY_UNIQUE_NAME,
      level: LEVEL_UNIQUE_NAME
    })

    const restrictions: MDOptions['restrictions'] = {
      CATALOG_NAME,
      CUBE_NAME,
      HIERARCHY_UNIQUE_NAME
    }
    if (level) {
      restrictions.LEVEL_NUMBER = level.levelNumber
    }
    const rowset: Rowset = await firstValueFrom(
      this.xmlaService.discoverMDMembers({
        restrictions,
        headers
      })
    )

    const rows = rowset.fetchAllAsObject()
    const result = rows?.map((item) => {
      item = convertXmlaMember(HIERARCHY_UNIQUE_NAME, item)
      return item
    })

    // Update cache
    this.cacheService?.setCache(cacheOptions, result)

    return result
  }

  override selectEntitySet(entity: string): Observable<EntitySet | Error> {
    if (!this.__entitySets[entity]) {
      this.__entitySets[entity] = super.selectEntitySet(entity).pipe(
        combineLatestWith(this.selectSchema().pipe(distinctUntilChanged())),
        map(([entitySet, schema]) => {
          if (isEntitySet(entitySet)) {
            return {
              ...entitySet,
              entityType: this.mergeEntityTypeCube(entitySet.entityType, schema)
            }
          } else {
            return entitySet
          }
        }),
        takeUntil(this.destroy$),
        shareReplay(1)
      )
    }

    return this.__entitySets[entity]
  }

  override selectIndicators(entity: string): Observable<Indicator[]> {
    return this.selectEntitySet(entity).pipe(
      filter(isEntitySet),
      map((entitySet) => entitySet.indicators),
      distinctUntilChanged()
    )
  }

  private mergeEntityTypeCube(rtEntityType: EntityType, schema: Schema) {
    const cube = schema?.cubes?.find((item) => item.name === rtEntityType.name)
    if (!cube) {
      return mergeVirtualCube(rtEntityType, schema)
    }

    const dimensions = [...(cube.dimensions ?? [])]
    cube.dimensionUsages?.forEach((usage) => {
      const dimension = schema.dimensions.find((item) => item.name === usage.source)
      if (dimension) {
        dimensions.push({
          ...dimension,
          name: usage.name,
          caption: usage.caption,
          __id__: usage.__id__
        })
      }
    })

    const properties = { ...rtEntityType.properties }
    dimensions.forEach((dimension) => {
      const dName = wrapBrackets(dimension.name)
      // @todo 是否有 runtime 不存在而使用 schema 中的 dimension 的情况？
      if (properties[dName]) {
        properties[dName] = mergeDimension(properties[dName], dimension)
      }
    })

    cube.measures?.forEach((measure) => {
      properties[measure.name] = {
        ...(properties[measure.name] ?? {}),
        ...measure
      }
    })

    cube.calculatedMembers
      ?.filter((member) => member.visible)
      .forEach((member: any /*在 CalculatedMember 里增加 formatting 属性 */) => {
        if (member.dimension === C_MEASURES) {
          const measure: PropertyMeasure = properties[member.name]
          if (measure) {
            properties[member.name] = {
              ...measure,
              caption: member.caption,
              formatting: assignDeepOmitBlank(measure.formatting, member.formatting, 2)
            } as PropertyMeasure
          } else {
            properties[member.name] = {
              ...member,
              dataType: 'number',
              role: AggregationRole.measure,
              calculationType: CalculationType.Calculated
            } as CalculatedProperty
          }
        } else {
          properties[member.dimension] = properties[member.dimension] || {
            name: member.dimension,
            members: []
          }
          // TODO
          // properties[member.dimension].members.push({
          //   name: member.name,
          //   formula: member.formula
          // })
        }
      })

    // Variables
    const parameters = rtEntityType.parameters
    cube.variables?.forEach((variable) => {
      parameters[variable.name] = {
        ...(properties[variable.name] ?? {}),
        ...variable
      }
    })

    // Custom entity type (common in story editor)
    const customEntityType = schema?.entitySets?.[rtEntityType.name]?.entityType
    if (!isNil(customEntityType)) {
      // TODO merge 函数有风险
      rtEntityType = mergeEntityType(rtEntityType, {
        ...customEntityType
      })
    }

    return {
      ...rtEntityType,
      caption: cube.caption || rtEntityType.caption,
      description: cube.description || rtEntityType.description,
      properties,
      parameters
    }
  }

  getMDXDialect(): MDXDialect {
    return this.options.dialect
  }

  override async clearCache(key = ''): Promise<void> {
    if (!this.cacheService) {
      return
    }
    if (key) {
      return await this.cacheService.clear(key)
    }

    const keys = await this.cacheService?.keys()
    return await Promise.all(
      keys
        .filter((key) => (key as string).startsWith('xmla') && (key as string).indexOf(`::${this.options.name}`) > -1)
        .map((key) => this.cacheService.clear(key))
    ).then(() => {
      return
    })
  }
}

// merge EntityType
export function mergeEntityType(a: EntityType, b: EntityType): EntityType {
  // for properties
  function customizer(objValue, srcValue) {
    if (isArray(objValue) && isArray(srcValue)) {
      srcValue.forEach((item) => {
        const obj = objValue.find((obj) => obj.name === item.name)
        if (obj) {
          mergeWith(obj, item, customizer)
        } else {
          objValue.push(item)
        }
      })
      return objValue
    }
    return undefined
  }

  const entityType = {
    ...a,
    ...b,
    properties: mergeWith(cloneDeep(a.properties), b?.properties, customizer),
    parameters: assignDeepOmitBlank(cloneDeep(a.parameters), b?.parameters, 3)
  }

  return entityType
}

// 迁移至 ocap-core
export interface CubeUsage {
  cubeName: string
  ignoreUnrelatedDimensions: boolean
}

export interface VirtualCubeDimension {
  cubeName: string
  cubeCaption?: string
  __shared__?: boolean
  name: string
  caption?: string
}

export interface VirtualCubeMeasure {
  cubeName: string
  cubeCaption?: string
  name: string
  caption?: string
  visible: boolean
}

export interface VirtualCube {
  name: string
  caption?: string
  description?: string
  cubeUsages: CubeUsage[]
  virtualCubeDimensions: VirtualCubeDimension[]
  virtualCubeMeasures: VirtualCubeMeasure[]
  calculatedMembers: CalculatedMember[]
}

function mergeVirtualCube(entityType: EntityType, schema: Schema) {
  const virtualCube = schema?.virtualCubes?.find((item) => item.name === entityType.name) as VirtualCube
  if (!virtualCube) {
    return entityType
  }

  const properties = entityType.properties
  // Is EntityType of virtual cube
  virtualCube.virtualCubeDimensions.forEach((dimension) => {
    const dName = wrapBrackets(dimension.name)
    const cube = schema.cubes?.find((item) => item.name === dimension.cubeName)
    if (cube) {
      const d = cube.dimensions?.find((item) => item.name === dimension.name)
      if (d) {
        properties[dName] = mergeDimension(properties[dName], d)
      } else {
        const dUsage = cube.dimensionUsages?.find((item) => item.name === dimension.name)
        if (dUsage) {
          const d = schema.dimensions?.find((item) => item.name === dUsage.source)
          properties[dName] = mergeDimension(properties[dName], d)
        }
      }
    }
  })

  return entityType
}

function mergeDimension(property: PropertyDimension, dimension: PropertyDimension) {
  return {
    ...merge({}, property, omitBy(dimension, isNil)),
    name: property.name,
    hierarchies: property.hierarchies?.map((hierarchy) => {
      const sourceHierarchy =
        dimension.hierarchies?.find(
          (item) =>
            (isWrapBrackets(item.name) ? item.name : serializeUniqueName(dimension.name, item.name)) === hierarchy.name
        ) ?? ({} as PropertyHierarchy)
      return {
        ...merge({}, hierarchy, omitBy(sourceHierarchy, isNil)),
        name: hierarchy.name,
        levels: hierarchy.levels?.map((level) => {
          const sourceLevel =
            sourceHierarchy.levels?.find(
              (item) =>
                `${
                  isWrapBrackets(item.name)
                    ? item.name
                    : serializeUniqueName(dimension.name, sourceHierarchy.name, item.name)
                }` === level.name
            ) ?? ({} as PropertyLevel)
          return {
            ...merge({}, level, omitBy(omit(sourceLevel, 'properties'), isNil)),
            name: level.name
          }
        })
      }
    })
  }
}
