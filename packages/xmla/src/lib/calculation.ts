import {
  AggregationOperation,
  AggregationProperty,
  CalculatedMember,
  CalculationProperty,
  CompareToEnum,
  Cube,
  C_MEASURES,
  Dimension,
  EntityType,
  formatCalculatedMemberName,
  getEntityProperty,
  getPropertyHierarchy,
  isAggregationProperty,
  isCalculatedProperty,
  isCalculationProperty,
  isIndicatorMeasureProperty,
  isMeasureControlProperty,
  isRestrictedMeasureProperty,
  isVarianceMeasureProperty,
  NamedSet,
  parameterFormatter,
  ParameterProperty,
  RestrictedMeasureProperty,
  VarianceMeasureProperty,
  compact, isEmpty, pick, isNil,
  measureFormatter,
  isVariableSlicer,
  convertSlicerToDimension,
  CubeParameterEnum,
  getMemberKey
} from '@metad/ocap-core'
import { t } from 'i18next'
import { MDXHierarchyFilter, MDXProperty } from './filter'
import {
  Abs,
  Aggregate,
  Ancestor,
  Avg,
  CoalesceEmpty,
  Count,
  CrossjoinOperator,
  CurrentMember,
  Distinct,
  Divide,
  Except,
  Filter,
  Lag,
  Lead,
  LogicalExpression,
  Max,
  Median,
  Members,
  MemberSet,
  Min,
  ParallelPeriod,
  Parenthesis,
  Stdev,
  StdevP,
  Subtract,
  Sum,
  TopCount,
  TopPercent,
  TopSum,
  Tuple
} from './functions'
import { serializeDimension, serializeSlicer } from './slicer'
import { wrapHierarchyValue } from './types/index'


export type WithMemberType = CalculatedMember | NamedSet

export function calculationPropertyToFormula(property: CalculationProperty, slicers?: MDXHierarchyFilter[]) {
  let formula: string
  if (isCalculatedProperty(property)) {
    // Checks
    if (!property.formula) {
      throw new Error(t('Error.FormulaEmpty', {ns: 'xmla', name: property.name}))
    }
    formula = property.formula
  } else if (isAggregationProperty(property)) {
    formula = serializeAggregationProperty(property)
  } else if (isRestrictedMeasureProperty(property)) {
    formula = serializeRestrictedMeasureProperty(property, slicers)
  } else if (isIndicatorMeasureProperty(property)) {
    formula = serializeRestrictedMeasureProperty(property, slicers)
  } else if (isVarianceMeasureProperty(property)) {
    formula = serializeVarianceMeasureProperty(property)
  } else if (isMeasureControlProperty(property)) {
    formula = measureFormatter(property.value as string)
  } else {
    throw new Error(
      t('Error.UnCalculationType', {ns: 'xmla', name: property.name, calculationType: property.calculationType})
    )
  }

  return formula
}

/**
 * 1. Calculate dependent calculated fields from the CalculationProperty of EntityType. These fields may not come from the MDX CalculatedMembers of the Model, so they need to be calculated separately.
 * 2. Replace the parameters in the formula with actual values
 *
 * @param members
 * @param calculationProperties
 * @param formula
 * @param values Actual values of parameters
 */
export function addCalculatedMember(
  formula: string,
  members: Record<string, WithMemberType>,
  calculationProperties: Array<CalculationProperty>,
  parameters: Array<ParameterProperty>,
  slicers?: MDXHierarchyFilter[],
  values?: Record<string, any>
) {
  calculationProperties.forEach((property) => {
    if (!members[property.name]) {
      if (isMeasureControlProperty(property)) {
        if (formula.includes(`[@${property.name}]`)) {
          formula = formula.split(`[@${property.name}]`).join(measureFormatter(property.value as string))
        }
        // else if (formula.includes(measureFormatter(property.name))) {
        //   formula = formula.split(measureFormatter(property.name)).join(measureFormatter(property.value as string))
        // }
      }
      // else if (isParameterControlProperty(property) ) {
      //   if (formula.includes(`[@${property.name}]`)) {
      //     formula = formula.split(`[@${property.name}]`).join(property.value as string)
      //   } else if (formula.includes(measureFormatter(property.name))) {
      //     formula = formula.split(measureFormatter(property.name)).join(property.value as string)
      //   }
      // }
      // else if (formula.includes(measureFormatter(property.name))) {
      // Measure control property 目前属于 calculation measure 应该使用 measureFormatter 来匹配为什么要用参数的 [@name] 来匹配 ？
      // Let’s match them here first.
      if (formula.includes(measureFormatter(property.name))) {
        const member = {
          name: property.name,
          dimension: C_MEASURES,
          formula: null
        }
        const memberName = formatCalculatedMemberName(member)
        members[memberName] = member
        members[memberName].formula = addCalculatedMember(
          calculationPropertyToFormula(property, slicers),
          members,
          calculationProperties,
          parameters,
          slicers,
          values
        )
      }
    }
  })

  parameters?.forEach((property) => {
    if (formula.includes(`[@${property.name}]`)) {
      const parameter = serializeParameter(property, values)
      formula = formula.split(`[@${property.name}]`).join(parameter)
    }
  })

  return formula
}

/**
 * Calculate dependent calculated members from MDX CalculatedMembers
 *
 * @param members
 * @param calculatedMembers
 * @param formula
 */
export function addDependCalculatedMember(
  members: Record<string, WithMemberType>,
  calculatedMembers: CalculatedMember[],
  formula: string
) {
  calculatedMembers?.forEach((calculatedMember) => {
    const name = formatCalculatedMemberName(calculatedMember)
    if (!members[name]) {
      if (formula.includes(name)) {
        members[name] = calculatedMember
        addDependCalculatedMember(members, calculatedMembers, calculatedMember.formula)
      }
    }
  })
}

/**
 * Calculated members that make calculations dependent on measures and dimensions that contain members
 *
 * @param dimensions Measures or has members dimensions
 * @param entityType EntityType
 * @param filters Filters
 */
export function withCalculationMembers(
  members: Record<string, WithMemberType>,
  dimensions: Array<MDXProperty>,
  cube: Cube,
  entityType: EntityType,
  filters?: MDXHierarchyFilter[],
  values?: Record<string, any>
): Record<string, WithMemberType> {
  // 未来迁移到 schema cube CalculatedMember 中
  [...dimensions, ...(filters ?? [])].forEach((dimension) => {
    dimension.members?.forEach((member) => {
      const property = getEntityProperty(entityType, getMemberKey(member))
      if (isCalculationProperty(property)) {
        const formula = calculationPropertyToFormula(property, filters)

        // Other CalculationProperty non-MDX calculated members
        if (formula) {
          const withMember = {
            name: getMemberKey(member),
            dimension: C_MEASURES,
            formula
          }
          members[formatCalculatedMemberName(withMember)] = withMember
        }
      } else if (!property?.rt) {
        const calculatedMember = cube?.calculatedMembers?.find(
          (item) => item.hierarchy === dimension.hierarchy && item.name === getMemberKey(member)
        )
        if (calculatedMember) {
          members[formatCalculatedMemberName(calculatedMember)] = pick(calculatedMember,
            'name',
            'dimension',
            'hierarchy',
            'formula'
          ) as CalculatedMember
        }
      }
    })
  })

  // Adding dependent calculated members
  const calculationProperties = Object.values(entityType.properties).filter(isCalculationProperty)

  Object.values(members).forEach((member) => {
    member.formula = addCalculatedMember(
      member.formula,
      members,
      calculationProperties,
      Object.values(entityType.parameters || {}),
      filters,
      values
    )
    /**
     * @todo calculatedMembers from cube
     */
    // addDependCalculatedMember(members, entityType.cube?.calculatedMembers, member.formula)
  })

  return members

  // TODO NamedSet 还没有支持
  // Object.keys(entityType.properties).forEach((key) => {
  //   const property = entityType.properties[key]
  //   if (isCalculationProperty(property) && !members[key]) {
  //     // 移至上一段代码
  //     // // Measures 计算成员
  //     // const value = Object.values(members).find((value: any) => value.formula.includes(measureFormatter(key)))
  //     // if (value && isCalculatedProperty(property)) {
  //     //   const member = {
  //     //     name: key,
  //     //     dimension: 'Measures',
  //     //     formula: property.formula
  //     //   }
  //     //   members[MDX.formatCalculatedMemberName(member)] = member
  //     // }
  //   } else if(!isEmpty(property.members)) {
  //     // dimension 计算成员
  //     property.members.forEach(item => {
  //       const member = {
  //         name: item.name,
  //         dimension: property.name,
  //         formula: item.formula
  //       }
  //       const value = Object.values(members).find((value: any) => value.formula.includes(MDX.formatCalculatedMemberName(member)))
  //       if (value) {
  //         members[MDX.formatCalculatedMemberName(member)] = member
  //       }
  //     })
  //   }
  // })
}

export function sortWithMembers(members: Record<string, WithMemberType>): Array<WithMemberType> {
  // Member Sorting
  const sortMembers = []
  Object.keys(members).forEach((key) => {
    const index = sortMembers.findIndex((item) => item.formula.includes(key))
    if (index > -1) {
      sortMembers.splice(index, 0, members[key])
    } else {
      sortMembers.push(members[key])
    }
  })

  return sortMembers
}

/**
 * Serialized Conditional Aggregation Metrics
 * 
 * @param property
 * @returns
 */
export function serializeAggregationProperty(property: AggregationProperty) {
  if (isEmpty(property.aggregationDimensions)) {
    throw new Error(t('Error.AggregationDimensionsEmpty', {ns: 'xmla', name: property.name}))
  }
  const aggregationDimensions = property.aggregationDimensions.map((dimension) => serializeMemberSet(dimension))

  let measure = measureFormatter(property.measure)
  // Conditional filters?
  if (property.useConditionalAggregation && !isEmpty(property.conditionalDimensions)) {
    measure = Aggregate(
      CrossjoinOperator(
        ...property.conditionalDimensions.map((dimension) => {
          const memberSet = serializeMemberSet(dimension)
          if (property.excludeConditions) {
            return Except(serializeMemberSet(dimension), memberSet)
          }
          return memberSet
        })
      ),
      measure
    )
  }

  switch (property.operation) {
    case AggregationOperation.SUM:
      return Sum(CrossjoinOperator(...aggregationDimensions), measure)
    case AggregationOperation.COUNT: {
      let memberSet = CrossjoinOperator(...aggregationDimensions)
      if (property.measure) {
        if (!property.compare) {
          throw new Error(t('Error.AggregationCompareEmpty', {ns: 'xmla', name: property.name}))
        }
        if (isNil(property.value)) {
          throw new Error(t('Error.AggregationValueEmpty', {ns: 'xmla', name: property.name}))
        }
        memberSet = Filter(memberSet, LogicalExpression(measureFormatter(property.measure), property.compare, property.value))
      }
      return Count(Distinct(memberSet), true)
    }
    case AggregationOperation.MIN:
      return Min(CrossjoinOperator(...aggregationDimensions), measure)
    case AggregationOperation.MAX:
      return Max(CrossjoinOperator(...aggregationDimensions), measure)
    case AggregationOperation.AVERAGE:
      return Avg(CrossjoinOperator(...aggregationDimensions), measure)
    case AggregationOperation.STDEV:
      return Stdev(CrossjoinOperator(...aggregationDimensions), measure)
    case AggregationOperation.STDEVP:
      return StdevP(CrossjoinOperator(...aggregationDimensions), measure)
    case AggregationOperation.MEDIAN:
      return Median(CrossjoinOperator(...aggregationDimensions), measure)
    case AggregationOperation.TOP_PERCENT:
      return Aggregate(TopPercent(CrossjoinOperator(...aggregationDimensions), property.value, measure), measure)
    case AggregationOperation.TOP_COUNT:
      return Aggregate(TopCount(CrossjoinOperator(...aggregationDimensions), property.value, measure), measure)
    case AggregationOperation.TOP_SUM:
        return Aggregate(TopSum(CrossjoinOperator(...aggregationDimensions), property.value, measure), measure)
    default:
      throw new Error(`The operation '${property.operation}' for conditional aggregation is not implemented!`)
  }
}

/**
 * @todo also need to implement the constantDimensions condition
 *
 * @param property
 * @param filters
 * @returns
 */
export function serializeRestrictedMeasureProperty(property: RestrictedMeasureProperty, filters: MDXHierarchyFilter[]) {
  const dimensions = property.slicers?.filter((slicer) => !isVariableSlicer(slicer)).map(convertSlicerToDimension)
    // property.dimensions
  const contexts = dimensions?.map((item) => {
      const dimension = { ...item, members: item.members || [] }
      // If it is not a constant selection or has a name?, the filter of the context context is merged.
      if (dimension.name || !property.enableConstantSelection) {
        filters
          ?.filter((item) => item.name === dimension.name || item.dimension === dimension.dimension)
          .forEach((item) => {
            dimension.members = item.members
          })
        dimension.members = compact(dimension.members)
      }
      return serializeMemberSet(dimension)
    })

  return isEmpty(contexts)
    ? measureFormatter(property.measure)
    : Aggregate(CrossjoinOperator(...contexts), measureFormatter(property.measure))
}

/**
 * Serializes the variance measure into a calculation formula
 *
 * @param property
 * @returns
 */
export function serializeVarianceMeasureProperty(property: VarianceMeasureProperty) {
  const measure = measureFormatter(property.measure.measure)

  let compareA = null
  switch (property.compareA.type) {
    case CompareToEnum.SelectedMember:
      compareA = serializeSlicer(property.compareA.slicer)
      break
    case CompareToEnum.CurrentMember:
    default:
      compareA = CurrentMember(getPropertyHierarchy(property.baseDimension))
  }
  compareA = Aggregate(compareA, measure)

  let toB = null
  switch (property.toB.type) {
    case CompareToEnum.Parallel:
      if (!property.baseDimension.level) {
        throw new Error(`Parallel variance need base dimension's level`)
      }
      toB = ParallelPeriod(
        property.baseDimension.level,
        property.toB.value as number,
        CurrentMember(getPropertyHierarchy(property.baseDimension))
      )
      break
    case CompareToEnum.Lag:
      toB = Lag(CurrentMember(getPropertyHierarchy(property.baseDimension)), property.toB.value as number)
      break
    case CompareToEnum.Lead:
      toB = Lead(CurrentMember(getPropertyHierarchy(property.baseDimension)), property.toB.value as number)
      break
    case CompareToEnum.Ancestor:
      toB = Ancestor(CurrentMember(getPropertyHierarchy(property.baseDimension)), property.baseDimension.level)
      break
    case CompareToEnum.SelectedMember: {
      const hierarchy = getPropertyHierarchy(property.baseDimension)
      if (!property.toB.value) {
        throw new Error(`Variance toB type SelectedMember need a member`)
      }
      toB = wrapHierarchyValue(hierarchy, property.toB.value as string)
      break
    }
    case CompareToEnum.CurrentMember:
      toB = CurrentMember(getPropertyHierarchy(property.baseDimension))
      break
    default:
      throw new Error(`Variance toB type '${property.toB.type}' not supported`)
  }

  toB = Tuple(toB, measure)

  const variance = Parenthesis(Subtract(compareA, toB))

  if (property.asPercentage) {
    let ratio = Divide(variance, toB)
    if (property.directDivide) {
      ratio = Divide(compareA, toB)
    } else if (property.divideBy === 'A') {
      if (property.absBaseValue) {
        ratio = Divide(variance, Abs(CoalesceEmpty(compareA, toB)))
      } else {
        ratio = Divide(variance, CoalesceEmpty(compareA, toB))
      }
    } else {
      // Default divide by toB
      if (property.absBaseValue) {
        ratio = Divide(variance, Abs(CoalesceEmpty(toB, compareA)))
      } else {
        ratio = Divide(variance, CoalesceEmpty(toB, compareA))
      }
    }

    // ratio = `${ratio}, FORMAT_STRING = 'Percent'` 不需要

    return ratio
  }

  return variance
}

/**
 * Convert dimension configuration to MDX statements. You need to handle the case where `parameter` is used.
 * Otherwise, use `members` fixed value. Otherwise, use all member functions of the dimension. {@link Members}
 *
 * @param dimension
 * @returns
 */
export function serializeMemberSet(dimension: Dimension) {
  if (dimension.parameter) {
    return parameterFormatter(dimension.parameter)
  } else if (!isEmpty(dimension.members)) {
    return serializeDimension(dimension)
  }
  return serializeDimensionMembers(dimension)
}

export function serializeDimensionMembers(dimension: Dimension): string {
  if (dimension.level) {
    return Members(dimension.level)
  }

  return Members(dimension.hierarchy || dimension.dimension)
}

/**
 * Serialize parameter value based on parameter definitions and actual values
 * 
 * @param parameter
 * @param values 
 * @returns value string
 */
export function serializeParameter(parameter: ParameterProperty, values: Record<string, any>) {
  switch (parameter.paramType) {
    case CubeParameterEnum.Input:
      return values?.[parameter.name] ? `${values[parameter.name]}` : `${parameter.value}`
    case CubeParameterEnum.Select: {
      const value = values?.[parameter.name] ? values[parameter.name] : parameter.value
      if (!isNil(value)) {
        return Array.isArray(value) ? value.map((member) => getMemberKey(member)).join(',') : value
      }
      return isNil(parameter.value) ? parameter.members.map((member) => getMemberKey(member)).join(',') : parameter.value as string
    }
    default: {
      if (values?.[parameter.name]) {
        return MemberSet(...values[parameter.name].map((member) => 
          wrapHierarchyValue(parameter.hierarchy || parameter.dimension, getMemberKey(member))
        ))
      }
      const hierarchy = getPropertyHierarchy(parameter)
      return isEmpty(parameter.members)
        ? serializeDimensionMembers(parameter)
        : hierarchy ? MemberSet(...parameter.members.map((member) => wrapHierarchyValue(hierarchy, getMemberKey(member))))
         : parameter.members.map((member) => getMemberKey(member)).join(',')
    }
  }
}
