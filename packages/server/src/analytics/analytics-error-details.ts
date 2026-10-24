import { t } from 'i18next'

type Stage = 'request' | 'source' | 'validation' | 'execution' | 'result'
type Guidance = { key: string; message: string; stage: Stage; retryable?: boolean }

// Stable codes select platform-owned copy, never raw SQL, connection details or driver errors.
const guidance = {
	request: {
		key: 'AnalyticsRequestInvalid',
		stage: 'request',
		message:
			'The query request does not match the contract. Pass binding as an object with source, providerId, operation, contractVersion, payload, parameters and output. Only payloadJson/bindingJson tool fields accept JSON text. Correct the input before retrying.'
	},
	readOnly: {
		key: 'AnalyticsReadOnlyRejected',
		stage: 'validation',
		message:
			'The SQL read-only validator rejected this query before execution. Use one read-only SELECT with supported functions; remove writes, multiple statements and unsupported calls. Inspect the SQL instead of retrying the same input.'
	},
	fields: {
		key: 'AnalyticsFieldsInvalid',
		stage: 'result',
		message:
			'An output sourceField is missing or matches multiple columns. Give each SELECT expression a unique alias and match output.fields[].sourceField to that alias, then preview again.'
	},
	types: {
		key: 'AnalyticsFieldTypesInvalid',
		stage: 'result',
		message:
			'A returned value does not match its declared logicalType or nullable flag. Inspect source types and output.fields; COUNT/BIGINT use int64, DECIMAL uses decimal, and nullable columns require nullable:true. Correct the declaration or an intentional SQL cast before retrying.'
	},
	grain: {
		key: 'AnalyticsGrainMismatch',
		stage: 'result',
		message:
			'Returned rows repeat the declared grain. Inspect the actual rows and use a truly unique grain, or an empty grain for an unaggregated table. Do not discard source rows.'
	},
	parameters: {
		key: 'AnalyticsParametersInvalid',
		stage: 'request',
		message:
			'A required query parameter is missing or its value is invalid. Check parameters[].controlId, type, required, allowedValues and defaults against controls. Use typed scalar values; correct the input before retrying.'
	},
	control: {
		key: 'AnalyticsControlUnknown',
		stage: 'request',
		message:
			'The query contains an undeclared control. Match controls keys to parameters[].controlId, or declare the intended parameter and its native query binding before retrying.'
	},
	order: {
		key: 'AnalyticsParameterOrderInvalid',
		stage: 'validation',
		message:
			'SQL placeholders and parameterOrder do not match the declared parameters. Include every parameter name, repeat its name for every positional ? occurrence, and make the placeholder count equal parameterOrder.length.'
	},
	template: {
		key: 'AnalyticsParameterTemplateInvalid',
		stage: 'validation',
		message:
			'The SQL parameter template is ambiguous or unsafe. Use scalar ? placeholders outside quotes/comments, never ?? for identifiers. Close quotes/comments and avoid backslash escapes; correct the SQL before retrying.'
	},
	source: {
		key: 'AnalyticsSourceUnavailableHint',
		stage: 'source',
		message:
			'The selected source is unavailable, changed, or inaccessible to the current user. Refresh the authorized source list and discover the exact source/provider pair. Do not guess IDs or retry the unchanged query.'
	},
	config: {
		key: 'AnalyticsSourceConfigInvalidHint',
		stage: 'source',
		message:
			'The source configuration is invalid. Ask an administrator to check the source configuration; changing SQL or repeatedly previewing cannot repair it.'
	},
	capability: {
		key: 'AnalyticsCapabilityUnavailableHint',
		stage: 'source',
		message:
			'The selected provider, operation or contract version is unavailable. List sources and discover again, then use the returned providerId, operation and contractVersion.'
	},
	timeout: {
		key: 'AnalyticsQueryTimeoutHint',
		stage: 'execution',
		retryable: true,
		message:
			'The query timed out or was cancelled. Narrow the data range or simplify the query, and check source connectivity. Retry at most once after the condition changes; stop if it fails again.'
	},
	recursion: {
		key: 'AnalyticsRecursionDeniedHint',
		stage: 'validation',
		message:
			'Analytics dependency recursion or depth was rejected. Inspect upstream source definitions and remove the dependency cycle before retrying.'
	},
	failed: {
		key: 'AnalyticsQueryFailedHint',
		stage: 'execution',
		message:
			'The provider failed to execute or validate the query. Private driver details are withheld. Inspect the source schema and query contract, then try a minimal read-only query to isolate the problem. If it still fails, report the blocker; do not repeat identical previews.'
	}
} satisfies Record<string, Guidance>

const byCode = new Map<string, Guidance>([
	['ANALYTICS_INVALID_REQUEST', guidance.request],
	['ANALYTICS_READ_ONLY_VIOLATION', guidance.readOnly],
	['ANALYTICS_FIELD_MISSING_OR_AMBIGUOUS', guidance.fields],
	['ANALYTICS_FIELD_TYPE_MISMATCH', guidance.types],
	['ANALYTICS_GRAIN_MISMATCH', guidance.grain],
	['ANALYTICS_PARAMETER_REQUIRED', guidance.parameters],
	['ANALYTICS_PARAMETER_INVALID', guidance.parameters],
	['ANALYTICS_UNKNOWN_CONTROL', guidance.control],
	['ANALYTICS_PARAMETER_ORDER_INVALID', guidance.order],
	['ANALYTICS_PARAMETER_TEMPLATE_INVALID', guidance.template],
	...['ANALYTICS_SOURCE_UNAVAILABLE', 'ANALYTICS_SOURCE_CHANGED', 'ANALYTICS_SOURCE_KIND_UNAVAILABLE'].map(
		(code) => [code, guidance.source] as const
	),
	['ANALYTICS_SOURCE_CONFIG_INVALID', guidance.config],
	...['ANALYTICS_CAPABILITY_UNAVAILABLE', 'ANALYTICS_DISCOVERY_UNAVAILABLE'].map(
		(code) => [code, guidance.capability] as const
	),
	['ANALYTICS_TIMEOUT', guidance.timeout],
	['ANALYTICS_RECURSION_DENIED', guidance.recursion],
	['ANALYTICS_QUERY_FAILED', guidance.failed]
])

export function analyticsErrorDetails(code: string) {
	const detail: Guidance = byCode.get(code) ?? guidance.failed
	return {
		code: byCode.has(code) ? code : 'ANALYTICS_QUERY_FAILED',
		stage: detail.stage,
		retryable: detail.retryable ?? false,
		message: t(`server-ai:Error.${detail.key}`, { defaultValue: detail.message })
	}
}

export const PROVIDER_VALIDATION_ERRORS = new Map([
	['read_only_violation', 'ANALYTICS_READ_ONLY_VIOLATION'],
	['MYSQL_PARAMETER_ORDER_INVALID', 'ANALYTICS_PARAMETER_ORDER_INVALID'],
	['MYSQL_PARAMETER_COUNT_INVALID', 'ANALYTICS_PARAMETER_ORDER_INVALID'],
	['MYSQL_PARAMETER_TEMPLATE_INVALID', 'ANALYTICS_PARAMETER_TEMPLATE_INVALID'],
	['MYSQL_IDENTIFIER_PARAMETER_DENIED', 'ANALYTICS_PARAMETER_TEMPLATE_INVALID']
])
