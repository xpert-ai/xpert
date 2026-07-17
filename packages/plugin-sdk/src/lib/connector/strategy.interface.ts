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

export type ConnectorCredentialFormDefinition = ConnectorAppCredentialsConfig

export type ConnectorAuthMethodDefinition =
  | {
      id: string
      type: 'oauth2'
      label: RuntimeI18nText
      appCredentials?: ConnectorCredentialFormDefinition
    }
  | {
      id: string
      type: 'api_key'
      label: RuntimeI18nText
      credentials: ConnectorCredentialFormDefinition
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

export type ConnectorDefinitionBase = {
  provider: string
  label: RuntimeI18nText
  description?: RuntimeI18nText
  icon?: RuntimeCapabilityIcon
  permissions?: ConnectorPermissionDeclaration[]
  /** Maps credentials stored before multi-auth support to a declared OAuth method. */
  legacyAuthMethodId?: string
}

export type ConnectorDefinition = ConnectorDefinitionBase & {
  auth: ConnectorOAuthConfig
  appCredentials?: ConnectorAppCredentialsConfig
}

export type ConnectorMultiAuthDefinition = ConnectorDefinitionBase & {
  authMethods: ConnectorAuthMethodDefinition[]
  /** Optional legacy OAuth metadata used by host compatibility adapters. */
  auth?: ConnectorOAuthConfig
  appCredentials?: ConnectorAppCredentialsConfig
}

export type ConnectorStrategyDefinition = ConnectorDefinition | ConnectorMultiAuthDefinition

export function getConnectorAuthMethods(definition: ConnectorStrategyDefinition): ConnectorAuthMethodDefinition[] {
  if ('authMethods' in definition) {
    return definition.authMethods
  }

  return [
    {
      id: definition.legacyAuthMethodId?.trim() || 'oauth2',
      type: 'oauth2',
      label: {
        en_US: 'OAuth 2.0',
        zh_Hans: 'OAuth 2.0'
      },
      appCredentials: definition.appCredentials
    }
  ]
}

export function assertConnectorDefinition(definition: unknown): asserts definition is ConnectorStrategyDefinition {
  if (!isObjectValue(definition)) {
    throw new Error('Connector strategy must expose a valid connector definition')
  }

  const providerValue: unknown = Reflect.get(definition, 'provider')
  const provider = typeof providerValue === 'string' ? providerValue.trim() : ''
  if (!provider) {
    throw new Error('Connector definition must declare a provider')
  }

  const label: unknown = Reflect.get(definition, 'label')
  if (!isRuntimeI18nText(label)) {
    throw new Error(`Connector '${provider}' must declare a label`)
  }

  const auth: unknown = Reflect.get(definition, 'auth')
  const authMethods: unknown = Reflect.get(definition, 'authMethods')
  const resolvedMethods: Array<{ id: string; type: 'oauth2' | 'api_key' }> = []
  const ids = new Set<string>()

  if (authMethods !== undefined) {
    if (!Array.isArray(authMethods) || !authMethods.length) {
      throw new Error(`Connector '${provider}' must declare at least one authentication method`)
    }

    for (const method of authMethods) {
      assertConnectorAuthMethod(method, provider)
      const id = method.id.trim()
      if (ids.has(id)) {
        throw new Error(`Connector '${provider}' has duplicate authentication method id '${id}'`)
      }
      ids.add(id)
      resolvedMethods.push({ id, type: method.type })
    }

    if (auth !== undefined && !isConnectorOAuthConfig(auth)) {
      throw new Error(`Connector '${provider}' has invalid legacy OAuth metadata`)
    }
  } else {
    if (!isConnectorOAuthConfig(auth)) {
      throw new Error(`Connector '${provider}' must declare legacy OAuth configuration or authentication methods`)
    }
    const legacyMethodValue: unknown = Reflect.get(definition, 'legacyAuthMethodId')
    const legacyMethodId =
      typeof legacyMethodValue === 'string' && legacyMethodValue.trim() ? legacyMethodValue.trim() : 'oauth2'
    resolvedMethods.push({ id: legacyMethodId, type: 'oauth2' })
  }

  const legacyAuthMethodValue: unknown = Reflect.get(definition, 'legacyAuthMethodId')
  if (
    legacyAuthMethodValue !== undefined &&
    (typeof legacyAuthMethodValue !== 'string' || !legacyAuthMethodValue.trim())
  ) {
    throw new Error(`Connector '${provider}' has an invalid legacy authentication method id`)
  }

  if (typeof legacyAuthMethodValue === 'string') {
    const legacyAuthMethodId = legacyAuthMethodValue.trim()
    const legacyMethod = resolvedMethods.find((method) => method.id === legacyAuthMethodId)
    if (!legacyMethod) {
      throw new Error(
        `Connector '${provider}' maps legacy credentials to unknown authentication method '${legacyAuthMethodId}'`
      )
    }
    if (legacyMethod.type !== 'oauth2') {
      throw new Error(`Connector '${provider}' must map legacy credentials to an OAuth authentication method`)
    }
  }
}

function assertConnectorAuthMethod(method: unknown, provider: string): asserts method is ConnectorAuthMethodDefinition {
  if (!isObjectValue(method)) {
    throw new Error(`Connector '${provider}' has an invalid authentication method`)
  }

  const idValue: unknown = Reflect.get(method, 'id')
  if (typeof idValue !== 'string' || !idValue.trim()) {
    throw new Error(`Connector '${provider}' has an authentication method without an id`)
  }

  const label: unknown = Reflect.get(method, 'label')
  if (!isRuntimeI18nText(label)) {
    throw new Error(`Connector '${provider}' authentication method '${idValue.trim()}' must declare a label`)
  }

  const type: unknown = Reflect.get(method, 'type')
  if (type !== 'oauth2' && type !== 'api_key') {
    throw new Error(`Connector '${provider}' has unsupported authentication method type '${String(type)}'`)
  }

  if (type === 'api_key' && !isObjectValue(Reflect.get(method, 'credentials'))) {
    throw new Error(`Connector '${provider}' API key method '${idValue.trim()}' must declare credentials`)
  }
}

function isConnectorOAuthConfig(value: unknown): value is ConnectorOAuthConfig {
  return isObjectValue(value) && Reflect.get(value, 'type') === 'oauth2'
}

function isRuntimeI18nText(value: unknown): value is RuntimeI18nText {
  if (typeof value === 'string') {
    return !!value.trim()
  }
  return isObjectValue(value) && typeof Reflect.get(value, 'en_US') === 'string'
}

function isObjectValue(value: unknown): value is object {
  return typeof value === 'object' && value !== null
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
  authMethodId?: string | null
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

export type ConnectorConnectRequest = {
  authMethodId?: string
  values?: ConnectorAppCredentialPayload
  /** @deprecated Use values instead. */
  app?: ConnectorAppCredentialPayload
}

export type ConnectorConnectResponse = {
  status: 'active' | 'pending'
  connector: ConnectorInstance
  authorizationUrl?: string | null
  stateExpiresAt?: string | null
  pollIntervalSeconds?: number | null
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

export type ConnectorRuntimeCredentialV2 = {
  connectorId: string
  workspaceId: string
  provider: string
  authMethodId: string
  credentials: Record<string, unknown>
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
  getConnectorCredential?(input: ConnectorRuntimeGetInput): Promise<ConnectorRuntimeCredentialV2>
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

export type ConnectorCredential = {
  data: ConnectorAppCredentialPayload
  expiresAt?: string | null
  refreshExpiresAt?: string | null
  scopes?: string[]
  profile?: ConnectorProfile | null
}

export type ConnectorConnectInput = {
  authMethodId: string
  values?: ConnectorAppCredentialPayload
  redirectUri: string
  state: string
  scopes?: string[]
}

export type ConnectorConnectResult =
  | {
      status: 'pending'
      authorizationUrl: string
      scopes?: string[]
      metadata?: Record<string, unknown>
      pollIntervalSeconds?: number | null
    }
  | {
      status: 'active'
      credential: ConnectorCredential
    }

export type ConnectorAuthorizationCodeInput = {
  authMethodId: string
  values?: ConnectorAppCredentialPayload
  metadata?: Record<string, unknown> | null
  code: string
  redirectUri: string
  scopes?: string[]
}

export type ConnectorConnectionPollInput = {
  authMethodId: string
  values?: ConnectorAppCredentialPayload
  metadata?: Record<string, unknown> | null
  redirectUri: string
  scopes?: string[]
}

export type ConnectorConnectionPollResult =
  | {
      status: 'pending'
      authorizationUrl?: string
      metadata?: Record<string, unknown>
      pollIntervalSeconds?: number | null
      message?: string
    }
  | {
      status: 'complete'
      credential: ConnectorCredential
      metadata?: Record<string, unknown>
    }
  | {
      status: 'error'
      error: string
      metadata?: Record<string, unknown>
    }

export type ConnectorCredentialRefreshInput = {
  authMethodId: string
  credential: ConnectorCredential
}

export type ConnectorRuntimeCredentialResolveInput = {
  authMethodId: string
  credential: ConnectorCredential
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

export interface ConnectorStrategyRuntime {
  definition: ConnectorStrategyDefinition
  connect?(input: ConnectorConnectInput): Promise<ConnectorConnectResult>
  exchangeAuthorizationCode?(input: ConnectorAuthorizationCodeInput): Promise<ConnectorCredential>
  pollConnection?(input: ConnectorConnectionPollInput): Promise<ConnectorConnectionPollResult>
  refreshConnectionCredential?(input: ConnectorCredentialRefreshInput): Promise<ConnectorCredential>
  resolveRuntimeCredential?(
    input: ConnectorRuntimeCredentialResolveInput
  ): Promise<Record<string, unknown>> | Record<string, unknown>
  buildAuthorizationUrl?(input: ConnectorAuthorizationUrlInput): Promise<ConnectorAuthorizationUrlResult>
  exchangeOAuthCode?(input: ConnectorOAuthCodeInput): Promise<ConnectorOAuthCredential>
  refreshCredential?(input: ConnectorRefreshInput): Promise<ConnectorOAuthCredential>
  pollAuthorization?(input: ConnectorAuthorizationPollInput): Promise<ConnectorAuthorizationPollResult>
}

export interface ConnectorStrategy extends ConnectorStrategyRuntime {
  definition: ConnectorDefinition
  buildAuthorizationUrl(input: ConnectorAuthorizationUrlInput): Promise<ConnectorAuthorizationUrlResult>
  exchangeOAuthCode(input: ConnectorOAuthCodeInput): Promise<ConnectorOAuthCredential>
}

export interface ConnectorMultiAuthStrategy extends ConnectorStrategyRuntime {
  definition: ConnectorMultiAuthDefinition
  connect(input: ConnectorConnectInput): Promise<ConnectorConnectResult>
}
