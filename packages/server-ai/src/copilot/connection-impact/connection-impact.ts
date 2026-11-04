import { ConnectionImpact, ConnectionImpactReference } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

const metadata = z.object({
    resourceType: z.enum(['default', 'assistant', 'knowledgebase', 'project', 'connection', 'binding']),
    resourceId: z.string(),
    resourceName: z.string(),
    organizationId: z.string().nullable(),
    version: z.string().nullable(),
    status: z.enum(['current', 'draft', 'published', 'historical', 'unresolved']),
    field: z.string()
})
const model = z.object({
    id: z.string(),
    root: z.string(),
    organizationId: z.string().nullable(),
    model: z.string().nullable(),
    modelType: z.string().nullable()
})
const direct = metadata.extend({
    bindingId: z.string(),
    root: z.string(),
    model: z.string().nullable(),
    modelType: z.string().nullable()
})
const document = metadata.extend({ document: z.unknown() })
const defaults = metadata.extend({ model: z.string().nullable(), modelType: z.string().nullable() })
type Model = Required<z.output<typeof model>>
type Metadata = Required<z.output<typeof metadata>>

function isObject(value: unknown): value is { [key: string]: unknown } {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function text(value: unknown): string | null {
    return typeof value === 'string' ? value : null
}

/** Inspect explicit persisted identity fields only. Unknown JSON is evidence, never an execution claim. */
function jsonReferences(source: Metadata, value: unknown, copilotId: string, models: Map<string, Model>) {
    const rows: ConnectionImpactReference[] = []
    const visit = (node: unknown, path: string, property?: string) => {
        if (Array.isArray(node)) {
            node.forEach((child, index) => visit(child, `${path}[${index}]`))
        } else if (isObject(node)) {
            const bindingId =
                text(node.referencedId) ??
                text(node.copilotModelId) ??
                (property === 'copilotModel' ? text(node.id) : null)
            const bound = bindingId ? models.get(bindingId) : undefined
            const connection = text(node.copilotId) ?? (isObject(node.copilot) ? text(node.copilot.id) : null)
            if (connection === copilotId || bound) {
                rows.push({
                    ...source,
                    evidence: 'json',
                    field: path,
                    bindingId: bound?.id ?? null,
                    model: text(node.model) ?? bound?.model ?? null,
                    modelType: text(node.modelType) ?? bound?.modelType ?? null
                })
            }
            for (const [key, child] of Object.entries(node)) visit(child, `${path}[${JSON.stringify(key)}]`, key)
        }
    }
    visit(value, source.field)
    return rows
}

export function buildConnectionImpact(
    tenantId: string,
    copilotId: string,
    input: {
        models: unknown
        direct: unknown
        documents: unknown
        defaults: unknown
    }
): ConnectionImpact {
    const models = z.array(model).parse(input.models) as Model[]
    const directRows = z.array(direct).parse(input.direct) as Required<z.output<typeof direct>>[]
    const documents = z.array(document).parse(input.documents) as Required<z.output<typeof document>>[]
    const defaultRows = z.array(defaults).parse(input.defaults) as Required<z.output<typeof defaults>>[]
    const modelMap = new Map(models.map((row) => [row.id, row]))
    const roots = models.filter((row) => row.id === row.root)
    const current = new Set(directRows.filter((r) => r.status !== 'historical').map((r) => r.root))
    const historical = new Set(directRows.filter((r) => r.status === 'historical').map((r) => r.root))
    const json = documents.flatMap(({ document, ...source }) => jsonReferences(source, document, copilotId, modelMap))
    const references: ConnectionImpactReference[] = [
        ...defaultRows.map((row): ConnectionImpactReference => ({ ...row, evidence: 'default', bindingId: null })),
        ...directRows.map(
            (row): ConnectionImpactReference => ({
                resourceType: row.resourceType,
                resourceId: row.resourceId,
                resourceName: row.resourceName,
                organizationId: row.organizationId,
                version: row.version,
                status: row.status,
                field: row.field,
                bindingId: row.bindingId,
                model: row.model,
                modelType: row.modelType,
                evidence: 'relation'
            })
        ),
        ...json,
        ...roots
            .filter((row) => !current.has(row.id) && !historical.has(row.id))
            .map(
                (row): ConnectionImpactReference => ({
                    resourceType: 'binding',
                    resourceId: row.id,
                    resourceName: row.id,
                    organizationId: row.organizationId,
                    version: null,
                    status: 'unresolved',
                    evidence: 'saved',
                    field: 'copilot_model.copilotId',
                    bindingId: row.id,
                    model: row.model,
                    modelType: row.modelType
                })
            )
    ]
    const resourceKey = (row: { resourceType: string; resourceId: string }) => `${row.resourceType}:${row.resourceId}`
    const uniqueReferences = [
        ...new Map(
            references.map((row) => [
                JSON.stringify([resourceKey(row), row.status, row.evidence, row.field, row.bindingId]),
                row
            ])
        ).values()
    ]
    return {
        scope: { tenantId },
        defaults: defaultRows.length,
        bindings: roots.length,
        drafts: new Set(json.filter((r) => r.status === 'draft').map(resourceKey)).size,
        bindingUsage: {
            current: roots.filter((r) => current.has(r.id)).length,
            historicalOnly: roots.filter((r) => !current.has(r.id) && historical.has(r.id)).length,
            unresolved: roots.filter((r) => !current.has(r.id) && !historical.has(r.id)).length
        },
        currentResources: new Set(directRows.filter((r) => r.status !== 'historical').map(resourceKey)).size,
        historicalResources: new Set(directRows.filter((r) => r.status === 'historical').map(resourceKey)).size,
        jsonMatches: json.length,
        references: uniqueReferences.sort(
            (a, b) => resourceKey(a).localeCompare(resourceKey(b)) || a.field.localeCompare(b.field)
        )
    }
}
