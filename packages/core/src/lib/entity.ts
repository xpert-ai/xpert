import { Observable } from 'rxjs'
import { PeriodFunctions } from './annotations'
import { DataSource } from './data-source'
import { CalculatedProperty, EntityType, IDimensionMember, Indicator, Property, QueryReturn } from './models'
import { Annotation, AnnotationTerm, Dimension, QueryOptions } from './types'

/**
 * CURD service for entity
 */
export interface EntityService<T> {
  __id__?: string
  dataSource: DataSource
  entitySet: string

  /**
   * 获取 EntityType
   */
  selectEntityType(): Observable<EntityType>

  /**
   * @deprecated use `selectQuery`
   * 查询
   * @param options 
   */
  query(options?: QueryOptions): Observable<QueryReturn<T>>

  selectQuery(options?: QueryOptions): Observable<QueryReturn<T>>

  /**
   * 刷新
   */
  refresh(): void

  /**
   * 获取当前 entity 的指定注解
   *
   * @param term 注解的类型
   * @param qualifier 注解标识符，可选
   */
  getAnnotation<AT extends Annotation>(term: AnnotationTerm, qualifier?: string): Observable<AT>

  /**
   * @deprecated use selectMembers
   * 
   * 获取字段维度的所有成员
   */
  getMembers(property: Dimension): Observable<Array<IDimensionMember>>
  selectMembers(property: Dimension): Observable<Array<IDimensionMember>>

  /**
   * Register a provisional indicator definition to measure
   * 
   * @param name measure name
   * @param property indicator definition
   */
  registerMeasure(name: string, property: CalculatedProperty): void

  /**
   * 获取常用函数生成的计算度量成员
   *
   * @param measure the name of indicator based measure
   * @param type time period function for indicator
   * @param calendar calendar hierarchy name
   */
  getCalculatedMember(measure: string, type: PeriodFunctions, calendar?: string): Property

  /**
   * @deprecated use getIndicator in DataSource ?
   * 
   * @param id 
   */
  getIndicator(idOrCode: string): Indicator

  /**
   * Completes all relevant Observable streams.
   */
  onDestroy(): void
}
