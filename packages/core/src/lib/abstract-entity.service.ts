import { BehaviorSubject, combineLatest, filter, map, Observable, of, Subject, takeUntil } from 'rxjs'
import { PeriodFunctions } from './annotations'
import { DataSource } from './data-source'
import { EntityService } from './entity'
import { EntityType, IDimensionMember, isEntityType, Property, QueryReturn, CalculatedProperty, isCalculatedProperty } from './models'
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
  // After merging the data source and user-defined entityType
  public readonly entityType$ = this._entityType$.pipe(filter((entityType) => !!entityType))
  get entityType(): EntityType {
    return this._entityType$.value
  }

  constructor(public readonly dataSource: DataSource, public readonly entitySet: string) {
    this.__id__ = uuid()
    // Merge entity type with provisional indicators
    combineLatest([
      this.dataSource.selectEntityType(this.entitySet), 
      this.dataSource.selectCalculatedMeasures(this.entitySet),
      this.registerMeasures$
    ])
      .pipe(
        map(([entityType, calculatedMeasures, registerMeasures]) => {
          if (!isEntityType(entityType)) {
            console.error(entityType)
            return entityType
          }

          const properties = {...entityType.properties}
          calculatedMeasures?.forEach((measure) => {
            properties[measure.name] = measure
          })
          
          return {
            ...entityType,
            properties: {
              ...properties,
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

  getProvisionalMeasures() {
    const measures = Object.values(this.registerMeasures$.value).filter((measure) => isCalculatedProperty(measure))
    this.dataSource.options.calculatedMeasures?.[this.entitySet]?.forEach((measure) => {
      measures.push(measure)
    })
    return measures
  }

  onDestroy(): void {
    this.destroySubject$.next()
    this.destroySubject$.complete()
  }
}
