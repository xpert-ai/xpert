import { IChatBIModel, ISemanticModel } from '@metad/contracts'
import { nonNullable } from '@metad/ocap-core'
import { z } from 'zod'

export const LanguageSchema = z.enum(['en', 'zh', 'zh-Hans']).describe('Language ​​used by user')
export const IndicatorSchema = z.object({
    language: LanguageSchema,
    modelId: z.string().describe('The id of model'),
    cube: z.string().describe('The cube name'),
    code: z.string().describe('The unique code of indicator'),
    name: z.string().describe(`The caption of indicator in user's language`),
    formula: z.string().describe('The MDX formula for calculated measure'),
    unit: z.string().optional().nullable().describe(`The unit of measure, '%' or orthers`),
    description: z
        .string()
        .describe(
            'The detail description of calculated measure, business logic and cube info for example: the time dimensions, measures or dimension members involved'
        ),
    query: z
        .string()
        .describe(
            `A query statement to test this indicator can correctly query the results, you cannot use 'WITH MEMBER' capability. You need include indicator code as measure name in statement like: \n`
            + `SELECT { [Measures].[The unique code of indicator] } ON COLUMNS, { <dimensions> } ON ROWS FROM [cube]`
        )
})

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
