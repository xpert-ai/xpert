import { Semantics } from '../../annotations'
import { DimensionType, PropertyDimension, PropertyHierarchy, Schema } from '../../models'
import { suuid } from '../../utils'

export function upsertSchemaDimension(schema: Partial<Schema>, dimension: Partial<PropertyDimension>) {
  const dimensions = [...(schema.dimensions || [])]
  let key = null
  const index = dimensions.findIndex((d) => d.name === dimension.name)
  if (index > -1) {
    key = dimensions[index].__id__
  } else {
    key = suuid()
  }

  const _dimension = {
    ...dimension,
    __id__: key,
    hierarchies: dimension.hierarchies?.map((hierarchy, index) => ({
      ...hierarchy,
      name: index ? hierarchy.name : '',
      __id__: suuid(),
      levels: hierarchy.levels?.map((level) => ({ ...level, __id__: suuid() }))
    }))
  } as PropertyDimension

  if (dimension.type === DimensionType.TimeDimension) {
    _dimension.semantics = {
      semantic: Semantics.Calendar
    }
  }

  if (index > -1) {
    dimensions[index] = _dimension
  } else {
    dimensions.push(_dimension)
  }

  return {
    schema: {
      ...schema,
      dimensions
    } as Schema,
    dimension: _dimension
  }
}

export function upsertHierarchy(dimension: PropertyDimension, hierarchy: Partial<PropertyHierarchy>) {
  let key = null
  const index = dimension.hierarchies.findIndex((item) => item.name === hierarchy.name)
  if (index > -1) {
    dimension.hierarchies.splice(index, 1, {
      ...dimension.hierarchies[index],
      ...hierarchy
    })
    key = dimension.hierarchies[index].__id__
  } else {
    dimension.hierarchies.push({ ...hierarchy, __id__: hierarchy.__id__ ?? suuid() } as PropertyHierarchy)
    key = dimension.hierarchies[dimension.hierarchies.length - 1].__id__
  }

  return key
}