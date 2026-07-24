export const DATA_X_SEMANTIC_MODELING_PLUGIN_NAME = 'analytics:datax-semantic-modeling'
export const DATA_X_SEMANTIC_MODELING_PROVIDER_KEY = 'datax_semantic_modeling'
export const DATA_X_SEMANTIC_MODELING_VIEW_KEY = 'modeling'
export const DATA_X_SEMANTIC_MODELING_PUBLIC_VIEW_KEY = `${DATA_X_SEMANTIC_MODELING_PROVIDER_KEY}__${DATA_X_SEMANTIC_MODELING_VIEW_KEY}`
export const DATA_X_SEMANTIC_MODELING_REMOTE_ENTRY_KEY = 'semantic-modeling'
export const DATA_X_SEMANTIC_MODELING_FEATURE = 'datax_semantic_modeling'
export const DATA_X_SEMANTIC_MODELING_MIDDLEWARE_NAME = DATA_X_SEMANTIC_MODELING_PROVIDER_KEY
export const DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME = 'semantic_modeling_open'
export const DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME = 'semantic_model_list_workspaces'
export const DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME = 'semantic_model_create_workspace'
export const DATA_X_SEMANTIC_MODEL_SAVE_DRAFT_TOOL_NAME = 'semantic_model_save_draft_schema'
export const DATA_X_SEMANTIC_MODEL_PUBLISH_TOOL_NAME = 'semantic_model_publish_workspace'
export const DATA_X_SEMANTIC_MODELING_MAIN_SLOT = 'agent.workbench.main'
export const DATA_X_SEMANTIC_MODELING_FIXED_SLOT = 'agent.workbench.fixed'
export const DATA_X_VISUALIZATION_META_KEY = 'xpertai/visualization'

export const DATA_X_SEMANTIC_MODELING_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="none">
  <rect x="24" y="24" width="208" height="208" rx="40" fill="#EEF2FF"/>
  <path d="M68 84L128 52L188 84L128 116L68 84Z" fill="#4F46E5"/>
  <path d="M68 124L128 156L188 124" stroke="#6366F1" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M68 164L128 196L188 164" stroke="#14B8A6" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`

export const DATA_X_SEMANTIC_MODELING_TOOL_NAMES = [
	DATA_X_SEMANTIC_MODELING_OPEN_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_LIST_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_CREATE_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_SAVE_DRAFT_TOOL_NAME,
	DATA_X_SEMANTIC_MODEL_PUBLISH_TOOL_NAME,
	'switch_model_workspace',
	'list_tables',
	'list_table_schema',
	'list_cubes',
	'read_cube',
	'edit_dimension',
	'edit_hierarchy',
	'edit_cube',
	'edit_calculated_member',
	'edit_measure',
	'edit_parameter',
	'edit_calculation',
	'edit_virtual_cube',
	'model_dimension_member_retriever',
	'get_cube_runtime_context',
	'preview_cube'
] as const
