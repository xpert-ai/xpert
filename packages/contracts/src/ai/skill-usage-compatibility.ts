import { getMessageSkillUsages } from '@xpert-ai/chatkit-types'

/** Legacy skill-only envelopes are metadata, not executable Computer results. */
export function isLegacySkillUsageComponent(value: unknown): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    !('type' in value) ||
    value.type !== 'component' ||
    !('data' in value) ||
    !value.data ||
    typeof value.data !== 'object'
  )
    return false
  const data = value.data
  if (
    !('category' in data) ||
    data.category !== 'Computer' ||
    !('tool' in data) ||
    data.tool !== 'read_skill_file' ||
    !('status' in data) ||
    data.status !== 'success' ||
    getMessageSkillUsages({ content: [value] }).length === 0
  )
    return false
  return !Object.entries(data).some(
    ([key, value]) =>
      ['type', 'input', 'output', 'message', 'error', 'data', 'artifact', '_meta', 'widgets'].includes(key) &&
      value != null
  )
}
