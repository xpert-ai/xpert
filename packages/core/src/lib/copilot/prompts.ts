import { EntityType, getDimensionHierarchies, getEntityDimensions, getEntityIndicators, getEntityMeasures, getEntityVariables, getHierarchyLevels, RuntimeLevelType, VariableEntryType } from "../models";
import { nonBlank } from "../utils";
import { MEMBER_RETRIEVER_TOOL_NAME } from "./constants"

export function prepend(prefix: string, text: string) {
  return text?.split('\n').map(line => prefix + line).join('\n') ?? ''
}

export function markdownEntityType(entityType: EntityType) {

  const variables = getEntityVariables(entityType)
  let context = `The cube definition for (${entityType.name}) is as follows:
  name: ${entityType.name}
  caption: ${entityType.caption || ''}
  description: >
  ${prepend('  ', entityType.description || entityType.caption)}
  dimensions:
  ${getEntityDimensions(entityType)
      .map((dimension) =>
  [
    `  - name: "${dimension.name}"`,
    `    caption: "${dimension.caption || ''}"`,
    dimension.description && dimension.description !== dimension.caption ?
  `    description: >
  ${prepend('      ', dimension.description)}` : null,
    dimension.semantics?.semantic ? 
    `    semantic: ${dimension.semantics.semantic}` : null,
    `    hierarchies:`
  ].filter(nonBlank).join('\n') + '\n' +
  getDimensionHierarchies(dimension).map((item) =>[
  `      - name: "${item.name}"`,
  `        caption: "${item.caption || ''}"`,
  item.description && item.description !== item.caption ?
  `        description: >
  ${prepend('          ', item.description)}` : null,
  `        levels:
  ${getHierarchyLevels(item).filter((level) => level.levelType !== RuntimeLevelType.ALL).map((item) =>
  [
  `        - name: "${item.name}"`,
  `            caption: "${item.caption || ''}"`,
  item.description && item.description !== item.caption ?
  `            description: >
  ${prepend('              ', item.description)}` : null,
  item.semantics?.semantic ?
  `            semantic: ${item.semantics.semantic}` : null,
  item.semantics?.formatter ? 
  `            time_formatter: "${item.semantics.formatter}"` : null,
  ].filter(nonBlank).join('\n')).join('\n')}
  `].join('\n')).join('\n')
  ).join('\n')}
`

  const indicators = getEntityIndicators(entityType)
  const measures = getEntityMeasures(entityType).filter((_) => !indicators.some((indicator) => indicator.name === _.name))
  if (measures.length) {
    context += `  measures:\n`
    + measures.map((item) => 
      [
        `  - name: "${item.name}"`,
        `    caption: ${item.caption || ''}`,
        item.description && item.description !== item.caption ? 
        `    description: >
    ${prepend('      ', item.description)}` : null,
        item.formatting?.unit ?
        `    unit: ${item.formatting.unit}` : null,
      ].filter(nonBlank).join(`\n`)
    ).join('\n')
  }

  if (indicators.length) {
    context += `\n  indicators:\n` +
    indicators.map((item) =>
      [
        `   - name: "${item.name}"`,
        `     caption: ${item.caption || ''}`,
        item.description && item.description !== item.caption ? 
        `     description: >
    ${prepend('       ', item.description)}` : null,
        item.formatting?.unit ?
        `     unit: ${item.formatting.unit}` : null,
      ].filter(nonBlank).join(`\n`)
    ).join('\n')
  }

  if (variables.length) {
    context += `sap variables in this cube are:
    ${variables.map((variable) =>
      [
      `  - name: ${variable.name}`,
      `    caption: ${variable.caption}`,
      `    referenceDimension: ${variable.referenceDimension}`,
      `    referenceHierarchy: ${variable.referenceHierarchy}`,
      variable.variableEntryType === VariableEntryType.Required?
      `    required: true` : null,
      variable.defaultLow?
      `    defaultValueKey: ${variable.defaultLow}` : null,
      variable.defaultLowCaption?
      `    defaultValueCaption: ${variable.defaultLowCaption}` : null,
      ``,
      ].filter(nonBlank).join(`\n`)
    ).join('\n')}`
  }

  return context
}
  
export function markdownModelCube({modelId, dataSource, cube}: {modelId: string; dataSource: string; cube: EntityType}) {
  return `The model id is: ${modelId || 'N\\A'}` + `\nThe dataSource is: ${dataSource || 'N\\A'}` +
      `\n` + (cube ? markdownEntityType(cube) : '')
}

export const CubeVariablePrompt = `If the cube has sap variables then all variables is required are added to the 'variables' parameter of tool, where each variable has the format:
{
  dimension: {
    dimension: variable.referenceDimension,
    hierarchy: variable.referenceHierarchy,
    parameter: name of variable
  },
  members: [
    {
      key: variable.defaultValueKey,
      caption: variable.defaultValueCaption
    }
  ]
}.`

export const PROMPT_RETRIEVE_DIMENSION_MEMBER = `Analyze user input to determine whether the sentence involves dimension members.` +
  ` If it involves dimension members, the "${MEMBER_RETRIEVER_TOOL_NAME}" tool needs to be called to retrieve information about the dimension members.` +
  ` Otherwise, proceed to the next step directly.`

export const PROMPT_TIME_SLICER = `If you want to create a slicer using a time dimension, calculate the key of member in slicer based on the format string 'time_formatter' at the level of specific time granularity.`

export function makeCubeRulesPrompt() {
  return `The dimensions consist of three attributes: dimension, hierarchy, and level, each of which is taken from the name of dimension, hierarchy, and level in the cube, respectively.
Dimension name pattern: [Dimension Name];
Hierarchy name pattern: [Hierarchy Name];
Level name pattern: [Hierarchy Name].[Level Name];
Member key pattern: [MemberKey] (do not includes [Hierarchy Name] and [Level Name] in member key field).
Use the code of indicator as measure name.
`
}