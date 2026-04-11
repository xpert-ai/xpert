import { Cube, EntityType, getEntityDimensions, getEntityMeasures } from '@xpert-ai/ocap-core'
export { markdownEntityType, markdownModelCube } from '@xpert-ai/ocap-core'

/**
 * @deprecated use markdownEntityType
 */
export function calcEntityTypePrompt(entityType: EntityType) {
  return JSON.stringify({
    name: entityType.name,
    caption: entityType.caption,
    dimensions: getEntityDimensions(entityType).map((dimension) => ({
      name: dimension.name,
      caption: dimension.caption,
      hierarchies: dimension.hierarchies?.map((item) => ({
        name: item.name,
        caption: item.caption,
        levels: item.levels?.map((item) => ({
          name: item.name,
          caption: item.caption
        }))
      }))
    })),
    measures: getEntityMeasures(entityType).map((item) => ({
      name: item.name,
      caption: item.caption
    }))
  })
}

/**
 * @deprecated use markdownCube
 */
export function makeCubePrompt(cube: Cube) {
  return JSON.stringify({
    name: cube.name,
    caption: cube.caption,
    dimensions: cube.dimensions?.map((dimension) => ({
      name: dimension.name,
      caption: dimension.caption,
      hierarchies: dimension.hierarchies?.map((item) => ({
        name: item.name,
        caption: item.caption,
        levels: item.levels?.map((item) => ({
          name: item.name,
          caption: item.caption
        }))
      }))
    })),
    measures: cube.measures?.map((item) => ({
      name: item.name,
      caption: item.caption
    })),
    calculatedMembers: cube.calculatedMembers?.map((item) => ({
      name: item.name,
      caption: item.caption,
      formula: item.formula
    })),
    /**
     * @todo Add dimensions
     */
    dimensionUsages: cube.dimensionUsages?.map((item) => ({
      name: item.name,
      caption: item.caption
    }))
  })
}

/**
 * @deprecated use markdownTable
 */
export function makeTablePrompt(entityType: EntityType) {
  if (!entityType?.properties) {
    return undefined
  }
  return JSON.stringify({
    name: entityType.name,
    caption: entityType.caption ?? undefined,
    columns: Object.values(entityType.properties).map((item) => ({
      name: item.name,
      caption: item.caption ?? undefined,
      type: item.dataType
    }))
  })
}

export function markdownTable(table: EntityType) {
  if (!table) {
    return `No table info.`
  }
  const columns = Object.values(table.properties)
  return [
    `Table is:`,
    `  - name: ${table.name}`,
    `    caption: ${table.caption || ''}`,
    `    columns:`,
    columns
      .map((t) =>
        [
          `    - name: ${t.name}`,
          `      caption: ${t.caption || ''}`,
          `      type: ${t.dataType || ''}`
        ].join('\n')
      )
      .join('\n'),
    '```'
  ].join('\n')
}
