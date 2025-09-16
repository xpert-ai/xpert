import { AggregationRole, EntityType, getDimensionHierarchies, getEntityDimensions, getEntityIndicators, getEntityMeasures, getEntityParameters, getEntityProperty, getHierarchyLevels, isAggregationProperty, isCalculatedProperty, isRestrictedMeasureProperty, RuntimeLevelType, VariableEntryType, VariableProperty } from "../models";
import { nonBlank } from "../utils";
import { MEMBER_RETRIEVER_TOOL_NAME } from "./constants"

export function prepend(prefix: string, text: string) {
  return text?.split('\n').map(line => prefix + line).join('\n') ?? ''
}

/**
 * Convert cube (EntityType) to markdown format.
 */
export function markdownEntityType(entityType: EntityType) {

  let context = `The cube definition for (${entityType.name}) is as follows:
name: ${entityType.name}
caption: ${entityType.caption || ''}
description: >
${prepend('  ', entityType.description || entityType.caption)}
dimensions:
${getEntityDimensions(entityType).filter((_) => !_.semantics?.hidden)
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
  getDimensionHierarchies(dimension).filter((_) => !_.semantics?.hidden).map((item) =>[
  `      - name: "${item.name}"`,
  `        caption: "${item.caption || ''}"`,
  item.description && item.description !== item.caption ?
  `        description: >
  ${prepend('          ', item.description)}` : null,
  `        levels:
${getHierarchyLevels(item).filter((level) => level.levelType !== RuntimeLevelType.ALL && !level.semantics?.hidden).map((item) =>
  [
  `          - name: "${item.name}"`,
  `            caption: "${item.caption || ''}"`,
  item.description && item.description !== item.caption ?
  `            description: >
  ${prepend('              ', item.description)}` : null,
  item.semantics?.semantic ?
  `            semantic: ${item.semantics.semantic}` : null,
  item.semantics?.formatter ? 
  `            time_formatter: "${item.semantics.formatter}"` : null,
    item.properties.length ? 
  `            properties:` : null,
    item.properties?.map((_) => 
  `              - name: ${_.name}\n                caption: ${_.caption}`
    ).join('\n')
  ].filter(nonBlank).join('\n')).join('\n')}`].join('\n')).join('\n')
  ).join('\n')}
`

  context += markdownMeasures(entityType)
  context += markdownParameters(entityType)

  return context
}

function markdownMeasures(entityType: EntityType) {
  let context = ''
  const indicators = getEntityIndicators(entityType).filter((_) => !_.semantics?.hidden)
  const measures = getEntityMeasures(entityType).filter((_) => !_.semantics?.hidden && !indicators.some((indicator) => indicator.name === _.name))
  if (measures.length) {
    context += `measures:\n`
    + measures.map((item) => {
      const depend_parameters = markdownCalculationParams(entityType, item.name)
      return [
        `  - name: "${item.name}"`,
        `    caption: ${item.caption || ''}`,
        item.description && item.description !== item.caption ? 
        `    description: >
    ${prepend('      ', item.description)}` : null,
        item.formatting?.unit ?
        `    unit: ${item.formatting.unit}` : null,
        depend_parameters ? prepend('    ', depend_parameters) : null,
      ].filter(nonBlank).join(`\n`)
    }).join('\n')
  }

  if (indicators.length) {
    context += `\nindicators:\n` +
    indicators.map((item) => {
      const depend_parameters = markdownCalculationParams(entityType, item.name)
      return [
        `   - name: "${item.name}"`,
        `     caption: ${item.caption || ''}`,
        item.description && item.description !== item.caption ? 
        `     description: >
    ${prepend('       ', item.description)}` : null,
        item.formatting?.unit ?
        `     unit: ${item.formatting.unit}` : null,
        item.dimensions?.length ?
        `     available_dimensions: ${item.dimensions.map((_) => `\`${_}\``).join(', ')}` : null,
        depend_parameters ? prepend('     ', depend_parameters) : null,
      ].filter(nonBlank).join(`\n`)
    }).join('\n')
  }

  return context
}

export function markdownParameters(entityType: EntityType) {
  const _paramerters = getEntityParameters(entityType)
  const variables = _paramerters.filter((_) => _.role === AggregationRole.variable) as VariableProperty[]
  const parameters = _paramerters.filter((_) => _.role !== AggregationRole.variable)

  let context = ''
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

  if (parameters.length) {
    context += `\n  parameters:\n` +
      parameters.map((item) =>
        [
          `  - name: "${item.name}"`,
          `    caption: ${item.caption || ''}`,
          item.description && item.description !== item.caption ? 
          `    description: >
    ${prepend('      ', item.description)}` : null,
          `    type: ${item.dataType}`,
        ].filter(nonBlank).join(`\n`)
      ).join('\n')
  }
  return context
}

export function markdownCalculationParams(entityType: EntityType, name: string) {
  const store = {}
  const params = getPropertyDependParameters(entityType, name, store)
  return params.length ? `depend_parameters: ${params.map((param) => `\`${param}\``).join(', ')}` : ''
}

function getPropertyDependParameters(entityType: EntityType, name: string, store: Record<string, string[]>) {
  if (store[name]) {
    return store[name]
  }
  const property = getEntityProperty(entityType, name)
  const regex = /\[@([^\]]+)\]/g;
  const params = []
  if (isCalculatedProperty(property)) {
    let match = null;
    while ((match = regex.exec(property.formula)) !== null) {
      params.push(match[1])
    }
  } else if (isAggregationProperty(property)) {
    if (typeof property.value === 'string') {
      let match = null;
      while ((match = regex.exec(property.value)) !== null) {
        params.push(match[1])
      }
    }
    if (property.measure) {
      params.push(...getPropertyDependParameters(entityType, property.measure, store))
    }
  } else if (isRestrictedMeasureProperty(property)) {
    if (property.measure) {
      params.push(...getPropertyDependParameters(entityType, property.measure, store))
    }
  }

  store[name] = Array.from(new Set(params))
  return store[name]
}

/**
 * Convert cube to markdown format
 */
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