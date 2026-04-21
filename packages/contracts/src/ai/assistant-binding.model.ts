import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { IUser } from '../user.model'

export enum AssistantCode {
  CHAT_COMMON = 'chat_common',
  XPERT_SHARED = 'xpert_shared',
  CHATBI = 'chatbi',
  CLAWXPERT = 'clawxpert'
}

export enum AssistantBindingScope {
  TENANT = 'tenant',
  ORGANIZATION = 'organization',
  USER = 'user'
}

export enum AssistantBindingSourceScope {
  NONE = 'none',
  TENANT = 'tenant',
  ORGANIZATION = 'organization'
}

export type AssistantManagement = 'system' | 'user'

export interface IAssistantBindingToolsetPreference {
  toolsetId?: string | null
  toolsetName: string
  disabledTools: string[]
}

export interface IAssistantBindingMiddlewarePreference {
  provider: string
  disabledTools: string[]
}

export interface IAssistantBindingSkillPreference {
  workspaceId: string
  disabledSkillIds: string[]
}

export type AssistantBindingToolPreferenceSourceType = 'toolset' | 'middleware'

export type AssistantBindingToolPreferenceSourceMetadata =
  | {
      toolsetId?: string | null
      toolsetName: string
    }
  | {
      provider: string
    }

export interface IAssistantBindingConversationPreferences {
  version: 2
  defaultThreadId?: string | null
  lastThreadId?: string | null
  defaultFollowUpBehavior?: 'queue' | 'steer'
}

export interface IAssistantBindingToolPreferences {
  version: number
  toolsets?: Record<string, IAssistantBindingToolsetPreference>
  middlewares?: Record<string, IAssistantBindingMiddlewarePreference>
  skills?: Record<string, IAssistantBindingSkillPreference>
}

function normalizeAssistantBindingPreferenceKey(value?: string | null): string {
  return value?.trim() ?? ''
}

function normalizeAssistantBindingPreferenceIds(value?: string[] | null): string[] {
  const deduped = new Set<string>()

  for (const item of value ?? []) {
    const normalized = normalizeAssistantBindingPreferenceKey(item)
    if (normalized) {
      deduped.add(normalized)
    }
  }

  return Array.from(deduped)
}

export function normalizeAssistantBindingToolPreferences(
  value?: IAssistantBindingToolPreferences | null
): IAssistantBindingToolPreferences | null {
  if (!value) {
    return null
  }

  const toolsets = Object.entries(value.toolsets ?? {}).reduce<Record<string, IAssistantBindingToolsetPreference>>(
    (acc, [key, item]) => {
      const nodeKey = normalizeAssistantBindingPreferenceKey(key)
      const toolsetName = normalizeAssistantBindingPreferenceKey(item?.toolsetName)
      if (!nodeKey || !toolsetName) {
        return acc
      }

      acc[nodeKey] = {
        toolsetId: normalizeAssistantBindingPreferenceKey(item?.toolsetId) || null,
        toolsetName,
        disabledTools: normalizeAssistantBindingPreferenceIds(item?.disabledTools)
      }
      return acc
    },
    {}
  )

  const middlewares = Object.entries(value.middlewares ?? {}).reduce<
    Record<string, IAssistantBindingMiddlewarePreference>
  >((acc, [key, item]) => {
    const nodeKey = normalizeAssistantBindingPreferenceKey(key)
    const provider = normalizeAssistantBindingPreferenceKey(item?.provider)
    if (!nodeKey || !provider) {
      return acc
    }

    acc[nodeKey] = {
      provider,
      disabledTools: normalizeAssistantBindingPreferenceIds(item?.disabledTools)
    }
    return acc
  }, {})

  const skills = Object.entries(value.skills ?? {}).reduce<Record<string, IAssistantBindingSkillPreference>>(
    (acc, [key, item]) => {
      const workspaceKey = normalizeAssistantBindingPreferenceKey(key)
      const workspaceId = normalizeAssistantBindingPreferenceKey(item?.workspaceId) || workspaceKey
      if (!workspaceKey || !workspaceId) {
        return acc
      }

      acc[workspaceKey] = {
        workspaceId,
        disabledSkillIds: normalizeAssistantBindingPreferenceIds(item?.disabledSkillIds)
      }
      return acc
    },
    {}
  )

  if (!Object.keys(toolsets).length && !Object.keys(middlewares).length && !Object.keys(skills).length) {
    return null
  }

  return {
    version: 1,
    ...(Object.keys(toolsets).length ? { toolsets } : {}),
    ...(Object.keys(middlewares).length ? { middlewares } : {}),
    ...(Object.keys(skills).length ? { skills } : {})
  }
}

export function isAssistantBindingToolPreferencesEmpty(preferences?: IAssistantBindingToolPreferences | null): boolean {
  return !normalizeAssistantBindingToolPreferences(preferences)
}

export function getAssistantBindingDisabledTools(
  preferences: IAssistantBindingToolPreferences | null | undefined,
  sourceType: AssistantBindingToolPreferenceSourceType,
  nodeKey: string | null | undefined
): string[] {
  const normalizedNodeKey = normalizeAssistantBindingPreferenceKey(nodeKey)
  if (!normalizedNodeKey) {
    return []
  }

  const normalizedPreferences = normalizeAssistantBindingToolPreferences(preferences)
  if (!normalizedPreferences) {
    return []
  }

  return sourceType === 'toolset'
    ? (normalizedPreferences.toolsets?.[normalizedNodeKey]?.disabledTools ?? [])
    : (normalizedPreferences.middlewares?.[normalizedNodeKey]?.disabledTools ?? [])
}

export function getAssistantBindingDisabledSkillIds(
  preferences: IAssistantBindingToolPreferences | null | undefined,
  workspaceId: string | null | undefined
): string[] {
  const normalizedWorkspaceId = normalizeAssistantBindingPreferenceKey(workspaceId)
  if (!normalizedWorkspaceId) {
    return []
  }

  const normalizedPreferences = normalizeAssistantBindingToolPreferences(preferences)
  return normalizedPreferences?.skills?.[normalizedWorkspaceId]?.disabledSkillIds ?? []
}

export function isAssistantBindingToolEnabled(
  preferences: IAssistantBindingToolPreferences | null | undefined,
  sourceType: AssistantBindingToolPreferenceSourceType,
  nodeKey: string | null | undefined,
  toolName: string
): boolean {
  return !getAssistantBindingDisabledTools(preferences, sourceType, nodeKey).includes(
    normalizeAssistantBindingPreferenceKey(toolName)
  )
}

export function isAssistantBindingSkillEnabled(
  preferences: IAssistantBindingToolPreferences | null | undefined,
  workspaceId: string | null | undefined,
  skillId: string
): boolean {
  return !getAssistantBindingDisabledSkillIds(preferences, workspaceId).includes(
    normalizeAssistantBindingPreferenceKey(skillId)
  )
}

export function filterAssistantBindingDisabledTools<T extends { name: string }>(
  tools: T[],
  preferences: IAssistantBindingToolPreferences | null | undefined,
  sourceType: AssistantBindingToolPreferenceSourceType,
  nodeKey: string | null | undefined
): T[] {
  const disabledTools = getAssistantBindingDisabledTools(preferences, sourceType, nodeKey)
  if (!disabledTools.length) {
    return tools
  }

  const disabledToolSet = new Set(disabledTools)
  return tools.filter((tool) => !disabledToolSet.has(tool.name))
}

export function filterAssistantBindingDisabledSkillIds(
  skillIds: string[],
  preferences: IAssistantBindingToolPreferences | null | undefined,
  workspaceId: string | null | undefined
): string[] {
  const disabledSkillIds = getAssistantBindingDisabledSkillIds(preferences, workspaceId)
  if (!disabledSkillIds.length) {
    return skillIds
  }

  const disabledSkillIdSet = new Set(disabledSkillIds)
  return skillIds.filter((skillId) => !disabledSkillIdSet.has(skillId))
}

export function updateAssistantBindingToolPreferences(
  preferences: IAssistantBindingToolPreferences | null | undefined,
  sourceType: AssistantBindingToolPreferenceSourceType,
  nodeKey: string | null | undefined,
  metadata: AssistantBindingToolPreferenceSourceMetadata,
  toolName: string,
  enabled: boolean
): IAssistantBindingToolPreferences | null {
  const normalizedNodeKey = normalizeAssistantBindingPreferenceKey(nodeKey)
  const normalizedToolName = normalizeAssistantBindingPreferenceKey(toolName)
  if (!normalizedNodeKey || !normalizedToolName) {
    return normalizeAssistantBindingToolPreferences(preferences)
  }

  const normalizedPreferences = normalizeAssistantBindingToolPreferences(preferences) ?? { version: 1 }
  const disabledTools = getAssistantBindingDisabledTools(normalizedPreferences, sourceType, normalizedNodeKey)
  const nextDisabledTools = enabled
    ? disabledTools.filter((item) => item !== normalizedToolName)
    : normalizeAssistantBindingPreferenceIds([...disabledTools, normalizedToolName])

  const toolsets = normalizedPreferences.toolsets ? { ...normalizedPreferences.toolsets } : undefined
  const middlewares = normalizedPreferences.middlewares ? { ...normalizedPreferences.middlewares } : undefined

  if (sourceType === 'toolset') {
    const toolsetName = 'toolsetName' in metadata ? normalizeAssistantBindingPreferenceKey(metadata.toolsetName) : ''
    if (!toolsetName) {
      return normalizedPreferences
    }

    const nextToolsets = toolsets ?? {}
    if (nextDisabledTools.length) {
      nextToolsets[normalizedNodeKey] = {
        toolsetId: 'toolsetId' in metadata ? normalizeAssistantBindingPreferenceKey(metadata.toolsetId) || null : null,
        toolsetName,
        disabledTools: nextDisabledTools
      }
    } else {
      delete nextToolsets[normalizedNodeKey]
    }

    return normalizeAssistantBindingToolPreferences({
      version: 1,
      ...(Object.keys(nextToolsets).length ? { toolsets: nextToolsets } : {}),
      ...(middlewares && Object.keys(middlewares).length ? { middlewares } : {}),
      ...(normalizedPreferences.skills ? { skills: { ...normalizedPreferences.skills } } : {})
    })
  }

  const provider = 'provider' in metadata ? normalizeAssistantBindingPreferenceKey(metadata.provider) : ''
  if (!provider) {
    return normalizedPreferences
  }

  const nextMiddlewares = middlewares ?? {}
  if (nextDisabledTools.length) {
    nextMiddlewares[normalizedNodeKey] = {
      provider,
      disabledTools: nextDisabledTools
    }
  } else {
    delete nextMiddlewares[normalizedNodeKey]
  }

  return normalizeAssistantBindingToolPreferences({
    version: 1,
    ...(toolsets && Object.keys(toolsets).length ? { toolsets } : {}),
    ...(Object.keys(nextMiddlewares).length ? { middlewares: nextMiddlewares } : {}),
    ...(normalizedPreferences.skills ? { skills: { ...normalizedPreferences.skills } } : {})
  })
}

export function updateAssistantBindingSkillPreferences(
  preferences: IAssistantBindingToolPreferences | null | undefined,
  workspaceId: string | null | undefined,
  skillId: string,
  enabled: boolean
): IAssistantBindingToolPreferences | null {
  const normalizedWorkspaceId = normalizeAssistantBindingPreferenceKey(workspaceId)
  const normalizedSkillId = normalizeAssistantBindingPreferenceKey(skillId)
  if (!normalizedWorkspaceId || !normalizedSkillId) {
    return normalizeAssistantBindingToolPreferences(preferences)
  }

  const normalizedPreferences = normalizeAssistantBindingToolPreferences(preferences) ?? { version: 1 }
  const disabledSkillIds = getAssistantBindingDisabledSkillIds(normalizedPreferences, normalizedWorkspaceId)
  const nextDisabledSkillIds = enabled
    ? disabledSkillIds.filter((item) => item !== normalizedSkillId)
    : normalizeAssistantBindingPreferenceIds([...disabledSkillIds, normalizedSkillId])
  const skills = normalizedPreferences.skills ? { ...normalizedPreferences.skills } : {}

  if (nextDisabledSkillIds.length) {
    skills[normalizedWorkspaceId] = {
      workspaceId: normalizedWorkspaceId,
      disabledSkillIds: nextDisabledSkillIds
    }
  } else {
    delete skills[normalizedWorkspaceId]
  }

  return normalizeAssistantBindingToolPreferences({
    version: 1,
    ...(normalizedPreferences.toolsets ? { toolsets: { ...normalizedPreferences.toolsets } } : {}),
    ...(normalizedPreferences.middlewares ? { middlewares: { ...normalizedPreferences.middlewares } } : {}),
    ...(Object.keys(skills).length ? { skills } : {})
  })
}

export function ensureAssistantBindingSkillWorkspacePreference(
  preferences: IAssistantBindingToolPreferences | null | undefined,
  workspaceId: string
): IAssistantBindingToolPreferences {
  const normalizedWorkspaceId = normalizeAssistantBindingPreferenceKey(workspaceId)
  const normalizedPreferences = normalizeAssistantBindingToolPreferences(preferences) ?? { version: 1 }
  if (!normalizedWorkspaceId) {
    return normalizedPreferences
  }

  const currentSkills = normalizedPreferences.skills ?? {}
  const currentWorkspacePreference = currentSkills[normalizedWorkspaceId]

  return {
    version: 1,
    ...(normalizedPreferences.toolsets ? { toolsets: { ...normalizedPreferences.toolsets } } : {}),
    ...(normalizedPreferences.middlewares ? { middlewares: { ...normalizedPreferences.middlewares } } : {}),
    skills: {
      ...currentSkills,
      [normalizedWorkspaceId]: {
        workspaceId:
          normalizeAssistantBindingPreferenceKey(currentWorkspacePreference?.workspaceId) || normalizedWorkspaceId,
        disabledSkillIds: currentWorkspacePreference?.disabledSkillIds ?? []
      }
    }
  }
}

export interface IAssistantBinding extends IBasePerTenantAndOrganizationEntityModel {
  code: AssistantCode
  scope: AssistantBindingScope
  assistantId?: string | null
  enabled?: boolean | null
  userId?: string | null
  user?: IUser
  preferences?: IAssistantBindingUserPreference[]
}

export interface IAssistantBindingUserPreference extends IBasePerTenantAndOrganizationEntityModel {
  assistantBindingId: string
  assistantBinding?: IAssistantBinding
  userId?: string | null
  user?: IUser
  soul?: string | null
  profile?: string | null
  toolPreferences?: IAssistantBindingToolPreferences | null
  conversationPreferences?: IAssistantBindingConversationPreferences | null
}

export interface IResolvedAssistantBinding extends IAssistantBinding {
  sourceScope: AssistantBindingSourceScope
}

export interface IAssistantBindingUpsertInput {
  code: AssistantCode
  scope: AssistantBindingScope
  assistantId?: string | null
  enabled?: boolean
}

export interface IAssistantBindingUserPreferenceUpsertInput {
  scope: AssistantBindingScope
  soul?: string | null
  profile?: string | null
  toolPreferences?: IAssistantBindingToolPreferences | null
  conversationPreferences?: IAssistantBindingConversationPreferences | null
}

const USER_MANAGED_ASSISTANTS = new Set<AssistantCode>([AssistantCode.CLAWXPERT])

export function getAssistantManagement(code: AssistantCode): AssistantManagement {
  return USER_MANAGED_ASSISTANTS.has(code) ? 'user' : 'system'
}

export function isUserManagedAssistant(code: AssistantCode): boolean {
  return getAssistantManagement(code) === 'user'
}

export function isSystemManagedAssistant(code: AssistantCode): boolean {
  return getAssistantManagement(code) === 'system'
}
