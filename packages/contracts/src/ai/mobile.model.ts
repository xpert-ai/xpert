import type {
  AssistantBindingScope,
  AssistantBindingSourceScope,
  AssistantCode,
  IResolvedAssistantBinding
} from './assistant-binding.model'
import type { SANDBOX_TERMINAL_NAMESPACE } from './sandbox-terminal.model'
import type { TAvatar } from '../types'
import type { LanguagesEnum } from '../user.model'
import type { XpertTypeEnum } from './xpert.model'

export interface XpertMobileDeploymentConfig {
  apiBaseUrl?: string | null
  apiBasePath: '/api'
  aiApiPath: '/api/ai'
  chatkitFrameUrl: string
  viewHostsPath: '/api/view-hosts'
  socketNamespaces: {
    sandboxTerminal: typeof SANDBOX_TERMINAL_NAMESPACE
  }
  capabilities: {
    chatkit: boolean
    extensionViews: boolean
    scheduledTasks: boolean
    fileMemory: boolean
    sandboxTerminal: boolean
    publicChatkitSessions: boolean
  }
}

export interface XpertMobileUserSummary {
  id: string
  tenantId?: string | null
  email?: string | null
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  imageUrl?: string | null
  preferredLanguage?: LanguagesEnum | string | null
}

export interface XpertMobileOrganizationSummary {
  id: string
  tenantId?: string | null
  name: string
  imageUrl?: string | null
  isDefault: boolean
  isActive: boolean
  timeZone?: string | null
  preferredLanguage?: LanguagesEnum | string | null
}

export interface XpertMobileAssistantBindingSummary extends Pick<
  IResolvedAssistantBinding,
  'assistantId' | 'enabled' | 'tenantId' | 'organizationId' | 'userId'
> {
  code: AssistantCode
  scope: AssistantBindingScope
  sourceScope: AssistantBindingSourceScope
}

export interface XpertMobileBootstrap {
  deployment: XpertMobileDeploymentConfig
  user: XpertMobileUserSummary
  organizations: XpertMobileOrganizationSummary[]
  activeOrganizationId?: string | null
  defaultOrganizationId?: string | null
  assistantBindings: XpertMobileAssistantBindingSummary[]
}

export interface XpertMobileXpertSummary {
  id: string
  slug: string
  name: string
  type: XpertTypeEnum | string
  title?: string | null
  titleCN?: string | null
  description?: string | null
  avatar?: TAvatar | null
  version?: string | null
  latest?: boolean | null
  workspaceId?: string | null
  organizationId?: string | null
  publishAt?: Date | string | null
  starters?: string[] | null
}

export interface XpertMobileXpertsResponse {
  items: XpertMobileXpertSummary[]
  total: number
  limit: number
  offset: number
}
