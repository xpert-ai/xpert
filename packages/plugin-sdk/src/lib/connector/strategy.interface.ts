import type { I18nText, IconDefinition } from '@xpert-ai/contracts'

export type RuntimeI18nText = I18nText

export type RuntimeCapabilityIcon = IconDefinition

export type ConnectorStatus = 'pending' | 'active' | 'expired' | 'error' | 'disconnected'

export type ConnectorOAuthConfig = {
  type: 'oauth2'
  authorizationUrl?: string
  tokenUrl?: string
  userInfoUrl?: string
  scopes?: string[]
  redirectPath?: string
}

export type ConnectorAppCredentialField = {
  name: string
  label: RuntimeI18nText
  type?: 'text' | 'password'
  required?: boolean
  placeholder?: RuntimeI18nText
  description?: RuntimeI18nText
  secret?: boolean
}

export type ConnectorAppCredentialsConfig = {
  fields?: ConnectorAppCredentialField[]
  help?: {
    label: RuntimeI18nText
    url: string
  }
  defaultValues?: Record<string, string | number | boolean | null>
}

export type ConnectorPermissionDeclaration = {
  key: string
  label?: RuntimeI18nText
  description?: RuntimeI18nText
  identity?: 'user' | 'app' | 'tenant'
  scopes?: string[]
  credential?: 'access_token' | 'refresh_token' | 'app_credential' | 'api_key'
  storage?: 'platform_vault' | 'runtime_only' | 'external'
  required?: boolean
}

export type ConnectorDefinition = {
  provider: string
  label: RuntimeI18nText
  description?: RuntimeI18nText
  icon?: RuntimeCapabilityIcon
  auth: ConnectorOAuthConfig
  permissions?: ConnectorPermissionDeclaration[]
  appCredentials?: ConnectorAppCredentialsConfig
}

export type ConnectorProfile = {
  openId?: string
  unionId?: string
  userId?: string
  name?: string
  avatarUrl?: string
  email?: string
  [key: string]: unknown
}

export type ConnectorInstance = {
  id: string
  workspaceId: string
  provider: string
  status: ConnectorStatus
  profile?: ConnectorProfile | null
  scopes?: string[]
  expiresAt?: string | null
  refreshExpiresAt?: string | null
  connectedAt?: string | null
  disconnectedAt?: string | null
  lastError?: string | null
  createdById?: string | null
  updatedById?: string | null
  createdAt?: string
  updatedAt?: string
}

export type ConnectorOAuthStartRequest = {
  app?: ConnectorAppCredentialPayload
}

export type ConnectorOAuthStartResponse = {
  connector: ConnectorInstance
  authorizationUrl: string
  stateExpiresAt: string
  pollIntervalSeconds?: number | null
}

export type ConnectorOAuthStatusResponse = {
  connector: ConnectorInstance
  authorizationUrl?: string | null
  stateExpiresAt?: string | null
  pollIntervalSeconds?: number | null
  message?: string | null
}

export type ConnectorRuntimeCredential = {
  connectorId: string
  workspaceId: string
  provider: string
  appId: string
  brand?: string
  accessToken: string
  expiresAt?: string | null
  scopes?: string[]
  profile?: ConnectorProfile | null
}

export type ConnectorRuntimeGetInput = {
  workspaceId: string
  provider: string
  connectorId?: string
}

export interface ConnectorRuntimeApi {
  getConnector(input: ConnectorRuntimeGetInput): Promise<ConnectorRuntimeCredential>
}

export type ConnectorSelectOption = {
  value: string
  label: RuntimeI18nText
  provider: string
  status: ConnectorStatus
  description?: RuntimeI18nText
  avatarUrl?: string
}

export type ConnectorAppCredentialPayload = Record<string, unknown>

export type ConnectorAuthorizationUrlInput = {
  app?: ConnectorAppCredentialPayload
  redirectUri: string
  state: string
  scopes?: string[]
}

export type ConnectorAuthorizationUrlResult = {
  authorizationUrl: string
  scopes?: string[]
  metadata?: Record<string, unknown>
  pollIntervalSeconds?: number | null
}

export type ConnectorOAuthCodeInput = {
  app?: ConnectorAppCredentialPayload
  code: string
  redirectUri: string
  scopes?: string[]
}

export type ConnectorRefreshInput = {
  app?: ConnectorAppCredentialPayload
  refreshToken: string
}

export type ConnectorOAuthCredential = {
  appId: string
  brand?: string
  /**
   * Provider app credentials retained only for encrypted platform storage and token refresh.
   * Hosts must not expose this field through public connector or runtime credential APIs.
   */
  app?: ConnectorAppCredentialPayload
  accessToken: string
  refreshToken?: string
  expiresAt?: string | null
  refreshExpiresAt?: string | null
  scopes?: string[]
  profile?: ConnectorProfile | null
}

export type ConnectorOAuthCompleteRequest = {
  state: string
  code: string
}

export type ConnectorAuthorizationPollInput = {
  metadata?: Record<string, unknown> | null
  redirectUri: string
  scopes?: string[]
}

export type ConnectorAuthorizationPollResult =
  | {
      status: 'pending'
      authorizationUrl?: string
      metadata?: Record<string, unknown>
      pollIntervalSeconds?: number | null
      message?: string
    }
  | {
      status: 'complete'
      credential: ConnectorOAuthCredential
      metadata?: Record<string, unknown>
    }
  | {
      status: 'error'
      error: string
      metadata?: Record<string, unknown>
    }

export interface ConnectorStrategy {
  definition: ConnectorDefinition
  buildAuthorizationUrl(input: ConnectorAuthorizationUrlInput): Promise<ConnectorAuthorizationUrlResult>
  exchangeOAuthCode(input: ConnectorOAuthCodeInput): Promise<ConnectorOAuthCredential>
  refreshCredential?(input: ConnectorRefreshInput): Promise<ConnectorOAuthCredential>
  pollAuthorization?(input: ConnectorAuthorizationPollInput): Promise<ConnectorAuthorizationPollResult>
}
