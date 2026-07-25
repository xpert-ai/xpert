import { randomUUID } from 'node:crypto'
import { extractSemanticModelDraft, ISemanticModel, IndicatorStatusEnum } from '@xpert-ai/contracts'
import { Cube, DimensionUsage, PropertyDimension, PropertyHierarchy, PropertyLevel, Schema } from '@xpert-ai/ocap-core'
import { Injectable } from '@nestjs/common'
import { ILike } from 'typeorm'
import { SemanticModelService } from '../../model'
import { UoseMdxAdapterError, UoseMdxQueryResponse } from '../../model/uose-query.mapper'
import { normalizeConversationalSemanticSchema } from '../datax-semantic-modeling/semantic-schema.normalizer'
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
			const fallback = await this.executeSchemaSqlFallback(
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

	private async executeSchemaSqlFallback(
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
		const parsedStatement = parseSimpleMdxStatement(statement)
		if (!parsedStatement) {
			return null
		}
		const explicitMeasures = [...statement.matchAll(/\[Measures\]\.\[([^\]]+)\]/gi)].map((match) => match[1])
		if (!explicitMeasures.length && !/\[Measures\]\.Members/i.test(statement)) {
			return null
		}
		const model = await this.semanticModelService.findOne(modelId, {
			relations: ['dataSource', 'dataSource.type', 'indicators']
		})
		if (!model) {
			return null
		}
		const draft = model.draft ?? extractSemanticModelDraft<Schema>(model)
		const schema = normalizeConversationalSemanticSchema(draft.schema ?? model.options?.schema ?? {})
		const cube = schema?.cubes?.find((item) => item.name === cubeName || item.caption === cubeName)
		const tableName = cube?.fact?.table?.name ?? cube?.tables?.[0]?.name
		if (!cube || !tableName) {
			return null
		}
		if (
			![cube.name, cube.caption, cubeName].some(
				(candidate) => normalizeComparisonName(candidate) === normalizeComparisonName(parsedStatement.cubeName)
			)
		) {
			return null
		}
		const grouping = resolveSqlGrouping(schema, cube, tableName, parsedStatement.rowAxis)
		if (parsedStatement.rowAxis && !grouping) {
			return null
		}
		const projections = (
			explicitMeasures.length
				? explicitMeasures
						.map((requestedName) => {
							const directMeasure = findCubeMeasure(cube, requestedName)
							if (directMeasure) {
								return {
									measure: directMeasure,
									alias: directMeasure.name
								}
							}
							const indicator = model.indicators?.find(
								(item) =>
									item.status === IndicatorStatusEnum.RELEASED &&
									(!item.entity ||
										normalizeComparisonName(item.entity) === normalizeComparisonName(cube.name)) &&
									[item.code, item.name].some(
										(candidate) =>
											normalizeComparisonName(candidate) ===
											normalizeComparisonName(requestedName)
									)
							)
							const indicatorMeasure =
								typeof indicator?.options?.measure === 'string'
									? findCubeMeasure(cube, indicator.options.measure)
									: undefined
							return indicatorMeasure
								? {
										measure: indicatorMeasure,
										alias: indicator?.code?.trim() || requestedName
									}
								: null
						})
						.filter(
							(
								value
							): value is {
								measure: NonNullable<Cube['measures']>[number]
								alias: string
							} => Boolean(value)
						)
				: (cube.measures ?? []).map((measure) => ({
						measure,
						alias: measure.name
					}))
		)
			.map(({ measure, alias }) => toAggregateProjection(measure, grouping ? 'f' : undefined, alias))
			.filter((value): value is string => Boolean(value))
		if (!projections.length) {
			return null
		}
		const sql = grouping
			? [
					`SELECT ${grouping.expression} AS ${quoteIdentifier(grouping.label)}, ${projections.join(', ')}`,
					`FROM ${quoteQualifiedIdentifier(tableName)} AS f`,
					grouping.joinSql,
					`GROUP BY ${grouping.expression}`,
					`LIMIT ${limit}`
				]
					.filter(Boolean)
					.join(' ')
			: `SELECT ${projections.join(', ')} FROM ${quoteQualifiedIdentifier(tableName)} LIMIT ${limit}`
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

function toAggregateProjection(
	measure: NonNullable<NonNullable<Schema['cubes']>[number]['measures']>[number],
	tableAlias?: string,
	outputName = measure.name
) {
	const column = typeof measure.column === 'string' ? measure.column.trim() : ''
	if (!column || !isSafeIdentifier(column)) {
		return null
	}
	const aggregator = String(measure.aggregator ?? 'sum').toLowerCase()
	const quotedColumn = tableAlias ? `${tableAlias}.${quoteIdentifier(column)}` : quoteIdentifier(column)
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
	return `${expression} AS ${quoteIdentifier(outputName)}`
}

function findCubeMeasure(cube: Cube, requestedName: string) {
	const normalized = normalizeComparisonName(requestedName)
	return cube.measures?.find((measure) =>
		[measure.name, measure.caption].some((candidate) => normalizeComparisonName(candidate) === normalized)
	)
}

type SchemaSqlGrouping = {
	expression: string
	label: string
	joinSql?: string
}

type SimpleMdxStatement = {
	cubeName: string
	rowAxis?: string
}

function parseSimpleMdxStatement(statement: string): SimpleMdxStatement | null {
	const select = statement.match(
		/^\s*select\s+([\s\S]+?)\s+from\s+\[([^\]]+)\]\s*(?:cell\s+properties[\s\S]+)?;?\s*$/i
	)
	if (!select) {
		return null
	}
	const axes = select[1]?.trim()
	const cubeName = select[2]?.trim()
	if (!axes || !cubeName) {
		return null
	}
	const grouped = axes.match(/^([\s\S]+?)\s+on\s+(?:columns|0)\s*,\s*([\s\S]+?)\s+on\s+(?:rows|1)\s*$/i)
	if (grouped) {
		const rowAxis = normalizeSimpleRowAxis(grouped[2])
		return rowAxis
			? {
					cubeName,
					rowAxis
				}
			: null
	}
	if (!/^([\s\S]+?)\s+on\s+(?:columns|0)\s*$/i.test(axes)) {
		return null
	}
	return {
		cubeName
	}
}

function normalizeSimpleRowAxis(value: string | undefined) {
	const normalized = value
		?.trim()
		.replace(/^non\s+empty\s+/i, '')
		.replace(/\s+dimension\s+properties[\s\S]*$/i, '')
		.trim()
	return normalized || null
}

function resolveSqlGrouping(
	schema: Schema | undefined,
	cube: Cube,
	factTableName: string,
	rowAxis: string | undefined
): SchemaSqlGrouping | null {
	if (!rowAxis) {
		return null
	}
	if (/crossjoin|nonempty|filter|topcount|bottomcount|\*/i.test(rowAxis)) {
		return null
	}
	const memberCount = rowAxis.match(/\.members\b/gi)?.length ?? 0
	const residual = rowAxis
		.replace(/\[[^\]]+\]/g, '')
		.replace(/[{}\s.]/g, '')
		.toLowerCase()
	if (memberCount !== 1 || residual !== 'members') {
		return null
	}
	const segments = [...rowAxis.matchAll(/\[([^\]]+)\]/g)]
		.map((match) => match[1]?.trim())
		.filter((segment): segment is string => Boolean(segment))
	if (!segments.length) {
		return null
	}
	const requestedDimension = segments[0]
	const usage = findDimensionUsage(cube, requestedDimension)
	const dimension = findDimension(schema, cube, usage, requestedDimension)
	if (!dimension) {
		return null
	}
	const { hierarchy, level } = resolveHierarchyLevel(dimension, segments.slice(1))
	const levelColumn = level?.column?.trim()
	if (!hierarchy || !level || !levelColumn || !isSafeIdentifier(levelColumn)) {
		return null
	}
	const dimensionTableName = hierarchy.primaryKeyTable?.trim() || hierarchy.tables?.[0]?.name?.trim() || factTableName
	if (!dimensionTableName) {
		return null
	}
	const sameTable = normalizeQualifiedName(dimensionTableName) === normalizeQualifiedName(factTableName)
	const tableAlias = sameTable ? 'f' : 'd'
	const expression = `${tableAlias}.${quoteIdentifier(levelColumn)}`
	const label = level.caption?.trim() || level.name?.trim() || requestedDimension
	if (sameTable) {
		return {
			expression,
			label
		}
	}
	const foreignKey = usage?.foreignKey?.trim() || dimension.foreignKey?.trim()
	const primaryKey = hierarchy.primaryKey?.trim()
	if (!foreignKey || !primaryKey || !isSafeIdentifier(foreignKey) || !isSafeIdentifier(primaryKey)) {
		return null
	}
	return {
		expression,
		label,
		joinSql: `LEFT JOIN ${quoteQualifiedIdentifier(dimensionTableName)} AS d ON f.${quoteIdentifier(
			foreignKey
		)} = d.${quoteIdentifier(primaryKey)}`
	}
}

function findDimensionUsage(cube: Cube, requestedDimension: string): DimensionUsage | undefined {
	const normalized = normalizeComparisonName(requestedDimension)
	return cube.dimensionUsages?.find((usage) =>
		[usage.name, usage.caption, usage.source].some((candidate) => normalizeComparisonName(candidate) === normalized)
	)
}

function findDimension(
	schema: Schema | undefined,
	cube: Cube,
	usage: DimensionUsage | undefined,
	requestedDimension: string
): PropertyDimension | undefined {
	const names = [usage?.source, usage?.name, requestedDimension]
	for (const name of names) {
		const normalized = normalizeComparisonName(name)
		if (!normalized) {
			continue
		}
		const dimension = [...(schema?.dimensions ?? []), ...(cube.dimensions ?? [])].find((candidate) =>
			[candidate.name, candidate.caption].some((value) => normalizeComparisonName(value) === normalized)
		)
		if (dimension) {
			return dimension
		}
	}
	return undefined
}

function resolveHierarchyLevel(
	dimension: PropertyDimension,
	requestedSegments: string[]
): { hierarchy?: PropertyHierarchy; level?: PropertyLevel } {
	const hierarchies = dimension.hierarchies ?? []
	const requestedHierarchy = requestedSegments[0]
	const matchingHierarchy = hierarchies.find((hierarchy) =>
		[hierarchy.name, hierarchy.caption].some(
			(value) => normalizeComparisonName(value) === normalizeComparisonName(requestedHierarchy)
		)
	)
	const hierarchy =
		matchingHierarchy ??
		hierarchies.find((candidate) => candidate.name === dimension.defaultHierarchy) ??
		hierarchies[0]
	if (!hierarchy) {
		return {}
	}
	const requestedLevel = matchingHierarchy ? requestedSegments[1] : requestedSegments[0]
	const levels = hierarchy.levels ?? []
	const level = requestedLevel
		? levels.find((candidate) =>
				[candidate.name, candidate.caption].some(
					(value) => normalizeComparisonName(value) === normalizeComparisonName(requestedLevel)
				)
			)
		: levels.at(-1)
	return {
		hierarchy,
		level: level ?? levels.at(-1)
	}
}

function normalizeComparisonName(value: string | undefined) {
	return (
		value
			?.replace(/^\[|\]$/g, '')
			.trim()
			.toLowerCase() ?? ''
	)
}

function normalizeQualifiedName(value: string) {
	return value
		.split('.')
		.map((part) => part.trim().toLowerCase())
		.join('.')
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
