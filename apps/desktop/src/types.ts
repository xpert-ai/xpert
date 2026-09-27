import type { PluginLibrary } from './plugin-library-types'
import type { BotActivity, SidebarState, SidebarUpdate } from './assistant-list-types'
import type { ShellSettings, ShellResult } from '@xpert-ai/contracts'
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
  theme: 'light' | 'dark' | 'system'
  appearance?: AppearanceConfig
}
export interface Profile {
  user: { id: string; name: string; tenantId: string | null; avatarUrl: string | null }
  organizations: { id: string; name: string }[]
  organizationId: string | null
}
export interface AppState {
  config: ConnectionConfig
  profile: Profile | null
  localLoginAvailable: boolean
}
export interface Bot {
  assistantId?: string
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
  editBot: { input: { botId: string; name: string; description: string }; output: { botId: string } }
  duplicateBot: { input: { botId: string; name: string }; output: { botId: string } }
  shellState: { input: undefined; output: DesktopShellState }
  shellEnable: { input: ShellSettings; output: DesktopShellState }
  shellDisable: { input: undefined; output: DesktopShellState }
  shellBind: { input: { assistantId: string; threadId: string | null }; output: DesktopShellGrant }
  shellUnbind: { input: string; output: { revoked: boolean } }
  shellOperations: { input: undefined; output: ShellResult[] }
  shellCancel: { input: string; output: ShellResult }
  state: { input: undefined; output: AppState }
  configure: { input: ConnectionConfig; output: AppState }
  login: { input: { email: string; password: string }; output: AppState }
  loginLocal: { input: undefined; output: AppState }
  selectOrganization: { input: string; output: AppState }
  listBots: { input: undefined; output: Bot[] }
  chatSession: { input: string; output: { secret: string; organizationId: string } }
  toolOutputPreview: {
    input: Pick<ToolOutputImageAttachment, 'artifactId' | 'artifactVersionId' | 'sha256' | 'mimeType'>
    output: ToolOutputAttachmentPreview
  }
  listCatalog: { input: Exclude<CatalogKind, 'plugins'>; output: CatalogItem[] }
  requestExpertAccess: { input: { id: string; reason: string }; output: ExpertItem }
  applicationSetup: { input: ApplicationInput; output: ApplicationSetup }
  initializeApplication: { input: InitializeApplicationInput; output: { botId: string } }
  templateWorkspaces: { input: undefined; output: WorkspaceOption[] }
  installTemplate: { input: { id: string; workspaceId: string; title: string }; output: { botId: string } }
  logout: { input: undefined; output: AppState }
}
declare global {
  interface Window {
    xpertDesktop?: {
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
