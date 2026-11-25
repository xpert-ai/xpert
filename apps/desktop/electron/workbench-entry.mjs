import { parseProjectNavigation } from './project-navigation.mjs'
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
const text = (value, max) => typeof value === 'string' && !!value.trim() && value.trim().length <= max
const scalar = (value) =>
  value === null ||
  typeof value === 'boolean' ||
  (typeof value === 'string' && value.length <= 4000) ||
  (typeof value === 'number' && Number.isFinite(value))

// Packaged Electron has no contracts runtime dependency; keep this IPC boundary aligned
// with workbenchEntryTargetSchema using the shared contract fixtures in the regression test.
export function parseWorkbenchNavigation(value) {
  if (value?.target === 'project.pipelines') return parseProjectNavigation(value)
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.target !== 'workbench.view') return null
  if (
    Object.keys(value).some(
      (key) =>
        !['target', 'assistantId', 'organizationId', 'projectId', 'viewKey', 'selectionId', 'parameters'].includes(key)
    )
  )
    return null
  if (
    !uuid(value.assistantId) ||
    !(value.organizationId === null || uuid(value.organizationId)) ||
    !(value.projectId === null || uuid(value.projectId)) ||
    !text(value.viewKey, 256) ||
    (value.selectionId !== undefined && !text(value.selectionId, 256))
  )
    return null
  if (value.parameters !== undefined) {
    const parameters = value.parameters
    if (
      !parameters ||
      typeof parameters !== 'object' ||
      Array.isArray(parameters) ||
      Object.keys(parameters).length > 50
    )
      return null
    if (
      Object.entries(parameters).some(
        ([key, item]) =>
          !key ||
          key.length > 100 ||
          !(scalar(item) || (Array.isArray(item) && item.length <= 100 && item.every(scalar)))
      )
    )
      return null
    if (JSON.stringify(parameters).length > 12000) return null
  }
  return {
    ...value,
    viewKey: value.viewKey.trim(),
    ...(value.selectionId !== undefined ? { selectionId: value.selectionId.trim() } : {})
  }
}
