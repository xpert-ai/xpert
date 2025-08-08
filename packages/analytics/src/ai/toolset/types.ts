import { IChatBIModel, IIndicator, ISemanticModel } from '@metad/contracts'
import { assignDeepOmitBlank, C_MEASURES, ChartMeasure, cloneDeep, EntityType, getChartType, nonNullable, tryFixDimension } from '@metad/ocap-core'
import { upperFirst } from 'lodash'

/**
 * Try to fix the formula given by AI
 * 
 * - `WITH MEMBER [Measures].[NewCode] AS '<formula>'` to `'<formula>'`
 * 
 * @param formula 
 */
export function tryFixFormula(formula: string, code: string) {
    const prefix = `WITH MEMBER [Measures].[${code}] AS `
    if (formula.startsWith(prefix)) {
        return formula.slice(prefix.length)
    }
    return formula
}

/**
 * Try to fix Chart options.
 * 
 * @param chartType 
 * @returns 
 */
export function tryFixChartType(chartType: string) {
  if (chartType?.endsWith('Chart')) {
    chartType = chartType.replace(/Chart$/, '')
    return assignDeepOmitBlank(cloneDeep(getChartType(upperFirst(chartType))?.value.chartType), {}, 5)
  }
  return null
}

/**
 * Try to fix the formatting issues:
 * - `[Sales Amount]`
 * - `[Measures].[Sales Amount]`
 */
export function fixMeasure(measure: ChartMeasure, entityType: EntityType) {
  return {
    ...tryFixDimension(measure, entityType),
    dimension: C_MEASURES,
    formatting: {
      shortNumber: true
    },
    palette: {
      name: 'Viridis'
    }
  }
}

export function markdownCubes(models: IChatBIModel[]) {
    return models.filter(nonNullable).map((item) => `- dataSource: ${item.modelId}
  cubeName: ${item.entity}
  cubeCaption: ${item.entityCaption}
  cubeDescription: ${item.entityDescription}`).join('\n')
}

export function markdownSemanticModels(models: ISemanticModel[]) {
    return models?.filter(nonNullable).map((item) => `- modelId: ${item.id}
  name: ${item.name}
  description: ${item.description}`).join('\n') ?? 'Empty semantic models'
}

/**
 * Convert cubes in semantic models to markdown format
 */
export function markdownModelCubes(models: ISemanticModel[]) {
    let markdown = ''
    for (const model of models) {
        markdown += `- modelId: ${model.id}\n`
        markdown += `  name: ${model.name}\n`
      if (model.description)
        markdown += `  description: ${model.description}\n`
        if (model.options?.schema?.cubes) {
            markdown += `  cubes:\n`
            for (const cube of model.options.schema.cubes) {
                markdown += `    - cubeName: ${cube.name}\n`
              if (cube.caption)
                markdown += `      cubeCaption: ${cube.caption}\n`
              if (cube.description)
                markdown += `      cubeDescription: ${cube.description}\n`
            }
        }
    }

    return markdown || 'No semantic models with cubes found'
}

export function markdownIndicators(indicators: IIndicator[]) {
    return indicators.filter(nonNullable).map((item) => `- code: ${item.code}
  name: ${item.name}
  description: ${item.business}
  cube: ${item.entity}
  modelId: ${item.modelId}`).join('\n')
}