import {
    KBMetadataFieldDef,
    KnowledgeFilterCondition,
    KnowledgeFilterNode,
    KnowledgeFilterOperator,
    KnowledgeFilterValue,
    MetadataFieldType,
    TKBRetrievalSettings
} from '@xpert-ai/contracts'

type JsonRecord = Record<string, unknown>

export type KnowledgeFilterMigrationIssue = {
    location: string
    knowledgebaseIds: string[]
    message: string
}

export type KnowledgeFilterConfigMigrationResult<T = unknown> = {
    value: T
    changed: boolean
    migratedRetrievals: number
    issues: KnowledgeFilterMigrationIssue[]
}

type LegacyCondition = {
    comparisonOperator?: string
    value?: unknown
    variableSelector?: string
}

type LegacyCase = {
    logicalOperator?: string
    conditions?: LegacyCondition[]
}

const SYSTEM_FIELD_TYPES: Record<string, MetadataFieldType> = {
    'document.fileName': 'string',
    'document.folderPath': 'string',
    'document.fileExtension': 'string',
    'document.mimeType': 'string',
    'document.category': 'enum',
    'document.sourceType': 'enum',
    'document.createdAt': 'datetime',
    'document.updatedAt': 'datetime'
}

const LEGACY_SYSTEM_FIELD_ALIASES: Record<string, string> = {
    title: 'document.fileName',
    name: 'document.fileName',
    originalFileName: 'document.fileName',
    fileName: 'document.fileName',
    folder: 'document.folderPath',
    folderPath: 'document.folderPath',
    type: 'document.fileExtension',
    fileExtension: 'document.fileExtension',
    mimeType: 'document.mimeType',
    category: 'document.category',
    sourceType: 'document.sourceType',
    createdAt: 'document.createdAt',
    updatedAt: 'document.updatedAt'
}

const LEGACY_OPERATOR_MAP: Record<string, KnowledgeFilterOperator> = {
    contains: 'contains',
    'not-contains': 'notContains',
    equal: 'eq',
    'not-equal': 'neq',
    gt: 'gt',
    ge: 'gte',
    lt: 'lt',
    le: 'lte',
    'starts-with': 'startsWith',
    'ends-with': 'endsWith'
}

export function migrateKnowledgeFilterConfigurations<T>(
    input: T,
    schemaByKnowledgebaseId: Map<string, KBMetadataFieldDef[]>,
    rootLocation: string
): KnowledgeFilterConfigMigrationResult<T> {
    const value = cloneJson(input)
    const resolvedSchemas = new Map(schemaByKnowledgebaseId)
    collectEmbeddedKnowledgebaseSchemas(value, resolvedSchemas)
    const issues: KnowledgeFilterMigrationIssue[] = []
    let migratedRetrievals = 0

    const visit = (item: unknown, location: string) => {
        if (!isRecord(item)) return

        const retrievals = item.retrievals
        if (isRecord(retrievals)) {
            for (const [knowledgebaseId, retrieval] of Object.entries(retrievals)) {
                const result = migrateRetrieval(
                    retrieval,
                    [knowledgebaseId],
                    resolvedSchemas,
                    `${location}.retrievals.${knowledgebaseId}`
                )
                issues.push(...result.issues)
                if (result.changed) {
                    retrievals[knowledgebaseId] = result.value
                    migratedRetrievals += 1
                }
            }
        }

        if ('retrieval' in item) {
            const knowledgebaseIds = Array.isArray(item.knowledgebases)
                ? item.knowledgebases.filter((id): id is string => typeof id === 'string')
                : []
            const result = migrateRetrieval(item.retrieval, knowledgebaseIds, resolvedSchemas, `${location}.retrieval`)
            issues.push(...result.issues)
            if (result.changed) {
                item.retrieval = result.value
                migratedRetrievals += 1
            }
        }

        for (const [key, child] of Object.entries(item)) {
            if (key !== 'retrievals' && key !== 'retrieval') {
                if (Array.isArray(child)) child.forEach((entry, index) => visit(entry, `${location}.${key}[${index}]`))
                else visit(child, `${location}.${key}`)
            }
        }
    }

    visit(value, rootLocation)
    return {
        value,
        changed: migratedRetrievals > 0,
        migratedRetrievals,
        issues
    }
}

function collectEmbeddedKnowledgebaseSchemas(value: unknown, schemas: Map<string, KBMetadataFieldDef[]>) {
    if (Array.isArray(value)) {
        value.forEach((item) => collectEmbeddedKnowledgebaseSchemas(item, schemas))
        return
    }
    if (!isRecord(value)) return
    if (typeof value.id === 'string' && Array.isArray(value.metadataSchema)) {
        const definitions = value.metadataSchema.filter(
            (field): field is KBMetadataFieldDef =>
                isRecord(field) && typeof field.key === 'string' && typeof field.type === 'string'
        )
        schemas.set(value.id, definitions)
    }
    Object.values(value).forEach((item) => collectEmbeddedKnowledgebaseSchemas(item, schemas))
}

function migrateRetrieval(
    input: unknown,
    knowledgebaseIds: string[],
    schemaByKnowledgebaseId: Map<string, KBMetadataFieldDef[]>,
    location: string
): KnowledgeFilterConfigMigrationResult<TKBRetrievalSettings | unknown> {
    if (!isRecord(input) || !('metadata' in input)) {
        return { value: input, changed: false, migratedRetrievals: 0, issues: [] }
    }
    const metadata = input.metadata
    if (!isRecord(metadata) || typeof metadata.filtering_mode !== 'string') {
        return migrationFailure(input, location, knowledgebaseIds, 'Legacy retrieval metadata is malformed.')
    }
    if ('filtering' in input) {
        return migrationFailure(
            input,
            location,
            knowledgebaseIds,
            'Retrieval contains both legacy metadata and Knowledge Filter V2 filtering.'
        )
    }

    const mode = metadata.filtering_mode
    if (!['disabled', 'automatic', 'manual'].includes(mode)) {
        return migrationFailure(input, location, knowledgebaseIds, `Unknown legacy filtering mode '${mode}'.`)
    }

    let fixed: KnowledgeFilterNode | undefined
    if (mode === 'manual') {
        const result = convertLegacyCase(
            metadata.filtering_conditions,
            knowledgebaseIds,
            schemaByKnowledgebaseId,
            location
        )
        if (result.issues.length) {
            return { value: input, changed: false, migratedRetrievals: 0, issues: result.issues }
        }
        fixed = result.value
    }

    const { metadata: _legacyMetadata, ...settings } = input
    return {
        value: {
            ...settings,
            mode: typeof settings.mode === 'string' ? settings.mode : 'vector',
            filtering: {
                ...(fixed ? { fixed } : {}),
                agent: { enabled: mode === 'automatic' }
            }
        } as TKBRetrievalSettings,
        changed: true,
        migratedRetrievals: 1,
        issues: []
    }
}

function convertLegacyCase(
    input: unknown,
    knowledgebaseIds: string[],
    schemaByKnowledgebaseId: Map<string, KBMetadataFieldDef[]>,
    location: string
): { value?: KnowledgeFilterNode; issues: KnowledgeFilterMigrationIssue[] } {
    if (!isRecord(input)) {
        return {
            issues: [issue(location, knowledgebaseIds, 'Manual filtering has no valid filtering_conditions value.')]
        }
    }
    const legacy = input as LegacyCase
    if (!['and', 'or'].includes(legacy.logicalOperator ?? '') || !Array.isArray(legacy.conditions)) {
        return { issues: [issue(location, knowledgebaseIds, 'Legacy manual filter group is malformed.')] }
    }
    if (legacy.conditions.length > 20) {
        return { issues: [issue(location, knowledgebaseIds, 'Legacy manual filter has more than 20 conditions.')] }
    }
    if (!legacy.conditions.length) return { value: undefined, issues: [] }

    const conditions: KnowledgeFilterCondition[] = []
    const issues: KnowledgeFilterMigrationIssue[] = []
    legacy.conditions.forEach((condition, index) => {
        try {
            conditions.push(
                convertLegacyCondition(
                    condition,
                    knowledgebaseIds,
                    schemaByKnowledgebaseId,
                    `${location}.conditions[${index}]`
                )
            )
        } catch (error) {
            issues.push(issue(location + `.conditions[${index}]`, knowledgebaseIds, getErrorMessage(error)))
        }
    })
    if (issues.length) return { issues }
    return {
        value: {
            kind: 'group',
            operator: legacy.logicalOperator as 'and' | 'or',
            children: conditions
        },
        issues: []
    }
}

function convertLegacyCondition(
    condition: LegacyCondition,
    knowledgebaseIds: string[],
    schemaByKnowledgebaseId: Map<string, KBMetadataFieldDef[]>,
    location: string
): KnowledgeFilterCondition {
    const legacyField = condition.variableSelector?.trim()
    if (!legacyField) throw new Error('Legacy condition has no field selector.')
    const definition = resolveFieldDefinition(legacyField, knowledgebaseIds, schemaByKnowledgebaseId)
    if (!definition) {
        throw new Error(`Field '${legacyField}' is not present with the same type in every bound knowledgebase.`)
    }

    let operator = LEGACY_OPERATOR_MAP[condition.comparisonOperator ?? '']
    let forcedValue: boolean | undefined
    if (condition.comparisonOperator === 'is-true') {
        operator = 'eq'
        forcedValue = true
    } else if (condition.comparisonOperator === 'is-false') {
        operator = 'eq'
        forcedValue = false
    }
    if (!operator) {
        throw new Error(
            `Operator '${condition.comparisonOperator ?? ''}' has no semantics-preserving Knowledge Filter V2 conversion.`
        )
    }

    const rawValue = forcedValue ?? condition.value
    const value = createMigratedValue(rawValue, definition.type, definition.enumValues, location)
    return {
        kind: 'condition',
        field: definition.field,
        operator,
        value
    }
}

function resolveFieldDefinition(
    legacyField: string,
    knowledgebaseIds: string[],
    schemaByKnowledgebaseId: Map<string, KBMetadataFieldDef[]>
): { field: string; type: MetadataFieldType; enumValues?: string[] } | undefined {
    if (legacyField in SYSTEM_FIELD_TYPES) {
        return { field: legacyField, type: SYSTEM_FIELD_TYPES[legacyField] }
    }
    if (!knowledgebaseIds.length) return undefined

    const explicitPrefix = legacyField.startsWith('metadata.')
        ? 'document'
        : legacyField.startsWith('chunk.metadata.')
          ? 'chunk'
          : undefined
    const rawKey = legacyField.replace(/^metadata\./, '').replace(/^chunk\.metadata\./, '')
    const definitions = knowledgebaseIds.map((id) =>
        (schemaByKnowledgebaseId.get(id) ?? []).find(
            (field) => field.key === rawKey && (!explicitPrefix || (field.scope ?? 'document') === explicitPrefix)
        )
    )
    if (definitions.every(Boolean)) {
        const first = definitions[0]
        const sameType = definitions.every(
            (field) => field?.type === first?.type && (field.scope ?? 'document') === (first?.scope ?? 'document')
        )
        if (sameType && first) {
            return {
                field: `${first.scope === 'chunk' ? 'chunk.metadata' : 'metadata'}.${first.key}`,
                type: first.type,
                enumValues: first.enumValues
            }
        }
    }

    const systemField = LEGACY_SYSTEM_FIELD_ALIASES[legacyField]
    return systemField ? { field: systemField, type: SYSTEM_FIELD_TYPES[systemField] } : undefined
}

function createMigratedValue(
    rawValue: unknown,
    type: MetadataFieldType,
    enumValues: string[] | undefined,
    location: string
): KnowledgeFilterValue {
    if (typeof rawValue === 'string') {
        const variable = rawValue.match(/^\s*\{\{\s*([^{}]+?)\s*\}\}\s*$/)
        if (variable) return { kind: 'variable', selector: variable[1] }
    }
    const value = parseLiteral(rawValue, type, location)
    if (type === 'enum' && enumValues?.length && !enumValues.includes(String(value))) {
        throw new Error(`Value '${String(value)}' is not allowed by the enum schema.`)
    }
    return { kind: 'literal', value }
}

function parseLiteral(value: unknown, type: MetadataFieldType, location: string) {
    if (type === 'number') {
        const parsed = typeof value === 'number' ? value : Number(value)
        if (!Number.isFinite(parsed)) throw new Error(`Value at '${location}' is not a number.`)
        return parsed
    }
    if (type === 'boolean') {
        if (typeof value === 'boolean') return value
        if (value === 'true') return true
        if (value === 'false') return false
        throw new Error(`Value at '${location}' is not a boolean.`)
    }
    if (type === 'datetime') {
        const parsed = new Date(String(value))
        if (Number.isNaN(parsed.valueOf())) throw new Error(`Value at '${location}' is not a datetime.`)
        return parsed.toISOString()
    }
    if (type === 'string[]' || type === 'number[]' || type === 'object') {
        try {
            const parsed = typeof value === 'string' ? JSON.parse(value) : value
            if (type === 'object' && (!isRecord(parsed) || Array.isArray(parsed))) throw new Error()
            if (type.endsWith('[]') && !Array.isArray(parsed)) throw new Error()
            return parsed
        } catch {
            throw new Error(`Value at '${location}' is not valid ${type} JSON.`)
        }
    }
    if (typeof value !== 'string') throw new Error(`Value at '${location}' is not a string.`)
    if (value.length > 512) throw new Error(`Value at '${location}' exceeds 512 characters.`)
    return value
}

function migrationFailure(
    value: unknown,
    location: string,
    knowledgebaseIds: string[],
    message: string
): KnowledgeFilterConfigMigrationResult<unknown> {
    return {
        value,
        changed: false,
        migratedRetrievals: 0,
        issues: [issue(location, knowledgebaseIds, message)]
    }
}

function issue(location: string, knowledgebaseIds: string[], message: string): KnowledgeFilterMigrationIssue {
    return { location, knowledgebaseIds, message }
}

function isRecord(value: unknown): value is JsonRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
    return value == null ? value : (JSON.parse(JSON.stringify(value)) as T)
}

function getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
}
