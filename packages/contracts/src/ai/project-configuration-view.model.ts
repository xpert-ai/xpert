import { z } from 'zod/v3'

export const PROJECT_CONFIGURATION_PROVIDER = 'platform.project-configuration'
export const PROJECT_CONFIGURATION_VIEW = `${PROJECT_CONFIGURATION_PROVIDER}__configuration`
export const projectConfigurationSectionSchema = z.enum([
  'type',
  'experts',
  'members',
  'skills',
  'connectors',
  'automations',
  'delete'
])
export type ProjectConfigurationSection = z.infer<typeof projectConfigurationSectionSchema>
export const PROJECT_CONFIGURATION_ACTION_HANDLERS = {
  'type': 'editors',
  'type-save': 'editors',
  'experts': 'editors',
  'expert-add': 'editors',
  'expert-remove': 'editors',
  'members': 'editors',
  'member-add': 'editors',
  'member-role': 'editors',
  'member-remove': 'editors',
  'member-owner': 'editors',
  'member-invite': 'editors',
  'invitation-revoke': 'editors',
  'skill-catalog': 'editors',
  'skill-install': 'editors',
  'skill-toggle': 'editors',
  'skill-remove': 'editors',
  'connectors': 'connectors',
  'connector-add': 'connectors',
  'connector-remove': 'connectors',
  'connector-connect': 'connectors',
  'connector-status': 'connectors',
  'connector-cancel': 'connectors',
  'automations': 'automations',
  'automation-save': 'automations',
  'automation-options': 'automations',
  'automation-pause': 'automations',
  'automation-resume': 'automations',
  'automation-delete': 'automations',
  'automation-propose': 'automations',
  'automation-accept': 'automations',
  'automation-connectors': 'automations',
  'delete': 'editors',
} as const
export type ProjectConfigurationAction = keyof typeof PROJECT_CONFIGURATION_ACTION_HANDLERS
export const projectConfigurationActionSchema = z.custom<ProjectConfigurationAction>((value) =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROJECT_CONFIGURATION_ACTION_HANDLERS, value))
export const PROJECT_CONFIGURATION_ACTIONS = Object.keys(PROJECT_CONFIGURATION_ACTION_HANDLERS).map((key) => projectConfigurationActionSchema.parse(key))

/** Compact public projection; credentials and authoring Assistant graphs never enter the iframe. */
export interface ProjectConfigurationOverview {
  projectId: string
  name: string
  userId: string
  canEdit: boolean
  canManage: boolean
  isOwner: boolean
  applicationManaged: boolean
  instruction: string
  effectiveMaxDurationSeconds: number
  tenantMaxDurationSeconds: number
  experts: { id: string; name: string }[]
  members: { id: string; name: string; role: 'owner' | 'manager' | 'editor' | 'member' }[]
  skills: { id: string; name: string; description?: string; enabled: boolean; skillIndexId?: string }[]
  automations: { id: string; name: string; schedule: string; status: string }[]
  automationTotal: number
}
