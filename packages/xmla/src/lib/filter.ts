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
  CurrentMemberCaption,
  CurrentMemberUniqueName,
  Descendants,
  DescendantsFlag,
  Except,
  Filter,
  InStr,
  IS,
  Left,
  Members,
  MemberSet,
  Not,
  NOT,
  OR,
  Parenthesis,
  Right
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
 * Concatenate Hierarchy filters into the form used in MDX statements
 */
export function mapMDXFilterToStatement(oFilter: MDXHierarchyFilter, cube: Cube, withMembers: Record<string, WithMemberType>, dialect?: MDXDialect): string {
  /**
   * @todo SAP BW 系统格式为 `[hierarchy].[value]` 而 Mondrian 中格式为 `[hierarchy].[level].[value]`, 不知道有没有其他设置可以消除差异?
   */
  const path = dialect === MDXDialect.SAPBW ? oFilter.hierarchy : /*oFilter.level ||*/ oFilter.hierarchy
  switch (oFilter.operator) {
    case FilterOperator.BT:
      if (isArray(oFilter.members)) {
        return oFilter.members.slice(0,2).map((member) => wrapHierarchyValue(path, getMemberKey(member))).join(':')
      }
      break
    case FilterOperator.NE:
      /**
       * @todo Will there be a situation where the hierarchy does not have an `[All]` member?
       * @todo The difference between using `Children` and `Members`
       */
      return Except(Children(oFilter.hierarchy), MemberSet(...oFilter.members.map((member) => wrapHierarchyValue(path, getMemberKey(member)))))
    case FilterOperator.Contains:
      if (includes(oFilter.properties, 'MEMBER_CAPTION')) {
        return Filter(
          oFilter.hierarchy,
          `${InStr(`${oFilter.hierarchy}.CURRENTMEMBER.MEMBER_CAPTION`, `"${getMemberKey(oFilter.members[0])}"`)} > 0`
        )
      }
      // By default, the Caption that meets the search criteria is also taken
      return Filter(
        oFilter.hierarchy,
        `${InStr(`${oFilter.hierarchy}.CURRENTMEMBER.MEMBER_CAPTION`, `"${getMemberKey(oFilter.members[0])}"`)} > 0`
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
      // When the filter value contains hierarchy
      let statement = MemberSet(...oFilter.members.map((member) => {
        const memberKey = getMemberKey(member)
        if (member && typeof member !== 'string' && member.operator) {
          switch(member.operator) {
            case FilterOperator.Contains: {
              if (member.caption) {
                return Filter(Children(oFilter.hierarchy),
                  `${InStr(CurrentMemberCaption(oFilter.hierarchy), `"${member.caption}"`)} > 0`
                )
              } else if (member.key) {
                return Filter(Children(oFilter.hierarchy),
                  `${InStr(CurrentMemberUniqueName(oFilter.hierarchy), `"${member.key}"`)} > 0`
                )
              }
              break
            }
            case FilterOperator.NotContains: {
              if (member.caption) {
                return Filter(Children(oFilter.hierarchy),
                  Not(`${InStr(CurrentMemberCaption(oFilter.hierarchy), `"${member.caption}"`)} > 0`)
                )
              } else if (member.key) {
                return Filter(Children(oFilter.hierarchy),
                  Not(`${InStr(CurrentMemberUniqueName(oFilter.hierarchy), `"${member.key}"`)} > 0`)
                )
              }
              break
            }
            case FilterOperator.StartsWith: {
              if (member.caption) {
                return Filter(Children(oFilter.hierarchy),
                  `${Left(CurrentMemberCaption(oFilter.hierarchy), member.caption.length)} = "${member.caption}"`
                )
              } else if (member.key) {
                return Filter(Children(oFilter.hierarchy),
                  `${Left(CurrentMemberUniqueName(oFilter.hierarchy), `${member.key}`.length)} = "${member.key}"`
                )
              }
              break
            }
            case FilterOperator.NotStartsWith: {
              if (member.caption) {
                return Filter(Children(oFilter.hierarchy),
                  Not(`${Left(CurrentMemberCaption(oFilter.hierarchy), member.caption.length)} = "${member.caption}"`)
                )
              } else if (member.key) {
                return Filter(Children(oFilter.hierarchy),
                  Not(`${Left(CurrentMemberUniqueName(oFilter.hierarchy), `${member.key}`.length)} = "${member.key}"`)
                )
              }
              break
            }
            case FilterOperator.EndsWith: {
              if (member.caption) {
                return Filter(Children(oFilter.hierarchy),
                  `${Right(CurrentMemberCaption(oFilter.hierarchy), member.caption.length)} = "${member.caption}"`
                )
              }
              else if (member.key) {
                return Filter(Children(oFilter.hierarchy),
                  `${Right(CurrentMemberUniqueName(oFilter.hierarchy), `${member.key}`.length)} = "${member.key}"`
                )
              }
              break
            }
            case FilterOperator.NotEndsWith: {
              if (member.caption) {
                return Filter(Children(oFilter.hierarchy),
                  Not(`${Right(CurrentMemberCaption(oFilter.hierarchy), member.caption.length)} = "${member.caption}"`)
                )
              }
              else if (member.key) {
                return Filter(Children(oFilter.hierarchy),
                  Not(`${Right(CurrentMemberUniqueName(oFilter.hierarchy), `${member.key}`.length)} = "${member.key}"`)
                )
              }
              break
            }
          }
        }

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
            // Why use distance?
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
            // Do you want to default to the bottom layer?
            oFilter.level ||
              (isNil(oFilter.distance) ? '1' : oFilter.distance),
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
 * Since there is no method to write the MDX statement corresponding to IAdvancedFilter, IAdvancedFilter is expanded into a detailed ISlicer
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
        throw new Error(`Operators are not supported: ${slicer.operator}`)
    }
    return statement
  } else if(isSlicer(slicer)) {
    return serializeSlicer(slicer)
  }

  throw new Error(`Slicers are not supported: ${JSON.stringify(slicer)}`)
}
