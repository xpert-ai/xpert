const id = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value)
const uuid = (value) =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const focusKeys = ['pipelineInstanceId', 'pipelineRoundId', 'pipelineNodeId']

export function parseProjectNavigation(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.target !== 'project.pipelines' ||
    !id(value.projectId)
  )
    return null
  if (
    Object.keys(value).some(
      (key) => !['target', 'projectId', 'organizationId', 'preserveView', ...focusKeys].includes(key)
    )
  )
    return null
  if (value.organizationId != null && !id(value.organizationId)) return null
  const focused = focusKeys.some((key) => value[key] !== undefined)
  if (focused && !focusKeys.every((key) => uuid(value[key]))) return null
  return {
    target: 'project.pipelines',
    projectId: value.projectId,
    ...(value.organizationId !== undefined ? { organizationId: value.organizationId } : {}),
    ...(focused ? Object.fromEntries(focusKeys.map((key) => [key, value[key]])) : {})
  }
}
