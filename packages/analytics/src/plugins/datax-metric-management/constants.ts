export const DATA_X_METRIC_PLUGIN_NAME = 'analytics:datax-metric-management'
export const DATA_X_METRIC_PROVIDER_KEY = 'datax_metric_management'
export const DATA_X_METRIC_VIEW_KEY = 'metrics'
export const DATA_X_METRIC_PUBLIC_VIEW_KEY = `${DATA_X_METRIC_PROVIDER_KEY}__${DATA_X_METRIC_VIEW_KEY}`
export const DATA_X_METRIC_REMOTE_ENTRY_KEY = 'metric-management'
export const AGENT_WORKBENCH_MAIN_SLOT = 'agent.workbench.main'
export const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'
export const DATA_X_METRIC_MANAGEMENT_FEATURE = 'datax_metric_management'
export const XPERT_VISUALIZATION_META_KEY = 'xpertai/visualization'
export const INDICATOR_MANAGEMENT_OPEN_TOOL_NAME = 'indicator_management_open'

export enum DataXMetricManagementToolName {
	SCOPE_GET = 'indicator_scope_get',
	SCOPE_SET = 'indicator_scope_set',
	SCOPE_CLEAR = 'indicator_scope_clear',
	SCOPE_OPTIONS = 'indicator_scope_options',
	SCOPE_PREVIEW = 'indicator_scope_preview',
	LIST_INDICATORS = 'list_indicators',
	LIST_CUBES = 'indicator_list_cubes',
	CREATE_DERIVE_INDICATOR = 'create_derive_indicator',
	CREATE_BASIC_INDICATOR = 'create_basic_indicator',
	EDIT_INDICATOR = 'edit_indicator',
	DELETE_INDICATOR = 'delete_indicator',
	INDICATOR_RETRIEVER = 'indicator_retriever',
	SHOW_INDICATORS = 'show_indicators',
	GET_CUBE_CONTEXT = 'get_indicator_cube_context',
	DIMENSION_MEMBER_RETRIEVER = 'dimension_member_retriever'
}

export const DATA_X_METRIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none">
  <rect x="28" y="28" width="200" height="200" rx="36" fill="#EFF6FF"/>
  <path d="M72 174V92" stroke="#2563EB" stroke-width="16" stroke-linecap="round"/>
  <path d="M120 174V120" stroke="#0EA5E9" stroke-width="16" stroke-linecap="round"/>
  <path d="M168 174V78" stroke="#14B8A6" stroke-width="16" stroke-linecap="round"/>
  <path d="M62 178H194" stroke="#0F172A" stroke-width="12" stroke-linecap="round"/>
  <path d="M76 118L116 102L150 116L188 84" stroke="#0F172A" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
export const DATA_X_METRIC_MANAGEMENT_TOOL_NAMES = [
	INDICATOR_MANAGEMENT_OPEN_TOOL_NAME,
	DataXMetricManagementToolName.SCOPE_GET,
	DataXMetricManagementToolName.SCOPE_SET,
	DataXMetricManagementToolName.SCOPE_CLEAR,
	DataXMetricManagementToolName.SCOPE_OPTIONS,
	DataXMetricManagementToolName.SCOPE_PREVIEW,
	DataXMetricManagementToolName.LIST_CUBES,
	DataXMetricManagementToolName.LIST_INDICATORS,
	DataXMetricManagementToolName.CREATE_DERIVE_INDICATOR,
	DataXMetricManagementToolName.CREATE_BASIC_INDICATOR,
	DataXMetricManagementToolName.EDIT_INDICATOR,
	DataXMetricManagementToolName.DELETE_INDICATOR,
	DataXMetricManagementToolName.INDICATOR_RETRIEVER,
	DataXMetricManagementToolName.SHOW_INDICATORS,
	DataXMetricManagementToolName.DIMENSION_MEMBER_RETRIEVER,
	DataXMetricManagementToolName.GET_CUBE_CONTEXT
] as const
