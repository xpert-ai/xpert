import { createHmac, timingSafeEqual } from 'crypto'

export const SLACK_BOT_SCOPES = ['users:read', 'users:read.email'] as const
const SLACK_OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export type SlackIntegrationConfig = {
  appId?: string
  clientId?: string
  clientSecret?: string
  signingSecret?: string
  verificationToken?: string
  defaultChannelId?: string
  botToken?: string
  accessScope?: string
  workspace?: string
  workspaceId?: string
  team?: string
  teamId?: string
  teamName?: string
  botUser?: string
  botUserId?: string
  botUserName?: string
  status?: string
  connectionStatus?: string
  users?: SlackUserSummary[]
  authorizedAt?: string
  lastSyncAt?: string
  updatedAt?: string
}

export type SlackUserSummary = {
  id: string
  displayName: string
  realName: string
  email: string
  status: string
}

export type SlackConnectionState = {
  checkedAt: number
  workspaceName: string
  workspaceId: string
  botUserName: string
  botUserId: string
}

export type SlackAuthorizationUrlOptions = {
  integrationId: string
  tenantId: string
  organizationId?: string | null
  baseUrl: string
  clientBaseUrl: string
  stateSecret: string
  redirectUri?: string
}

export type SlackAuthorizationUrlResult = {
  authorizationUrl: string
  callbackUrl: string
  redirectUri: string
  scopes: string[]
}

export type SlackOAuthStatePayload = {
  integrationId: string
  tenantId: string
  organizationId?: string | null
  redirectUri: string
  exp: number
}

export async function hydrateSlackConfig(config: SlackIntegrationConfig) {
  const normalized = normalizeSlackConfig(config)
  const connection = await fetchSlackConnectionState(normalized)
  const warnings: string[] = []
  let users: SlackUserSummary[] = normalized.users ?? []

  try {
    users = await fetchSlackUsers(normalized)
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error))
  }

  return {
    checkedAt: connection.checkedAt,
    warnings,
    nextOptions: {
      ...normalized,
      workspace: connection.workspaceName,
      workspaceId: connection.workspaceId,
      team: connection.workspaceName,
      teamId: connection.workspaceId,
      teamName: connection.workspaceName,
      botUser: connection.botUserName,
      botUserId: connection.botUserId,
      botUserName: connection.botUserName,
      status: 'connected',
      connectionStatus: 'connected',
      users,
      lastSyncAt: new Date(connection.checkedAt).toISOString(),
      updatedAt: new Date(connection.checkedAt).toISOString()
    } satisfies SlackIntegrationConfig
  }
}

export async function exchangeSlackOAuthCode(config: SlackIntegrationConfig, code: string, redirectUri: string) {
  const normalized = normalizeSlackConfig(config)
  assertSlackAppConfig(normalized)

  const payload = await slackApiPostForm('oauth.v2.access', {
    client_id: normalized.clientId,
    client_secret: normalized.clientSecret,
    code,
    redirect_uri: redirectUri
  })
  ensureSlackOk(payload, 'oauth.v2.access')

  const botToken = getString(payload, 'access_token')
  if (!botToken) {
    throw new Error('Slack oauth.v2.access did not return a bot token')
  }

  const checkedAt = Date.now()
  const team = getObject(payload, 'team')
  const hydrated = await hydrateSlackConfig({
    ...normalized,
    appId: getString(payload, 'app_id') ?? normalized.appId,
    botToken,
    accessScope: getString(payload, 'scope') ?? normalized.accessScope,
    workspace: getString(team, 'name') ?? normalized.workspace,
    workspaceId: getString(team, 'id') ?? normalized.workspaceId,
    team: getString(team, 'name') ?? normalized.team,
    teamId: getString(team, 'id') ?? normalized.teamId,
    teamName: getString(team, 'name') ?? normalized.teamName,
    botUserId: getString(payload, 'bot_user_id') ?? normalized.botUserId,
    authorizedAt: new Date(checkedAt).toISOString()
  })

  return {
    checkedAt,
    warnings: hydrated.warnings,
    nextOptions: {
      ...hydrated.nextOptions,
      appId: getString(payload, 'app_id') ?? normalized.appId,
      accessScope: getString(payload, 'scope') ?? normalized.accessScope,
      authorizedAt: new Date(checkedAt).toISOString()
    } satisfies SlackIntegrationConfig
  }
}

export function buildSlackAuthorizationUrl(
  config: SlackIntegrationConfig,
  options: SlackAuthorizationUrlOptions
): SlackAuthorizationUrlResult {
  const normalized = normalizeSlackConfig(config)
  assertSlackAppConfig(normalized)

  const callbackUrl = getSlackCallbackUrl(options.baseUrl)
  const redirectUri = trimString(options.redirectUri) ?? getSlackIntegrationRedirectUrl(options.clientBaseUrl, options.integrationId)
  const state = createSlackOAuthState(
    {
      integrationId: options.integrationId,
      tenantId: options.tenantId,
      organizationId: options.organizationId ?? null,
      redirectUri
    },
    options.stateSecret
  )

  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', normalized.clientId)
  url.searchParams.set('scope', SLACK_BOT_SCOPES.join(','))
  url.searchParams.set('redirect_uri', callbackUrl)
  url.searchParams.set('state', state)

  return {
    authorizationUrl: url.toString(),
    callbackUrl,
    redirectUri,
    scopes: [...SLACK_BOT_SCOPES]
  }
}

export function getSlackCallbackUrl(baseUrl: string) {
  return new URL('/api/slack/callback', ensureAbsoluteBaseUrl(baseUrl)).toString()
}

export function getSlackIntegrationRedirectUrl(clientBaseUrl: string, integrationId: string) {
  return new URL(`/settings/integration/${integrationId}`, ensureAbsoluteBaseUrl(clientBaseUrl)).toString()
}

export function createSlackOAuthState(
  payload: Omit<SlackOAuthStatePayload, 'exp'>,
  secret: string,
  now = Date.now()
) {
  const normalizedPayload: SlackOAuthStatePayload = {
    integrationId: payload.integrationId,
    tenantId: payload.tenantId,
    organizationId: payload.organizationId ?? null,
    redirectUri: payload.redirectUri,
    exp: now + SLACK_OAUTH_STATE_TTL_MS
  }
  const encodedPayload = Buffer.from(JSON.stringify(normalizedPayload), 'utf8').toString('base64url')
  const signature = signSlackOAuthState(encodedPayload, secret)
  return `${encodedPayload}.${signature}`
}

export function parseSlackOAuthState(state: string, secret: string, now = Date.now()): SlackOAuthStatePayload {
  const [encodedPayload, signature] = state.split('.')
  if (!encodedPayload || !signature) {
    throw new Error('Slack OAuth state is malformed')
  }

  const expectedSignature = signSlackOAuthState(encodedPayload, secret)
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSignature)
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new Error('Slack OAuth state signature is invalid')
  }

  const payload = parseSlackOAuthStatePayload(encodedPayload)
  if (payload.exp <= now) {
    throw new Error('Slack OAuth state has expired')
  }

  return payload
}

export function resolveSlackStateSecret(primarySecret?: string | null, fallbackSecret?: string | null) {
  return trimString(primarySecret) ?? trimString(fallbackSecret) ?? 'xpert-slack-oauth-state'
}

export function assertSlackAppConfig(config: SlackIntegrationConfig) {
  const missingFields = [
    !config.appId ? 'appId' : null,
    !config.clientId ? 'clientId' : null,
    !config.clientSecret ? 'clientSecret' : null,
    !config.signingSecret ? 'signingSecret' : null
  ].filter((field): field is string => !!field)

  if (missingFields.length) {
    throw new Error(`Slack app configuration is incomplete: missing ${missingFields.join(', ')}`)
  }
}

export async function fetchSlackConnectionState(config: SlackIntegrationConfig): Promise<SlackConnectionState> {
  const normalized = normalizeSlackConfig(config)

  if (!normalized.botToken) {
    throw new Error('Slack workspace authorization is required')
  }

  const checkedAt = Date.now()
  const authPayload = await slackApiGet('auth.test', normalized.botToken)
  ensureSlackOk(authPayload, 'auth.test')

  return {
    checkedAt,
    workspaceName: getString(authPayload, 'team') ?? normalized.workspace ?? normalized.team ?? '',
    workspaceId: getString(authPayload, 'team_id') ?? normalized.workspaceId ?? normalized.teamId ?? '',
    botUserName: getString(authPayload, 'user') ?? normalized.botUser ?? normalized.botUserName ?? '',
    botUserId: getString(authPayload, 'user_id') ?? normalized.botUserId ?? ''
  }
}

export async function fetchSlackUsers(config: SlackIntegrationConfig) {
  const normalized = normalizeSlackConfig(config)

  if (!normalized.botToken) {
    throw new Error('Slack workspace authorization is required')
  }

  const users: SlackUserSummary[] = []
  const seen = new Set<string>()
  let cursor: string | null = null

  for (let page = 0; page < 10; page += 1) {
    const payload = await slackApiGet('users.list', normalized.botToken, {
      limit: '200',
      ...(cursor ? { cursor } : {})
    })
    ensureSlackOk(payload, 'users.list')

    const members = getArray(payload, 'members')
    for (const member of members) {
      const user = normalizeSlackUser(member)
      if (!user || seen.has(user.id)) {
        continue
      }

      seen.add(user.id)
      users.push(user)
    }

    cursor = getNextCursor(payload)
    if (!cursor) {
      break
    }
  }

  return users
}

export function normalizeSlackConfig(config: SlackIntegrationConfig | null | undefined): SlackIntegrationConfig {
  return {
    appId: trimString(config?.appId),
    clientId: trimString(config?.clientId),
    clientSecret: trimString(config?.clientSecret),
    signingSecret: trimString(config?.signingSecret),
    verificationToken: trimString(config?.verificationToken),
    defaultChannelId: trimString(config?.defaultChannelId),
    botToken: trimString(config?.botToken),
    accessScope: trimString(config?.accessScope),
    workspace: trimString(config?.workspace),
    workspaceId: trimString(config?.workspaceId),
    team: trimString(config?.team),
    teamId: trimString(config?.teamId),
    teamName: trimString(config?.teamName),
    botUser: trimString(config?.botUser),
    botUserId: trimString(config?.botUserId),
    botUserName: trimString(config?.botUserName),
    status: trimString(config?.status),
    connectionStatus: trimString(config?.connectionStatus),
    users: normalizeSlackUsers(config?.users),
    authorizedAt: trimString(config?.authorizedAt),
    lastSyncAt: trimString(config?.lastSyncAt),
    updatedAt: trimString(config?.updatedAt)
  }
}

async function slackApiGet(path: string, botToken: string, query?: Record<string, string>) {
  const url = new URL(`https://slack.com/api/${path}`)

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      url.searchParams.set(key, value)
    }
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${botToken}`
    }
  })

  if (!response.ok) {
    throw new Error(`Slack API ${path} failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  return payload
}

async function slackApiPostForm(path: string, body: Record<string, string | undefined>) {
  const formData = new URLSearchParams()

  for (const [key, value] of Object.entries(body)) {
    if (value) {
      formData.set(key, value)
    }
  }

  const response = await fetch(`https://slack.com/api/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formData.toString()
  })

  if (!response.ok) {
    throw new Error(`Slack API ${path} failed with status ${response.status}`)
  }

  const payload: unknown = await response.json()
  return payload
}

function ensureSlackOk(payload: unknown, action: string) {
  if (getBoolean(payload, 'ok')) {
    return
  }

  const errorMessage = getString(payload, 'error') ?? 'unknown_error'
  throw new Error(`Slack ${action} failed: ${errorMessage}`)
}

function normalizeSlackUser(value: unknown): SlackUserSummary | null {
  if (!isObject(value)) {
    return null
  }

  const id = getString(value, 'id')
  if (!id) {
    return null
  }

  const profile = getObject(value, 'profile')
  const displayName =
    getString(profile, 'display_name_normalized') ??
    getString(profile, 'display_name') ??
    getString(value, 'name') ??
    getString(profile, 'real_name_normalized') ??
    getString(profile, 'real_name') ??
    '-'

  const realName =
    getString(profile, 'real_name_normalized') ?? getString(profile, 'real_name') ?? displayName ?? '-'
  const email = getString(profile, 'email') ?? '-'
  const explicitStatus = trimString(getString(value, 'presence')) ?? trimString(getString(profile, 'status_text'))

  return {
    id,
    displayName,
    realName,
    email,
    status: explicitStatus ?? (getBoolean(value, 'deleted') ? 'deleted' : getBoolean(value, 'is_bot') ? 'bot' : 'active')
  }
}

function normalizeSlackUsers(users: SlackIntegrationConfig['users']): SlackUserSummary[] {
  if (!Array.isArray(users)) {
    return []
  }

  const normalizedUsers: SlackUserSummary[] = []
  for (const user of users) {
    const normalized = normalizeStoredSlackUser(user)
    if (normalized) {
      normalizedUsers.push(normalized)
    }
  }

  return normalizedUsers
}

function normalizeStoredSlackUser(value: unknown): SlackUserSummary | null {
  if (!isObject(value)) {
    return null
  }

  const id = getString(value, 'id')
  if (!id) {
    return null
  }

  return {
    id,
    displayName: getString(value, 'displayName') ?? '-',
    realName: getString(value, 'realName') ?? '-',
    email: getString(value, 'email') ?? '-',
    status: getString(value, 'status') ?? 'unknown'
  }
}

function getNextCursor(value: unknown) {
  const metadata = getObject(value, 'response_metadata')
  return trimString(getString(metadata, 'next_cursor'))
}

function ensureAbsoluteBaseUrl(value: string) {
  const normalized = trimString(value)
  if (!normalized) {
    throw new Error('Slack integration base URL is not configured')
  }

  return normalized
}

function signSlackOAuthState(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function parseSlackOAuthStatePayload(encodedPayload: string): SlackOAuthStatePayload {
  let payload: unknown

  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    throw new Error('Slack OAuth state payload is invalid')
  }

  if (!isObject(payload)) {
    throw new Error('Slack OAuth state payload is invalid')
  }

  const integrationId = getString(payload, 'integrationId')
  const tenantId = getString(payload, 'tenantId')
  const redirectUri = getString(payload, 'redirectUri')
  const exp = getNumber(payload, 'exp')

  if (!integrationId || !tenantId || !redirectUri || exp === null) {
    throw new Error('Slack OAuth state payload is incomplete')
  }

  return {
    integrationId,
    tenantId,
    organizationId: getNullableString(payload, 'organizationId'),
    redirectUri,
    exp
  }
}

function trimString(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim()
  return normalized.length ? normalized : undefined
}

function getString(value: unknown, key: string) {
  if (!isObject(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' ? candidate : null
}

function getNullableString(value: unknown, key: string) {
  if (!isObject(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  if (candidate === null) {
    return null
  }

  return typeof candidate === 'string' ? candidate : null
}

function getNumber(value: unknown, key: string) {
  if (!isObject(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  return typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null
}

function getBoolean(value: unknown, key: string) {
  if (!isObject(value) || !(key in value)) {
    return false
  }

  return Reflect.get(value, key) === true
}

function getArray(value: unknown, key: string) {
  if (!isObject(value) || !(key in value)) {
    return []
  }

  const candidate = Reflect.get(value, key)
  return Array.isArray(candidate) ? candidate : []
}

function getObject(value: unknown, key: string) {
  if (!isObject(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  return isObject(candidate) ? candidate : null
}

function isObject(value: unknown): value is object {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
