import { Semantics } from '../annotations'
import {
  C_MEASURES,
  Dimension,
  DisplayBehaviour,
  IMember,
  ISlicer,
  Measure,
  PrimitiveType,
  PropertyName
} from '../types'
import { isNil } from '../utils/index'
import { EntityProperty } from './property'
import { ParameterProperty, Property, PropertyMeasure } from './sdl'

export enum AggregationOperation {
  SUM = 'SUM',
  COUNT = 'COUNT',
  MIN = 'MIN',
  MAX = 'MAX',
  AVERAGE = 'AVERAGE',
  STDEV = 'STDEV',
  STDEVP = 'STDEVP',
  MEDIAN = 'MEDIAN',
  TOP_PERCENT = 'TOP_PERCENT',
  TOP_COUNT = 'TOP_COUNT',
  TOP_SUM = 'TOP_SUM',
}

export const AggregationOperations = [
  {
    value: AggregationOperation.SUM,
    label: 'Sum'
  },
  {
    value: AggregationOperation.COUNT,
    label: 'Count'
  },
  {
    value: AggregationOperation.MIN,
    label: 'Min'
  },
  {
    value: AggregationOperation.MAX,
    label: 'Max'
  },
  {
    value: AggregationOperation.AVERAGE,
    label: 'Average'
  },
  {
    value: AggregationOperation.STDEV,
    label: 'Standard Deviation'
  },
  {
    value: AggregationOperation.STDEVP,
    label: 'Population Standard Deviation'
  },
  {
    value: AggregationOperation.MEDIAN,
    label: 'Median'
  },
  {
    value: AggregationOperation.TOP_PERCENT,
    label: 'Top Percent'
  },
  {
    value: AggregationOperation.TOP_COUNT,
    label: 'Top Count'
  },
  {
    value: AggregationOperation.TOP_SUM,
    label: 'Top Sum'
  }
]

export const AggregationCompareOperations = [
  {
    value: '=',
    label: 'Equal To'
  },
  {
    value: '!=',
    label: 'Not Equal To'
  },
  {
    value: '>',
    label: 'Greater Than'
  },
  {
    value: '<',
    label: 'Less Than'
  },
  {
    value: '>=',
    label: 'Greater or Equal'
  },
  {
    value: '<=',
    label: 'Less or Equal'
  }
]

/**
 * Calculated property types
 */
export enum CalculationType {
  /**
   * Restricted Measure
   */
  Restricted = 'Restricted',
  /**
   * Formula Measure
   */
  Calculated = 'Calculated',
  /**
   * Conditional Aggregation
   */
  Aggregation = 'Aggregation',
  Variance = 'Variance',
  D2Measure = 'D2Measure',
  MeasureControl = 'MeasureControl',
  Parameter = 'Parameter',
  Indicator = 'Indicator'
}

export interface CalculatedMember {
  __id__?: string
  name: string
  label?: string
  formula: string
  aggregator?: string
  dimension?: string
  hierarchy?: string
  visible?: boolean
  caption?: string
  description?: string
  properties?: Array<{
    name: string
    value: string
  }>

  formatting?: {
    unit?: string;
    decimal?: number;
  }
}

export interface NamedSet {
  name: string
  caption?: string
  description?: string
  formula?: string
  Formula?: string[]
}

/**
 * Calculation measures or member sets
 */
export interface CalculationProperty extends EntityProperty {
  calculationType: CalculationType
  aggregator?: string
}

export interface CalculatedProperty extends CalculationProperty, CalculatedMember {}

/**
 * Restricted measure property ( a sub type calculation property )
 */
export interface RestrictedMeasureProperty extends CalculationProperty {
  /**
   * The measure name
   */
  measure: PropertyName
  /**
   * @deprecated use slicers
   */
  dimensions: Array<Dimension>
  /**
   * The slicers to restrict measure
   */
  slicers: ISlicer[]
  /**
   * Enable Constant Selection
   */
  enableConstantSelection?: boolean
  /**
   * All Selection Context Dimensions
   */
  allSelectionContext?: boolean
  /**
   * Constant Dimensions
   */
  constantDimensions?: Array<Dimension>
  
  formatting?: {
    unit?: string;
    decimal?: number;
  }
}

/**
 * Conditional aggregation property
 */
export interface AggregationProperty extends CalculationProperty {
  /**
   * The aggregate operation
   */
  operation: AggregationOperation
  /**
   * The measure name for aggregation
   */
  measure?: PropertyName
  /**
   * for TopPercent TopCount
   */
  value?: number
  /**
   * Filter members by compare aggregated measure to value:
   * ```sql
   * Filter(
   *  [Region].[Province].Members,
   *  [Measures].[Sales Amount] > 1000000
   * )
   *```
   */
  compare?: '>' | '<' | '=' | '<=' | '>=' | '!='
  /**
   * Aggregation dimensions of the calculation measure
   */
  aggregationDimensions: Array<Dimension>
  /**
   * Is using conditional dimension slicers
   */
  useConditionalAggregation?: boolean
  /**
   * Conditional slicers applied to aggregation
   */
  conditionalDimensions?: Array<Dimension>
  /**
   * Using exclusion operations with conditionalDimensions slicers
   */
  excludeConditions?: boolean
}

export enum CompareToEnum {
  CurrentMember = 'CurrentMember',
  // CurrentDate = 'CurrentDate',
  SelectedMember = 'SelectedMember',
  Lag = 'Lag',
  Lead = 'Lead',
  Parallel = 'Parallel',
  Ancestor = 'Ancestor'
}

export interface CompareToType {
  type: CompareToEnum
  value?: number | string
  slicer?: ISlicer
}

/**
 * Calculates the difference between a member and another specified member
 */
export interface VarianceMeasureProperty extends CalculationProperty {
  /**
   * The measure to compare
   */
  measure: Measure
  baseDimension: Dimension
  compareA: CompareToType
  toB: CompareToType

  /**
   * Set No data as Zero
   */
  asZero?: boolean
  /**
   * Whether it is a ratio
   */
  asPercentage?: boolean
  /**
   * Directly divide A / B
   */
  directDivide?: boolean
  /**
   * Take the absolute value of the denominator
   * `(A - B) / abs(B)`
   */
  absBaseValue?: boolean

  /**
   * A: `(A - B) / A`
   * B: `(A - B) / B`
   */
  divideBy?: 'A' | 'B'
}

/**
 * @deprecated use CubeParameterEnum
 */
export enum ParameterControlEnum {
  Input,
  Select,
  Dimensions
}

export enum CubeParameterEnum {
  Input = 'input',
  Select = 'select',
  Dimension = 'dimension'
}

// export interface ParameterControlProperty extends CalculationProperty {
//   paramType: ParameterControlEnum
//   value: PrimitiveType
//   availableMembers: Array<IMember>
// }

export interface MeasureControlProperty extends CalculationProperty {
  value: PrimitiveType

  allMeasures: boolean

  // Candidate members
  availableMembers: Array<IMember>
  displayBehaviour?: DisplayBehaviour
}

export const isCalculationProperty = (toBe): toBe is CalculationProperty =>
  !isNil((toBe as CalculationProperty)?.calculationType)

export const isCalculatedProperty = (toBe): toBe is CalculatedProperty =>
  isCalculationProperty(toBe) && toBe.calculationType === CalculationType.Calculated

export const isAggregationProperty = (toBe): toBe is AggregationProperty =>
  isCalculationProperty(toBe) && toBe.calculationType === CalculationType.Aggregation

export const isRestrictedMeasureProperty = (toBe): toBe is RestrictedMeasureProperty =>
  isCalculationProperty(toBe) && toBe.calculationType === CalculationType.Restricted

export const isVarianceMeasureProperty = (toBe): toBe is VarianceMeasureProperty =>
  isCalculationProperty(toBe) && toBe.calculationType === CalculationType.Variance

export const isMeasureControlProperty = (toBe): toBe is MeasureControlProperty =>
  isCalculationProperty(toBe) && toBe.calculationType === CalculationType.MeasureControl

export const isIndicatorMeasureProperty = (toBe): toBe is RestrictedMeasureProperty =>
  isCalculationProperty(toBe) && toBe.calculationType === CalculationType.Indicator

export const isParameterProperty = (toBe): toBe is ParameterProperty => !isNil(toBe?.paramType)
export const isCalendarProperty = (toBe) => toBe?.semantics?.semantic === Semantics.Calendar

export function getMeasurePropertyUnit(property: Property) {
  if (isVarianceMeasureProperty(property)) {
    if (property.asPercentage) {
      return '%'
    }
  }

  return (property as PropertyMeasure)?.formatting?.unit
}

export function parameterFormatter(name: string) {
  return `[@${name}]`
}

export function indicatorFormatter(name: string) {
  return `[#${name}]`
}

export const isCalculatedMember = (toBe): toBe is CalculatedMember =>
  (!isNil((toBe as CalculatedMember)?.dimension) || !isNil((toBe as CalculatedMember)?.hierarchy)) &&
  !isNil((toBe as CalculatedMember)?.formula)

export function formatCalculatedMemberName(member: CalculatedMember) {
  if (member.dimension === C_MEASURES) {
    return `[Measures].[${member.name}]`
  }
  return `${member.hierarchy || member.dimension}.[${member.name}]`
}
