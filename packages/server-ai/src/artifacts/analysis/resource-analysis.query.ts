import type {
    AnalyticalDataset,
    AnalyticsField,
    AnalyticsValue,
    ResourceAnalysisFilter,
    ResourceAnalysisPolicy,
    ResourceAnalysisQuery
} from '@xpert-ai/contracts'
import { ForbiddenException, BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { isResourceAnalysisFilterValue } from '@xpert-ai/plugin-sdk/analytics'

const denied = () => new ForbiddenException(t('server-ai:Error.ResourceAnalysisDenied'))
const invalid = () => new BadRequestException(t('server-ai:Error.ResourceAnalysisInvalid'))

/** Server-side computation input: enforce the approved field/row scope before returning to a provider.
 * Public row limits are applied after aggregation by analyzeDataset; source scanning remains capped at 1000. */
export function projectAnalysisDataset(
    dataset: AnalyticalDataset,
    scope: ResourceAnalysisPolicy['datasets'][number]
): AnalyticalDataset {
    const fields = scope.fields.map((id) => {
        const field = dataset.fields.find((field) => field.id === id)
        if (!field) throw denied()
        return field
    })
    const rows = dataset.rows
        .filter((row) =>
            scope.filters.every((filter) => {
                const field = fields.find((field) => field.id === filter.field)
                if (!field) throw denied()
                return matches(row[filter.field], filter, field)
            })
        )
        .map((row) => Object.fromEntries(fields.map((field) => [field.id, row[field.id]])))
    const complete = dataset.completeness.scope === 'full_query_result' && !dataset.completeness.truncated
    return {
        ...dataset,
        fields,
        rows,
        grain: dataset.grain.filter((id) => scope.fields.includes(id)),
        completeness: {
            returnedRows: rows.length,
            scope: dataset.completeness.scope,
            truncated: dataset.completeness.truncated,
            totalAccuracy: complete ? 'exact' : 'unknown',
            ...(complete ? { totalRows: rows.length } : {})
        }
    }
}

/** Reject impossible or over-scoped requests before invoking any data provider. */
export function validateAnalysisQuery(
    datasetFields: AnalyticsField[],
    policy: ResourceAnalysisPolicy,
    query: ResourceAnalysisQuery
) {
    const scope = policy.datasets.find((item) => item.key === query.datasetKey)
    if (!scope) throw denied()
    const limit = query.limit ?? policy.maxRows
    if (limit > policy.maxRows) throw new ForbiddenException(t('server-ai:Error.ResourceAnalysisBudget'))
    const fields = new Map(datasetFields.map((field) => [field.id, field]))
    const requireField = (id: string) => {
        const field = fields.get(id)
        if (!field || !scope.fields.includes(id)) throw denied()
        return field
    }
    const selected = query.select.length ? query.select : scope.fields
    for (const id of [
        ...selected,
        ...query.groupBy,
        ...scope.filters.map((f) => f.field),
        ...query.filters.map((f) => f.field)
    ])
        requireField(id)
    if (
        policy.mode === 'bindings' &&
        (query.aggregates.length || query.groupBy.length || query.filters.length || query.orderBy.length)
    )
        throw denied()
    if (!policy.allowDetails && !query.aggregates.length) throw denied()
    if (query.groupBy.length && !query.aggregates.length) throw invalid()
    for (const filter of [...scope.filters, ...query.filters])
        if (
            filter.values.some((value) => !isResourceAnalysisFilterValue(requireField(filter.field).logicalType, value))
        )
            throw invalid()
    const keys = query.aggregates.length ? [...query.groupBy, ...query.aggregates.map((a) => a.key)] : selected
    if (new Set(keys).size !== keys.length || query.aggregates.some((a) => fields.has(a.key))) throw invalid()
    for (const aggregate of query.aggregates) {
        const field = aggregate.field ? requireField(aggregate.field) : undefined
        if (aggregate.operation !== 'count' && (!field || !['int64', 'decimal', 'float64'].includes(field.logicalType)))
            throw invalid()
        if (aggregate.operation === 'count' && aggregate.field) throw invalid()
    }
    for (const order of query.orderBy) if (!keys.includes(order.field)) throw denied()
    return { scope, fields, selected, requireField, limit }
}

/** Projection, immutable row predicates and aggregation run before results enter model context. */
export function analyzeDataset(
    dataset: AnalyticalDataset,
    policy: ResourceAnalysisPolicy,
    query: ResourceAnalysisQuery
): AnalyticalDataset {
    const { scope, selected, requireField, limit } = validateAnalysisQuery(dataset.fields, policy, query)
    if (
        query.aggregates.length &&
        (dataset.completeness.truncated || dataset.completeness.scope !== 'full_query_result')
    )
        throw new BadRequestException(t('server-ai:Error.ResourceAnalysisIncomplete'))
    const predicates = [...scope.filters, ...query.filters]
    let rows = dataset.rows.filter((row) =>
        predicates.every((filter) => matches(row[filter.field], filter, requireField(filter.field)))
    )
    let outputFields: AnalyticsField[]
    if (query.aggregates.length) {
        outputFields = query.groupBy.map(requireField)
        for (const aggregate of query.aggregates) {
            const field = aggregate.field ? requireField(aggregate.field) : undefined
            outputFields.push({
                id: aggregate.key,
                sourceField: aggregate.key,
                label: aggregate.key,
                logicalType:
                    aggregate.operation === 'count'
                        ? 'int64'
                        : field.logicalType === 'int64' && aggregate.operation === 'sum'
                          ? 'decimal'
                          : field.logicalType,
                nullable: aggregate.operation !== 'count',
                role: 'measure',
                ...(field?.unit ? { unit: field.unit } : {})
            })
        }
        const groups = new Map<string, typeof rows>()
        if (!query.groupBy.length) groups.set('[]', [])
        for (const row of rows) {
            const key = JSON.stringify(query.groupBy.map((id) => row[id]))
            const group = groups.get(key) ?? []
            group.push(row)
            groups.set(key, group)
        }
        rows = [...groups.values()].map((group) => {
            const row: Record<string, AnalyticsValue> = Object.fromEntries(
                query.groupBy.map((id) => [id, group[0][id]])
            )
            for (const aggregate of query.aggregates) {
                if (aggregate.operation === 'count') {
                    row[aggregate.key] = String(group.length)
                    continue
                }
                const field = requireField(aggregate.field)
                const values = group.map((item) => item[field.id]).filter((value) => value !== null)
                row[aggregate.key] = values.length ? reduce(values, field, aggregate.operation) : null
            }
            return row
        })
    } else {
        outputFields = selected.map(requireField)
        rows = rows.map((row) => Object.fromEntries(outputFields.map((field) => [field.id, row[field.id]])))
    }
    rows.sort((a, b) => {
        for (const order of query.orderBy) {
            const result = compare(
                a[order.field],
                b[order.field],
                outputFields.find((field) => field.id === order.field)
            )
            if (result) return order.direction === 'asc' ? result : -result
        }
        return 0
    })
    const totalRows = rows.length,
        truncated = totalRows > limit || dataset.completeness.truncated
    return {
        ...dataset,
        fields: outputFields,
        rows: rows.slice(0, limit),
        grain: query.aggregates.length ? query.groupBy : [],
        completeness: {
            returnedRows: Math.min(rows.length, limit),
            ...(dataset.completeness.scope === 'full_query_result' && !dataset.completeness.truncated
                ? { totalRows, totalAccuracy: 'exact' as const }
                : { totalAccuracy: 'unknown' as const }),
            scope: truncated ? 'top_n' : dataset.completeness.scope,
            truncated
        }
    }
}

function matches(value: AnalyticsValue, filter: ResourceAnalysisFilter, field: AnalyticsField) {
    const result = compare(value, filter.values[0], field)
    switch (filter.operator) {
        case 'eq':
            return result === 0
        case 'ne':
            return result !== 0
        case 'in':
            return filter.values.some((item) => compare(value, item, field) === 0)
        case 'gt':
            return value !== null && filter.values[0] !== null && result > 0
        case 'gte':
            return value !== null && filter.values[0] !== null && result >= 0
        case 'lt':
            return value !== null && filter.values[0] !== null && result < 0
        case 'lte':
            return value !== null && filter.values[0] !== null && result <= 0
    }
}
function decimal(value: AnalyticsValue) {
    if (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/.test(value) || value.length > 128) throw invalid()
    const [whole, fraction = ''] = value.split('.')
    return { integer: BigInt(whole + fraction), scale: fraction.length }
}
function compare(left: AnalyticsValue, right: AnalyticsValue, field: AnalyticsField) {
    if (left === null || right === null) return left === right ? 0 : left === null ? -1 : 1
    if (['int64', 'decimal'].includes(field.logicalType)) {
        const a = decimal(left),
            b = decimal(right),
            scale = Math.max(a.scale, b.scale)
        const x = a.integer * 10n ** BigInt(scale - a.scale),
            y = b.integer * 10n ** BigInt(scale - b.scale)
        return x < y ? -1 : x > y ? 1 : 0
    }
    if (typeof left !== typeof right) throw invalid()
    return left < right ? -1 : left > right ? 1 : 0
}
function reduce(values: AnalyticsValue[], field: AnalyticsField, operation: 'sum' | 'min' | 'max'): AnalyticsValue {
    if (operation !== 'sum')
        return values.reduce((a, b) => (compare(a, b, field) < 0 === (operation === 'min') ? a : b))
    if (field.logicalType === 'float64') {
        const value = values.reduce<number>((sum, value) => {
            if (typeof value !== 'number') throw invalid()
            return sum + value
        }, 0)
        if (!Number.isFinite(value)) throw invalid()
        return value
    }
    const parts = values.map(decimal),
        scale = Math.max(...parts.map((part) => part.scale))
    const sum = parts.reduce((sum, part) => sum + part.integer * 10n ** BigInt(scale - part.scale), 0n)
    const digits = (sum < 0n ? -sum : sum).toString().padStart(scale + 1, '0')
    return `${sum < 0n ? '-' : ''}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`
}
