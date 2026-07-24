export const DATA_X_QUERY_ANALYSIS_PLUGIN_NAME = 'analytics:datax-query-analysis'
export const DATA_X_QUERY_ANALYSIS_PROVIDER_KEY = 'datax_query_analysis'
export const DATA_X_QUERY_ANALYSIS_VIEW_KEY = 'query'
export const DATA_X_QUERY_ANALYSIS_PUBLIC_VIEW_KEY = `${DATA_X_QUERY_ANALYSIS_PROVIDER_KEY}__${DATA_X_QUERY_ANALYSIS_VIEW_KEY}`
export const DATA_X_QUERY_ANALYSIS_REMOTE_ENTRY_KEY = 'query-analysis'
export const DATA_X_QUERY_ANALYSIS_FEATURE = 'datax_query_analysis'
export const DATA_X_QUERY_ANALYSIS_MIDDLEWARE_NAME = DATA_X_QUERY_ANALYSIS_PROVIDER_KEY
export const DATA_X_QUERY_ANALYSIS_EXECUTE_TOOL_NAME = 'datax_query_execute'
export const DATA_X_QUERY_ANALYSIS_CONTEXT_TOOL_NAME = 'datax_query_model_context'
export const DATA_X_QUERY_ANALYSIS_OPEN_TOOL_NAME = 'datax_query_open'
export const DATA_X_QUERY_ANALYSIS_MAIN_SLOT = 'agent.workbench.main'
export const DATA_X_QUERY_ANALYSIS_FIXED_SLOT = 'agent.workbench.fixed'
export const DATA_X_QUERY_VISUALIZATION_META_KEY = 'xpertai/visualization'

export const DATA_X_QUERY_ANALYSIS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
  <rect x="24" y="24" width="208" height="208" rx="40" fill="#ECFDF5"/>
  <ellipse cx="128" cy="76" rx="68" ry="28" fill="#0F766E"/>
  <path d="M60 76V128C60 143.5 90.4 156 128 156C165.6 156 196 143.5 196 128V76" stroke="#0F766E" stroke-width="14"/>
  <path d="M60 128V180C60 195.5 90.4 208 128 208C165.6 208 196 195.5 196 180V128" stroke="#14B8A6" stroke-width="14"/>
</svg>`

export const DATA_X_QUERY_ANALYSIS_TOOL_NAMES = [
	DATA_X_QUERY_ANALYSIS_OPEN_TOOL_NAME,
	DATA_X_QUERY_ANALYSIS_CONTEXT_TOOL_NAME,
	DATA_X_QUERY_ANALYSIS_EXECUTE_TOOL_NAME
] as const
