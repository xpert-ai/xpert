import {
  AbstractEntityService,
  EntitySemantics,
  PeriodFunctions,
  Property,
  QueryOptions,
  QueryReturn
} from '@metad/ocap-core'
import { BehaviorSubject, Observable, switchMap } from 'rxjs'
import { CubeContext } from './cube'
import { queryDimension } from './dimension'
import { queryCube, transposePivot } from './query'
import { queryTable } from './query-table'
import { SQLQueryResult } from './types'
import { getErrorMessage, serializeWrapCatalog } from './utils'

/**
 * @todo A test procedure should be developed to address error scenarios.
 */
export class SQLEntityService<T> extends AbstractEntityService<T> {
  refresh$ = new BehaviorSubject<void>(null)

  get agent() {
    return this.dataSource.agent
  }

  override query(options?: QueryOptions<any>): Observable<QueryReturn<T>> {
    return this.selectQuery(options)
  }

  override selectQuery(options?: QueryOptions): Observable<QueryReturn<T>> {
    const schema = this.dataSource.options.schema
    const entityType = this.entityType
    const dialect = this.dataSource.options.dialect
    const catalog = this.dataSource.options.catalog

    return this.refresh$.pipe(
      switchMap(async () => {
        let _statement = options?.statement
        let _cubeContext: CubeContext
        if (!_statement) {
          try {
            const { cubeContext, statement } = await (async () => {
              // 1. Is Dimension
              const dimension = schema?.dimensions?.find((item) => item.name === entityType.name)
              if (dimension) {
                return {
                  cubeContext: null,
                  statement: queryDimension(dimension, entityType, options, dialect, catalog)
                }
              }

              // 2. Is Cube
              const cube = schema?.cubes?.find((item) => item.name === entityType.name)

              if (cube) {
                return queryCube(cube, options, entityType, dialect, catalog)
              }

              // 3. Is Table
              if (entityType.semantics === EntitySemantics.table) {
                return queryTable(options, entityType, dialect, catalog)
              }

              throw new Error(`未找到模型'${this.entitySet}'`)
            })()

            _cubeContext = cubeContext
            _statement = statement
          } catch (err: any) {
            console.error(err)
            const error: string = getErrorMessage(err)
            this.agent.error(err)
            return {
              error
            }
          }
        }

        _statement = serializeWrapCatalog(_statement, this.dataSource.options.dialect, this.dataSource.options.catalog)
        
        try {
          const result: SQLQueryResult = await this.dataSource.agent.request(this.dataSource.options, {
            method: 'post',
            url: 'query',
            body: {
              statement: _statement,
              forceRefresh: options.force
            },
            catalog: this.dataSource.options.catalog
          })

          // Query cube or dimension
          const { data, schema } = _cubeContext
            ? transposePivot(_cubeContext, result.data)
            : { data: result.data, schema: { columns: result.columns } }

          return {
            ...result, // backcomp
            data,
            schema,
            stats: {
              ...(result.stats ?? {}),
              statements: [_statement]
            }
          } as QueryReturn<T>
        } catch (err) {
          console.error(err)
          const error: string = getErrorMessage(err)
          this.agent.error(err)
          return { data: [], error, stats: { statements: [_statement] } }
        }
      })
    )
  }

  override refresh() {
    this.refresh$.next()
  }

  getCalculatedMember(measure: string, type: PeriodFunctions, calendar?: string): Property {
    throw new Error('Method not implemented.')
  }
}
