import { createHash } from 'node:crypto'
import {
	C_MEASURES,
	CalculationType,
	FilterOperator,
	reformat,
	RuntimeLevelType,
	TimeGranularity,
	TimeLevelType,
	unwrapBrackets,
	wrapBrackets
} from '@xpert-ai/ocap-core'
import type {
	Cube,
	DimensionUsage,
	CalculatedProperty,
	PropertyDimension,
	PropertyHierarchy,
	PropertyLevel,
	QueryOptions,
	QueryReturn,
	Schema
} from '@xpert-ai/ocap-core'

export type UoseMdxQueryMode = 'semantic_dsl' | 'mdx_statement' | 'native_dsl'
export type UoseMetricLevel = 'raw' | 'business' | 'decision'
export type UosePolicyEffect = 'allow' | 'deny' | 'require_approval'

export enum UoseMdxAdapterErrorCode {
	CUBE_NOT_FOUND = 'UOSE-MDX-4041',
	METRIC_NOT_MAPPED = 'UOSE-MDX-4042',
	DIMENSION_NOT_MAPPED = 'UOSE-MDX-4043',
	METRIC_VERSION_CONFLICT = 'UOSE-MDX-4091',
	POLICY_DENIED = 'UOSE-MDX-4031',
	QUERY_TIMEOUT = 'UOSE-MDX-5041',
	PROVIDER_ERROR = 'UOSE-MDX-5001'
}

export interface UoseMdxAdapterContext {
	traceId: string
	taskId: string
	principalId: string
	tenantId?: string
	organizationId?: string
	requestedAt: string
}

export interface UoseMdxMetricRef {
	metricId: string
	metricVersion?: string
	level?: UoseMetricLevel
}

export interface UoseMdxDimensionRef {
	dimensionId: string
	hierarchy?: string[]
	level?: string
}

export interface UoseMdxFilter {
	field: string
	op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'between' | 'contains'
	value: unknown
}

export interface UoseMdxCalculatedMeasure {
	name: string
	caption?: string
	formula: string
	dimension?: string
	hierarchy?: string
	calculationType?: 'Calculated'
	formatString?: string
	formatting?: {
		unit?: string
		decimal?: number
	}
}

export interface UoseMdxQueryRequest {
	context: UoseMdxAdapterContext
	queryMode?: UoseMdxQueryMode
	modelId: string
	cubeName: string
	metrics: UoseMdxMetricRef[]
	dimensions?: UoseMdxDimensionRef[]
	timeDimension?: UoseMdxDimensionRef
	filters?: UoseMdxFilter[]
	calculatedMeasures?: UoseMdxCalculatedMeasure[]
	statement?: string
	nativeQuery?: Record<string, unknown>
	timeWindow?: {
		from: string
		to: string
		timezone?: string
	}
	limit?: number
	includeAuditFields?: boolean
}

export interface UoseMdxAdapterError {
	code: UoseMdxAdapterErrorCode
	message: string
	details?: Record<string, unknown>
}

export interface UoseMdxQueryResponse {
	columns: Array<{ name: string; type: string }>
	rows: Array<Record<string, unknown>>
	rowCount: number
	mdx?: string
	sql?: string
	appliedMetricVersions: Array<{ metricId: string; metricVersion: string }>
	audit: {
		traceId: string
		taskId: string
		principalId: string
		modelId: string
		cubeName: string
		metricRefs: string[]
		policyDecision: UosePolicyEffect | 'allow'
		queryHash: string
		durationMs: number
		rowCount: number
		occurredAt: string
	}
}

type ResolvedUoseDimensionRef = {
	dimensionId: string
	hierarchy: string
	level?: string
	levelFormatter?: string
	timeGranularity?: TimeGranularity
}

const MAX_CALCULATED_EXPRESSION_LENGTH = 2000
const DISALLOWED_MDX_EXPRESSION_PATTERN =
	/\b(select|with|from|create|drop|alter|update|insert|delete|call|drillthrough)\b/i

export function buildOcapQueryFromUose(request: UoseMdxQueryRequest, schema?: Schema): QueryOptions {
	if (request.queryMode === 'native_dsl') {
		return {
			...(request.nativeQuery ?? {}),
			cube: normalizeString(request.nativeQuery?.cube) ?? request.cubeName
		} as QueryOptions
	}

	const resolvedDimensions = (request.dimensions ?? []).map((dimension) =>
		resolveDimensionRef(schema, request.cubeName, dimension)
	)
	const rows = resolvedDimensions.map((dimension) => ({
		dimension: dimension.dimensionId,
		hierarchy: dimension.hierarchy,
		level: dimension.level
	}))
	const columns = request.metrics.map((metric) => ({
		dimension: C_MEASURES,
		measure: metric.metricId
	}))
	const filters = [
		...(request.filters ?? []).map((filter) => mapFilter(filter, schema, request.cubeName)),
		...mapTimeWindowFilters(request, resolvedDimensions, schema)
	]
	const calculatedMeasures = normalizeCalculatedMeasures(request.calculatedMeasures)

	return {
		cube: request.cubeName,
		rows,
		columns,
		filters,
		...(calculatedMeasures.length > 0 ? { calculatedMeasures } : {}),
		paging: {
			top: normalizeLimit(request.limit)
		}
	}
}

export function normalizeUoseQueryResponse(
	request: UoseMdxQueryRequest,
	payload: unknown,
	durationMs: number
): UoseMdxQueryResponse {
	const queryReturn = unwrapQueryReturn(payload)
	const rows = extractRows(queryReturn)
	const columns = extractColumns(queryReturn, rows)
	const stats = readObject(queryReturn)?.stats as Record<string, unknown> | undefined
	const statements = Array.isArray(stats?.statements)
		? stats.statements.filter((item): item is string => typeof item === 'string')
		: []
	const rowCount = rows.length

	return {
		columns,
		rows,
		rowCount,
		mdx: request.statement ?? statements[0],
		sql: normalizeString(stats?.sql),
		appliedMetricVersions: request.metrics.map((metric) => ({
			metricId: metric.metricId,
			metricVersion: metric.metricVersion ?? 'latest'
		})),
		audit: {
			traceId: request.context.traceId,
			taskId: request.context.taskId,
			principalId: request.context.principalId,
			modelId: request.modelId,
			cubeName: request.cubeName,
			metricRefs: request.metrics.map((metric) => metric.metricId),
			policyDecision: 'allow',
			queryHash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
			durationMs,
			rowCount,
			occurredAt: new Date().toISOString()
		}
	}
}

export function buildUoseMdxError(
	code: UoseMdxAdapterErrorCode,
	message: string,
	details?: Record<string, unknown>
): UoseMdxAdapterError {
	return {
		code,
		message,
		details
	}
}

function normalizeCalculatedMeasures(measures: UoseMdxCalculatedMeasure[] | undefined): CalculatedProperty[] {
	const output: CalculatedProperty[] = []
	for (const item of measures ?? []) {
		const name = normalizeString(item.name)
		const formula = normalizeString(item.formula)
		if (!name || !formula) {
			throw new Error('Calculated measure requires name and formula')
		}
		validateCalculatedExpression(formula)

		const measure: CalculatedProperty = {
			name,
			formula,
			dimension: normalizeString(item.dimension) ?? C_MEASURES,
			calculationType: CalculationType.Calculated
		}
		const caption = normalizeString(item.caption)
		if (caption) {
			measure.caption = caption
		}
		const hierarchy = normalizeString(item.hierarchy)
		if (hierarchy) {
			measure.hierarchy = hierarchy
		}
		if (item.formatting) {
			measure.formatting = item.formatting
		}
		const formatString = normalizeString(item.formatString)
		if (formatString) {
			measure.properties = [
				...(measure.properties ?? []),
				{
					name: 'FORMAT_STRING',
					value: formatString
				}
			]
		}
		output.push(measure)
	}

	return output
}

function validateCalculatedExpression(expression: string): void {
	if (expression.length > MAX_CALCULATED_EXPRESSION_LENGTH) {
		throw new Error(`Calculated expression is too long; max ${MAX_CALCULATED_EXPRESSION_LENGTH} characters`)
	}
	if (expression.includes(';')) {
		throw new Error('Calculated expression must not contain semicolons')
	}
	if (DISALLOWED_MDX_EXPRESSION_PATTERN.test(expression)) {
		throw new Error('Calculated expression must be an MDX formula fragment, not a full statement')
	}
}

function mapFilter(filter: UoseMdxFilter, schema: Schema | undefined, cubeName: string) {
	const field = resolveFieldDimensionId(schema, cubeName, filter.field)
	const operator = mapFilterOperator(filter.op)
	const members = mapFilterMembers(filter)

	return {
		dimension: {
			dimension: field,
			hierarchy: field
		},
		operator,
		members
	}
}

function mapTimeWindowFilters(
	request: UoseMdxQueryRequest,
	dimensions: ResolvedUoseDimensionRef[],
	schema: Schema | undefined
) {
	if (!request.timeWindow) {
		return []
	}

	const timeDimension = request.timeDimension
		? resolveDimensionRef(schema, request.cubeName, request.timeDimension)
		: undefined
	const dimension =
		timeDimension ??
		dimensions.find((item) => item.level || /date|time|day|week|month|year/i.test(item.dimensionId))
	if (!dimension) {
		return []
	}

	return [
		{
			dimension: {
				dimension: dimension.dimensionId,
				hierarchy: dimension.hierarchy,
				level: dimension.level
			},
			operator: FilterOperator.BT,
			members: [
				{
					key: formatTimeWindowMember(
						request.timeWindow.from,
						dimension.levelFormatter,
						dimension.timeGranularity
					)
				},
				{
					key: formatTimeWindowMember(
						request.timeWindow.to,
						dimension.levelFormatter,
						dimension.timeGranularity
					)
				}
			]
		}
	]
}

function resolveDimensionRef(
	schema: Schema | undefined,
	cubeName: string,
	dimension: UoseMdxDimensionRef
): ResolvedUoseDimensionRef {
	const cube = findCube(schema, cubeName)
	const usage = findDimensionUsage(cube, dimension.dimensionId)
	const sourceDimension = findSourceDimension(schema, cube, usage, dimension.dimensionId)
	const sourceHierarchy = findHierarchy(sourceDimension, dimension.hierarchy?.[0])
	const level = findLevel(sourceHierarchy, sourceDimension, dimension.level)
	const dimensionId = usage ? toUniqueNameSegment(usage.name) : dimension.dimensionId
	const hierarchy = dimension.hierarchy?.[0] ? toHierarchyName(dimensionId, dimension.hierarchy[0]) : dimensionId

	return {
		dimensionId,
		hierarchy,
		level: level?.name ?? dimension.level,
		levelFormatter: level?.semantics?.formatter ?? level?.formatter,
		timeGranularity: resolveTimeGranularity(level, dimension.level)
	}
}

function resolveFieldDimensionId(schema: Schema | undefined, cubeName: string, field: string): string {
	const usage = findDimensionUsage(findCube(schema, cubeName), field)
	return usage ? toUniqueNameSegment(usage.name) : field
}

function findCube(schema: Schema | undefined, cubeName: string): Cube | undefined {
	const normalizedCubeName = normalizeComparisonName(cubeName)
	return schema?.cubes?.find((cube) => normalizeComparisonName(cube.name) === normalizedCubeName)
}

function findDimensionUsage(cube: Cube | undefined, dimensionId: string): DimensionUsage | undefined {
	const normalizedDimensionId = normalizeComparisonName(dimensionId)
	return cube?.dimensionUsages?.find((usage) =>
		[usage.name, usage.caption, usage.source].some(
			(candidate) => normalizeComparisonName(candidate) === normalizedDimensionId
		)
	)
}

function findSourceDimension(
	schema: Schema | undefined,
	cube: Cube | undefined,
	usage: DimensionUsage | undefined,
	dimensionId: string
): PropertyDimension | undefined {
	const candidates = [usage?.source, usage?.name, dimensionId]
	for (const candidate of candidates) {
		const normalizedCandidate = normalizeComparisonName(candidate)
		if (!normalizedCandidate) {
			continue
		}
		const dimension = [...(schema?.dimensions ?? []), ...(cube?.dimensions ?? [])].find(
			(item) =>
				normalizeComparisonName(item.name) === normalizedCandidate ||
				normalizeComparisonName(item.caption) === normalizedCandidate
		)
		if (dimension) {
			return dimension
		}
	}
	return undefined
}

function findHierarchy(
	dimension: PropertyDimension | undefined,
	requestedHierarchy: string | undefined
): PropertyHierarchy | undefined {
	const hierarchies = dimension?.hierarchies ?? []
	if (!requestedHierarchy) {
		return hierarchies.find((hierarchy) => hierarchy.name === dimension?.defaultHierarchy) ?? hierarchies[0]
	}

	const normalizedHierarchy = normalizeComparisonName(requestedHierarchy)
	return hierarchies.find(
		(hierarchy) =>
			normalizeComparisonName(hierarchy.name) === normalizedHierarchy ||
			normalizeComparisonName(hierarchy.caption) === normalizedHierarchy
	)
}

function findLevel(
	hierarchy: PropertyHierarchy | undefined,
	dimension: PropertyDimension | undefined,
	requestedLevel: string | undefined
): PropertyLevel | undefined {
	const levels = hierarchy?.levels ?? dimension?.hierarchies?.flatMap((item) => item.levels ?? []) ?? []
	const normalizedLevel = normalizeComparisonName(lastUniqueNameSegment(requestedLevel))
	if (!normalizedLevel) {
		return undefined
	}

	return levels.find(
		(level) =>
			normalizeComparisonName(level.name) === normalizedLevel ||
			normalizeComparisonName(level.caption) === normalizedLevel ||
			isTimeLevelMatch(level, normalizedLevel)
	)
}

function isTimeLevelMatch(level: PropertyLevel, normalizedLevel: string): boolean {
	const requestedGranularity = timeGranularityFromLevelName(normalizedLevel)
	return requestedGranularity !== undefined && resolveTimeGranularity(level, undefined) === requestedGranularity
}

function resolveTimeGranularity(
	level: PropertyLevel | undefined,
	requestedLevel: string | undefined
): TimeGranularity | undefined {
	const normalizedLevel = normalizeComparisonName(lastUniqueNameSegment(requestedLevel))
	const requestedGranularity = timeGranularityFromLevelName(normalizedLevel)
	if (requestedGranularity) {
		return requestedGranularity
	}

	if (!level) {
		return undefined
	}

	const levelType = level.levelType
	if (levelType === TimeLevelType.TimeYears || levelType === RuntimeLevelType.TIME_YEAR) {
		return TimeGranularity.Year
	}
	if (levelType === TimeLevelType.TimeQuarters || levelType === RuntimeLevelType.TIME_QUARTER) {
		return TimeGranularity.Quarter
	}
	if (levelType === TimeLevelType.TimeMonths || levelType === RuntimeLevelType.TIME_MONTH) {
		return TimeGranularity.Month
	}
	if (levelType === TimeLevelType.TimeWeeks || levelType === RuntimeLevelType.TIME_WEEK) {
		return TimeGranularity.Week
	}
	if (levelType === TimeLevelType.TimeDays || levelType === RuntimeLevelType.TIME_DAY) {
		return TimeGranularity.Day
	}

	return undefined
}

function timeGranularityFromLevelName(normalizedLevel: string): TimeGranularity | undefined {
	if (normalizedLevel === 'year') {
		return TimeGranularity.Year
	}
	if (normalizedLevel === 'quarter') {
		return TimeGranularity.Quarter
	}
	if (normalizedLevel === 'month') {
		return TimeGranularity.Month
	}
	if (normalizedLevel === 'week') {
		return TimeGranularity.Week
	}
	if (normalizedLevel === 'day' || normalizedLevel === 'date') {
		return TimeGranularity.Day
	}
	return undefined
}

function formatTimeWindowMember(
	value: string,
	formatter: string | undefined,
	timeGranularity: TimeGranularity | undefined
): string {
	const trimmed = normalizeString(value)
	if (!trimmed || !formatter || !timeGranularity || trimmed.startsWith('[')) {
		return value
	}

	try {
		return reformat(new Date(), trimmed, timeGranularity, formatter)
	} catch {
		return value
	}
}

function toHierarchyName(dimensionId: string, hierarchy: string): string {
	const trimmed = hierarchy.trim()
	if (!trimmed || trimmed.startsWith('[')) {
		return hierarchy
	}
	return `${dimensionId}.${toUniqueNameSegment(trimmed)}`
}

function toUniqueNameSegment(value: string): string {
	const trimmed = value.trim()
	if (!trimmed || trimmed.startsWith('[')) {
		return value
	}
	return wrapBrackets(trimmed)
}

function lastUniqueNameSegment(value: string | undefined): string | undefined {
	const trimmed = normalizeString(value)
	if (!trimmed) {
		return undefined
	}
	const parts = trimmed.split('].[')
	if (parts.length > 1) {
		const lastPart = parts[parts.length - 1]
		return unwrapBrackets(lastPart?.startsWith('[') ? lastPart : `[${lastPart}`)
	}
	return unwrapBrackets(trimmed)
}

function normalizeComparisonName(value: string | undefined): string {
	const normalized = lastUniqueNameSegment(value)?.trim().toLowerCase()
	return normalized ?? ''
}

function mapFilterOperator(op: UoseMdxFilter['op']): FilterOperator {
	switch (op) {
		case 'eq':
		case 'in':
			return FilterOperator.EQ
		case 'ne':
			return FilterOperator.NE
		case 'gt':
			return FilterOperator.GT
		case 'gte':
			return FilterOperator.GE
		case 'lt':
			return FilterOperator.LT
		case 'lte':
			return FilterOperator.LE
		case 'between':
			return FilterOperator.BT
		case 'contains':
			return FilterOperator.Contains
	}
}

function mapFilterMembers(filter: UoseMdxFilter) {
	if (filter.op === 'between') {
		const range = Array.isArray(filter.value)
			? filter.value
			: [readObject(filter.value)?.from, readObject(filter.value)?.to]
		return range.slice(0, 2).map((value) => ({ key: String(value ?? '') }))
	}

	const values = filter.op === 'in' && Array.isArray(filter.value) ? filter.value : [filter.value]
	return values.map((value) => ({ key: String(value ?? '') }))
}

function unwrapQueryReturn(payload: unknown): unknown {
	const object = readObject(payload)
	if (
		object &&
		readObject(object.data) &&
		(Array.isArray(readObject(object.data)?.data) || readObject(object.data)?.schema)
	) {
		return object.data
	}
	return payload
}

function extractRows(payload: unknown): Array<Record<string, unknown>> {
	const object = readObject(payload)
	const rows = ((Array.isArray(payload) && payload) ||
		(Array.isArray(object?.rows) && object.rows) ||
		(Array.isArray(object?.data) && object.data) ||
		(Array.isArray(readObject(object?.data)?.rows) && readObject(object?.data)?.rows) ||
		(Array.isArray(readObject(object?.data)?.data) && readObject(object?.data)?.data) ||
		[]) as unknown[]

	return rows.map((row, index) => {
		if (row && typeof row === 'object' && !Array.isArray(row)) {
			return row as Record<string, unknown>
		}
		return {
			index,
			value: row
		}
	})
}

function extractColumns(payload: unknown, rows: Array<Record<string, unknown>>) {
	if (rows.length > 0) {
		const first = rows[0]
		return Object.keys(first).map((name) => ({
			name,
			type: inferColumnType(first[name])
		}))
	}

	const schema = (readObject(payload) as QueryReturn<unknown> | undefined)?.schema
	const schemaColumns = [...(schema?.rows ?? []), ...(schema?.columns ?? [])]
	return schemaColumns.map((column) => ({
		name: normalizeString(column.name) ?? normalizeString(column.caption) ?? 'value',
		type: normalizeString(column.dataType) ?? 'unknown'
	}))
}

function inferColumnType(value: unknown): string {
	if (value === null || value === undefined) {
		return 'unknown'
	}
	if (value instanceof Date) {
		return 'datetime'
	}
	return typeof value
}

function normalizeLimit(value: unknown): number {
	const parsed = typeof value === 'number' ? value : Number(value)
	if (!Number.isFinite(parsed)) {
		return 100
	}
	return Math.min(1000, Math.max(1, Math.trunc(parsed)))
}

function normalizeString(value: unknown): string | undefined {
	if (typeof value !== 'string') {
		return undefined
	}
	const trimmed = value.trim()
	return trimmed ? trimmed : undefined
}

function readObject(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined
	}
	return value as Record<string, unknown>
}
