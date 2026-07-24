import { randomUUID } from 'node:crypto'
import { extractSemanticModelDraft, ISemanticModel } from '@xpert-ai/contracts'
import { Schema } from '@xpert-ai/ocap-core'
import { Injectable } from '@nestjs/common'
import { ILike } from 'typeorm'
import { SemanticModelService } from '../../model'
import { UoseMdxAdapterError, UoseMdxQueryResponse } from '../../model/uose-query.mapper'
import { DataXQueryExecuteInput } from './schemas'

export type DataXQueryModelRow = {
	id: string
	name?: string
	description?: string
	type?: string
	catalog?: string
	cubes: Array<{ name: string; caption?: string; description?: string }>
}

export type DataXQueryResult = {
	modelId: string
	cubeName: string
	statement: string
	columns: Array<{ name: string; type: string }>
	rows: Array<{ [key: string]: unknown }>
	rowCount: number
	totalRowCount: number
	truncated: boolean
	mdx?: string
	sql?: string
	audit: UoseMdxQueryResponse['audit']
}

export type DataXQueryExecutionContext = {
	tenantId?: string
	organizationId?: string | null
	userId: string
}

@Injectable()
export class DataXQueryAnalysisService {
	constructor(private readonly semanticModelService: SemanticModelService) {}

	async listModels(search?: string): Promise<DataXQueryModelRow[]> {
		const result = await this.semanticModelService.findMy({
			where: search?.trim()
				? [{ name: ILike(`%${search.trim()}%`) }, { description: ILike(`%${search.trim()}%`) }]
				: undefined,
			order: {
				updatedAt: 'DESC'
			},
			take: 100
		})
		return result.items.map(toQueryModelRow)
	}

	async getModel(modelId: string): Promise<DataXQueryModelRow> {
		const model = await this.semanticModelService.findOne(modelId)
		return toQueryModelRow(model)
	}

	async execute(input: DataXQueryExecuteInput, context: DataXQueryExecutionContext): Promise<DataXQueryResult> {
		const traceId = randomUUID()
		const requestContext = {
			traceId,
			taskId: traceId,
			principalId: context.userId,
			tenantId: context.tenantId,
			organizationId: context.organizationId ?? undefined,
			requestedAt: new Date().toISOString()
		}
		let response = await this.semanticModelService.queryUose({
			context: {
				...requestContext
			},
			queryMode: 'mdx_statement',
			modelId: input.modelId,
			cubeName: input.cubeName,
			metrics: [],
			statement: input.statement,
			limit: input.limit
		})
		if (isQueryError(response)) {
			const fallback = await this.executeMeasuresSqlFallback(
				input.modelId,
				input.cubeName,
				input.statement,
				Math.min(Math.max(input.limit ?? 200, 1), 500),
				requestContext,
				response.message
			)
			if (fallback) {
				return fallback
			}
		}
		if (isQueryError(response)) {
			throw new Error(`${response.code}: ${response.message}`)
		}

		const limit = Math.min(Math.max(input.limit ?? 200, 1), 500)
		return {
			modelId: input.modelId,
			cubeName: input.cubeName,
			statement: input.statement,
			columns: response.columns,
			rows: response.rows.slice(0, limit),
			rowCount: Math.min(response.rowCount, limit),
			totalRowCount: response.rowCount,
			truncated: response.rowCount > limit,
			mdx: response.mdx,
			sql: response.sql,
			audit: response.audit
		}
	}

	private async executeMeasuresSqlFallback(
		modelId: string,
		cubeName: string,
		statement: string,
		limit: number,
		context: {
			traceId: string
			taskId: string
			principalId: string
			tenantId?: string
			organizationId?: string
			requestedAt: string
		},
		mdxError: string
	): Promise<DataXQueryResult | null> {
		if (!/^\s*select\b[\s\S]*\bon\s+columns\b[\s\S]*\bfrom\s+\[[^\]]+\]\s*$/i.test(statement)) {
			return null
		}
		const explicitMeasures = [...statement.matchAll(/\[Measures\]\.\[([^\]]+)\]/gi)].map((match) => match[1])
		if (!explicitMeasures.length && !/\[Measures\]\.Members/i.test(statement)) {
			return null
		}
		const model = await this.semanticModelService.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type']
		})
		if (!model) {
			return null
		}
		const draft = model.draft ?? extractSemanticModelDraft<Schema>(model)
		const schema = draft.schema ?? model.options?.schema
		const cube = schema?.cubes?.find((item) => item.name === cubeName || item.caption === cubeName)
		const tableName = cube?.fact?.table?.name ?? cube?.tables?.[0]?.name
		if (!cube || !tableName) {
			return null
		}
		const requested = explicitMeasures.length ? new Set(explicitMeasures) : null
		const projections = (cube.measures ?? [])
			.filter((measure) => !requested || requested.has(measure.name))
			.map((measure) => toAggregateProjection(measure))
			.filter((value): value is string => Boolean(value))
		if (!projections.length) {
			return null
		}
		const sql = `SELECT ${projections.join(', ')} FROM ${quoteQualifiedIdentifier(tableName)} LIMIT ${limit}`
		const startedAt = Date.now()
		const raw = await this.semanticModelService.query(modelId, { statement: sql }, {})
		const payload = isRecord(raw) ? raw : {}
		if (payload['status'] === 'ERROR') {
			throw new Error(String(payload['error'] ?? mdxError))
		}
		const rows = Array.isArray(payload['data'])
			? payload['data'].filter(isRecord)
			: Array.isArray(raw)
				? raw.filter(isRecord)
				: []
		const sourceColumns = Array.isArray(payload['columns']) ? payload['columns'].filter(isRecord) : []
		const columns = sourceColumns.length
			? sourceColumns.map((column) => ({
					name: String(column['name'] ?? column['label'] ?? ''),
					type: String(column['type'] ?? column['dataType'] ?? 'unknown')
				}))
			: Object.keys(rows[0] ?? {}).map((name) => ({
					name,
					type: typeof rows[0]?.[name]
				}))
		const totalRowCount = rows.length
		return {
			modelId,
			cubeName,
			statement,
			columns,
			rows: rows.slice(0, limit),
			rowCount: Math.min(totalRowCount, limit),
			totalRowCount,
			truncated: totalRowCount > limit,
			mdx: statement,
			sql,
			audit: {
				traceId: context.traceId,
				taskId: context.taskId,
				principalId: context.principalId,
				modelId,
				cubeName,
				metricRefs: explicitMeasures,
				policyDecision: 'allow',
				queryHash: '',
				durationMs: Date.now() - startedAt,
				rowCount: totalRowCount,
				occurredAt: new Date().toISOString()
			}
		}
	}
}

function toQueryModelRow(model: ISemanticModel): DataXQueryModelRow {
	const draft = model.draft ?? extractSemanticModelDraft<Schema>(model)
	const schema = draft.schema ?? model.options?.schema
	return {
		id: String(model.id),
		name: model.name,
		description: model.description,
		type: model.type,
		catalog: model.catalog,
		cubes: [
			...(schema?.cubes ?? []).map((cube) => ({
				name: cube.name,
				caption: cube.caption,
				description: cube.description
			})),
			...(schema?.virtualCubes ?? []).map((cube) => ({
				name: cube.name,
				caption: cube.caption,
				description: cube.description
			}))
		]
	}
}

function isQueryError(value: UoseMdxQueryResponse | UoseMdxAdapterError): value is UoseMdxAdapterError {
	return 'code' in value && 'message' in value && !('rows' in value)
}

function toAggregateProjection(measure: NonNullable<NonNullable<Schema['cubes']>[number]['measures']>[number]) {
	const column = typeof measure.column === 'string' ? measure.column.trim() : ''
	if (!column || !isSafeIdentifier(column)) {
		return null
	}
	const aggregator = String(measure.aggregator ?? 'sum').toLowerCase()
	const quotedColumn = quoteIdentifier(column)
	const expression =
		aggregator === 'count'
			? `COUNT(${quotedColumn})`
			: aggregator === 'distinct-count' || aggregator === 'distinctcount'
				? `COUNT(DISTINCT ${quotedColumn})`
				: aggregator === 'avg' || aggregator === 'average'
					? `AVG(${quotedColumn})`
					: aggregator === 'min'
						? `MIN(${quotedColumn})`
						: aggregator === 'max'
							? `MAX(${quotedColumn})`
							: `SUM(${quotedColumn})`
	return `${expression} AS ${quoteIdentifier(measure.name)}`
}

function quoteQualifiedIdentifier(value: string) {
	const parts = value.split('.').map((part) => part.trim())
	if (!parts.length || parts.some((part) => !isSafeIdentifier(part))) {
		throw new Error('Semantic fact table name is not a safe SQL identifier.')
	}
	return parts.map(quoteIdentifier).join('.')
}

function quoteIdentifier(value: string) {
	return `"${value.replace(/"/g, '""')}"`
}

function isSafeIdentifier(value: string) {
	return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
