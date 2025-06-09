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
  getMemberValue,
  getPropertyHierarchy,
  isAggregationProperty,
  isCalculatedProperty,
  isCalculationProperty,
  isIndicatorMeasureProperty,
  isMeasureControlProperty,
  isRestrictedMeasureProperty,
  isVarianceMeasureProperty,
  NamedSet,
  ParameterControlEnum,
  parameterFormatter,
  ParameterProperty,
  RestrictedMeasureProperty,
  VarianceMeasureProperty,
  compact, isEmpty, pick, isNil,
  measureFormatter,
  isVariableSlicer,
  convertSlicerToDimension
} from '@metad/ocap-core'
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
  Lag,
  Lead,
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
import { t } from 'i18next'

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
 * 1. 从 EntityType 的 CalculationProperty 中计算出依赖的计算字段, 这些字段可能不是来自于 Model 的 MDX CalculatedMembers, 所以需要单独计算
 * 2. 替换公式中的参数成实际值
 *
 * @param members
 * @param calculationProperties
 * @param formula
 */
export function addCalculatedMember(
  formula: string,
  members: Record<string, WithMemberType>,
  calculationProperties: Array<CalculationProperty>,
  parameters: Array<ParameterProperty>,
  slicers?: MDXHierarchyFilter[]
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
      // 这里先都去匹配一下
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
          slicers
        )
      }
    }
  })

  parameters?.forEach((property) => {
    if (formula.includes(`[@${property.name}]`)) {
      const parameter = serializeParameter(property)
      formula = formula.split(`[@${property.name}]`).join(parameter)
    }
  })

  return formula
}

/**
 * 从 MDX CalculatedMembers 中计算出依赖的计算成员
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
 * 对度量和含有成员的维度进行计算依赖的计算成员
 *
 * @param dimensions Measures or has members dimensions
 * @param entityType EntityType
 * @param filters 过滤器
 */
export function withCalculationMembers(
  members: Record<string, WithMemberType>,
  dimensions: Array<MDXProperty>,
  cube: Cube,
  entityType: EntityType,
  filters?: MDXHierarchyFilter[]
): Record<string, WithMemberType> {
  // 未来迁移到 schema cube CalculatedMember 中
  [...dimensions, ...(filters ?? [])].forEach((dimension) => {
    dimension.members?.forEach((member) => {
      const property = getEntityProperty(entityType, getMemberValue(member))
      if (isCalculationProperty(property)) {
        const formula = calculationPropertyToFormula(property, filters)

        // 其他的 CalculationProperty 非 MDX 计算成员
        if (formula) {
          const withMember = {
            name: getMemberValue(member),
            dimension: C_MEASURES,
            formula
          }
          members[formatCalculatedMemberName(withMember)] = withMember
        }
      } else if (!property?.rt) {
        const calculatedMember = cube?.calculatedMembers?.find(
          (item) => item.hierarchy === dimension.hierarchy && item.name === getMemberValue(member)
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

  // 添加依赖的计算成员
  const calculationProperties = Object.values(entityType.properties).filter(isCalculationProperty)

  Object.values(members).forEach((member) => {
    member.formula = addCalculatedMember(
      member.formula,
      members,
      calculationProperties,
      Object.values(entityType.parameters || {}),
      filters
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
  // 成员排序
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
 * 序列化条件聚合度量
 * 
 * @param property
 * @returns
 */
export function serializeAggregationProperty(property: AggregationProperty) {
  const aggregationDimensions = property.aggregationDimensions.map((dimension) => serializeMemberSet(dimension))

  let measure = measureFormatter(property.measure)
  // 限定条件?
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
    case AggregationOperation.COUNT:
      if (property.measure) {
        aggregationDimensions.push(`{${measureFormatter(property.measure)}}`)
      }
      
      return Count(Distinct(CrossjoinOperator(...aggregationDimensions)), true)
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
 * @todo 还需要实现 constantDimensions 条件
 *
 * @param property
 * @param filters
 * @returns
 */
export function serializeRestrictedMeasureProperty(property: RestrictedMeasureProperty, filters: MDXHierarchyFilter[]) {
  const dimensions = property.slicers ? property.slicers.filter((slicer) => !isVariableSlicer(slicer)).map(convertSlicerToDimension) :
    property.dimensions
  const contexts = dimensions?.map((item) => {
      const dimension = { ...item, members: item.members || [] }
      // 非常量选择或者有 name? 则合并 Context 上下文的过滤器
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
 * 序列化差值度量成计算公式
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
 * 将维度配置转换成 MDX 语句, 需要处理具有 `parameter` 参数的情况, 否则使用 `members` 固定值, 再否则使用维度的所有成员函数 {@link Members}
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

export function serializeParameter(parameter: ParameterProperty) {
  switch (parameter.paramType) {
    case ParameterControlEnum.Input:
      return `${parameter.value}`
    case ParameterControlEnum.Select:
      return isNil(parameter.value) ? parameter.members.map((member) => getMemberValue(member)).join(',') : parameter.value as string
    default: {
      const hierarchy = getPropertyHierarchy(parameter)
      return isEmpty(parameter.members)
        ? serializeDimensionMembers(parameter)
        : hierarchy ? MemberSet(...parameter.members.map((member) => wrapHierarchyValue(hierarchy, getMemberValue(member))))
         : parameter.members.map((member) => getMemberValue(member)).join(',')
    }
  }
}
