export const NAMESPACE = 'execution_observability'
export const PROVIDER = `${NAMESPACE}.analytics`
export const FEATURE = 'execution-observability'
export const VIEW_KEY = 'timeline'
export const PLUGIN_NAME = '@xpert-ai/plugin-execution-observability'
export const ADMINISTRATOR_TEMPLATE_KEY = 'execution-administrator'
export const APP_COVER = './assets/branding/cover-v1.png'
export const TOOL_NAMES = [
  'execution_query',
  'execution_summary',
  'execution_get',
  'execution_compare',
  'execution_find_anomalies'
] as const
export const label = (en_US: string, zh_Hans: string) => ({ en_US, zh_Hans })
// Original timeline mark, inline so iframe and provider-image consumers need no font or asset request.
export const ICON = {
  type: 'svg' as const,
  value:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#2563EB"/><path d="M11 9H26M11 16H26M11 23H26" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="2" stroke-linecap="round"/><g fill="#FFFFFF"><circle cx="7" cy="9" r="1.75"/><circle cx="7" cy="16" r="1.75"/><circle cx="7" cy="23" r="1.75"/><rect x="11" y="7" width="10" height="4" rx="2"/><rect x="15" y="14" width="11" height="4" rx="2"/><rect x="11" y="21" width="7" height="4" rx="2"/></g><path d="M23 6V27" stroke="#5EEAD4" stroke-width="1.5" stroke-linecap="round"/><circle cx="23" cy="5.5" r="2" fill="#5EEAD4"/></svg>',
  alt: 'Execution overview'
}
