import type { PluginLibrary } from './plugin-library-types'
import type { CertificateCheck, ConnectionUrlField } from './connection/certificate-types'
import type { BotActivity, SidebarState, SidebarUpdate } from './assistant-list-types'
import type {
  ShellSettings,
  ShellResult,
  ShellPreparationRequest,
  ShellPreparation,
  ShellPolicy
} from '@xpert-ai/contracts'
import type { ToolOutputAttachmentPreview, ToolOutputImageAttachment } from '@xpert-ai/chatkit-types'
import type { Locale, MessageParams } from './i18n'
import type { AppearanceConfig } from './appearance-types'
import type {
  AssistantProfile,
  ProfileConversation,
  ProfileViewSession,
  ProfileViewRequest
} from './assistant-profile-types'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'

export interface ConnectionConfig {
  locale: Locale
  apiUrl: string
  webUrl: string
  frameUrl: string
  allowUntrustedCertificates?: boolean
  theme: 'light' | 'dark' | 'system'
  appearance?: AppearanceConfig
}
export interface Profile {
  user: {
    id: string
    name: string
    tenantId: string | null
    avatarUrl: string | null
    preferredLanguage?: Locale | null
  }
  organizations: { id: string; name: string }[]
  organizationId: string | null
}
export interface AppState {
  config: ConnectionConfig
  profile: Profile | null
  localLoginAvailable: boolean
}
export interface Bot {
  avatar?: import('@xpert-ai/contracts').TAvatar | null
  assistantId?: string
  businessArea?: { id: string; name: string } | null
  id: string
  createdAt?: string | null
  name: string
  description: string
  avatarUrl: string | null
  avatarEmoji: { id: string; unified: string | null } | null
}
export type HostResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string; status: number; key?: string; params?: MessageParams }
export interface DesktopShellState {
  policy: ShellPolicy
  available: boolean
  enabled: boolean
  connected: boolean
  deviceId: string | null
  settings: ShellSettings | null
  errorCode: string | null
}
export interface DesktopShellGrant {
  id: string
  expiresAt: number
  threadId: string | null
}
export interface WorkbenchSessionInput {
  botId: string
  target: 'assistant.conversation' | 'assistant.project'
  /** Current host-resolved Assistant for project navigation; the server checks project access. */
  assistantId?: string
  conversationId?: string
  projectId?: string
  threadId?: string
}
export interface WorkbenchSession {
  assistantId: string
  projectId: string | null
  threadId: string | null
  conversationId?: string
  secret: string
  organizationId: string
}
export interface HostMethods {
  bosiOnboarding: { input: undefined; output: import('@xpert-ai/contracts').BosiOnboardingCatalog }
  bosiChoose: {
    input: import('@xpert-ai/contracts').BosiOnboardingChoice
    output: import('@xpert-ai/contracts').BosiOnboardingCatalog
  }
  bosiConnect: {
    input: { provider: string }
    output: {
      attemptId: string
      target: { target: 'bosi.connector.connect'; workspaceId: string; bindingId: string; organizationId: string }
    }
  }
  bosiCheckConnection: { input: { attemptId: string }; output: { status: 'connected' | 'pending' } }
  bosiSetup: {
    input: { capabilities?: import('@xpert-ai/contracts').BosiCapability[] }
    output: import('@xpert-ai/contracts').BosiSetup
  }
  createBosi: {
    input: { capabilities: import('@xpert-ai/contracts').BosiCapability[]; modelId: string }
    output: import('@xpert-ai/contracts').BosiSetup
  }
  bosiWelcome: { input: undefined; output: import('@xpert-ai/contracts').BosiSetup }
  bosiWorkspace: { input: undefined; output: { id: string; name: string } }
  bosiConnections: { input: { workspaceId: string }; output: { id: string; name: string; connected: boolean }[] }
  assistantAppearance: {
    input: { botId: string }
    output: { canEdit: boolean; revision: string; name: string; avatar: import('@xpert-ai/contracts').TAvatar }
  }
  saveAssistantAppearance: {
    input: { botId: string; revision: string; name: string; avatar: import('@xpert-ai/contracts').TAvatar }
    output: { id: string }
  }
  uploadAssistantAvatar: { input: { botId: string; data: string }; output: { url: string } }
  assistantPetCatalog: {
    input: { botId: string }
    output: { id: string; label: string; spriteVersionNumber?: 1 | 2 }[]
  }
  uploadAssistantPet: { input: { botId: string; data: string }; output: { url: string } }
  assistantPetAsset: { input: { botId: string; petId: string }; output: { src: string } }
  usageMembership: { input: undefined; output: import('./usage/types').UsageMembership | null }
  usagePeriods: { input: undefined; output: import('./usage/types').UsagePeriod[] }
  usageOverview: { input: import('./usage/types').UsageQuery; output: import('./usage/types').UsageOverview }
  usageSummaries: {
    input: import('./usage/types').UsageQuery & { take: number; skip: number }
    output: { items: import('./usage/types').UsageSummary[]; total: number }
  }
  usageEntries: {
    input: import('./usage/types').UsageQuery & {
      group: import('./usage/types').UsageGroup
      take: number
      skip: number
    }
    output: { items: import('./usage/types').UsageEntry[]; nextSkip: number | null }
  }
  checkConnectionCertificates: { input: Pick<ConnectionConfig, ConnectionUrlField>; output: CertificateCheck[] }
  pluginLibrary: { input: { workspaceId?: string }; output: PluginLibrary }
  addWorkspacePlugin: {
    input: { workspaceId: string; packageId: string; experts: { [reference: string]: string } }
    output: { status: 'added' | 'already_added'; bindingId: string }
  }
  pluginConnection: {
    input: { assistantId: string; bindingId: string }
    output: {
      connected: boolean
      target: { target: 'workspace.connector.connect'; assistantId: string; bindingId: string; organizationId: string }
    }
  }
  startPluginConnection: {
    input: HostMethods['pluginConnection']['input']
    output:
      | { status: 'connected' }
      | { status: 'pending'; attemptId: string; target: HostMethods['pluginConnection']['output']['target'] }
  }
  checkPluginConnection: {
    input: { attemptId: string }
    output: { status: 'pending' | 'connected' }
  }
  cancelPluginConnection: { input: { attemptId: string }; output: { status: 'cancelled' } }
  botProfile: { input: string; output: AssistantProfile }
  assistantTriggers: { input: { botId: string }; output: import('@xpert-ai/contracts').AssistantTriggerSettings }
  saveAssistantTrigger: {
    input: { botId: string; change: import('@xpert-ai/contracts').AssistantTriggerMutation }
    output: { saved: boolean }
  }
  validateAssistantTrigger: { input: HostMethods['saveAssistantTrigger']['input']; output: { valid: boolean } }
  beginAssistantTriggerQr: {
    input: { botId: string; provider: string }
    output: import('@xpert-ai/contracts').TIntegrationQrSession
  }
  pollAssistantTriggerQr: {
    input: { botId: string; provider: string; session: string }
    output: import('@xpert-ai/contracts').TIntegrationQrResult
  }
  completeAssistantTriggerQr: {
    input: HostMethods['pollAssistantTriggerQr']['input']
    output: import('@xpert-ai/contracts').TWorkflowTriggerConnectionStatus
  }
  cancelAssistantTriggerQr: { input: HostMethods['pollAssistantTriggerQr']['input']; output: void }
  assistantTriggerOptions: {
    input: { botId: string; provider: string; field: string }
    output: { value: string; label: string; disabled: boolean }[]
  }
  assistantTriggerManageUrl: { input: { botId: string }; output: { url: string } }
  botConversations: { input: { botId: string; page: number }; output: { items: ProfileConversation[]; total: number } }
  botProfileViews: { input: string; output: XpertExtensionViewManifest[] }
  openProfileView: { input: { botId: string; viewKey: string }; output: ProfileViewSession }
  closeProfileView: { input: string; output: { closed: boolean } }
  profileViewRequest: { input: ProfileViewRequest; output: unknown }
  workbenchSession: { input: WorkbenchSessionInput; output: WorkbenchSession }

  sidebarState: { input: undefined; output: SidebarState }
  updateSidebar: { input: SidebarUpdate; output: SidebarState }
  botActivity: { input: undefined; output: BotActivity[] }
  botConversation: {
    input: { botId: string; threadId: string }
    output: { id: string; title: string | null; threadId: string | null }
  }
  markBotRead: { input: { botId: string; threadId: string }; output: { read: boolean } }
  markAllBotRead: { input: string; output: SidebarState }
  assistantConfiguration: {
    input: { botId: string; capabilities?: string[] }
    output: import('./assistant-settings/types').AssistantSettings
  }
  saveAssistantConfiguration: {
    input: { botId: string; revision: string; prompt: string; modelId: string; capabilities: string[] }
    output: { botId: string }
  }
  editBot: { input: { botId: string; name?: string; description: string }; output: { botId: string } }
  duplicateBot: { input: { botId: string; name: string }; output: { botId: string } }
  shellConfigure: { input: ShellSettings; output: DesktopShellState }
  shellPrepare: { input: ShellPreparationRequest; output: ShellPreparation }
  shellDecide: { input: { id: string; decision: 'approve' | 'reject' }; output: { accepted: boolean } }
  shellPolicy: { input: ShellPolicy; output: DesktopShellState }
  shellState: { input: undefined; output: DesktopShellState }
  shellEnable: { input: ShellSettings; output: DesktopShellState }
  shellDisable: { input: undefined; output: DesktopShellState }
  shellBind: { input: { assistantId: string; threadId: string | null }; output: DesktopShellGrant }
  shellUnbind: { input: string; output: { revoked: boolean } }
  shellOperations: { input: undefined; output: ShellResult[] }
  shellCancel: { input: string; output: ShellResult }
  state: { input: undefined; output: AppState }
  refreshProfile: { input: undefined; output: AppState }
  configure: { input: ConnectionConfig; output: AppState }
  login: { input: { email: string; password: string }; output: AppState }
  loginLocal: { input: undefined; output: AppState }
  selectOrganization: { input: string; output: AppState }
  listBots: { input: undefined; output: Bot[] }
  voiceCapability: { input: { botId: string; assistantId?: string }; output: { enabled: boolean } }
  voiceStart: {
    input: { botId: string; assistantId: string; threadId: string | null; originMode: 'web' | 'desktop' }
    output: {
      sessionId: string
      conversationId: string
      threadId: string
      assistantId: string
      url: string
      ticket: string
    }
  }
  voiceEnd: {
    input: { threadId: string; sessionId: string }
    output: { ended: boolean; call?: import('@xpert-ai/chatkit-types').CompletedVoiceCall }
  }
  chatSession: { input: string; output: { secret: string; organizationId: string } }
  toolOutputPreview: {
    input: Pick<ToolOutputImageAttachment, 'artifactId' | 'artifactVersionId' | 'sha256' | 'mimeType'>
    output: ToolOutputAttachmentPreview
  }
  deliveredFilePreview: {
    input: { artifactId: string; artifactVersionId: string }
    output: { base64: string; sha256: string; size: number; mimeType: string; name: string }
  }
  listCatalog: { input: Exclude<CatalogKind, 'plugins'>; output: CatalogItem[] }
  requestExpertAccess: { input: { id: string; reason: string }; output: ExpertItem }
  applicationSetup: { input: ApplicationInput; output: ApplicationSetup }
  initializeApplication: { input: InitializeApplicationInput; output: { botId: string } }
  templateWorkspaces: { input: undefined; output: WorkspaceOption[] }
  templateSetup: {
    input: { id: string; capabilities?: string[] }
    output: {
      workspaces: WorkspaceOption[]
      hasPrimaryLanguageModel: boolean
      preflight?: import('./catalog-types').TemplatePreflight
    }
  }
  installTemplate: {
    input: {
      id: string
      workspaceId: string
      title: string
      prompt?: string
      capabilities?: string[]
      modelId?: string
    }
    output: { botId: string }
  }
  logout: { input: undefined; output: AppState }
}
declare global {
  interface Window {
    xpertDesktop?: {
      updates?: import('./update-types').UpdateBridge
      onAvatarPointer?: (listener: (point: { x: number; y: number } | null) => void) => () => void
      onWindowActivated?: (listener: () => void) => () => void
      invoke: <K extends keyof HostMethods>(
        method: K,
        argument?: HostMethods[K]['input']
      ) => Promise<HostResult<HostMethods[K]['output']>>
      openWorkspace: () => Promise<void>
      openPlatform: (payload: unknown) => Promise<boolean>
      setSidebarCollapsed: (collapsed: boolean) => void
      platform: string
    }
  }
}
import type {
  ApplicationInput,
  ApplicationSetup,
  CatalogItem,
  CatalogKind,
  ExpertItem,
  InitializeApplicationInput,
  WorkspaceOption
} from './catalog-types'
