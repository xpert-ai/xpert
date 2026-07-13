import { I18nObject, IconDefinition } from '../types'

export type TSandboxProviderMeta = {
  name: I18nObject
  description?: I18nObject
  icon: IconDefinition
}

/** Supported ownership scopes for interactive sandboxes and isolated background jobs. */
export const SANDBOX_WORK_FOR_TYPES = ['user', 'project', 'environment', 'job'] as const

/** Identifies the business lifetime that owns a sandbox instance. */
export type TSandboxWorkForType = (typeof SANDBOX_WORK_FOR_TYPES)[number]
