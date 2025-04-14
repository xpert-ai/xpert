import {
  AdvancedSlicer,
  C_MEASURES,
  Dimension,
  EntityType,
  getEntityHierarchy,
  getMemberValue,
  isCalculationProperty,
  CalculatedMember,
  isCalculatedMember,
  NamedSet,
  formatCalculatedMemberName,
  isEmpty,
  measureFormatter,
  getMemberKey
} from '@metad/ocap-core'
import { addCalculatedMember, sortWithMembers, withCalculationMembers } from './calculation'
import { MDXHierarchyFilter, MDXProperty } from './filter'
import { BottomCount, CurrentMemberProperties, DimensionProperties, Filter, Order, OrderFlag, TopCount } from './functions'
import { IntrinsicMemberProperties } from './reference'
import { mapHierarchyFilterToSAPVariable, SAPVariableParameter, serializeSAPVariables } from './sap'
import { generateSlicersStatement, generateTopCount } from './slicer'
import {
  EngineAxis,
  getQueryDefaultMeasure,
  MDXDialect,
  MDXQuery,
  MDXRank,
} from './types/index'
import { log } from './utils'

/**
 * 将 MDXQuery 生成相应的 MDX 语句
 */
export function generateMDXStatement(query: MDXQuery, entityType: EntityType, dialect?: MDXDialect) {
  let mdx = 'SELECT\n'

  // 只针对图形情况, AdvancedSlicer AdvancedFilters 只放在行上, 其他情况暂未支持
  const cols = generateAxisStatement(query.columns)
  const rows = generateAxisStatement(query.rows, query.conditions, query.advancedFilters)

  const calculationMembers = query.withMembers ?? {}
  cols.members.forEach((member) => {
    calculationMembers[member.name] = member
  })
  rows.members.forEach((member) => {
    calculationMembers[member.name] = member
  })

  // calculated members
  // 对于 Measures 和有指定 members 的维度要检查其成员是否为计算成员, 需要加到 with member 里
  const members = withCalculationMembers(
    calculationMembers,
    [...query.rows, ...query.columns].filter((item) => !isEmpty(item.members)),
    query.cube,
    entityType,
    query.slicers
  )

  // Add order measure before add calculated members
  if (rows.statement) {
    rows.statement = serializeOrderRank(rows, query.orderbys, query.rank, getQueryDefaultMeasure(query))
  }

  // 添加依赖的计算成员
  const calculationProperties = Object.values(entityType.properties).filter(isCalculationProperty)
  const parameters = Object.values(entityType.parameters || {})
  rows.statement = addCalculatedMember(rows.statement, members, calculationProperties, parameters, query.slicers)
  cols.statement = addCalculatedMember(cols.statement, members, calculationProperties, parameters, query.slicers)

  cols.statement = serializeDimensionProperties(query.columns, cols.statement, entityType)

  if (rows.statement) {
    // rows.statement = serializeOrderRank(rows, query.orderbys, query.rank, getQueryDefaultMeasure(query))
    rows.statement = serializeDimensionProperties(query.rows, rows.statement, entityType)
    // COLUMNS 轴不能为空
    mdx += `non empty ${cols.statement || '{}'} ON COLUMNS,\n${rows.zeroSuppression ? 'non empty ' : ''}${
      rows.statement
    }\nON ROWS`
  } else {
    mdx += `non empty ${cols.statement || '{}'} ON COLUMNS`
  }

  mdx += `\nFROM [${query.entity}]`

  if (query.slicers?.length) {
    mdx += `\nWHERE (${generateSlicersStatement(query.slicers, entityType.cube, members, dialect)})`
  }
  if (query.variables?.length) {
    // 先 Hardcode SAP VARIABLES
    mdx += `\nSAP VARIABLES ${generateVariablesStatement(query.variables)}`
  }

  // for SAP Variables
  if (entityType.dialect === MDXDialect.SAPBW) {
    const sapVariables = Object.values(entityType.parameters ?? {}).filter((parameter: SAPVariableParameter) => parameter.variableName && parameter.value)
    if (sapVariables.length) {
      mdx += `\nSAP VARIABLES ${serializeSAPVariables(sapVariables)}`
    }
  }

  // const members = [...(query.members || []), ...rows.members, ...cols.members]

  const sortedMembers = sortWithMembers(members)
  if (!isEmpty(sortedMembers)) {
    let withMembers = ''
    sortedMembers.forEach((member: CalculatedMember | NamedSet) => {
      if (isCalculatedMember(member)) {
        withMembers = `${withMembers}\nMEMBER ${formatCalculatedMemberName(member)} AS ${
          member.formula
        }`
      } else {
        // is NamedSet
        withMembers = `${withMembers}\nSET ${member.name} AS ${member.formula || member.Formula[0]}`
      }
    })
    mdx = `WITH ${withMembers}\n${mdx}`
  }

  log(`mdx: `, mdx)

  return mdx
}

/**
 * 将行或者列轴上已生成的字段语句合并上高级切片器
 * 
 * @param dimensions 
 * @param conditions 
 * @returns 
 */
export function generateAxisStatement(dimensions: Array<MDXProperty>, conditions?: Array<AdvancedSlicer>, advancedFilters?: string[]): EngineAxis {
  let statement = ''
  const zeroSuppression = !!dimensions.find((dimension) => dimension.zeroSuppression)
  const _members = []
  // 如果有 AdvancedSlicer 的情况下所有维度都统一到 generateTopCount 函数里去计算
  if (conditions?.length) {
    // 暂时只支持一个 AdvancedSlicer
    const { statement: _statement, members } = generateTopCount(dimensions.filter(({dimension}) => dimension !== C_MEASURES), conditions[0])
    if (members) {
      _members.push(...members)
    }
    statement = _statement
  } else {
    dimensions?.forEach((dimension) => {
      if (dimension.dimension === C_MEASURES) {
        // for Measures
        const measures = dimension.members?.map(getMemberKey).map(measureFormatter).join(', ') || `[${C_MEASURES}]`
        // console.log(measures, dimension)
        statement = statement ? `${statement}*{${measures}}` : `{${measures}}`
      } else {
        const column = `{${dimension.statement}}`
        // for Dimension
        statement = statement ? `${statement}*${column}` : `${column}`
      }
    })
  }

  // At the and Filter by advancedFilters
  advancedFilters?.forEach(advancedFilter => {
    statement = Filter(statement, advancedFilter)
  })

  return { statement, members: _members, zeroSuppression }
}

export function generateVariablesStatement(variables: Array<MDXHierarchyFilter>) {
  let variablesStatement = ''
  const variableGroup = {}
  variables.forEach((slicer) => {
    const varName = slicer.parameter
    variableGroup[varName] = variableGroup[varName] || []
    variableGroup[varName].push(slicer)
  })

  Object.keys(variableGroup).forEach((name) => {
    const variables: Array<MDXHierarchyFilter> = variableGroup[name]
    variablesStatement = `${variablesStatement}\n${variables
      .map((value) => mapHierarchyFilterToSAPVariable(name, value).join(' '))
      .join(' ')}`
  })

  return variablesStatement
}

/**
 * 对整个轴语句进行 order rank 封装
 *
 * @param statement Axis 语句
 * @param orderbys 排序
 * @param rank 排名
 */
export function serializeOrderRank(axis: EngineAxis,
  orderbys: Array<MDXProperty>,
  rank: [MDXRank, number],
  measure: string
) {
  let { statement } = axis
  if (!isEmpty(orderbys)) {
    // 1. 先排序
    statement = serializeOrder(statement, orderbys)

    if (rank) {
      // 要获取整个 query 默认的 measure
      if (rank[0] === MDXRank.Top) {
        statement = TopCount(statement, rank[1]) //`TopCount(\n${statement},\n${rank[1]})`
      } else {
        statement = BottomCount(statement, rank[1]) // `BottomCount(\n${statement},\n${rank[1]})`
      }
    }
  } else if (rank) {
    // 要获取整个 query 默认的 measure
    if (rank[0] === MDXRank.Top) {
      statement = TopCount(statement, rank[1]) //`TopCount(\n${statement},\n${rank[1]},\n${measureFormatter(measure)})`
    } else {
      statement = BottomCount(statement, rank[1], measureFormatter(measure)) // `BottomCount(\n${statement},\n${rank[1]},\n${measureFormatter(measure)})`
    }
  }

  return statement
}

/**
 * serialize Order function
 * 
 * @param statement 
 * @param orderbys 
 * @returns 
 */
export function serializeOrder(statement: string, orderbys: Array<MDXProperty>) {
  orderbys?.forEach(({ dimension, hierarchy, members, order }) => {
    order = order === OrderFlag.DESC ? OrderFlag.BDESC : order === OrderFlag.ASC ? OrderFlag.BASC : order
    if (dimension === C_MEASURES) {
      statement = Order(statement, measureFormatter(getMemberValue(members[0])), order)
    } else {
      // statement = Order(statement, Ordinal(CurrentMember(dimension)), order)
      // Order({[Department]}, [Department].CurrentMember.Ordinal, BDESC) to Order({[Department]}, [Department].CurrentMember.Properties("MEMBER_ORDINAL"), BDESC)
      statement = Order(statement, CurrentMemberProperties(hierarchy, IntrinsicMemberProperties[IntrinsicMemberProperties.MEMBER_ORDINAL]), order)
    }
  })

  return statement
}

/**
 * for MDX 'DIMENSION PROPERTIES'
 *
 * @param dimensions 轴维度们
 * @param statement 拼装好的轴语句
 *
 * @returns 轴语句加上 DIMENSION PROPERTIES
 */
export function serializeDimensionProperties(
  dimensions: Array<MDXProperty>,
  statement: string,
  entityType: EntityType
) {
  const properties = []
  dimensions
    ?.filter((item) => item.properties?.length)
    .forEach((item) => {
      const hierarchy = getEntityHierarchy(entityType, item as Dimension)
      properties.push(
        ...item.properties.map((propertyName) => {
          if (IntrinsicMemberProperties[propertyName]) {
            return propertyName
          } else {
            hierarchy?.levels?.find((level) => {
              const prop = level.properties?.find((prop) => prop.name === propertyName)
              if (prop) {
                propertyName = prop.uniqueName || propertyName
              }
            })

            return propertyName
          }
        })
      )
    })

  if (!isEmpty(properties)) {
    statement = `${statement}\n${DimensionProperties(properties)}`
  }

  return statement
}
