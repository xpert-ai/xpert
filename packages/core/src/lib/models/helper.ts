import { t } from 'i18next'
import { Semantics } from '../annotations'
import {
  Dimension,
  getPropertyHierarchy,
  getPropertyName,
  IMember,
  isDimension,
  ISlicer,
  isMeasure,
  Measure,
  Member
} from '../types'
import { assignDeepOmitBlank, isEmpty, isNil, isString, omit, omitBy } from '../utils'
import {
  CalculationProperty,
  CalculationType,
  isCalculationProperty,
  isIndicatorMeasureProperty,
  RestrictedMeasureProperty
} from './calculated'
import { IntrinsicMemberProperties } from './member'
import { AggregationRole, EntityProperty, PropertyAttributes } from './property'
import {
  Cube,
  DimensionUsage,
  EntitySet,
  EntityType,
  ParameterProperty,
  Property,
  PropertyDimension,
  PropertyHierarchy,
  PropertyLevel,
  PropertyMeasure,
  Schema,
  VariableProperty
} from './sdl'

export function serializeUniqueName(dimension: string, hierarchy?: string, level?: string, intrinsic?: string) {
  const name = !!hierarchy && dimension !== hierarchy ? `[${dimension}.${hierarchy}]` : `[${dimension}]`
  if (intrinsic) {
    return `${name}.[${level}].[${intrinsic}]`
  }
  if (level) {
    return `${name}.[${level}]`
  }
  return name
}

/**
 * 通过字段名或者 dimension 配置获取 dimension property
 */
export function getEntityProperty<T = Property>(entityType: EntityType, path: Dimension | Measure | string): T {
  const name = getPropertyName(path)
  return (entityType?.properties[name] ?? entityType?.parameters?.[name]) as unknown as T
}

/**
 * 获取不仅是 dimension 的具体属性字段如 level hierarchy parameter measure 等, 而 {@link getEntityProperty} 仅获取 dimension, measure 字段
 *
 * @param entityType
 * @param path
 * @returns
 */
export function getEntityProperty2<T extends PropertyAttributes = EntityProperty>(
  entityType: EntityType,
  path: Dimension | Measure | string
): T {
  if (isString(path)) {
    return (Object.values(entityType?.properties ?? {}).reduce(
      (prev, dimension) =>
        prev ??
        (dimension.name === path
          ? dimension
          : dimension.hierarchies?.reduce(
              (prev, hierarchy) =>
                prev ??
                (hierarchy.name === path
                  ? hierarchy
                  : hierarchy.levels?.reduce((prev, level) => prev ?? (level.name === path ? level : null), null)),
              null
            )),
      null
    ) ?? entityType?.parameters?.[path]) as unknown as T
  }

  if (isMeasure(path)) {
    return entityType?.properties[path.measure] as T
  }

  return (Object.values(entityType?.properties ?? {}).reduce((prev, dimension) => {
    return (
      prev ??
      (dimension.name === path.dimension
        ? path.hierarchy
          ? dimension.hierarchies?.reduce(
              (prev, hierarchy) =>
                prev ??
                (hierarchy.name === path.hierarchy
                  ? path.level
                    ? hierarchy.levels?.reduce(
                        (prev, level) => prev ?? (level.name === path.level ? level : null),
                        null
                      )
                    : hierarchy
                  : null),
              null
            )
          : dimension
        : null)
    )
  }, null) ?? entityType?.parameters?.[path.dimension]) as unknown as T
}

/**
 * Get dimensions in entity type, filterd by is `visible` or **empty**
 *
 * @param entityType
 * @returns
 */
export function getEntityDimensions(entityType: EntityType): Property[] {
  if (isNil(entityType?.properties)) {
    return []
  }
  return Object.values(entityType?.properties).filter(
    (item) => item.role === AggregationRole.dimension && isVisible(item)
  )
}

export function getEntityDimensionAndHierarchies(entityType: EntityType): Property[] {
  if (isNil(entityType?.properties)) {
    return []
  }

  const results = []
  Object.values(entityType.properties).forEach((property) => {
    if (property.role === AggregationRole.dimension) {
      results.push(property)

      property.hierarchies?.forEach((hierarchy) => {
        results.push(hierarchy)
      })
    }
  })
  return results
}

/**
 * Get measures in entity type, filtered by is visible or empty
 *
 * @param entityType
 * @returns
 */
export function getEntityMeasures(entityType: EntityType): PropertyMeasure[] {
  if (isNil(entityType?.properties)) {
    return []
  }
  return Object.values(entityType.properties).filter(
    (property) => property.role === AggregationRole.measure && isVisible(property)
  )
}

/**
 * Get all indicator type measures in entity type, filtered by is visible or empty
 *
 * @param entityType
 * @returns
 */
export function getEntityIndicators(entityType: EntityType): RestrictedMeasureProperty[] {
  return getEntityMeasures(entityType).filter(isIndicatorMeasureProperty)
}

/**
 * Get default measure in entity type or first measure property
 *
 * @param entityType
 * @returns
 */
export function getEntityDefaultMeasure(entityType: EntityType) {
  return entityType.defaultMeasure ? entityType.properties[entityType.defaultMeasure] : getEntityMeasures(entityType)[0]
}

/**
 * Get visiable hierarchies from dimension property
 * 
 * @param dimension 
 * @returns 
 */
export function getDimensionHierarchies(dimension: PropertyDimension) {
  return dimension?.hierarchies?.filter(isVisible) ?? []
}

/**
 * Get visiable levels from hierarchy property
 * 
 * @param hierarchy 
 * @returns 
 */
export function getHierarchyLevels(hierarchy: PropertyHierarchy) {
  return hierarchy?.levels?.filter(isVisible) ?? []
}

/**
 * Get hierarchy proeprty from EntityType:
 *
 * ```javascript
 * getEntityHierarchy(entityType, {dimension: '[Time]', hierarchy: '[Time.byWeek]'})
 *
 * getEntityHierarchy(entityType, {hierarchy: '[Time.byWeek]'})
 *
 * getEntityHierarchy(entityType, {dimension: '[Time]'})
 *
 * getEntityHierarchy(entityType, '[Time.byWeek]')
 * ```
 *
 * @param entityType
 * @param hierarchy
 * @returns
 */
export function getEntityHierarchy(entityType: EntityType, params: Dimension | string): PropertyHierarchy {
  if (isNil(entityType?.properties) || isNil(params)) {
    return null
  }
  const { dimension, hierarchy } = isString(params) ? { dimension: null, hierarchy: params } : params
  return Object.values(entityType.properties).reduce(
    (prev, item) =>
      prev ??
      ((dimension ? item.name === dimension : true)
        ? item.hierarchies?.find((hier) => hier.name === (hierarchy || dimension))
        : null),
    null
  )
}

export function getEntityLevel(entityType: EntityType, dimension: Dimension): PropertyLevel {
  return (
    entityType?.properties &&
    dimension &&
    Object.values(entityType.properties)
      .find((item) => item.name === dimension.dimension)
      ?.hierarchies?.find((item) => item.name === (dimension.hierarchy || dimension.dimension))
      ?.levels?.find((item) => item.name === dimension.level)
  )
}

export function getEntityCalculations(entityType: EntityType): CalculationProperty[] {
  if (isNil(entityType?.properties)) {
    return []
  }
  return Object.values(entityType.properties).filter((property) =>
    isCalculationProperty(property)
  ) as CalculationProperty[]
}

export function getEntityParameters<T extends ParameterProperty>(entityType: EntityType): T[] {
  if (isNil(entityType?.parameters)) {
    return []
  }
  return Object.values(entityType.parameters) as T[]
}

export function getEntityVariables(entityType: EntityType): VariableProperty[] {
  return getEntityParameters(entityType).filter(
    (parameter) => parameter.role === AggregationRole.variable
  ) as VariableProperty[]
}

/**
 * 查找 Hierarchy 里的 levels 下的 property
 *
 * @param hierarchy
 * @param name
 * @returns
 */
export function getHierarchyProperty(hierarchy: PropertyHierarchy, name: string) {
  let property = null
  hierarchy?.levels?.find((level) => {
    return (property = level.properties?.find((item) => item.name === name))
  })
  return property
}

export function _getPropertyCaption(property: Property) {
  return property?.caption
}

export function getDimensionMemberCaption(dimension: Dimension, entityType?: EntityType) {
  if (isNil(dimension)) {
    return null
  }
  if (dimension.memberCaption) {
    if (IntrinsicMemberProperties[dimension.memberCaption]) {
      return `${getPropertyHierarchy(dimension)}.[${dimension.memberCaption}]`
    }
    return dimension.memberCaption
  }
  if (entityType) {
    const property = getEntityProperty(entityType, dimension)
    return property?.memberCaption
  }
  return null
}

export function getDimensionDisplayBehaviour(dimension: Dimension) {
  if (isDimension(dimension)) {
    return dimension.displayBehaviour
  }

  return null
}

export function getPropertyUnitName(property: Property) {
  return isString(property?.unit) ? property.unit : property?.unit?.name
}

/**
 * @deprecated use {@link getMemberKey}
 */
export function getMemberValue(member: Member): string {
  return isString(member) ? member : member?.key || (member?.value as string)
}

export function getMemberKey(member: Member): string {
  return isString(member) ? member : member?.key || (member?.value as string)
}

export function hasLevel(dimension: Dimension | string) {
  return isDimension(dimension) ? !!dimension.level : false
}

/**
 * The property is Calendar Semantic
 *
 * @param property
 * @returns
 */
export function isSemanticCalendar(property: EntityProperty): boolean {
  return property?.semantics?.semantic && Semantics[property.semantics.semantic]?.startsWith('Calendar')
}

/**
 * 可以比较两个 PropertyPath 对象作为 Property 是否相同
 *
 * > 目前 level 属性中存储的就是全称, 不排除未来改为只有 level 的信息
 *
 * @param path
 * @returns
 */
export function stringifyProperty(path: Dimension | Measure | string) {
  return isString(path) ? path : isDimension(path) ? `${path.level || path.hierarchy || path.dimension}` : path.measure
}

/**
 * Convert string name to dimension structure
 *
 * @param name
 * @param entityType
 * @returns
 */
export function parseDimension(name: string, entityType: EntityType) {
  const d = {} as Dimension
  if (!isNil(entityType?.properties)) {
    Object.values(entityType.properties).find((dimension) => {
      if (dimension.name === name) {
        d.dimension = name
        return true
      }
      return dimension.hierarchies?.find((hierarchy) => {
        if (hierarchy.name === name) {
          d.dimension = dimension.name
          d.hierarchy = name
          return true
        }
        return hierarchy.levels?.find((level) => {
          if (level.name === name) {
            d.dimension = dimension.name
            d.hierarchy = hierarchy.name
            d.level = name
            return true
          }
          return false
        })
      })
    })
  } else {
    return null
  }

  return d
}

/**
 * @deprecated use {@link parseDimension}
 *
 * @param path
 * @param entityType
 * @returns
 */
export function propertyPath2Dimension(path: string | Dimension, entityType: EntityType): Dimension {
  if (isString(path)) {
    const d = {} as Dimension
    if (!isNil(entityType?.properties)) {
      Object.values(entityType.properties).find((dimension) => {
        if (dimension.name === path) {
          d.dimension = path
          return true
        }
        return dimension.hierarchies?.find((hierarchy) => {
          if (hierarchy.name === path) {
            d.dimension = dimension.name
            d.hierarchy = path
            return true
          }
          return hierarchy.levels?.find((level) => {
            if (level.name === path) {
              d.dimension = dimension.name
              d.hierarchy = hierarchy.name
              d.level = path
              return true
            }
            return false
          })
        })
      })
    }
    return d
  }

  return path
}

/**
 * 根据 ID 从 Cube 中找到 Hierarchy
 *
 * @param cube
 * @param id
 * @returns
 */
export function getHierarchyById(cube: Cube, id: string): PropertyHierarchy {
  return cube.dimensions?.reduce(
    (prev, current) =>
      prev ??
      current.hierarchies?.reduce((prevH, currentH) => prevH ?? (currentH.__id__ === id ? currentH : null), null),
    null
  ) as PropertyHierarchy
}

export function getLevelById(cube: Cube, id: string): PropertyLevel {
  return cube.dimensions?.reduce(
    (prev, current) =>
      prev ??
      current.hierarchies?.reduce(
        (prevH, currentH) =>
          prevH ??
          currentH.levels?.reduce((prevL, currentL) => prevL ?? (currentL.__id__ === id ? currentL : null), null),
        null
      ),
    null
  ) as PropertyLevel
}

export function getCubeProperty(cube: Cube, role: AggregationRole, id: string) {
  if (role === AggregationRole.dimension) {
    return cube.dimensions?.find((item) => item.__id__ === id)
  }

  if (role === AggregationRole.hierarchy) {
    return getHierarchyById(cube, id)
  }

  if (role === AggregationRole.level) {
    return getLevelById(cube, id)
  }

  if (role === AggregationRole.measure) {
    return cube.measures?.find((item) => item.__id__ === id)
  }

  return null
}

/**
 * 获取维度列表中指定层级 ID 所属层级结构
 *
 * @param dimensions 维度列表
 * @param id 层级的 ID
 * @returns 层级所属的层级结构
 */
export function getLevelsHierarchy(dimensions: PropertyDimension[], id: string): PropertyHierarchy {
  return dimensions?.reduce(
    (prevDim, currentDim) =>
      prevDim ??
      currentDim.hierarchies?.reduce(
        (prevHier, currentHier) =>
          prevHier ?? (currentHier.levels?.find((level) => level.__id__ === id) ? currentHier : null),
        null
      ),
    null
  )
}

export function isVisible(property: PropertyAttributes) {
  return property.visible || isNil(property.visible)
}

/**
 * Get the calendar level in the entity type. If no level name is specified, the default level is used.
 *
 * @param entityType
 * @param param1
 * @returns
 */
export function getEntityCalendarHierarchy(
  entityType: EntityType,
  { dimension, hierarchy }: Dimension
): PropertyHierarchy {
  const dProperty = getEntityProperty(entityType, dimension)
  if (!dProperty) {
    throw new Error(
      t('Error.NoDimensionFoundFor', {ns: 'core', cube: entityType?.name, name: dimension})
    )
  }
  if (hierarchy) {
    const hProperty = dProperty.hierarchies?.find((item) => item.name === hierarchy)
    if (!hProperty) {
      throw new Error(
        t('Error.NoHierarchyFoundFor', {ns: 'core', dimension: dimension, name: hierarchy})
      )
    }
    return hProperty
  }

  const defaultHierarchy = dProperty.hierarchies?.find((item) => item.name === dProperty.defaultHierarchy)

  return defaultHierarchy ?? dProperty.hierarchies?.[0]
}

// merge EntityType
export function mergeEntityType(a: EntityType, b: EntityType): EntityType {
  // // for properties
  // function customizer(objValue, srcValue) {
  //   if (isArray(objValue) && isArray(srcValue)) {
  //     srcValue.forEach((item) => {
  //       const obj = objValue.find((obj) => obj.name === item.name)
  //       if (obj) {
  //         // mergeWith(obj, item, customizer)
  //       } else {
  //         objValue.push(item)
  //       }
  //     })
  //     return objValue
  //   }
  //   return undefined
  // }

  // const entityType = {
  //   ...a,
  //   ...b,
  //   // properties: mergeWith(cloneDeep(a.properties), b?.properties, customizer)
  // }

  return assignDeepOmitBlank(a, b, 5)
}

export function mergeEntitySets(
  a: { [key: string]: EntitySet },
  b: { [key: string]: EntitySet }
): { [key: string]: EntitySet } {
  const result = {}
  Object.keys(a).forEach((aKey) => {
    result[aKey] = b[aKey] ? mergeEntitySet(a[aKey], b[aKey]) : a[aKey]
  })
  Object.keys(b).forEach((bKey) => {
    if (!a[bKey]) {
      result[bKey] = b[bKey]
    }
  })

  return result
}

/**
 * 暂时只有 merge entityType
 *
 * @param a
 * @param b
 * @returns
 */
export function mergeEntitySet(a: EntitySet, b: EntitySet): EntitySet {
  return {
    ...omitBy(a, isEmpty),
    ...omitBy(b, isEmpty),
    entityType:
      a?.entityType && b?.entityType ? mergeEntityType(a.entityType, b.entityType) : a?.entityType ?? b?.entityType
  } as EntitySet
}

/**
 * @deprecated
 *
 * @param a
 * @param b
 * @returns
 */
export function mergeSDLSchema(a: Schema, b: Schema) {
  return {
    ...a,
    ...b
  }
}

/**
 * @deprecated See where else it can be used?
 *
 * @param entityType
 * @param cube
 * @returns
 */
export function mergeEntityTypeCube(entityType: EntityType, cube: Cube) {
  const properties = { ...entityType.properties }
  // XMLA dimension name cannot be unified yet
  cube?.dimensions?.forEach((dim) => {
    properties[dim.name] = {
      ...(properties[dim.name] ?? {}),
      ...dim,
      role: AggregationRole.dimension
    }
  })

  cube?.measures?.forEach((item) => {
    properties[item.name] = {
      ...(properties[item.name] ?? {}),
      ...item,
      role: AggregationRole.measure
    }
  })

  cube?.calculatedMembers?.forEach((item) => {
    properties[item.name] = {
      ...(properties[item.name] ?? {}),
      ...item,
      role: AggregationRole.measure,
      calculationType: CalculationType.Calculated
    } as CalculationProperty
  })

  return {
    ...entityType,
    properties
  }
}

/**
 * Convert slicer (include or exclude members) to dimension type
 *
 * @param slicer
 * @returns
 */
export function convertSlicerToDimension(slicer: ISlicer): Dimension {
  if (!slicer?.dimension) {
    return null
  }

  return {
    ...slicer.dimension,
    members: slicer.members,
    exclude: slicer.exclude
  }
}

export function convertDimensionToSlicer(dimension: Dimension): ISlicer {
  return {
    dimension: omit(dimension, 'members', 'exclude'),
    members: dimension.members as IMember[],
    exclude: dimension.exclude
  }
}

export function mapEntityTypeHierarchy2Tree(entityType: EntityType) {
  if (isNil(entityType?.properties)) {
    return []
  }
  return Object.keys(entityType.properties)
    .filter((key) => entityType.properties[key].role === AggregationRole.dimension)
    .map((key) => {
      return {
        value: entityType.properties[key].name,
        label: entityType.properties[key].caption || entityType.properties[key].name,
        children: entityType.properties[key].hierarchies?.map((hier) => {
          return {
            value: hier.name,
            label: hier.caption || hier.name,
            isLeaf: true
          }
        })
      }
    })
}

export function getMemberFromRow(row: unknown, dimension: Dimension, entityType?: EntityType) {
  const caption = getDimensionMemberCaption(dimension, entityType)
  return {
    key: row[dimension.hierarchy || dimension.dimension],
    value: row[dimension.hierarchy || dimension.dimension],
    label: caption ? row[caption] : null,
    caption: caption ? row[caption] : null
  }
}

export function getDefaultHierarchy(property: Property) {
  const defaultHierarchy =
    property?.hierarchies?.find((hierarchy) => hierarchy.name === property.defaultHierarchy) ||
    property?.hierarchies?.[0]
  // if (!defaultHierarchy) {
  //     throw new Error(`Can't found default hierarchy in dimension: ${property?.name}`)
  // }
  return defaultHierarchy
}

export function getHierarchySemanticLevel(hierarchy: PropertyHierarchy, semantic: Semantics): PropertyLevel {
  return hierarchy?.levels?.find((item) => item.semantics?.semantic === semantic)
}

export function isWrapBrackets(name: string) {
  return name?.match(/\[.*\]/g)
}

export function wrapBrackets(name: string) {
  if (name && !isWrapBrackets(name)) {
    return `[${name}]`
  }
  return name
}

export function unwrapBrackets(name: string) {
  const m = name?.match(/\[(.*)\]/)
  if (m) {
    return m[1]
  }
  return name
}

/**
 * 将 Hierarchy 和其 Member 的值拼接成 MDX 语句中的 Member 唯一标识形式
 */
export function wrapHierarchyValue(hierarchy: string, value: string) {
  // 有的 Member 值里包含 Hierarchy 名字如 `"[Time.Weekly].[1998].[01]"`
  if (value.startsWith(hierarchy)) {
    return value
  }
  return `${hierarchy}.${wrapBrackets(value)}`
}

export function wrapLevelUniqueName(hierarchy: string,) {
  return `${hierarchy}.[LEVEL_UNIQUE_NAME]`
}

export function wrapMemberCaption(hierarchy: string,) {
  return `${hierarchy}.[MEMBER_CAPTION]`
}
export function wrapLevelNumber(hierarchy: string,) {
  return `${hierarchy}.[LEVEL_NUMBER]`
}

// Type Guards
export const isDimensionUsage = (toBe): toBe is DimensionUsage => !isNil((toBe as DimensionUsage)?.source)

export const isPropertyDimension = (toBe: unknown): toBe is PropertyDimension =>
  (toBe as EntityProperty)?.role === AggregationRole.dimension
export const isPropertyHierarchy = (toBe): toBe is PropertyHierarchy =>
  (toBe as EntityProperty)?.role === AggregationRole.hierarchy
export const isPropertyLevel = (toBe): toBe is PropertyLevel =>
  (toBe as EntityProperty)?.role === AggregationRole.level
export const isPropertyMeasure = (toBe): toBe is PropertyMeasure =>
  (toBe as EntityProperty)?.role === AggregationRole.measure
export const isEntityType = (toBe): toBe is EntityType => !(toBe instanceof Error) && !isNil((toBe as EntityType)?.name)
export const isEntitySet = (toBe): toBe is EntitySet => !(toBe instanceof Error) && !isNil((toBe as EntitySet)?.name)
