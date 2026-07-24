import {
	isJsonObject,
	JsonObject,
	readArray,
	readBoolean,
	readNumber,
	readObject,
	readString
} from '../../../../remote-components/shared/runtime'

export type Option = {
	value: string
	label: string
	description?: string
}

export type MetricRow = {
	id: string
	code: string
	name: string
	type: string
	status: string
	modelId?: string
	modelName?: string
	businessAreaId?: string
	businessAreaName?: string
	certificationId?: string
	certificationName?: string
	entity?: string
	business?: string
	unit?: string
	principal?: string
	validity?: string
	isApplication: boolean
	embeddingStatus?: string
	error?: string
	visible: boolean
	updatedAt?: string
	tags: Array<{ id?: string; name?: string; color?: string }>
	draft?: JsonObject
	options?: JsonObject
}

export type MetricForm = {
	code: string
	name: string
	type: 'BASIC' | 'DERIVE'
	modelId: string
	businessAreaId: string
	cube: string
	description: string
	business: string
	calendar: string
	measure: string
	formula: string
	aggregator: string
	dimensionsText: string
	filtersText: string
	unit: string
	certificationId: string
	principal: string
	validity: string
	visible: boolean
	isApplication: boolean
}

export type MetricPage = {
	items: MetricRow[]
	total: number
	scopeSummary?: string
}

export const emptyMetricForm = (): MetricForm => ({
	code: '',
	name: '',
	type: 'BASIC',
	modelId: '',
	businessAreaId: '',
	cube: '',
	description: '',
	business: '',
	calendar: '',
	measure: '',
	formula: '',
	aggregator: 'sum',
	dimensionsText: '',
	filtersText: '[]',
	unit: '',
	certificationId: '',
	principal: '',
	validity: '',
	visible: true,
	isApplication: false
})

export function parseOptions(result: JsonObject): Option[] {
	return readArray(result, 'items')
		.filter(isJsonObject)
		.map((item) => ({
			value: scalarString(item['value']),
			label: readString(item, 'label') ?? scalarString(item['value']),
			description: readString(item, 'description')
		}))
		.filter((option) => option.value)
}

export function parseMetricPage(data: JsonObject): MetricPage {
	return {
		items: readArray(data, 'items').filter(isJsonObject).map(parseMetricRow),
		total: readNumber(data, 'total') ?? 0,
		scopeSummary: readString(readObject(data, 'meta'), 'scopeSummary')
	}
}

export function parseMetricRow(row: JsonObject): MetricRow {
	return {
		id: scalarString(row['id']),
		code: readString(row, 'code') ?? '',
		name: readString(row, 'name') ?? '',
		type: readString(row, 'type') ?? 'BASIC',
		status: readString(row, 'status') ?? 'DRAFT',
		modelId: readString(row, 'modelId'),
		modelName: readString(row, 'modelName'),
		businessAreaId: readString(row, 'businessAreaId'),
		businessAreaName: readString(row, 'businessAreaName'),
		certificationId: readString(row, 'certificationId'),
		certificationName: readString(row, 'certificationName'),
		entity: readString(row, 'entity'),
		business: readString(row, 'business'),
		unit: readString(row, 'unit'),
		principal: readString(row, 'principal'),
		validity: readString(row, 'validity'),
		isApplication: readBoolean(row, 'isApplication') ?? false,
		embeddingStatus: readString(row, 'embeddingStatus'),
		error: readString(row, 'error'),
		visible: readBoolean(row, 'visible') ?? true,
		updatedAt: readString(row, 'updatedAt'),
		tags: readArray(row, 'tags')
			.filter(isJsonObject)
			.map((tag) => ({
				id: readString(tag, 'id'),
				name: readString(tag, 'name'),
				color: readString(tag, 'color')
			})),
		draft: readObject(row, 'draft'),
		options: readObject(row, 'options')
	}
}

export function metricFormFromRow(row: MetricRow): MetricForm {
	const options = row.options ?? readObject(row.draft, 'options') ?? {}
	const dimensions = readArray(options, 'dimensions').filter((item): item is string => typeof item === 'string')
	const filters = readArray(options, 'filters')
	return {
		code: row.code,
		name: row.name,
		type: row.type === 'DERIVE' ? 'DERIVE' : 'BASIC',
		modelId: row.modelId ?? '',
		businessAreaId: row.businessAreaId ?? '',
		cube: row.entity ?? '',
		description: row.business ?? '',
		business: row.business ?? '',
		calendar: readString(options, 'calendar') ?? '',
		measure: readString(options, 'measure') ?? '',
		formula: readString(options, 'formula') ?? '',
		aggregator: readString(options, 'aggregator') ?? 'sum',
		dimensionsText: dimensions.join(', '),
		filtersText: JSON.stringify(filters, null, 2),
		unit: row.unit ?? '',
		certificationId: row.certificationId ?? '',
		principal: row.principal ?? '',
		validity: row.validity ?? '',
		visible: row.visible,
		isApplication: row.isApplication
	}
}

export function metricFormToInput(form: MetricForm): JsonObject {
	const filters: unknown = JSON.parse(form.filtersText || '[]')
	if (!Array.isArray(filters)) {
		throw new Error('Filters must be a JSON array.')
	}
	return {
		code: form.code.trim(),
		name: form.name.trim(),
		type: form.type,
		modelId: form.modelId || undefined,
		businessAreaId: form.businessAreaId || undefined,
		cube: form.cube.trim() || undefined,
		entity: form.cube.trim() || undefined,
		description: form.description.trim() || undefined,
		business: form.business.trim() || form.description.trim() || undefined,
		calendar: form.calendar.trim() || undefined,
		measure: form.measure.trim() || undefined,
		formula: form.formula.trim() || undefined,
		aggregator: form.aggregator.trim() || undefined,
		dimensions: form.dimensionsText
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean),
		filters: filters.filter(isJsonObject),
		unit: form.unit.trim() || undefined,
		certificationId: form.certificationId || undefined,
		principal: form.principal.trim() || undefined,
		validity: form.validity.trim() || undefined,
		visible: form.visible,
		isApplication: form.isApplication
	}
}

export function tr(locale: string | undefined, en: string, zh: string) {
	return locale?.toLowerCase().startsWith('zh') ? zh : en
}

function scalarString(value: unknown) {
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
}
