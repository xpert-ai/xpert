import { I18nObject, IconDefinition } from '../types'

export type TSandboxProviderMeta = {
  name: I18nObject
  description?: I18nObject
  icon: IconDefinition
}

export const SANDBOX_WORK_FOR_TYPES = ['user', 'project', 'environment'] as const

export type TSandboxWorkForType = (typeof SANDBOX_WORK_FOR_TYPES)[number]
