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
	'switch_project',
	'indicator_list_cubes',
	'list_indicators',
	'create_derive_indicator',
	'create_basic_indicator',
	'edit_indicator',
	'delete_indicator',
	'indicator_retriever',
	'show_indicators',
	'dimension_member_retriever',
	'get_indicator_cube_context'
] as const
