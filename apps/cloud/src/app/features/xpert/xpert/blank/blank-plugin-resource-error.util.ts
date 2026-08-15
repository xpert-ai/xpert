import { PLUGIN_RESOURCE_ERROR_CODE } from '@xpert-ai/contracts'

export type BlankLocalizedError = Readonly<{
  key: string
  defaultMessage: string
}>

const NO_MATCHING_COMPONENTS_ERROR: BlankLocalizedError = {
  key: 'XP.Xpert.TemplatePluginSkillsNoMatchingComponents',
  defaultMessage:
    'The plugin components required by this template were not found. Verify that the required plugins are installed and try again.'
}

export function resolveTemplatePluginSkillInstallError(error: unknown): BlankLocalizedError | null {
  return readErrorCode(error) === PLUGIN_RESOURCE_ERROR_CODE.NO_MATCHING_COMPONENTS
    ? NO_MATCHING_COMPONENTS_ERROR
    : null
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }
  const direct = Reflect.get(error, 'errorCode')
  if (typeof direct === 'string') {
    return direct
  }
  const response = Reflect.get(error, 'error')
  if (!response || typeof response !== 'object') {
    return null
  }
  const nested = Reflect.get(response, 'errorCode')
  return typeof nested === 'string' ? nested : null
}
