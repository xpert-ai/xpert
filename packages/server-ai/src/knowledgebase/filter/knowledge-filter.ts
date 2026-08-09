import {
    IKnowledgebase,
    KBMetadataFieldDef,
    KnowledgeFilterDiagnostics,
    KnowledgeFilterJSONValue,
    KnowledgeFilterNode,
    KnowledgeFilterOperator,
    KnowledgeFilterSources,
    KNOWLEDGE_FILTER_MAX_CONDITIONS,
    KNOWLEDGE_FILTER_MAX_DEPTH,
    KNOWLEDGE_FILTER_MAX_SET_VALUES,
    KNOWLEDGE_FILTER_MAX_STRING_LENGTH,
    KNOWLEDGE_FILTER_VERSION,
    MetadataFieldType
} from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import get from 'lodash/get'

export type KnowledgeFilterFieldScope = 'document' | 'documentMetadata' | 'chunkMetadata'

export type KnowledgeFilterFieldDefinition = {
    field: string
    type: MetadataFieldType
    scope: KnowledgeFilterFieldScope
    column?: string
    metadataKey?: string
    operators: readonly KnowledgeFilterOperator[]
    agentVisible: boolean
    description?: string
    enumValues?: string[]
}

export type PreparedKnowledgeFilter = {
    sources: KnowledgeFilterSources
    effective?: KnowledgeFilterNode
    registry: Map<string, KnowledgeFilterFieldDefinition>
    diagnostics: KnowledgeFilterDiagnostics
}

export type CompiledPostgresFilter = {
    sql: string
    parameters: unknown[]
}

export type CompiledMilvusFilter = {
    expression: string
    values: Record<string, unknown>
}

export class KnowledgeFilterValidationError extends Error {
    constructor(
        message: string,
        readonly code:
            | 'INVALID_FILTER'
            | 'UNKNOWN_FIELD'
            | 'INVALID_OPERATOR'
            | 'INVALID_VALUE'
            | 'MISSING_VARIABLE'
            | 'FILTER_TOO_COMPLEX'
    ) {
        super(message)
        this.name = 'KnowledgeFilterValidationError'
    }
}

const STRING_OPERATORS = [
    'eq',
    'neq',
    'in',
    'notIn',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'exists'
] as const satisfies readonly KnowledgeFilterOperator[]
const NUMBER_OPERATORS = [
    'eq',
    'neq',
    'in',
    'gt',
    'gte',
    'lt',
    'lte',
    'between',
    'exists'
] as const satisfies readonly KnowledgeFilterOperator[]
const ARRAY_OPERATORS = [
    'contains',
    'containsAny',
    'containsAll',
    'isEmpty',
    'exists'
] as const satisfies readonly KnowledgeFilterOperator[]

const TYPE_OPERATORS: Record<MetadataFieldType, readonly KnowledgeFilterOperator[]> = {
    string: STRING_OPERATORS,
    enum: ['eq', 'neq', 'in', 'notIn', 'exists'],
    datetime: NUMBER_OPERATORS,
    number: NUMBER_OPERATORS,
    boolean: ['eq', 'neq', 'exists'],
    'string[]': ARRAY_OPERATORS,
    'number[]': ARRAY_OPERATORS,
    object: ['jsonContains', 'exists']
}

const SYSTEM_FIELDS: KnowledgeFilterFieldDefinition[] = [
    systemField('document.fileName', 'string', 'name'),
    {
        ...systemField('document.folderPath', 'string', 'folder'),
        operators: [...STRING_OPERATORS, 'under']
    },
    systemField('document.fileExtension', 'string', 'type'),
    systemField('document.mimeType', 'string', 'mimeType'),
    {
        ...systemField('document.category', 'enum', 'category'),
        enumValues: ['text', 'image', 'audio', 'video', 'sheet', 'other']
    },
    {
        ...systemField('document.sourceType', 'enum', 'sourceType'),
        enumValues: ['local-file', 'file-system', 'online-document', 'web-crawl', 'database', 'folder', 'file']
    },
    systemField('document.createdAt', 'datetime', 'createdAt'),
    systemField('document.updatedAt', 'datetime', 'updatedAt'),
    {
        ...systemField('document.id', 'string', 'id'),
        agentVisible: false
    }
]

function systemField(field: string, type: MetadataFieldType, column: string): KnowledgeFilterFieldDefinition {
    return {
        field,
        type,
        scope: 'document',
        column,
        operators: TYPE_OPERATORS[type],
        agentVisible: true
    }
}

export function createKnowledgeFilterRegistry(
    knowledgebase: Pick<IKnowledgebase, 'metadataSchema'>
): Map<string, KnowledgeFilterFieldDefinition> {
    const registry = new Map(SYSTEM_FIELDS.map((field) => [field.field, field]))
    for (const definition of knowledgebase.metadataSchema ?? []) {
        const scope = definition.scope === 'chunk' ? 'chunkMetadata' : 'documentMetadata'
        const prefix = scope === 'chunkMetadata' ? 'chunk.metadata.' : 'metadata.'
        registry.set(prefix + definition.key, metadataField(prefix + definition.key, definition, scope))
    }
    return registry
}

function metadataField(
    field: string,
    definition: KBMetadataFieldDef,
    scope: Extract<KnowledgeFilterFieldScope, 'documentMetadata' | 'chunkMetadata'>
): KnowledgeFilterFieldDefinition {
    return {
        field,
        type: definition.type,
        scope,
        metadataKey: definition.key,
        operators: TYPE_OPERATORS[definition.type],
        agentVisible: true,
        description: definition.description,
        enumValues: definition.enumValues
    }
}

export function prepareKnowledgeFilter(input: {
    knowledgebase: Pick<IKnowledgebase, 'metadataSchema'>
    filters?: KnowledgeFilterSources
    variables?: Record<string, unknown>
    vectorBackend?: string
}): PreparedKnowledgeFilter {
    const registry = createKnowledgeFilterRegistry(input.knowledgebase)
    const errors: string[] = []
    const sources: KnowledgeFilterSources = {}

    if (input.filters?.fixed) {
        sources.fixed = validateKnowledgeFilter(input.filters.fixed, registry, {
            allowVariables: true,
            variables: input.variables,
            source: 'fixed'
        })
    }
    if (input.filters?.request) {
        sources.request = validateKnowledgeFilter(input.filters.request, registry, {
            allowVariables: false,
            source: 'request'
        })
    }
    let fallbackReason: KnowledgeFilterDiagnostics['fallbackReason']
    if (input.filters?.dynamic) {
        try {
            sources.dynamic = validateKnowledgeFilter(input.filters.dynamic, registry, {
                allowVariables: false,
                source: 'dynamic'
            })
        } catch (error) {
            fallbackReason = 'invalid_dynamic_filter'
            errors.push(error instanceof Error ? error.message : String(error))
        }
    }

    const effective = mergeKnowledgeFilters(sources.fixed, sources.request, sources.dynamic)
    const filterHash = effective ? createHash('sha256').update(JSON.stringify(effective)).digest('hex') : undefined
    return {
        sources,
        effective,
        registry,
        diagnostics: {
            filterVersion: KNOWLEDGE_FILTER_VERSION,
            fixedFilter: sources.fixed,
            requestFilter: sources.request,
            dynamicFilter: input.filters?.dynamic,
            effectiveFilter: effective,
            filterHash,
            filterStatus: fallbackReason ? 'dynamic_fallback' : effective ? 'applied' : 'not_applied',
            fallbackReason,
            hitCount: 0,
            vectorBackend: input.vectorBackend,
            errors: errors.length ? errors : undefined
        }
    }
}

export function mergeKnowledgeFilters(
    ...filters: Array<KnowledgeFilterNode | undefined>
): KnowledgeFilterNode | undefined {
    const children = filters.filter((filter): filter is KnowledgeFilterNode => !!filter)
    if (!children.length) return undefined
    if (children.length === 1) return children[0]
    return { kind: 'group', operator: 'and', children } as KnowledgeFilterNode
}

export function validateKnowledgeFilter(
    node: KnowledgeFilterNode,
    registry: Map<string, KnowledgeFilterFieldDefinition>,
    options: {
        allowVariables: boolean
        variables?: Record<string, unknown>
        source: 'fixed' | 'request' | 'dynamic'
    }
): KnowledgeFilterNode {
    const state = { conditions: 0 }
    return validateNode(node, registry, options, state, 1)
}

function validateNode(
    node: KnowledgeFilterNode,
    registry: Map<string, KnowledgeFilterFieldDefinition>,
    options: {
        allowVariables: boolean
        variables?: Record<string, unknown>
        source: 'fixed' | 'request' | 'dynamic'
    },
    state: { conditions: number },
    depth: number
): KnowledgeFilterNode {
    if (!node || typeof node !== 'object') {
        throw new KnowledgeFilterValidationError('Filter node must be an object.', 'INVALID_FILTER')
    }
    if (node.kind === 'group') {
        if (depth > KNOWLEDGE_FILTER_MAX_DEPTH) {
            throw new KnowledgeFilterValidationError(
                `Filter nesting exceeds ${KNOWLEDGE_FILTER_MAX_DEPTH} levels.`,
                'FILTER_TOO_COMPLEX'
            )
        }
        if (!['and', 'or'].includes(node.operator) || !Array.isArray(node.children) || !node.children.length) {
            throw new KnowledgeFilterValidationError(
                'Filter group must contain children and a valid operator.',
                'INVALID_FILTER'
            )
        }
        return {
            kind: 'group',
            operator: node.operator,
            children: node.children.map((child) => validateNode(child, registry, options, state, depth + 1))
        } as KnowledgeFilterNode
    }
    if (node.kind !== 'condition') {
        throw new KnowledgeFilterValidationError('Unknown filter node kind.', 'INVALID_FILTER')
    }
    state.conditions += 1
    if (state.conditions > KNOWLEDGE_FILTER_MAX_CONDITIONS) {
        throw new KnowledgeFilterValidationError(
            `Filter contains more than ${KNOWLEDGE_FILTER_MAX_CONDITIONS} conditions.`,
            'FILTER_TOO_COMPLEX'
        )
    }
    const definition = registry.get(node.field)
    if (!definition) {
        throw new KnowledgeFilterValidationError(`Unknown knowledge filter field '${node.field}'.`, 'UNKNOWN_FIELD')
    }
    if (!definition.operators.includes(node.operator)) {
        throw new KnowledgeFilterValidationError(
            `Operator '${node.operator}' is not valid for field '${node.field}'.`,
            'INVALID_OPERATOR'
        )
    }
    const value = resolveFilterValue(node, definition, options)
    return {
        kind: 'condition',
        field: node.field,
        operator: node.operator,
        ...(value === undefined ? {} : { value: { kind: 'literal', value } })
    }
}

function resolveFilterValue(
    node: Extract<KnowledgeFilterNode, { kind: 'condition' }>,
    definition: KnowledgeFilterFieldDefinition,
    options: {
        allowVariables: boolean
        variables?: Record<string, unknown>
        source: 'fixed' | 'request' | 'dynamic'
    }
): KnowledgeFilterJSONValue | undefined {
    if (node.operator === 'exists' || node.operator === 'isEmpty') {
        return undefined
    }
    if (!node.value) {
        throw new KnowledgeFilterValidationError(`Field '${node.field}' requires a value.`, 'INVALID_VALUE')
    }
    let value: unknown
    if (node.value.kind === 'variable') {
        if (!options.allowVariables) {
            throw new KnowledgeFilterValidationError(
                `${options.source} filters cannot reference runtime variables.`,
                'INVALID_VALUE'
            )
        }
        value = get(options.variables ?? {}, node.value.selector)
        if (value === undefined) {
            throw new KnowledgeFilterValidationError(
                `Required fixed-filter variable '${node.value.selector}' is missing.`,
                'MISSING_VARIABLE'
            )
        }
    } else if (node.value.kind === 'literal') {
        value = node.value.value
    } else {
        throw new KnowledgeFilterValidationError('Unknown filter value kind.', 'INVALID_VALUE')
    }
    validateValue(node.operator, definition, value)
    return value as KnowledgeFilterJSONValue
}

function validateValue(operator: KnowledgeFilterOperator, definition: KnowledgeFilterFieldDefinition, value: unknown) {
    validateStrings(value)
    if (['in', 'notIn'].includes(operator)) {
        if (!Array.isArray(value) || !value.length || value.length > KNOWLEDGE_FILTER_MAX_SET_VALUES) {
            throw new KnowledgeFilterValidationError(
                `'${operator}' requires between 1 and ${KNOWLEDGE_FILTER_MAX_SET_VALUES} values.`,
                'INVALID_VALUE'
            )
        }
        value.forEach((item) => validateScalar(definition, item))
        return
    }
    if (operator === 'between') {
        if (!Array.isArray(value) || value.length !== 2) {
            throw new KnowledgeFilterValidationError("'between' requires exactly two values.", 'INVALID_VALUE')
        }
        value.forEach((item) => validateScalar(definition, item))
        return
    }
    if (['containsAny', 'containsAll'].includes(operator)) {
        if (!Array.isArray(value) || !value.length || value.length > KNOWLEDGE_FILTER_MAX_SET_VALUES) {
            throw new KnowledgeFilterValidationError(`'${operator}' requires a non-empty value array.`, 'INVALID_VALUE')
        }
        const expected = definition.type === 'string[]' ? 'string' : 'number'
        if (!value.every((item) => typeof item === expected && (expected !== 'number' || Number.isFinite(item)))) {
            throw new KnowledgeFilterValidationError(
                `Field '${definition.field}' requires ${expected} array values.`,
                'INVALID_VALUE'
            )
        }
        return
    }
    if (operator === 'jsonContains') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new KnowledgeFilterValidationError("'jsonContains' requires an object value.", 'INVALID_VALUE')
        }
        return
    }
    if (['string[]', 'number[]'].includes(definition.type) && operator === 'contains') {
        const expected = definition.type === 'string[]' ? 'string' : 'number'
        if (typeof value !== expected) {
            throw new KnowledgeFilterValidationError(
                `Field '${definition.field}' requires a ${expected} value.`,
                'INVALID_VALUE'
            )
        }
        return
    }
    validateScalar(definition, value)
}

function validateScalar(definition: KnowledgeFilterFieldDefinition, value: unknown) {
    const type = definition.type
    const valid =
        (['string', 'enum', 'datetime'].includes(type) && typeof value === 'string') ||
        (type === 'number' && typeof value === 'number' && Number.isFinite(value)) ||
        (type === 'boolean' && typeof value === 'boolean')
    if (!valid) {
        throw new KnowledgeFilterValidationError(
            `Value type does not match field '${definition.field}' (${type}).`,
            'INVALID_VALUE'
        )
    }
    if (type === 'datetime' && (Number.isNaN(Date.parse(String(value))) || !String(value).endsWith('Z'))) {
        throw new KnowledgeFilterValidationError(
            `Field '${definition.field}' requires an ISO-8601 datetime.`,
            'INVALID_VALUE'
        )
    }
    if (type === 'enum' && definition.enumValues?.length && !definition.enumValues.includes(String(value))) {
        throw new KnowledgeFilterValidationError(
            `Value is not allowed for enum field '${definition.field}'.`,
            'INVALID_VALUE'
        )
    }
}

function validateStrings(value: unknown) {
    if (typeof value === 'string' && value.length > KNOWLEDGE_FILTER_MAX_STRING_LENGTH) {
        throw new KnowledgeFilterValidationError(
            `Filter strings cannot exceed ${KNOWLEDGE_FILTER_MAX_STRING_LENGTH} characters.`,
            'INVALID_VALUE'
        )
    }
    if (Array.isArray(value)) value.forEach(validateStrings)
    else if (value && typeof value === 'object') Object.values(value).forEach(validateStrings)
}

export function compileKnowledgeFilterToPostgres(
    node: KnowledgeFilterNode,
    registry: Map<string, KnowledgeFilterFieldDefinition>,
    parameterOffset = 0
): CompiledPostgresFilter {
    const parameters: unknown[] = []
    const parameter = (value: unknown) => {
        parameters.push(value)
        return `$${parameterOffset + parameters.length}`
    }
    const compile = (item: KnowledgeFilterNode): string => {
        if (item.kind === 'group') {
            const separator = item.operator === 'and' ? ' AND ' : ' OR '
            return `(${item.children.map(compile).join(separator)})`
        }
        const definition = registry.get(item.field)
        if (!definition) throw new KnowledgeFilterValidationError(`Unknown field '${item.field}'.`, 'UNKNOWN_FIELD')
        const value = item.value?.kind === 'literal' ? item.value.value : undefined
        return compilePostgresCondition(definition, item.operator, value, parameter)
    }
    return { sql: compile(node), parameters }
}

function compilePostgresCondition(
    definition: KnowledgeFilterFieldDefinition,
    operator: KnowledgeFilterOperator,
    value: KnowledgeFilterJSONValue | undefined,
    parameter: (value: unknown) => string
) {
    if (operator === 'exists') {
        return definition.scope === 'document'
            ? `d."${definition.column}" IS NOT NULL`
            : `${metadataOwner(definition)}."metadata"::jsonb ? ${parameter(definition.metadataKey)}`
    }
    const expression = postgresFieldExpression(definition, parameter)
    const scalarExpression =
        definition.scope === 'document' ? expression : postgresScalarExpression(expression, definition.type)
    switch (operator) {
        case 'eq':
            return `${scalarExpression} = ${parameter(value)}`
        case 'neq':
            return `${scalarExpression} IS DISTINCT FROM ${parameter(value)}`
        case 'in':
            return `${scalarExpression} = ANY(${parameter(value)})`
        case 'notIn':
            return `NOT (${scalarExpression} = ANY(${parameter(value)}))`
        case 'contains':
            if (definition.type === 'string[]' || definition.type === 'number[]') {
                return `${expression} @> ${parameter(JSON.stringify([value]))}::jsonb`
            }
            return `${scalarExpression} ILIKE ${parameter(`%${escapeLike(String(value))}%`)} ESCAPE '\\'`
        case 'notContains':
            return `NOT (${scalarExpression} ILIKE ${parameter(`%${escapeLike(String(value))}%`)} ESCAPE '\\')`
        case 'startsWith':
            return `${scalarExpression} ILIKE ${parameter(`${escapeLike(String(value))}%`)} ESCAPE '\\'`
        case 'endsWith':
            return `${scalarExpression} ILIKE ${parameter(`%${escapeLike(String(value))}`)} ESCAPE '\\'`
        case 'under': {
            const path = normalizeFolderPath(String(value))
            if (!path) return 'TRUE'
            return `(${scalarExpression} = ${parameter(path)} OR ${scalarExpression} ILIKE ${parameter(`${escapeLike(path)}/%`)} ESCAPE '\\')`
        }
        case 'gt':
            return `${scalarExpression} > ${parameter(value)}`
        case 'gte':
            return `${scalarExpression} >= ${parameter(value)}`
        case 'lt':
            return `${scalarExpression} < ${parameter(value)}`
        case 'lte':
            return `${scalarExpression} <= ${parameter(value)}`
        case 'between': {
            const [start, end] = value as KnowledgeFilterJSONValue[]
            return `${scalarExpression} BETWEEN ${parameter(start)} AND ${parameter(end)}`
        }
        case 'containsAny':
            return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(${expression}, '[]'::jsonb)) AS item(value) WHERE ${definition.type === 'number[]' ? 'item.value::numeric' : 'item.value'} = ANY(${parameter(value)}))`
        case 'containsAll':
            return `${expression} @> ${parameter(JSON.stringify(value))}::jsonb`
        case 'isEmpty':
            return `(${expression} IS NULL OR ${expression} = '[]'::jsonb)`
        case 'jsonContains':
            return `${expression} @> ${parameter(JSON.stringify(value))}::jsonb`
        default:
            throw new KnowledgeFilterValidationError(`Unsupported operator '${operator}'.`, 'INVALID_OPERATOR')
    }
}

function postgresFieldExpression(definition: KnowledgeFilterFieldDefinition, parameter: (value: unknown) => string) {
    if (definition.scope === 'document') return `d."${definition.column}"`
    return `${metadataOwner(definition)}."metadata"::jsonb -> ${parameter(definition.metadataKey)}`
}

function postgresScalarExpression(expression: string, type: MetadataFieldType) {
    if (['string', 'enum', 'datetime'].includes(type)) return `(${expression} #>> '{}')`
    if (type === 'number') return `(${expression} #>> '{}')::numeric`
    if (type === 'boolean') return `(${expression} #>> '{}')::boolean`
    return expression
}

function metadataOwner(definition: KnowledgeFilterFieldDefinition) {
    return definition.scope === 'chunkMetadata' ? 'c' : 'd'
}

export function compileKnowledgeFilterToMilvus(
    node: KnowledgeFilterNode,
    registry: Map<string, KnowledgeFilterFieldDefinition>
): CompiledMilvusFilter {
    const values: Record<string, unknown> = {}
    let index = 0
    const parameter = (value: unknown) => {
        const key = `p${index++}`
        values[key] = value
        return `{${key}}`
    }
    const compile = (item: KnowledgeFilterNode): string => {
        if (item.kind === 'group') {
            const separator = item.operator === 'and' ? ' and ' : ' or '
            return `(${item.children.map(compile).join(separator)})`
        }
        const definition = registry.get(item.field)
        if (!definition) throw new KnowledgeFilterValidationError(`Unknown field '${item.field}'.`, 'UNKNOWN_FIELD')
        const textPattern =
            ['contains', 'notContains', 'startsWith', 'endsWith'].includes(item.operator) &&
            ['string', 'enum'].includes(definition.type)
        const path = milvusFieldPath(definition, textPattern)
        const value = item.value?.kind === 'literal' ? item.value.value : undefined
        const textValue = textPattern ? String(value).toLocaleLowerCase() : value
        switch (item.operator) {
            case 'eq':
                return `${path} == ${parameter(value)}`
            case 'neq':
                return `${path} != ${parameter(value)}`
            case 'in':
                return `${path} in ${parameter(value)}`
            case 'notIn':
                return `not (${path} in ${parameter(value)})`
            case 'contains':
                return definition.type === 'string[]' || definition.type === 'number[]'
                    ? `json_contains(${path}, ${parameter(value)})`
                    : `${path} like ${parameter(`%${textValue}%`)}`
            case 'notContains':
                return `not (${path} like ${parameter(`%${textValue}%`)})`
            case 'startsWith':
                return `${path} like ${parameter(`${textValue}%`)}`
            case 'endsWith':
                return `${path} like ${parameter(`%${textValue}`)}`
            case 'under': {
                const folder = normalizeFolderPath(String(value))
                if (!folder) return `exists ${path}`
                return `(${path} == ${parameter(folder)} or ${path} like ${parameter(`${folder}/%`)})`
            }
            case 'gt':
                return `${path} > ${parameter(value)}`
            case 'gte':
                return `${path} >= ${parameter(value)}`
            case 'lt':
                return `${path} < ${parameter(value)}`
            case 'lte':
                return `${path} <= ${parameter(value)}`
            case 'between': {
                const [start, end] = value as KnowledgeFilterJSONValue[]
                return `(${path} >= ${parameter(start)} and ${path} <= ${parameter(end)})`
            }
            case 'exists':
                return `exists ${path}`
            case 'containsAny':
                return `json_contains_any(${path}, ${parameter(value)})`
            case 'containsAll':
                return `json_contains_all(${path}, ${parameter(value)})`
            case 'isEmpty':
                return `${path} == ${parameter([])}`
            case 'jsonContains':
                return `json_contains(${path}, ${parameter(value)})`
            default:
                throw new KnowledgeFilterValidationError('Unsupported Milvus filter operator.', 'INVALID_OPERATOR')
        }
    }
    return { expression: compile(node), values }
}

function milvusFieldPath(definition: KnowledgeFilterFieldDefinition, normalizedText = false) {
    if (definition.scope === 'document') {
        const logical = definition.field.slice('document.'.length)
        return `filterAttributes["${normalizedText ? 'documentText' : 'document'}"]["${logical}"]`
    }
    const scope = definition.scope === 'chunkMetadata' ? 'chunkMetadata' : 'metadata'
    return `filterAttributes["${normalizedText ? `${scope}Text` : scope}"]["${escapeMilvusKey(definition.metadataKey)}"]`
}

function escapeMilvusKey(value?: string) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
}

function escapeLike(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export function normalizeFolderPath(value: string) {
    const segments: string[] = []
    for (const segment of value.replace(/\\/g, '/').split('/')) {
        if (!segment || segment === '.') continue
        if (segment === '..') segments.pop()
        else segments.push(segment)
    }
    return segments.join('/')
}

export function createMilvusFilterAttributes(input: {
    document: Record<string, unknown>
    documentMetadata?: Record<string, unknown>
    chunkMetadata?: Record<string, unknown>
}) {
    const { filterAttributes: _filterAttributes, ...chunkMetadata } = input.chunkMetadata ?? {}
    const document = {
        fileName: input.document.name ?? null,
        folderPath: normalizeFolderPath(String(input.document.folder ?? '')),
        fileExtension:
            typeof input.document.type === 'string'
                ? input.document.type.trim().replace(/^\.+/, '').toLocaleLowerCase()
                : (input.document.type ?? null),
        mimeType:
            typeof input.document.mimeType === 'string'
                ? input.document.mimeType.trim().toLocaleLowerCase()
                : (input.document.mimeType ?? null),
        category: input.document.category ?? null,
        sourceType: input.document.sourceType ?? null,
        disabled: Boolean(input.document.disabled),
        createdAt: serializeDate(input.document.createdAt),
        updatedAt: serializeDate(input.document.updatedAt)
    }
    const metadata = input.documentMetadata ?? {}
    return {
        document,
        documentText: lowercaseTextValues(document),
        metadata,
        metadataText: lowercaseTextValues(metadata),
        chunkMetadata,
        chunkMetadataText: lowercaseTextValues(chunkMetadata)
    }
}

function lowercaseTextValues(value: unknown): unknown {
    if (typeof value === 'string') return value.toLocaleLowerCase()
    if (Array.isArray(value)) return value.map(lowercaseTextValues)
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, lowercaseTextValues(item)]))
    }
    return value
}

function serializeDate(value: unknown) {
    if (value instanceof Date) return value.toISOString()
    return value ?? null
}
