import {
  Dimension,
  Drill,
  EntityType,
  FilteringLogic,
  getPropertyHierarchy,
  IAdvancedFilter,
  isAdvancedFilter,
  isFilter,
  ISlicer,
  isSlicer,
  Measure,
  FilterOperator,
  IFilter,
  Cube,
  formatCalculatedMemberName,
  CalculatedMember,
  pick,
  getMemberKey,
} from '@metad/ocap-core'
import { flatten, includes, isArray, isNil } from 'lodash'
import { WithMemberType } from './calculation'
import {
  AND,
  Children,
  CurrentMember,
  Descendants,
  DescendantsFlag,
  Except,
  Filter,
  InStr,
  IS,
  MemberSet,
  NOT,
  OR,
  Parenthesis
} from './functions'
import { serializeSlicer } from './slicer'
import { MDXDialect, wrapHierarchyValue } from './types/index'

export interface MDXProperty extends Partial<Dimension & Measure> {
  order?: any // OrderFlag
  defaultMember?: string
  allMember?: string
  statement?: string
}

export interface MDXHierarchyFilter extends MDXProperty, Omit<Omit<Omit<IFilter, 'dimension'>, 'members'>, 'distance'> {
  distance?: string | number
}

export function convertMDXQueryHierarchyToString(hierarchy: MDXProperty) {
  if (hierarchy.level) {
    return `${hierarchy.hierarchy}.${hierarchy.level}`
  }
  if (hierarchy.hierarchy) {
    // TODO
  }
  return ''
}

/**
 * 将 Hierarchy filter 拼接成 MDX 语句中使用的形式
 */
export function mapMDXFilterToStatement(oFilter: MDXHierarchyFilter, cube: Cube, withMembers: Record<string, WithMemberType>, dialect?: MDXDialect): string {
  // SAP BW 系统格式为 `[hierarchy].[value]` 而 Mondrian 中格式为 `[hierarchy].[level].[value]`, 不知道有没有其他设置可以消除差异?
  const path = dialect === MDXDialect.SAPBW ? oFilter.hierarchy : /*oFilter.level ||*/ oFilter.hierarchy
  switch (oFilter.operator) {
    case FilterOperator.BT:
      if (isArray(oFilter.members)) {
        return oFilter.members.slice(0,2).map((member) => wrapHierarchyValue(path, getMemberKey(member))).join(':')
      }
      break
    case FilterOperator.NE:
      // 会不会出现 hierarchy 没有 [All] 成员的情况
      // 用 Children 和 Members 的区别
      return Except(Children(oFilter.hierarchy), MemberSet(...oFilter.members.map((member) => wrapHierarchyValue(path, getMemberKey(member)))))
    case FilterOperator.Contains:
      if (includes(oFilter.properties, 'MEMBER_CAPTION')) {
        return Filter(
          oFilter.hierarchy,
          `${InStr(`${oFilter.hierarchy}.CURRENTMEMBER.MEMBER_CAPTION`, `"${getMemberKey(oFilter.members[0])}"`)} > 0`
        )
      }
      // 默认也是取 Caption 符合搜索条件
      return Filter(
        oFilter.hierarchy,
        `${InStr(`${oFilter.hierarchy}.CURRENTMEMBER.MEMBER_CAPTION`, `"${getMemberKey(oFilter.members[0])}"`)} > 0`
        // `InStr(${oFilter.hierarchy}.CURRENTMEMBER.MEMBER_CAPTION, "${oFilter.members}") > 0`
      )
    case FilterOperator.StartsWith: {
      const values = isArray(oFilter.members) ? oFilter.members : [oFilter.members]
      return values
        .map((value) => {
          if (value) {
            return `Left(${oFilter.hierarchy}.CurrentMember.name, ${`${value}`.length}) = "${value}"`
          }
          return ''
        })
        .join(' or ')
    }
    default: {
      // filter value 中有带有 hierarchy 的情况
      let statement = MemberSet(...oFilter.members.map((member) => {
        const memberKey = getMemberKey(member)
        const hierarchyValue = wrapHierarchyValue(path, memberKey)
        const calculatedMember = cube?.calculatedMembers?.find((item) => item.name === memberKey && item.hierarchy === oFilter.hierarchy)
        if (calculatedMember) {
          withMembers[formatCalculatedMemberName(calculatedMember)] = pick(calculatedMember,
            'name',
            'dimension',
            'hierarchy',
            'formula'
          ) as CalculatedMember
        }
        return hierarchyValue
      }))

      switch (oFilter.drill) {
        case Drill.Children:
          statement = Descendants(
            statement,
            // 为什么要用 distance
            oFilter.distance ?? 1
          )
          break
        case Drill.SelfAndChildren:
          statement = Descendants(
            statement,
            isNil(oFilter.distance) ? '1' : oFilter.distance,
            DescendantsFlag.SELF_AND_BEFORE
          )
          break
        case Drill.SelfAndDescendants:
          statement = Descendants(
            statement,
            // 要不要默认到最底层？
            isNil(oFilter.distance) ? '1' : oFilter.distance,
            DescendantsFlag.SELF_AND_BEFORE
          )
          break
        // TODO more case
      }
      return statement
    }
  }

  return ''
}

/**
 * 由于目前没有找到如何书写 IAdvancedFilter 对应的 MDX 语句的方法, 所以将 IAdvancedFilter 展开成明细的 ISlicer
 * 
 * @param entityType 
 * @param advancedFilter 
 */
export function flattenAdvancedFilter(advancedFilter: IAdvancedFilter | ISlicer) {

  if (isAdvancedFilter(advancedFilter)) {
    return flatten(advancedFilter.children.map(child => flattenAdvancedFilter(child)))
  }
  
  return [advancedFilter]
}

export function generateAdvancedFilterStatement(entityType: EntityType, advancedFilter: IAdvancedFilter) {
  const statement = _generateAdvancedFilterStatement(entityType, advancedFilter)
  // const hierarchyFilter = convertFilter2Hierarchy(entityType, advancedFilter.children[0])
  return statement // Filter(`${hierarchyFilter.hierarchy}.allMembers`, statement) //`Filter(${hierarchyFilter.hierarchy}.allMembers,${statement})`
}

function _generateAdvancedFilterStatement(entityType: EntityType, slicer: IAdvancedFilter | IFilter) {
  if (isAdvancedFilter(slicer)) {
    const children = slicer.children.map((item) => _generateAdvancedFilterStatement(entityType, item))
    return slicer.filteringLogic === FilteringLogic.And ? AND(...children) : OR(...children)
  } else if(isFilter(slicer)) {
    const hierarchy = getPropertyHierarchy(slicer.dimension)
    let statement = Parenthesis(
      OR(
        ...slicer.members.map((member) =>
          IS(CurrentMember(hierarchy), wrapHierarchyValue(hierarchy, getMemberKey(member)))
        )
      )
    )
    switch (slicer.operator) {
      case FilterOperator.EQ:
        break
      case FilterOperator.NE:
        statement = NOT(statement)
        break
      default:
        throw new Error(`暂不支持操作符: ${slicer.operator}`)
    }
    return statement
  } else if(isSlicer(slicer)) {
    return serializeSlicer(slicer)
  }

  throw new Error(`暂不支持切片器: ${JSON.stringify(slicer)}`)
}
