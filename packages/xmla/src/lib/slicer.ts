import {
  AdvancedSlicer,
  AdvancedSlicerOperator,
  CalculatedMember,
  convertSlicerToDimension,
  Cube,
  Dimension,
  getMemberValue,
  getPropertyName,
  ISlicer,
  isNil,
  measureFormatter,
  PrimitiveType
} from '@metad/ocap-core'
import { groupBy, isEmpty, uniq } from 'lodash'
import { WithMemberType } from './calculation'
import { mapMDXFilterToStatement, MDXHierarchyFilter, MDXProperty } from './filter'
import {
  Aggregate,
  Between,
  BottomCount,
  BottomPercent,
  BottomSum,
  Children,
  Crossjoin,
  CrossjoinOperator,
  CurrentMember,
  Descendants,
  DescendantsFlag,
  Equal,
  Except,
  Filter,
  Generate,
  GreaterEqual,
  GreaterThan,
  LessEqual,
  LessThan,
  Members,
  MemberSet,
  NotBetween,
  NotEqual,
  Order,
  TopCount,
  TopPercent,
  TopSum
} from './functions'
import { EngineAxis, MDXDialect, wrapHierarchyValue } from './types/index'
import { log } from './utils'

/**
 * dimensions:
 * `[A]`
 *
 * condition:
 * ```json
 * {
 *   path: [B]
 *   operator: 'TopCount',
 *   value: 10,
 *   members: [C]
 *   other: true
 * }
 * ```
 *
 * generate:
 * ```sql
 * WITH
 * SET [Top 10 Members] AS Generate([A], TopCount([A].CurrentMember*[B], 10, Measure))
 * MEMBER [B].[Other] AS Aggregate(Except([B], [Top 10 Members]))
 * SELECT
 * Order({[Top 10 Members], [A]*{[B].[Other]}}, [B]) ON ROWS
 * ```
 *
 * @param dimensions
 * @param condition
 * @returns
 */
export function generateTopCount(dimensions: Array<MDXProperty>, condition: AdvancedSlicer): EngineAxis {
  const { A, B } = splitQueryDimensionsAB(dimensions, condition)

  const topCountStatement = generateTopCountStatement(condition, A, B)

  if (condition.other) {
    const bSet = B.map((dimension) => `{${dimension.statement}}`)
    const aSet = A.map((item) => CurrentMember(item.hierarchy))

    const otherName = 'Other'
    const other = {
      name: otherName,
      // dimension: B?.[0].hierarchy,
      hierarchy: B?.[0].hierarchy,
      formula: Aggregate(Except(Crossjoin(...aSet, ...bSet), topCountStatement))
    } as CalculatedMember

    return {
      members: [other],
      statement: isEmpty(A)
        ? Order(
            `{${topCountStatement}, ${wrapHierarchyValue(B?.[0].hierarchy, otherName)}}`,
            `${CurrentMember(B?.[0].hierarchy)}.NAME`
          )
        : Order(
            MemberSet(
              Generate(generateCrossJoinStatement(A), topCountStatement),
              Generate(
                generateCrossJoinStatement(A),
                Crossjoin(...aSet, `{${wrapHierarchyValue(B?.[0].hierarchy, otherName)}}`)
              )
            ),
            `${aSet[0]}.NAME`
          )
    }
  }

  return {
    statement: isEmpty(A) ? topCountStatement : Generate(generateCrossJoinStatement(A), topCountStatement)
  }
}

/**
 * Divide the query dimensions at runtime into
 * - A: Not within the AdvancedSlicer restricted dimensions;
 * - B: In AdvancedSlicer restricted dimensions
 *
 * @param dimensions
 * @param condition
 * @returns
 */
export function splitQueryDimensionsAB(dimensions: Array<MDXProperty>, condition: AdvancedSlicer) {
  const A = dimensions.filter((value) => !condition.context?.find((item) => getPropertyName(item) === value.dimension))
  const B = dimensions.filter((value) => condition.context?.find((item) => getPropertyName(item) === value.dimension))
  return {
    A,
    B
  }
}

/**
 * `Generate(A, TopCount(A.CurrentMember*B, 10, Measure))`
 */
export function generateTopCountStatement(
  condition: AdvancedSlicer,
  A: Array<MDXProperty>,
  B: Array<MDXProperty>
): string {
  const measure = measureFormatter(condition.measure)

  const bSet = B.map((dimension) => `{${dimension.statement}}`)
  const aSet = A.map((item) => CurrentMember(item.hierarchy))

  let Operator = null
  let relationalOperator = null
  let value: PrimitiveType | PrimitiveType[] = condition.value[0]
  switch (condition.operator) {
    case AdvancedSlicerOperator.TopCount:
      Operator = TopCount
      break
    case AdvancedSlicerOperator.TopPercent:
      Operator = TopPercent
      break
    case AdvancedSlicerOperator.TopSum:
      Operator = TopSum
      break
    case AdvancedSlicerOperator.BottomCount:
      Operator = BottomCount
      break
    case AdvancedSlicerOperator.BottomPercent:
      Operator = BottomPercent
      break
    case AdvancedSlicerOperator.BottomSum:
      Operator = BottomSum
      break
    // Relational Operators
    case AdvancedSlicerOperator.Equal:
      relationalOperator = Equal
      break
    case AdvancedSlicerOperator.NotEqual:
      relationalOperator = NotEqual
      break
    case AdvancedSlicerOperator.GreaterThan:
      relationalOperator = GreaterThan
      break
    case AdvancedSlicerOperator.GreaterEqual:
      relationalOperator = GreaterEqual
      break
    case AdvancedSlicerOperator.LessThan:
      relationalOperator = LessThan
      break
    case AdvancedSlicerOperator.LessEqual:
      relationalOperator = LessEqual
      break
    case AdvancedSlicerOperator.Between:
      relationalOperator = Between
      value = condition.value
      break
    case AdvancedSlicerOperator.NotBetween:
      relationalOperator = NotBetween
      value = condition.value
      break
    default:
      // Operator = TopCount
      break
  }

  if (relationalOperator) {
    return isEmpty(A)
      ? Filter(bSet.length > 1 ? Crossjoin(...bSet) : bSet[0], relationalOperator(measure, value))
      : Filter(Crossjoin(...aSet, ...bSet), relationalOperator(measure, value))
  }

  if (Operator) {
    return isEmpty(A)
      ? Operator(bSet.length > 1 ? Crossjoin(...bSet) : bSet[0], value, measure)
      : Operator(Crossjoin(...aSet, ...bSet), value, measure)
  }

  return 'Not Implemented'
}

export function generateCrossJoinStatement(dimensions: Array<MDXProperty>) {
  return dimensions.length > 1
    ? CrossjoinOperator(...dimensions.map((dimension) => `{${dimension.statement}}`))
    : `${dimensions[0].statement}`
}

export function generateSlicersStatement(slicers: Array<MDXHierarchyFilter>, cube: Cube, withMembers: Record<string, WithMemberType>, dialect?: MDXDialect) {
  // groupby dimension
  const dimSlicerFilters = groupBy(slicers, 'dimension')

  const statement = Object.keys(dimSlicerFilters)
    .map((dimension) => {
      log(`generateSlicersStatement: `)
      log(`slicers: `, dimSlicerFilters[dimension])
      const slicerStatements = dimSlicerFilters[dimension].map((item) => mapMDXFilterToStatement(item, cube, withMembers, dialect))
      log(`slicerStatements: `, slicerStatements)
      //@todo Just simply remove the duplicate
      return uniq(slicerStatements).join(',')
    })
    .map((item) => `{${item}}`)
    .join('*')

  // if (!isEmpty(advancedFilters)) {
  //   statement = `${statement ? statement + '*' : ''}${advancedFilters.map((item) => `{${item}}`).join('*')}`
  // }

  return statement
}

export function serializeSlicer(slicer: ISlicer) {
  return serializeDimension(convertSlicerToDimension(slicer))
}

export function serializeDimension({dimension, hierarchy, level, exclude, members, displayHierarchy}: Dimension) {
  if (!dimension || !members?.length) {
    return ''
  }

  hierarchy = hierarchy || dimension

  const memberSet = MemberSet(
    ...members
      .filter((member) => !isNil(getMemberValue(member)))
      .map((member) => wrapHierarchyValue(hierarchy, getMemberValue(member)))
  )

  let hierarchySet = Children(hierarchy)
  if (displayHierarchy && level) {
    hierarchySet = Descendants(hierarchy, level, DescendantsFlag.SELF_AND_BEFORE)
  } else if (level) {
    hierarchySet = Members(level)
  }
  
  return exclude ? Except(hierarchySet, memberSet) : memberSet
}