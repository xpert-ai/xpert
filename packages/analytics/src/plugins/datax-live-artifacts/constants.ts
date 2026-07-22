export const DATA_X_LIVE_ARTIFACT_MIDDLEWARE_NAME = 'datax-live-artifacts'
export const DATA_X_LIVE_ARTIFACT_FEATURE = 'datax.live-artifacts'
export const DATA_X_LIVE_ARTIFACT_PLUGIN_NAME = '@xpert-ai/datax-live-artifacts'
export const DATA_X_LIVE_ARTIFACT_RESOURCE_TYPE = 'live-artifact-draft'
export const DATA_X_LIVE_ARTIFACT_MAX_HTML_BYTES = 1_000_000
export const DATA_X_LIVE_ARTIFACT_DEFAULT_CACHE_TTL_SECONDS = 90
export const DATA_X_LIVE_ARTIFACT_VISUALIZATION_META_KEY = 'xpertai/visualization'

export const DataXLiveArtifactToolName = {
	VALIDATE: 'datax_validate_live_artifact',
	CREATE: 'datax_create_live_artifact',
	UPDATE: 'datax_update_live_artifact',
	OPEN: 'datax_open_live_artifact'
} as const

export const DATA_X_LIVE_ARTIFACT_ICON = [
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">',
	'<path d="M4 19V5m0 14h16"/><path d="m7 15 3-4 3 2 4-6"/><circle cx="7" cy="15" r="1"/><circle cx="10" cy="11" r="1"/><circle cx="13" cy="13" r="1"/><circle cx="17" cy="7" r="1"/>',
	'</svg>'
].join('')
