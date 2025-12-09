import {
  AggregationRole,
  CalculationType,
  Cube,
  C_MEASURES,
  Dimension,
  EntitySemantics,
  EntityType,
  getEntityDefaultMeasure,
  getEntityProperty,
  IMember,
  IntrinsicMemberProperties,
  ISlicer,
  isMeasure,
  Measure,
  OrderDirection,
  pick,
  PropertyDimension,
  PropertyLevel,
  PropertyMeasure,
  QueryOptions,
  EntityProperty,
  CalculationProperty,
} from '@metad/ocap-core'
import {
  compileDimensionSchema,
  DimensionContext,
  getLevelColumn,
  LevelCaptionField,
  LevelContext
} from './dimension'
import { AggregateFunctions, CubeFactTable } from './types'
import { allMemberCaption, allMemberName, serializeIntrinsicName, serializeMeasureName, serializeTableAlias } from './utils'

/**
 * Compile the cube of entity with it's dimensions to runtime entity type
 *
 * @param entity
 * @param cube
 * @param dimensions
 * @param dialect
 * @returns
 */
export function compileCubeSchema(
  entity: string,
  cube: Cube,
  dimensions: PropertyDimension[],
  dialect: string
): EntityType {
  const properties: Record<string, EntityProperty> = {}

  cube.dimensionUsages?.forEach((usage) => {
    const dimension = dimensions?.find((item) => item.name === usage.source)
    // Validator: fact foreignKeya for foreignKey
    if (!usage.foreignKey) {
      throw new Error(`The foreignKey '${usage.foreignKey}' of dimension usage '${usage.name}' is not correct!`)
    }
    if (dimension) {
      const property = compileDimensionSchema(
        entity,
        {
          ...dimension,
          name: usage.name,
          foreignKey: usage.foreignKey || dimension.foreignKey
        },
        dialect
      )
      properties[property.name] = property
    } else {
      throw new Error(`Can't find source dimension '${usage.source}' for dimension usage '${usage.name}'`)
    }
  })

  cube.dimensions?.forEach((dimension) => {
    const property = compileDimensionSchema(entity, dimension, dialect)
    properties[property.name] = property
  })

  // if (!cube.measures?.length || !cube.defaultMeasure) {
  //   throw new SQLError('CUBE_DEFAULT_MEASURE')
  // }

  cube.measures?.forEach((measure) => {
    const name = serializeMeasureName(dialect, measure.name)
    properties[name] = {
      ...measure,
      name,
      role: AggregationRole.measure
    }
  })

  cube.calculatedMembers
    ?.filter((member) => member.visible)
    .forEach((calculatedMember) => {
      if (calculatedMember.dimension === C_MEASURES) {
        const name = serializeMeasureName(dialect, calculatedMember.name)
        properties[name] = {
          ...calculatedMember,
          name,
          role: AggregationRole.measure,
          dataType: 'number',
          calculationType: CalculationType.Calculated
        } as CalculationProperty
      }
    })

  return {
    name: entity,
    caption: cube.caption,
    defaultMeasure: cube.defaultMeasure,
    visible: true,
    properties,
    semantics: EntitySemantics.aggregate
  }
}

export interface CubeContext {
  schema: Cube
  entityType: EntityType
  factTable: string
  dimensions: DimensionContext[]
  measures: Array<{ alias: string; order?: OrderDirection } & PropertyMeasure>
  slicers?: ISlicer[]
  filterString?: string
}

export function CubeFactTableAlias(cube: Cube) {
  const tableName = CubeFactTable(cube)
  return serializeTableAlias(cube.name, tableName)
}

/**
 * Build context for Cube
 *
 * @param cube
 * @param options
 * @param entityType
 * @param dialect
 * @returns
 */
export function buildCubeContext(
  cube: Cube,
  options: QueryOptions,
  entityType: EntityType,
  dialect: string
): CubeContext {
  const factTable = CubeFactTableAlias(cube)
  if (!factTable) {
    throw new Error(`在模型中未找到事实表`)
  }

  const context = { schema: cube, entityType, dimensions: [], measures: [], slicers: [], factTable } as CubeContext

  ;[
    ...(options.rows?.map((row) => ({ row, role: 'row' })) ?? []),
    ...(options.columns?.map((row) => ({ row, role: 'column' })) ?? [])
  ].forEach(({ row, role }) => {
    let dimension = context.dimensions.find((item) => item.dimension.dimension === row.dimension)
    if (!dimension) {
      const property = getEntityProperty(entityType, row)
      // if (!property) {
      //   throw new Error(`未找到维度'${row.dimension}'`)
      // }
      dimension = { dialect, factTable, schema: property, dimension: row, levels: [], role } as DimensionContext
      context.dimensions.push(dimension)
    }
    if (isMeasure(row)) {
      dimension.schema = {
        ...dimension.schema,
        memberCaption: 'caption'
      }
      dimension.members = dimension.members ?? []
      const members = row.members ? [...row.members] : []
      if (!members.length && row.measure) {
        members.push(row.measure)
      }
      members.forEach((measureName) => {
        const measure = getEntityProperty(entityType, { dimension: C_MEASURES, measure: measureName } as Measure)
        if (!measure) {
          throw new Error(`未找到度量'${measureName}'`)
        }
        context.measures.push({
          ...measure,
          alias: measure.name,
          order: row.order
        })
        dimension.members.push({
          key: measure.name,
          value: measure.name,
          caption: measure.caption
        })
      })
    } else {
      buildCubeDimensionContext(dimension)
    }
  })

  if (!context.measures.length) {
    const defaultMeasure = getEntityDefaultMeasure(entityType)
    context.measures.push({ ...defaultMeasure, alias: defaultMeasure.name })
  }

  return context
}

/**
 * Build Dimension Context in Cube
 * Since the returned result is an array of objects, when multiple levels of the same hierarchy are selected, their members all belong to the same column but different rows;
 *
 * @param context
 * @param entityType
 * @param row
 * @returns
 */
export function buildCubeDimensionContext(context: DimensionContext): DimensionContext {
  const row = context.dimension
  // const property = getEntityProperty(entityType, row)
  // if (!property) {
  //   throw new Error(`未找到维度'${row.dimension}'`)
  // }
  // context.schema = property

  const _hierarchy = context.schema.hierarchies?.find((item) =>
    row.hierarchy ? item.name === row.hierarchy : item.name === row.dimension
  )
  if (!_hierarchy) {
    throw new Error(`未找到层级结构'${row.hierarchy || row.dimension}'`)
  }
  if (context.hierarchy && context.hierarchy.name !== _hierarchy.name) {
    throw new Error(`不能同时查询不同层级结构`)
  }
  context.hierarchy = _hierarchy
  context.keyColumn = context.hierarchy.name
  context.captionColumn = context.hierarchy.memberCaption
  context.parentKeyColumn = serializeIntrinsicName(
    context.dialect,
    context.hierarchy.name,
    IntrinsicMemberProperties.PARENT_UNIQUE_NAME
  )
  context.childrenCardinalityColumn = serializeIntrinsicName(
    context.dialect,
    context.hierarchy.name,
    IntrinsicMemberProperties.CHILDREN_CARDINALITY
  )
  const lIndex = row.level ? context.hierarchy.levels?.findIndex((item) => item.name === row.level) :
    context.hierarchy.hasAll ? 1 : 0

  if (lIndex > -1) {
    // for Hierarchy
    context.dimensionTable = context.hierarchy.primaryKeyTable || context.hierarchy.tables?.[0]?.name

    // for levels
    const startLevel = row.displayHierarchy ? 0 : lIndex
    for (let index = startLevel; index <= lIndex; index++) {
      const level = context.hierarchy.levels[index]
      context.levels.push(buildLevelContext(context, row, level, index))
    }

    // if (context.level?.name && context.level?.name !== level.name) {
    //   throw new Error(`暂时不能同时查询不同层级`)
    // }
    // context.level = level
  } else {
    throw new Error(`Can't find level ${row.level}`)
  }

  // members slicer in dimension
  if (context.dimension.members?.length) {
    context.slicers = context.slicers ?? []
    context.slicers.push({
      dimension: pick(context.dimension, 'dimension', 'hierarchy'),
      exclude: context.dimension.exclude,
      members: context.dimension.members as IMember[]
    })
  }
  return context
}

/**
 * Build dimension level context
 *
 * @param context Dimension context
 * @param row Dimension
 * @param level Dimension level
 * @param lIndex Level number
 * @returns
 */
export function buildLevelContext(context: DimensionContext, row: Dimension, level: PropertyLevel, lIndex: number) {
  const levelContext: LevelContext = {
    level,
    selectFields: [],
    orderBys: [],
    groupBys: []
  }

  const hAlias = context.keyColumn
  const levelTable = level.table || context.dimensionTable
  const table = levelTable ? serializeTableAlias(context.hierarchy.name, levelTable) : context.factTable

  // const nameColumn = level.nameColumn || level.column
  // let captionColumn = level.captionColumn || level.nameColumn
  const levels = context.hierarchy.levels.slice(context.hierarchy.hasAll ? 1 : 0, lIndex + 1)
  if (level.levelNumber === 0 && context.hierarchy.hasAll) {
    levelContext.selectFields.push({
      expression: `'${allMemberName(context.hierarchy)}'`,
      alias: hAlias
    })
    levelContext.selectFields.push({
      expression: `'${allMemberCaption(context.hierarchy)}'`,
      alias: context.hierarchy.memberCaption
    })
  } else {
    //
    // captionColumn = captionColumn || nameColumn
    levelContext.selectFields.push({
      columns: LevelsToColumns(levels, context),
      alias: hAlias
    })
    levelContext.selectFields.push({
      ...LevelCaptionField(table, level, context.dialect),
      alias: context.hierarchy.memberCaption,
    })
    // Ordinal column
    levelContext.orderBys.push(
      ...levels.map((level) => {
        return {
          table,
          column: level.ordinalColumn || level.column
        }
      })
    )

    levelContext.groupBys.push(...levelContext.orderBys)
  }

  // 暂时注释掉, 待解决
  // if (level.parentColumn) {
  //   context.parentKeyColumn = level.column
  //   context.parentColumn = level.parentColumn
  //   levelContext.selectFields.push({
  //     table: table + '(1)',
  //     column: nameColumn,
  //     alias: hAlias + '[parent_unique_name]'
  //   })
  // }

  row.properties?.forEach((name) => {
    const property = level.properties?.find((item) => item.name === name)
    if (property) {
      levelContext.selectFields.push({
        table,
        column: property.column,
        alias: property.name
      })
    }
  })

  // DisplayHierarchy 相关属性
  if (row.displayHierarchy) {
    // Parent
    if (level.levelNumber === 1 && context.hierarchy.hasAll) {
      levelContext.selectFields.push({
        expression: `'${allMemberName(context.hierarchy)}'`,
        alias: serializeIntrinsicName(context.dialect, hAlias, IntrinsicMemberProperties.PARENT_UNIQUE_NAME)
      })
    } else {
      levelContext.selectFields.push({
        columns: LevelsToColumns(levels.slice(0, levels.length - 1), context),
        alias: serializeIntrinsicName(context.dialect, hAlias, IntrinsicMemberProperties.PARENT_UNIQUE_NAME)
      })
    }

    // Children cardinality
    const childrenLevels = context.hierarchy.levels.slice(
      context.hierarchy.hasAll ? 1 : 0,
      Math.min(lIndex + 2, context.hierarchy.levels.length)
    )
    // 排除最低层级(没有子节点)
    if (childrenLevels.length > levels.length) {
      levelContext.selectFields.push({
        columns: LevelsToColumns(childrenLevels, context),
        alias: context.childrenCardinalityColumn,
        aggregate: AggregateFunctions.COUNT_DISTINCT
      })
    } else {
      levelContext.selectFields.push({
        expression: '0',
        alias: context.childrenCardinalityColumn
      })
    }
  }

  return levelContext
}

export function LevelsToColumns(levels: PropertyLevel[], context: DimensionContext) {
  return levels.map((level) => {
    const levelTable = level.table || context.dimensionTable
    const table = levelTable ? serializeTableAlias(context.hierarchy.name, levelTable) : context.factTable
    return getLevelColumn(level, table)
  })
}

export function getOrBuildDimensionContext(cubeContext: CubeContext, row: Dimension) {
  const { factTable, entityType } = cubeContext
  const { dialect } = entityType
  let dimension = cubeContext.dimensions.find((item) => item.dimension.dimension === row.dimension)
  if (!dimension) {
    dimension = buildCubeDimensionContext(
      { dialect, factTable, dimension: row, levels: [], role: 'row', selectFields: [] },
    )
    cubeContext.dimensions.push(dimension)
  }

  return dimension
}
