import {
	I18nObject,
	XpertExtensionViewManifest,
	XpertResolvedViewHostContext,
	XpertViewActionDefinition,
	XpertViewActionPlacement,
	XpertViewActionTransport,
	XpertViewActionType,
	XpertViewDataSource,
	XpertViewFilter,
	XpertViewFilterOperator,
	XpertViewHostContext,
	XpertViewParameterDefinition,
	XpertViewQuery,
	XpertViewScalar,
	XpertViewSchemaType
} from '@xpert-ai/contracts'
import { BadRequestException, UnauthorizedException } from '@nestjs/common'
import { LanguagesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '../core/context'

const ALLOWED_SCHEMA_TYPES = new Set<XpertViewSchemaType>([
	'stats',
	'table',
	'list',
	'detail',
	'raw_json',
	'remote_component'
])
const ALLOWED_ACTION_TYPES = new Set<XpertViewActionType>(['invoke', 'navigate', 'open_detail', 'refresh'])
const ALLOWED_ACTION_PLACEMENTS = new Set<XpertViewActionPlacement>(['toolbar', 'row'])
const ALLOWED_ACTION_TRANSPORTS = new Set<XpertViewActionTransport>(['json', 'file'])
const VIEW_KEY_SEPARATOR = '__'
const ALLOWED_QUERY_KEYS = new Set([
	'page',
	'pageSize',
	'cursor',
	'search',
	'sortBy',
	'sortDirection',
	'filters',
	'selectionId',
	'parameters'
])

export function buildBaseViewHostContext(hostType: string, hostId: string): XpertViewHostContext {
	const tenantId = RequestContext.currentTenantId()
	const organizationId = RequestContext.getOrganizationId()
	const userId = RequestContext.currentUserId()

	if (!tenantId || !userId) {
		throw new UnauthorizedException()
	}

	return {
		tenantId,
		organizationId,
		userId,
		hostType,
		hostId,
		locale: RequestContext.getLanguageCode() ?? LanguagesEnum.English
	}
}

export function normalizeManifest(
	manifest: XpertExtensionViewManifest,
	providerKey: string,
	context: XpertResolvedViewHostContext,
	slot: string
): XpertExtensionViewManifest {
	validateProviderKey(providerKey)
	validateManifestShape(manifest, providerKey, context, slot)

	return {
		...manifest,
		key: composePublicViewKey(providerKey, manifest.key),
		source: {
			provider: providerKey,
			plugin: manifest.source?.plugin,
			version: manifest.source?.version
		},
		dataSource: normalizeDataSource(manifest.dataSource),
		actions: normalizeActions(manifest.actions)
	}
}

export function isManifestActiveForContext(
	manifest: XpertExtensionViewManifest,
	context: XpertResolvedViewHostContext
): boolean {
	const activation = manifest.activation
	if (!activation) {
		return true
	}

	const requiredFeatures = normalizeStringList(activation.requiredFeatures)
	const requiredMiddlewareProviders = normalizeStringList(activation.requiredMiddlewareProviders)

	if (requiredFeatures.length) {
		const availableFeatures = new Set(normalizeStringList(context.capabilities?.features))
		if (!requiredFeatures.every((feature) => availableFeatures.has(feature))) {
			return false
		}
	}

	if (requiredMiddlewareProviders.length) {
		const availableProviders = new Set(normalizeStringList(context.capabilities?.middlewareProviders))
		if (!requiredMiddlewareProviders.every((provider) => availableProviders.has(provider))) {
			return false
		}
	}

	return true
}

export function composePublicViewKey(providerKey: string, manifestKey: string) {
	validateProviderKey(providerKey)
	validateManifestKey(manifestKey)
	return `${providerKey}${VIEW_KEY_SEPARATOR}${manifestKey}`
}

export function splitPublicViewKey(viewKey: string) {
	const separatorIndex = viewKey.indexOf(VIEW_KEY_SEPARATOR)
	if (separatorIndex <= 0 || separatorIndex === viewKey.length - VIEW_KEY_SEPARATOR.length) {
		throw new BadRequestException(`Invalid view key '${viewKey}'`)
	}

	const providerKey = viewKey.slice(0, separatorIndex)
	const manifestKey = viewKey.slice(separatorIndex + VIEW_KEY_SEPARATOR.length)

	validateProviderKey(providerKey)
	validateManifestKey(manifestKey)

	return {
		providerKey,
		manifestKey
	}
}

export function validateQuery(query: XpertViewQuery, dataSource: XpertViewDataSource) {
	const schema = dataSource.querySchema
	const hasQuery =
		query.page !== undefined ||
		query.pageSize !== undefined ||
		query.cursor !== undefined ||
		query.search !== undefined ||
		query.sortBy !== undefined ||
		query.sortDirection !== undefined ||
		query.selectionId !== undefined ||
		(query.filters?.length ?? 0) > 0 ||
		Object.keys(query.parameters ?? {}).length > 0

	if (!schema) {
		if (hasQuery) {
			throw new BadRequestException('This view does not support query parameters')
		}

		return query
	}

	if (!schema.supportsPagination && (query.page !== undefined || query.pageSize !== undefined)) {
		throw new BadRequestException('This view does not support pagination')
	}

	if (!schema.supportsCursor && query.cursor) {
		throw new BadRequestException('This view does not support cursor queries')
	}

	if (!schema.supportsSearch && query.search) {
		throw new BadRequestException('This view does not support search')
	}

	if (!schema.supportsSort && (query.sortBy || query.sortDirection)) {
		throw new BadRequestException('This view does not support sorting')
	}

	if (!schema.supportsFilter && query.filters?.length) {
		throw new BadRequestException('This view does not support filters')
	}

	if (!schema.supportsSelection && query.selectionId) {
		throw new BadRequestException('This view does not support selection queries')
	}

	if (!schema.supportsParameters && Object.keys(query.parameters ?? {}).length > 0) {
		throw new BadRequestException('This view does not support parameterized queries')
	}

	return query
}

export function parseViewQuery(input: Record<string, string | string[] | undefined>): XpertViewQuery {
	for (const key of Object.keys(input)) {
		if (!ALLOWED_QUERY_KEYS.has(key)) {
			throw new BadRequestException(`Unsupported query parameter '${key}'`)
		}
	}

	const page = parseOptionalPositiveInt(input['page'])
	const pageSize = parseOptionalPositiveInt(input['pageSize'])
	const cursor = parseOptionalString(input['cursor'])
	const search = parseOptionalString(input['search'])
	const sortBy = parseOptionalString(input['sortBy'])
	const sortDirection = parseSortDirection(input['sortDirection'])
	const selectionId = parseOptionalString(input['selectionId'])
	const filters = parseFilters(input['filters'])
	const parameters = parseParameters(input['parameters'])

	return {
		page,
		pageSize,
		cursor,
		search,
		sortBy,
		sortDirection,
		filters,
		selectionId,
		parameters
	}
}

export function parseParameterOptionsQuery(input: Record<string, string | string[] | undefined>) {
	for (const key of Object.keys(input)) {
		if (key !== 'search' && key !== 'parameters') {
			throw new BadRequestException(`Unsupported query parameter '${key}'`)
		}
	}

	return {
		search: parseOptionalString(input['search']),
		parameters: parseParameters(input['parameters'])
	}
}

function validateManifestShape(
	manifest: XpertExtensionViewManifest,
	providerKey: string,
	context: XpertResolvedViewHostContext,
	slot: string
) {
	validateManifestKey(manifest.key)

	if (!hasI18nText(manifest.title)) {
		throw new BadRequestException(`View manifest '${providerKey}:${manifest.key}' must have a title`)
	}

	if (manifest.description !== undefined) {
		assertI18nText(
			manifest.description,
			`View manifest '${providerKey}:${manifest.key}' has an invalid description`
		)
	}

	if (manifest.hostType !== context.hostType) {
		throw new BadRequestException(`View manifest '${providerKey}:${manifest.key}' has an invalid hostType`)
	}

	if (manifest.slot !== slot) {
		throw new BadRequestException(`View manifest '${providerKey}:${manifest.key}' has an invalid slot`)
	}

	if (!ALLOWED_SCHEMA_TYPES.has(manifest.view.type)) {
		throw new BadRequestException(`Unsupported view schema type '${manifest.view.type}'`)
	}

	if (manifest.dataSource.mode !== 'platform') {
		throw new BadRequestException(
			`View manifest '${providerKey}:${manifest.key}' must use platform dataSource mode`
		)
	}

	validateSchemaText(manifest, providerKey)
	validateManifestParameters(manifest.parameters, providerKey, manifest.key)
}

function normalizeDataSource(dataSource: XpertViewDataSource): XpertViewDataSource {
	return {
		...dataSource,
		mode: 'platform'
	}
}

function normalizeActions(actions?: XpertViewActionDefinition[]) {
	return actions?.map((action) => {
		if (!action.key?.trim()) {
			throw new BadRequestException('View actions must have a key')
		}

		if (!hasI18nText(action.label)) {
			throw new BadRequestException(`View action '${action.key}' must have a label`)
		}

		if (action.confirm?.title !== undefined) {
			assertI18nText(action.confirm.title, `View action '${action.key}' has an invalid confirm title`)
		}

		if (action.confirm?.message !== undefined) {
			assertI18nText(action.confirm.message, `View action '${action.key}' has an invalid confirm message`)
		}

		if (!ALLOWED_ACTION_TYPES.has(action.actionType)) {
			throw new BadRequestException(`Unsupported action type '${action.actionType}'`)
		}

		const placement = action.placement ?? 'toolbar'
		if (!ALLOWED_ACTION_PLACEMENTS.has(placement)) {
			throw new BadRequestException(`Unsupported action placement '${placement}'`)
		}

		const transport = action.transport ?? 'json'
		if (!ALLOWED_ACTION_TRANSPORTS.has(transport)) {
			throw new BadRequestException(`Unsupported action transport '${transport}'`)
		}

		return {
			...action,
			placement,
			transport
		}
	})
}

function normalizeStringList(values?: string[]) {
	return (values ?? []).map((value) => value?.trim()).filter((value): value is string => Boolean(value))
}

function validateProviderKey(providerKey: string) {
	if (!providerKey?.trim() || providerKey.includes(VIEW_KEY_SEPARATOR)) {
		throw new BadRequestException(`Invalid provider key '${providerKey}'`)
	}
}

function validateManifestKey(manifestKey: string) {
	if (!manifestKey?.trim() || manifestKey.includes(VIEW_KEY_SEPARATOR)) {
		throw new BadRequestException(`Invalid manifest key '${manifestKey}'`)
	}
}

function validateSchemaText(manifest: XpertExtensionViewManifest, providerKey: string) {
	switch (manifest.view.type) {
		case 'stats':
			manifest.view.items.forEach((item) => {
				if (!hasI18nText(item.label)) {
					throw new BadRequestException(
						`Stats item '${providerKey}:${manifest.key}:${item.key}' must have a label`
					)
				}
			})
			break
		case 'table':
			manifest.view.columns.forEach((column) => {
				if (!hasI18nText(column.label)) {
					throw new BadRequestException(
						`Table column '${providerKey}:${manifest.key}:${column.key}' must have a label`
					)
				}
			})

			if (manifest.view.search?.placeholder !== undefined) {
				assertI18nText(
					manifest.view.search.placeholder,
					`Table view '${providerKey}:${manifest.key}' has an invalid search placeholder`
				)
			}
			break
		case 'list':
			if (manifest.view.search?.placeholder !== undefined) {
				assertI18nText(
					manifest.view.search.placeholder,
					`List view '${providerKey}:${manifest.key}' has an invalid search placeholder`
				)
			}
			break
		case 'detail':
			manifest.view.fields.forEach((field) => {
				if (!hasI18nText(field.label)) {
					throw new BadRequestException(
						`Detail field '${providerKey}:${manifest.key}:${field.key}' must have a label`
					)
				}
			})
			break
		case 'raw_json':
			break
		case 'remote_component':
			if (manifest.view.runtime !== 'react') {
				throw new BadRequestException(
					`Remote component view '${providerKey}:${manifest.key}' must use react runtime`
				)
			}
			if (manifest.view.protocolVersion !== 1) {
				throw new BadRequestException(
					`Remote component view '${providerKey}:${manifest.key}' has an unsupported protocolVersion`
				)
			}
			if (!manifest.view.component?.entry) {
				throw new BadRequestException(
					`Remote component view '${providerKey}:${manifest.key}' must define component.entry`
				)
			}
			break
	}
}

function validateManifestParameters(
	parameters: XpertViewParameterDefinition[] | undefined,
	providerKey: string,
	manifestKey: string
) {
	const seenKeys = new Set<string>()

	for (const parameter of parameters ?? []) {
		if (!parameter.key?.trim()) {
			throw new BadRequestException(`View parameter '${providerKey}:${manifestKey}' must have a key`)
		}

		if (seenKeys.has(parameter.key)) {
			throw new BadRequestException(`Duplicate view parameter '${providerKey}:${manifestKey}:${parameter.key}'`)
		}
		seenKeys.add(parameter.key)

		if (!hasI18nText(parameter.label)) {
			throw new BadRequestException(
				`View parameter '${providerKey}:${manifestKey}:${parameter.key}' must have a label`
			)
		}

		if (parameter.description !== undefined) {
			assertI18nText(
				parameter.description,
				`View parameter '${providerKey}:${manifestKey}:${parameter.key}' has an invalid description`
			)
		}
	}
}

function assertI18nText(value: unknown, message: string): asserts value is I18nObject {
	if (!isI18nObject(value)) {
		throw new BadRequestException(message)
	}
}

function hasI18nText(value: unknown): value is I18nObject {
	return isI18nObject(value) && value.en_US.trim().length > 0
}

function isI18nObject(value: unknown): value is I18nObject {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return false
	}

	const english = Reflect.get(value, 'en_US')
	const chinese = Reflect.get(value, 'zh_Hans')

	if (typeof english !== 'string') {
		return false
	}

	if (chinese !== undefined && typeof chinese !== 'string') {
		return false
	}

	return true
}

function parseOptionalPositiveInt(value: string | string[] | undefined) {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		throw new BadRequestException('Duplicate query parameter')
	}

	const parsed = Number.parseInt(value, 10)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new BadRequestException(`Invalid numeric query parameter '${value}'`)
	}

	return parsed
}

function parseOptionalString(value: string | string[] | undefined) {
	if (!value) {
		return undefined
	}

	if (Array.isArray(value)) {
		throw new BadRequestException('Duplicate query parameter')
	}

	return value
}

function parseSortDirection(value: string | string[] | undefined) {
	const normalized = parseOptionalString(value)
	if (!normalized) {
		return undefined
	}

	if (normalized !== 'asc' && normalized !== 'desc') {
		throw new BadRequestException(`Invalid sortDirection '${normalized}'`)
	}

	return normalized
}

function parseFilters(value: string | string[] | undefined) {
	const normalized = parseOptionalString(value)
	if (!normalized) {
		return undefined
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(normalized)
	} catch {
		throw new BadRequestException('Invalid filters payload')
	}

	if (!Array.isArray(parsed)) {
		throw new BadRequestException('filters must be an array')
	}

	return parsed.map(parseFilter)
}

function parseParameters(value: string | string[] | undefined) {
	const normalized = parseOptionalString(value)
	if (!normalized) {
		return undefined
	}

	let parsed: unknown
	try {
		parsed = JSON.parse(normalized)
	} catch {
		throw new BadRequestException('Invalid parameters payload')
	}

	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new BadRequestException('parameters must be an object')
	}

	const parameters: Record<string, XpertViewScalar | XpertViewScalar[]> = {}
	for (const [key, parameterValue] of Object.entries(parsed)) {
		if (!key.trim()) {
			throw new BadRequestException('Parameter key is required')
		}

		if (!isScalarOrScalarArray(parameterValue)) {
			throw new BadRequestException(`Invalid parameter value for '${key}'`)
		}

		parameters[key] = parameterValue
	}

	return parameters
}

function parseFilter(value: unknown): XpertViewFilter {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new BadRequestException('Invalid filter item')
	}

	const keyValue = Reflect.get(value, 'key')
	const operatorValue = Reflect.get(value, 'operator')
	const filterValue = Reflect.get(value, 'value')

	if (typeof keyValue !== 'string' || keyValue.length === 0) {
		throw new BadRequestException('Filter key is required')
	}

	if (
		operatorValue !== undefined &&
		operatorValue !== 'eq' &&
		operatorValue !== 'neq' &&
		operatorValue !== 'contains' &&
		operatorValue !== 'starts_with' &&
		operatorValue !== 'ends_with' &&
		operatorValue !== 'in' &&
		operatorValue !== 'gt' &&
		operatorValue !== 'gte' &&
		operatorValue !== 'lt' &&
		operatorValue !== 'lte'
	) {
		throw new BadRequestException(`Unsupported filter operator '${String(operatorValue)}'`)
	}

	if (!isScalarOrScalarArray(filterValue)) {
		throw new BadRequestException('Invalid filter value')
	}

	return {
		key: keyValue,
		operator: parseFilterOperator(operatorValue),
		value: filterValue
	}
}

function parseFilterOperator(value: unknown): XpertViewFilterOperator | undefined {
	if (
		value !== 'eq' &&
		value !== 'neq' &&
		value !== 'contains' &&
		value !== 'starts_with' &&
		value !== 'ends_with' &&
		value !== 'in' &&
		value !== 'gt' &&
		value !== 'gte' &&
		value !== 'lt' &&
		value !== 'lte'
	) {
		return undefined
	}

	return value
}

function isScalarOrScalarArray(
	value: unknown
): value is string | number | boolean | null | Array<string | number | boolean | null> {
	if (value === null) {
		return true
	}

	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return true
	}

	if (!Array.isArray(value)) {
		return false
	}

	return value.every(
		(item) => item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
	)
}
