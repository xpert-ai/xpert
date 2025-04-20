import {
  AdvancedSlicer,
  AggregationRole,
  C_MEASURES,
  deconstructOrderby,
  Dimension,
  Drill,
  EntityType,
  FilterOperator,
  FilterSelectionType,
  getEntityDimensions,
  getEntityHierarchy,
  getEntityLevel,
  getEntityMeasures,
  getEntityProperty,
  getEntityProperty2,
  isAdvancedFilter,
  isAdvancedSlicer,
  isDimension,
  isFilter,
  ISlicer,
  isMeasure,
  isNil,
  isPropertyHierarchy,
  isPropertyLevel,
  isString,
  Measure,
  nonNullable,
  omitBy,
  OrderBy,
  parameterFormatter,
  Property,
  QueryOptions,
  RuntimeLevelType,
  Semantics
} from '@metad/ocap-core'
import { t } from 'i18next'
import { findIndex, flatten, groupBy, isEmpty, merge, negate, omit, padStart, uniq } from 'lodash'
import { WithMemberType } from './calculation'
import { flattenAdvancedFilter, mapMDXFilterToStatement, MDXHierarchyFilter, MDXProperty } from './filter'
import { Ascendants, Descendants, DescendantsFlag, Distinct, Except, Members, MemberSet } from './functions'
import { IntrinsicMemberProperties } from './reference/index'
import {
  C_MDX_FIELD_NAME_REGEX,
  MDXDialect,
  MDXDimension,
  MDXHierarchy,
  MDXLevel,
  MDXQuery,
  MDXRank,
  wrapBrackets,
} from './types/index'

export function filterNotUnitText(dimensions: Array<Dimension>, entityType: EntityType) {
  return (
    dimensions?.filter((field) => {
      const property = getEntityProperty(entityType, field)
      return (
        property?.semantics?.semantic !== Semantics.UnitOfMeasure && property?.semantics?.semantic !== Semantics.Text
      )
    }) || []
  )
}

/**
 * 根据 entityType 和 QueryOptions 生成 cube 相应的 MDXQuery 信息对象, 后续再由 MDXQuery 生成 MDX Statement
 *
 * @param entity
 * @param entityType
 * @param options
 * @returns
 */
export function generateMDXQuery(entity: string, entityType: EntityType, options: QueryOptions): MDXQuery {
  /**
   * 去除 Unit 和 Text 字段
   */
  const selects = uniq(
    options?.selects?.filter((field) => {
      const property = getEntityProperty(entityType, field)
      return property?.semantic !== Semantics.UnitOfMeasure && property?.semantic !== Semantics.Text
    })
  )

  const rows = filterNotUnitText(options?.rows, entityType)
    .filter(negate(isNil))
    .map((field) => getMDXProperty(entityType, field))
  const columns = filterNotUnitText(options?.columns, entityType)
    .filter(negate(isNil))
    .map((field) => getMDXProperty(entityType, field))

  selects?.forEach((field) => {
    if (getEntityProperty(entityType, field)?.role === AggregationRole.measure) {
      columns.push(getMDXProperty(entityType, field))
    } else {
      rows.push(getMDXProperty(entityType, field))
    }
  })

  // 将不同的 filters 提取出来
  const conditions: Array<AdvancedSlicer> = []
  const advancedFilters: Array<string> = []
  /**
   * 其余常规过滤器需要分配到轴或者计算成员或者 Slicer 轴上
   */
  const slicers = []
  const variables = []
  options.filters?.forEach((item) => {
    if (isAdvancedSlicer(item)) {
      conditions.push(item)
    } else if (isAdvancedFilter(item)) {
      slicers.push(...flattenAdvancedFilter(item).map((slicer) => convertFilter2Hierarchy(entityType, slicer)))
      // advancedFilters.push(generateAdvancedFilterStatement(entityType, item))
    } else {
      if (item.dimension.parameter) {
        variables.push({...item, ...item.dimension})
      } else {
        slicers.push(convertFilter2Hierarchy(entityType, item))
      }
    }
  })
  // filterHierarchies = compactSlicers(filterHierarchies)

  // TODO 暂时用 paging 属性作为 Rank 输入，可能会重构成别的名称
  let rank = null
  if (options.paging?.top) {
    rank = [MDXRank.Top, options.paging.top]
  } else if (options.paging?.last) {
    rank = [MDXRank.Bottom, options.paging.last]
  }

  // Orderbys
  const orderbys = []
  // 取来自 Dimension 或 Measure 本身的 Order 属性
  ;[...rows, ...columns].forEach((dimension) => {
    if (dimension.order) {
      orderbys.push(
        convertOrderby(entityType, {
          by: dimension.hierarchy ? dimension.hierarchy : dimension.measure,
          order: dimension.order
        })
      )
    }
  })
  options?.orderbys?.forEach((orderby) => orderbys.push(convertOrderby(entityType, orderby)))

  const withMembers: Record<string, WithMemberType> = {}
  // TODO 将过滤器分配到轴上，与后面的有部分过滤器分配到计算成员的 Restricted Dimension 上有先后顺序，需要调整
  const filtered = allocateFilters(uniteMDXProperty(rows), uniteMDXProperty(columns), slicers, entityType, withMembers)
  filtered.rows = filtered.rows?.map((item) =>
    processMDXDimensionProperties(item, entityType, entityType.dialect as MDXDialect)
  )
  filtered.columns = filtered.columns?.map((item) =>
    processMDXDimensionProperties(item, entityType, entityType.dialect as MDXDialect)
  )

  return omitBy(
    {
      ...filtered,
      entity,
      rank,
      conditions,
      advancedFilters,
      orderbys,
      withMembers,
      variables
    },
    isNil
  ) as MDXQuery
}

export function getMDXProperty(entityType: EntityType, path: string | Dimension): MDXProperty {
  let hierarchy = null

  if (isString(path)) {
    const property = getEntityProperty(entityType, path)
    if (property?.role === AggregationRole.measure) {
      return {
        dimension: C_MEASURES,
        members: [property.name]
      }
    } else if (property) {
      return {
        dimension: property.name,
        hierarchy: property.defaultHierarchy || property.hierarchies.find((item) => item.name === property.name)?.name // Use the default or same name hierarchy with dimension
      }
    } else {
      const property = getEntityHierarchy(entityType, path)
      if (property) {
        return {
          dimension: property.dimension,
          hierarchy: property.name,
        }
      }

      throw new Error(t('Error.NoPropertyFoundFor', {ns: 'xmla', cube: entityType.name, path}))
    }
  }

  const dimensions = getEntityDimensions(entityType) as Array<MDXDimension>
  const measures = getEntityMeasures(entityType)

  if (isMeasure(path)) {
    if (path.measure) {
      return {
        ...path,
        dimension: C_MEASURES,
        members: [path.measure]
      }
    }
    return path
  }

  // is measure?
  const measure = measures.find((item) => item.name === path.dimension)
  if (measure) {
    return {
      ...path,
      members: [path.dimension],
      dimension: C_MEASURES
    }
  }
  const dProperty = dimensions.find((item) => item.name === path.dimension)
  if (!dProperty) {
    throw new Error(t('Error.NoDimensionFoundFor', {ns: 'xmla', dimension: path.dimension, cube: entityType.name}))
  }
  hierarchy =
    isDimension(path) && !isNil(path.hierarchy)
      ? path.hierarchy
      : dProperty?.defaultHierarchy
      ? wrapBrackets(dProperty.defaultHierarchy)
      : path.dimension
  const hProperty = dProperty.hierarchies?.find((item) => item.name === hierarchy)

  return {
    ...path,
    hierarchy,
    defaultMember: hProperty?.defaultMember,
    allMember: hProperty?.allMember
  }
}

/**
 * @deprecated
 * 模式识别 MDX 选择条件中的维度 Hierarchy 信息
 */
export function _extractHierarchy(path): MDXHierarchyFilter {
  const dimension = {} as MDXHierarchyFilter
  // const paths = path.match(new RegExp(`\\[${MDX_FIELD_NAME_REGEX}\\]`)) ///\[[A-Za-z0-9\s_\-\/]*\]/g)
  // eslint-disable-next-line no-useless-escape
  const paths = path.match(/\[[a-zA-Z0-9\u4E00-\u9FCC\/\s_\-]*\]/g)
  let level = null
  paths?.find((sub) => {
    const lvl = sub.match(/\[([Ll][Ee][Vv][Ee][Ll])([0-9]{0,2})\]/)
    level = (lvl?.[2] || lvl?.[1])?.toUpperCase()
    return !!lvl
  })
  if (paths) {
    dimension.hierarchy = paths[0]
  }
  if (level) {
    dimension.level = level
  }
  // /\[[A-Za-z0-9\s_\-\/]*\]\.PROPERTIES\.([A-Za-z0-9_\/\-]*)/)
  const properties = path
    .toUpperCase()
    .match(new RegExp(`\\[${C_MDX_FIELD_NAME_REGEX}\\]\\.PROPERTIES\\.(${C_MDX_FIELD_NAME_REGEX})`))
  if (properties) {
    dimension.properties = [properties[1]]
  }
  return paths ? dimension : null
}

/**
 * 将分散的 hierarchy 和其 dimension property 合并
 *
 */
export function uniteMDXProperty(dimensions: Array<MDXProperty>): Array<MDXProperty> {
  const results = []
  let measureGroup: Measure
  dimensions.forEach((item) => {
    if (item.dimension === C_MEASURES) {
      // 合并 Measures 字段
      if (!measureGroup) {
        measureGroup = measureGroup ?? ({ ...omit(item, 'measure'), members: [] } as Measure)
        results.push(measureGroup)
      }

      if (item.members?.length) {
        measureGroup.members.push(...item.members)
      } else if (item.measure) {
        measureGroup.members.push(item.measure)
      }
    } else {
      // 合并 hierarchy 一致的维度字段
      const property = results.find(
        (dimension) => dimension.dimension === item.dimension && dimension.hierarchy === item.hierarchy
      )
      if (property) {
        // 合并其他所有属性
        merge(property, omit(item, ['dimension', 'hierarchy', 'properties']))
        if (item.properties) {
          property.properties = property.properties || []
          property.properties.push(...item.properties)
        }
      } else {
        results.push({ ...item })
      }
    }
  })

  return results
}

/**
 * 将 Filter 转换成 MDX 结构化数据
 */
export function convertFilter2Hierarchy(entityType: EntityType, ftr: ISlicer): MDXHierarchyFilter {
  const dim: MDXHierarchyFilter = getMDXProperty(entityType, ftr.dimension)
  if (dim) {
    dim.members = ftr.members
    dim.drill = ftr.drill
    dim.distance = ftr.distance
    if (isFilter(ftr)) {
      // TODO 需要更好的方式
      dim.operator = ftr.operator
    }
    if (ftr.exclude) {
      dim.operator = FilterOperator.NE
    }

    if (ftr.selectionType === FilterSelectionType.SingleRange) {
      dim.operator = FilterOperator.BT
    }
  }

  // TODO for variables
  // const parameter = Object.values<PropertyReference>(entityType.parameters || {}).find(
  //   (parameter) => parameter.refName === dim.dimension && parameter.refHierarchy === dim.hierarchy
  // )
  // if (parameter) {
  //   dim.parameter = parameter
  // }

  return omitBy(dim, isNil)
}

export function getCubeHierarchyLevel(entityType: EntityType, hierarchy: string, levelNumber: number): MDXLevel {
  const dimensions = Object.values<Property>(entityType.properties).filter(
    (property: Property) => property.role === AggregationRole.dimension
  ) as Array<MDXDimension>

  let lProperty = null
  dimensions.find((d: MDXDimension) => {
    return d.hierarchies?.find((item: MDXHierarchy) => {
      if (item.name === hierarchy) {
        lProperty = item.levels?.find((l) => l.levelNumber === levelNumber)
        return true
      }
      return false
    })
  })

  return lProperty
}

/**
 * Decompose Orderby to dimension:hierarchy:measure:order
 */
export function convertOrderby(entityType: EntityType, orderby: OrderBy): MDXProperty {
  const { by, order = 'ASC' } = deconstructOrderby(orderby)
  const property = getEntityProperty2(entityType, by)
  if (!property) {
    throw new Error(`Not found property for order by: ${by}`)
  }
  let name = by
  if (isPropertyLevel(property)) {
    name = property.hierarchy
  } else if(isPropertyHierarchy(property)) {
    name = property.name
  }
  return {
    ...omitBy(getMDXProperty(entityType, name), isNil),
    order
  } as MDXProperty
}

export function getHierarchyName(fHierarchy) {
  if (fHierarchy.level === 'LEVEL') {
    return `${fHierarchy.hierarchy}.[LEVEL${padStart(`${fHierarchy.value}`, 2, '0')}]`
  }
  return fHierarchy.hierarchy
}

/**
 * 将 Filters 分配到行或者列维度, 剩余的到 Slicers 轴上
 *
 * @param rows    行
 * @param columns 列
 * @param filters 过滤器
 */
export function allocateFilters(
  rows: Array<MDXProperty>,
  columns: Array<MDXProperty>,
  filters: Array<MDXHierarchyFilter>,
  entityType: EntityType,
  withMembers: Record<string, WithMemberType>
): MDXQuery {
  const dialect = entityType.dialect as MDXDialect
  const parameterGroup = groupBy(filters, (item) => !!item.parameter)

  // filters 中的 hierarchy level 限制给 dimensions 字段
  // const ftrGroupByLevel = groupBy(parameterGroup['false'], (item) => !!item.level)
  // const filtersWithLevel = ftrGroupByLevel['true'] || []
  const filtersWithoutLevel = parameterGroup['false'] ?? [] // ftrGroupByLevel['false'] || []

  // const withLevels = allocateLevelFilter(rows, filtersWithLevel, filtersWithoutLevel)
  // allocateLevelFilter(columns, withLevels, filtersWithoutLevel)
  rows = allocateAxesFilter(rows, [...filtersWithoutLevel], entityType, withMembers, dialect)
  columns = allocateAxesFilter(columns, [...filtersWithoutLevel], entityType, withMembers, dialect)

  // 是否 SAP MDX 根本不支持使用同一 DIMENSION 的多个 Hierarchy 进行 Slicer 查询 ?
  const selects = [...(rows || []), ...(columns || [])]
  const slicerFilters = parameterGroup['false']
    ?.filter((ftr) => !(findIndex(selects, { hierarchy: ftr.hierarchy }) > -1 || isEmpty(ftr.members)))
    .map((item) => {
      item.dimension = item.dimension || item.hierarchy
      return item
    })

  return omitBy(
    {
      rows,
      columns,
      slicers: slicerFilters || [],
      variables: parameterGroup['true']
      // orderbys: orderbys?.filter(orderby => !!orderby.measure) // 取对 Measures 的 Orderbys
    },
    isNil
  ) as MDXQuery
}

/**
 * 将维度属性与过滤器合并
 *
 * @param calculatedMembers 用于存储计算 calculated slicers 过程中产生的 with member
 */
export function allocateAxesFilter(
  dimensions: Array<MDXProperty>,
  filters: Array<MDXHierarchyFilter>,
  entityType: EntityType,
  withMembers: Record<string, WithMemberType>,
  dialect?: MDXDialect
) {
  return dimensions?.map((item) => {
    if (item.dimension === C_MEASURES) {
      // for measures
      return item
    }
    const currentLevel = getEntityLevel(entityType, item)
    const currentHierarchy = getEntityHierarchy(entityType, item)

    // for dimensions TODO 增加 parameter 逻辑
    const {
      dimension,
      hierarchy: _hierarchy,
      level,
      allMember,
      defaultMember,
      unbookedData,
      members,
      exclude,
      parameter,
      displayHierarchy
    } = item
    const hierarchy = _hierarchy || dimension

    const mdxProperty = { ...item, properties: item.properties || [] }

    /**
     * @todo use `serializeMemberSet` ?
     */
    const _filters: Array<string> = []
    if (parameter) {
      _filters.push(parameterFormatter(parameter))
    } else if (!isEmpty(members)) {
      // _filters.push(serializeDimension(item))
    }

    // 排除的条件不同于等于的条件，要单独处理
    const excludeSlicers = []
    // Dimension 的 members 应该作为优先级低的 slicer，所以要合并到 filters 中
    if (members?.length) {
      if (exclude) {
        excludeSlicers.push({
          dimension,
          hierarchy,
          exclude,
          members
        })
      } else if (!filters.some((ftr) => ftr.hierarchy === hierarchy)) {
        // Include 的 Members 当作低优先级的 slicer
        filters.push({
          dimension,
          hierarchy,
          members
        })
      }
    }

    let statement = ''

    // 有指定层级的情况
    if (level) {
      const slicers = filters
        .filter((ftr) => ftr?.hierarchy === hierarchy)
        .map((item) => {
          if (!isNil(item.drill)) {
            mdxProperty.properties = [
              ...mdxProperty.properties,
              IntrinsicMemberProperties[IntrinsicMemberProperties.PARENT_UNIQUE_NAME]
            ]
          }
          // TODO: 有没有除了 members 之外其他情况 ???
          if (!isEmpty(item.members)) {
            // Slicer as drill down parent member in flat mode
            // if (isNil(item.drill)) {
            //   item = {
            //     ...item,
            //     drill: displayHierarchy ? Drill.SelfAndDescendants : Drill.Children,
            //     distance: item.distance ?? level
            //   }
            // }
            return item
            // slicers.push(mapMDXFilterToStatement(item, entityType.cube, withMembers, dialect))
          }
          return null
        }).filter(nonNullable)
        

      let dimensionStatement = ''
      if (isEmpty(_filters)) {
        dimensionStatement = Members(level)
      } else {
        // 放在了 serializeDimension 函数里，要和 Except 一起处理
        if (exclude) {
          dimensionStatement = MemberSet(..._filters)
        } else {
          dimensionStatement = Descendants(MemberSet(..._filters), level)
        }
      }

      // level 和 members 同时存在意味这什么? 下钻上钻还是只取 members 成员
      if (!isEmpty(slicers)) {
        if (displayHierarchy) {
          // Hierarchy data union drill down data then distinct
          // statement = Distinct(MemberSet(...slicers, dimensionStatement))
          statement = MemberSet(...slicers.map((item) => mapMDXFilterToStatement({...item, drill: Drill.SelfAndDescendants}, entityType.cube, withMembers, dialect)))
        } else {
          // 下钻时只用下钻成员？ 下钻到指定层级, 例如：去年每个月的销售额
          if (isNil(slicers[0].drill)) {
            if (currentHierarchy.levels.filter((level) => level.levelType !== RuntimeLevelType.ALL).length > 1) {
              statement = Descendants(MemberSet(...slicers.map((item) => mapMDXFilterToStatement(item, entityType.cube, withMembers, dialect))), level)
            } else {
              // No need to drill down if only one level
              statement = MemberSet(...slicers.map((item) => mapMDXFilterToStatement(item, entityType.cube, withMembers, dialect)))
            }
          } else {
            statement = MemberSet(...slicers.map((item) => mapMDXFilterToStatement(item, entityType.cube, withMembers, dialect)))
          }
        }
      } else {
        if (displayHierarchy) {
          statement =
            dialect === MDXDialect.SAPBW
              ? Distinct(Ascendants(statement))
              : Descendants(item.defaultMember, level || 1, DescendantsFlag.SELF_AND_BEFORE)
        } else {
          statement = dimensionStatement
        }
      }
    } else {
      // 如果 selects 中的 DIMENSION 没有 LEVEL 信息则认为全部是 EQ filters (目前认识情况下)
      const ftrs = flatten(
        filters
          .filter((ftr) => ftr?.hierarchy === hierarchy)
          .map((item) => mapMDXFilterToStatement(item, entityType.cube, withMembers, dialect))
      )
      if (ftrs.length > 0) {
        _filters.push(...ftrs)
      }

      if (!isEmpty(_filters)) {
        // 先在这里进行去重, 后续可以提前到结构化部分去重
        statement = MemberSet(...uniq(_filters))
        // TODO: 有 filters 并且没有 level，则获取 member level 和 children cardinality 信息
        mdxProperty.properties = [
          ...mdxProperty.properties,
          IntrinsicMemberProperties[IntrinsicMemberProperties.LEVEL_NUMBER],
          IntrinsicMemberProperties[IntrinsicMemberProperties.CHILDREN_CARDINALITY]
        ]
      } else {
        /**
         * `[hierarchy].Members` 取所有 Members 如果是 `[hierarchy]` 则只取一个默认 Member
         * 改成 Children 默认就都不取 Flat 结构的 All 成员， 但是 Children 只需 defaultMember 的子成员
         */
        // if (!unbookedData) {
        //   statement = `Except(${hierarchy}.Children, {${hierarchy}.[#]})`
        // } else {
        // 使用其他方式(dimension属性,level设置...)排除 AllMember 成员
        // }

        // statement = defaultMember ? wrapHierarchyValue(hierarchy, defaultMember) : Members(hierarchy)
        // statement = allMember ? Except(Members(hierarchy), wrapHierarchyValue(hierarchy, allMember)) : Members(hierarchy)
        statement = serializeHierarchyDefaultLevel(entityType, {dimension, hierarchy})
      }
    }

    if (item.displayHierarchy) {
      
      mdxProperty.properties.push(
        IntrinsicMemberProperties[IntrinsicMemberProperties.PARENT_UNIQUE_NAME],
        IntrinsicMemberProperties[IntrinsicMemberProperties.CHILDREN_CARDINALITY]
      )

      if (!currentLevel?.parentColumn) {
        if (level) {
          // if (isEmpty(_filters) && !statement) {
          //   statement = dialect === MDXDialect.SAPBW
          //     ? Distinct(Ascendants(statement))
          //     : Descendants(item.defaultMember, level || 1, DescendantsFlag.SELF_AND_BEFORE)
          // } else {
          //   // statement = Descendants(MemberSet(..._filters), level, DescendantsFlag.SELF_AND_BEFORE)
          //   // statement = MemberSet(..._filters)
          // }
        } else {
          statement = Descendants(
            statement,
            currentHierarchy.levels[currentHierarchy.levels.length - 1].name,
            DescendantsFlag.SELF_AND_BEFORE
          )
        }
      }
    }

    // 最终排除 Exclude 的 Members
    if (excludeSlicers.length > 0) {
      statement = Except(
        statement,
        MemberSet(...excludeSlicers.map((item) => mapMDXFilterToStatement(item, entityType.cube, withMembers, dialect)))
      )
    }

    mdxProperty.statement = statement
    return mdxProperty
  })
}

export function serializeHierarchyDefaultLevel(entityType: EntityType, {dimension, hierarchy}: Dimension) {
  const property = getEntityHierarchy(entityType, {dimension, hierarchy})
  const levels = property.levels.filter((level) => level.levelType !== RuntimeLevelType.ALL)
  const level = levels[0]
  if (!level) {
    throw new Error(`Can't find any levels in hierarchy ${hierarchy} of cube ${entityType.name} except all level`)
  }
  return Members(level.name)
}

/**
 * 1. 使用函数 `Ascendants` 获取节点节点及其所有父级节点的层级结构, 并将 `PARENT_UNIQUE_NAME` 加入到 properties 列表中
 * 2. label 属性(说明此维度使用哪个属性字段作为 Label 信息)设置的字段添加到 properties 列表中
 *
 * @param dimensions
 * @returns
 */
export function processMDXDimensionProperties(
  dimension: MDXProperty,
  entityType: EntityType,
  dialect: MDXDialect
): MDXProperty {
  // if (dimension.displayHierarchy) {
  //   const property = getEntityLevel(entityType, dimension as Dimension)
  //   dimension.properties = [
  //     ...dimension.properties,
  //     IntrinsicMemberProperties[IntrinsicMemberProperties.PARENT_UNIQUE_NAME],
  //     IntrinsicMemberProperties[IntrinsicMemberProperties.CHILDREN_CARDINALITY],
  //   ]
  //   if (!property?.parentChild) {
  //     dimension.statement =
  //       dialect === MDXDialect.SAPBW
  //         ? Distinct(Ascendants(dimension.statement))
  //         //
  //         : Descendants(dimension.defaultMember, dimension.level || 1, DescendantsFlag.SELF_AND_BEFORE)
  //   }
  // }
  if (dimension.memberCaption) {
    return {
      ...dimension,
      properties: [...dimension.properties, dimension.memberCaption]
    }
  }

  return dimension
}
