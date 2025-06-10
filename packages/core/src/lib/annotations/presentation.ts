import { OrderBy } from '../orderby'
import { Dimension } from '../types'

/**
 * 
 * Refer to OData 4.0 Vocabularies - SAP UI
 * see [PresentationVariantType](https://github.com/SAP/odata-vocabularies/blob/master/vocabularies/UI.md#PresentationVariantType)
 */
export interface PresentationVariant {
  id?: string
  text?: string
  /**
   * Top N
   */
  maxItems?: number
  // 增加此属性是否有必要?
  skip?: number
  /**
   * Order by measures or dimension
   */
  sortOrder?: Array<OrderBy>
  /**
   * Sequence of groupable properties p1, p2, ... defining how the result is composed of instances representing groups,
   * one for each combination of value properties in the queried collection.
   * The sequence specifies a certain level of aggregation for the queried collection,
   * and every group instance will provide aggregated values for properties that are aggregatable.
   * Moreover, the series of sub-sequences (p1), (p1, p2), ... forms a **leveled hierarchy**,
   * which may become relevant in combination with `InitialExpansionLevel`.
   */
  groupBy?: Array<Dimension>
  /**
   * @todo
   */
  totalBy?
  /**
   * @todo
   */
  total?
  /**
   * @todo
   */
  includeGrandTotal?
  /**
   * Level up to which the hierarchy defined for the queried collection should be expanded initially.
   * The hierarchy may be implicitly imposed by the sequence of the `GroupBy`, or by an explicit `hierarchy` annotation.
   */
  initialExpansionLevel?: number
  requestAtLeast?
}
