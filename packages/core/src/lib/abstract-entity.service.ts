import { BehaviorSubject, combineLatest, filter, map, Observable, of, Subject, takeUntil } from 'rxjs'
import { PeriodFunctions } from './annotations'
import { DataSource } from './data-source'
import { EntityService } from './entity'
import { EntityType, IDimensionMember, isEntityType, Property, QueryReturn, CalculatedProperty } from './models'
import { Annotation, Dimension, QueryOptions, uuid } from './types'

/**
 * Public abstract entity service class, including some commonly used public capabilities such as: 
 * - Merging custom Entity attributes
 * - Supporting simple JavaScript entity field calculation expressions
 * - Provisional indicator definition
 */
export abstract class AbstractEntityService<T> implements EntityService<T> {
  public __id__: string
  private destroySubject$ = new Subject<void>()
  public readonly destroy$ = this.destroySubject$.asObservable()

  /**
   * Provisional indicators definition
   */
  protected registerMeasures$ = new BehaviorSubject<Record<string, CalculatedProperty>>({})

  protected _entityType$ = new BehaviorSubject<EntityType>(null)
  // 合并数据源端和用户自定义 entityType 后的
  public readonly entityType$ = this._entityType$.pipe(filter((entityType) => !!entityType))
  get entityType(): EntityType {
    return this._entityType$.value
  }

  constructor(public readonly dataSource: DataSource, public readonly entitySet: string) {
    this.__id__ = uuid()
    // Merge entity type with provisional indicators
    combineLatest([this.dataSource.selectEntityType(this.entitySet), this.registerMeasures$])
      .pipe(
        map(([entityType, registerMeasures]) => {
          if (!isEntityType(entityType)) {
            console.error(entityType)
            return entityType
          }
          
          return {
            ...entityType,
            properties: {
              ...entityType.properties,
              ...registerMeasures
            }
          }
        }),
        filter(isEntityType),
        takeUntil(this.destroy$)
      )
      .subscribe((entityType) => {
        this._entityType$.next(entityType)
      })
  }

  abstract refresh(): void
  abstract query(options?: QueryOptions<any>): Observable<QueryReturn<T>>
  abstract selectQuery(options?: QueryOptions<any>): Observable<QueryReturn<T>>
  abstract getCalculatedMember(measure: string, type: PeriodFunctions, calendar?: string): Property
  
  /**
   * @deprecated use selectMembers
   * 获取字段相关维度成员
   */
  getMembers<M>(property: Dimension): Observable<any[]> {
    return this.dataSource.getMembers(this.entitySet, property)
  }
  selectMembers<M extends IDimensionMember>(property: Dimension): Observable<M[]> {
    return this.dataSource.selectMembers(this.entitySet, property) as Observable<M[]>
  }

  selectEntityType(): Observable<EntityType> {
    return this.entityType$
  }

  getAnnotation<AT extends Annotation>(term: string, qualifier: string): Observable<AT> {
    return of(null)
  }

  getIndicator(id: string) {
    return this.dataSource.getIndicator(id, this.entitySet)
  }

  registerMeasure(name: string, property: CalculatedProperty) {
    const registerMeasures = this.registerMeasures$.value
    this.registerMeasures$.next({
      ...registerMeasures,
      [name]: property
    })
  }

  onDestroy(): void {
    this.destroySubject$.next()
    this.destroySubject$.complete()
  }
}
