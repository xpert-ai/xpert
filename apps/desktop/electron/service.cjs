// Credentials stay in the host. Only scoped ChatKit secrets cross into the renderer.
const {
  MessageError,
  normalizeLocale,
  resolveSystemLocale,
  isSupportedLocale,
  localizedText
} = require('./i18n/index.mjs')
const { parseAppearance } = require('./appearance.cjs')
const { parseBusinessArea } = require('./business-area.cjs')
const { parseAvatarUrl } = require('./avatar-url.cjs')
const { AssistantActivity } = require('./assistant-activity.cjs')
const { apiRootUrl, chatkitUrl } = require('./connection/urls.mjs')
const { connectionPolicyKey, connectionErrorKey } = require('./connection/tls.cjs')
const DEFAULT_CONFIG = {
  ...require('./connection/defaults.json'),
  allowUntrustedCertificates: false,
  theme: 'system',
  locale: 'en'
}

class ClientError extends MessageError {
  constructor(message, status = 400, params = {}) {
    super(message, params)
    this.status = status
  }
}

function webUrl(value) {
  if (typeof value !== 'string') throw new ClientError('Enter a valid service URL.')
  let url
  try {
    url = new URL(value)
  } catch {
    throw new ClientError('Enter a complete HTTP or HTTPS URL.')
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new ClientError(
      'Service URLs require HTTPS; localhost may use HTTP. URLs cannot include credentials or query parameters.'
    )
  }
  return url.href.replace(/\/$/, '')
}

function parseConfig(value) {
  if (!value || typeof value !== 'object') throw new ClientError('Invalid connection settings.')
  const apiUrl = webUrl(value.apiUrl)
  const web = webUrl(value.webUrl)
  const frame = webUrl(value.frameUrl || chatkitUrl(web))
  if (value.allowUntrustedCertificates !== undefined && typeof value.allowUntrustedCertificates !== 'boolean')
    throw new ClientError('Invalid certificate settings.')
  if (!['light', 'dark', 'system'].includes(value.theme)) throw new ClientError('Invalid theme settings.')
  if (value.locale !== undefined && !isSupportedLocale(value.locale)) throw new ClientError('Invalid language setting.')
  let appearance
  try {
    appearance = parseAppearance(value.appearance)
  } catch (error) {
    throw new ClientError(error instanceof MessageError ? error.key : 'Invalid theme settings.', 400, error.params)
  }
  return {
    apiUrl,
    webUrl: web,
    frameUrl: frame,
    allowUntrustedCertificates: value.allowUntrustedCertificates === true,
    theme: value.theme,
    appearance,
    locale: normalizeLocale(value.locale)
  }
}

function parseUser(value) {
  if (!value || typeof value.id !== 'string') throw new ClientError('The service returned invalid user information.')
  return {
    id: value.id,
    avatarUrl: typeof value.imageUrl === 'string' && /^https?:\/\//.test(value.imageUrl) ? value.imageUrl : null,
    tenantId: typeof value.tenantId === 'string' ? value.tenantId : null,
    preferredLanguage: isSupportedLocale(value.preferredLanguage) ? normalizeLocale(value.preferredLanguage) : null,
    name:
      [value.fullName, value.name, value.firstName, value.email].find(
        (item) => typeof item === 'string' && item.trim()
      ) || ''
  }
}

function parseBootstrap(value) {
  if (!value || !Array.isArray(value.organizations))
    throw new ClientError('The service returned invalid workspace information.')
  const organizations = value.organizations.map((item) => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string')
      throw new ClientError('Invalid workspace information.')
    return { id: item.id, name: item.name }
  })
  return {
    user: parseUser(value.user),
    organizations,
    organizationId:
      organizations.find((item) => item.id === value.activeOrganizationId)?.id || organizations[0]?.id || null
  }
}

function parseBots(value, locale) {
  if (!value || !Array.isArray(value.items) || typeof value.total !== 'number')
    throw new ClientError('The service returned an invalid Bot list.')
  return {
    total: value.total,
    items: value.items.map((item) => {
      if (!item || typeof item.id !== 'string' || typeof item.name !== 'string')
        throw new ClientError('Invalid Bot information.')
      const avatar = item.avatar
      return {
        id: item.id,
        createdAt:
          typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : null,
        name: [...(locale?.startsWith('zh') ? [item.titleCN] : []), item.title, item.name].find(
          (title) => typeof title === 'string' && title.trim()
        ),
        description: localizedText(item.description, locale),
        businessArea: parseBusinessArea(item.businessArea),
        avatarEmoji:
          typeof avatar?.emoji?.id === 'string'
            ? { id: avatar.emoji.id, unified: typeof avatar.emoji.unified === 'string' ? avatar.emoji.unified : null }
            : null,
        avatarUrl: parseAvatarUrl(avatar?.url),
        avatar: avatar || null
      }
    })
  }
}

class DesktopService {
  constructor({
    storage,
    fetcher = fetch,
    localLogin,
    certificateProbe,
    defaultConfig = DEFAULT_CONFIG,
    systemLanguages = []
  } = {}) {
    this.storage = storage || { read: () => null, write: () => {} }
    this.fetcher = fetcher
    this.localLogin = localLogin
    this.certificateProbe = certificateProbe
    const saved = this.storage.read()
    const defaults = parseConfig({ ...DEFAULT_CONFIG, ...defaultConfig, locale: resolveSystemLocale(systemLanguages) })
    const savedConfig = saved?.config || defaults
    let validSavedConfig = Boolean(saved?.config)
    let appearance
    try {
      appearance = parseAppearance(savedConfig.appearance)
      if (saved?.config && !saved.config.appearance?.chatkit?.messagePresentation)
        appearance.chatkit.messagePresentation = 'transcript'
    } catch {
      appearance = parseAppearance()
    }
    try {
      this.config = parseConfig({
        ...savedConfig,
        appearance,
        locale: isSupportedLocale(savedConfig.locale) ? normalizeLocale(savedConfig.locale) : defaults.locale
      })
    } catch {
      this.config = defaults
      validSavedConfig = false
    }
    this.sidebars =
      saved?.sidebars && typeof saved.sidebars === 'object' && !Array.isArray(saved.sidebars) ? saved.sidebars : {}
    this.credentials = validSavedConfig ? saved?.credentials || null : null
    this.profile = null
    this.bots = []
    this.sourceBots = []
    this.generation = 0
    this.refreshing = null
    this.assistantActivity = new AssistantActivity(this)
  }

  snapshot() {
    return { config: this.config, profile: this.profile, localLoginAvailable: this.canLoginLocal() }
  }

  canLoginLocal() {
    return !!this.localLogin && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(this.config.apiUrl).hostname)
  }

  persist() {
    this.storage.write({ config: this.config, credentials: this.credentials, sidebars: this.sidebars })
  }

  async state() {
    if (this.credentials && !this.profile) {
      try {
        await this.bootstrap()
      } catch (error) {
        if (error.status === 401) this.logout()
        else throw error
      }
    }
    return this.snapshot()
  }

  configure(value) {
    const next = parseConfig(value)
    const connectionChanged = connectionPolicyKey(next) !== connectionPolicyKey(this.config)
    if (connectionChanged) this.logout()
    this.config = next
    this.persist()
    return this.snapshot()
  }

  async checkConnectionCertificates(input) {
    if (!input || typeof input !== 'object') throw new ClientError('Invalid connection settings.')
    if (!this.certificateProbe) throw new ClientError('Unsupported operation.')
    const groups = new Map()
    const invalid = []
    for (const field of ['apiUrl', 'webUrl', 'frameUrl']) {
      try {
        const url = new URL(webUrl(input[field]))
        const group = groups.get(url.origin) || { origin: url.origin, fields: [], protocol: url.protocol }
        group.fields.push(field)
        groups.set(url.origin, group)
      } catch {
        invalid.push({ origin: null, fields: [field], status: 'invalid' })
      }
    }
    return [
      ...(await Promise.all(
        [...groups.values()].map(async ({ origin, fields, protocol }) => ({
          origin,
          fields,
          ...(protocol === 'https:' ? await this.certificateProbe(origin) : { status: 'http' })
        }))
      )),
      ...invalid
    ]
  }

  async login(input) {
    if (
      !input ||
      typeof input.email !== 'string' ||
      typeof input.password !== 'string' ||
      !input.email.trim() ||
      !input.password
    ) {
      throw new ClientError('Enter your email and password.')
    }
    this.logout()
    const result = await this.request('/api/auth/login', {
      method: 'POST',
      body: { email: input.email.trim(), password: input.password },
      auth: false
    })
    if (typeof result?.token !== 'string' || typeof result.refreshToken !== 'string')
      throw new ClientError('Invalid sign-in response.')
    const user = parseUser(result.user)
    this.credentials = { token: result.token, refreshToken: result.refreshToken, tenantId: user.tenantId }
    try {
      await this.bootstrap()
    } catch (error) {
      this.logout()
      throw error
    }
    this.persist()
    return this.snapshot()
  }

  async loginLocal() {
    if (!this.canLoginLocal())
      throw new ClientError('Local development accounts can only connect to a local Xpert service.', 403)
    return this.login(await this.localLogin())
  }

  async bootstrap() {
    this.profile = parseBootstrap(await this.request('/api/mobile/bootstrap'))
    this.assistantActivity.sync()
    this.applyAccountLanguage()
    return this.profile
  }

  applyAccountLanguage() {
    const locale = this.profile?.user.preferredLanguage
    if (locale && locale !== this.config.locale) {
      this.config = { ...this.config, locale }
      this.persist()
    }
  }

  async refreshProfile() {
    if (!this.credentials) return this.snapshot()
    if (this.refreshingProfile) return this.refreshingProfile
    this.refreshingProfile = (async () => {
      const generation = this.generation
      const profile = parseBootstrap(await this.request('/api/mobile/bootstrap', { scope: 'tenant' }))
      const currentOrganizationId = this.profile?.organizationId
      if (profile.organizations.some((organization) => organization.id === currentOrganizationId)) {
        profile.organizationId = currentOrganizationId
      }
      if (profile.organizationId !== this.profile?.organizationId) {
        await this.shell?.disable()
        if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
        this.generation++
        this.bots = []
        this.sourceBots = []
      }
      this.profile = profile
      this.applyAccountLanguage()
      this.credentials = { ...this.credentials, organizationId: profile.organizationId }
      this.assistantActivity.sync()
      this.persist()
      return this.snapshot()
    })().finally(() => {
      this.refreshingProfile = null
    })
    return this.refreshingProfile
  }

  async selectOrganization(id) {
    if (!this.profile?.organizations.some((item) => item.id === id))
      throw new ClientError('You cannot access this workspace.', 403)
    await this.shell?.disable()
    this.generation++
    this.bots = []
    this.sourceBots = []
    this.profile = { ...this.profile, organizationId: id }
    this.credentials = { ...this.credentials, organizationId: id }
    this.assistantActivity.sync()
    this.persist()
    return this.snapshot()
  }

  async listBots() {
    if (!this.profile?.organizationId) return []
    const generation = this.generation
    const items = []
    let total = 0
    do {
      const page = parseBots(
        await this.request(`/api/mobile/xperts?limit=100&offset=${items.length}`),
        this.config.locale
      )
      total = page.total
      items.push(...page.items)
      if (!page.items.length) break
    } while (items.length < total)
    if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
    this.sourceBots = items
    this.bots = this.decorateBots(items)
    this.assistantActivity.sync()
    return this.bots
  }

  async chatSession(botId) {
    if (!this.bots.some((item) => item.id === botId))
      throw new ClientError('Select a Bot in the current workspace first.', 403)
    const organizationId = this.profile?.organizationId
    const result = await this.request('/api/ai/v1/chatkit/sessions', {
      method: 'POST',
      body: { assistant: { id: this.bots.find((item) => item.id === botId).assistantId || botId } }
    })
    if (typeof result?.client_secret !== 'string' || !result.client_secret)
      throw new ClientError('Could not create a ChatKit session.')
    return { secret: result.client_secret, organizationId }
  }

  logout() {
    // Execution grants follow the CLI/task lifecycle, independently of desktop login or connection changes.
    void this.shell?.disable().catch(() => undefined)
    this.generation++
    this.credentials = null
    this.profile = null
    this.bots = []
    this.sourceBots = []
    this.persist()
    this.assistantActivity.sync()
    return this.snapshot()
  }

  async refresh() {
    if (this.refreshing) return this.refreshing
    if (!this.credentials) throw new ClientError('Please sign in again.', 401)
    this.refreshing = (async () => {
      const value = await this.request('/api/auth/refresh', { auth: false, token: this.credentials.refreshToken })
      if (typeof value?.token !== 'string' || typeof value.refreshToken !== 'string')
        throw new ClientError('Your session expired. Please sign in again.', 401)
      this.credentials = { ...this.credentials, token: value.token, refreshToken: value.refreshToken }
      this.persist()
    })().finally(() => {
      this.refreshing = null
    })
    return this.refreshing
  }

  async request(
    path,
    {
      method = 'GET',
      body,
      auth = true,
      token,
      scope,
      retry = true,
      timeout = 20000,
      responseType = 'json',
      errorMessages,
      includeServerMessage = false
    } = {}
  ) {
    if (auth && !this.credentials) throw new ClientError('Please sign in first.', 401)
    const generation = this.generation
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': this.config.locale,
      language: this.config.locale
    }
    if (auth || token) headers.Authorization = `Bearer ${token || this.credentials.token}`
    if (auth && this.credentials.tenantId) headers['tenant-id'] = this.credentials.tenantId
    const organizationId = this.profile?.organizationId || this.credentials?.organizationId
    if (auth && organizationId && scope !== 'tenant') headers['organization-id'] = organizationId
    if (auth && scope) headers['x-scope-level'] = scope
    const multipart = typeof FormData !== 'undefined' && body instanceof FormData
    if (multipart) delete headers['Content-Type']
    let response
    try {
      response = await this.fetcher(`${apiRootUrl(this.config.apiUrl)}${path}`, {
        method,
        headers,
        ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeout),
        redirect: 'error'
      })
    } catch (error) {
      if (method === 'POST' && timeout > 20000)
        throw new ClientError(
          'The installation result is not available yet. Refresh the catalog or check the workspace before retrying.',
          503
        )
      const connectionError = connectionErrorKey(error)
      throw new ClientError(connectionError || 'Cannot connect to Xpert. Check the service URL and network.', 503)
    }
    if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
    if (response.status === 401 && auth && retry) {
      try {
        await this.refresh()
      } catch (error) {
        if (error.status === 401) this.logout()
        throw error
      }
      return this.request(path, {
        method,
        body,
        auth,
        scope,
        retry: false,
        timeout,
        responseType,
        errorMessages,
        includeServerMessage
      })
    }
    if (!response.ok) {
      if (response.status === 401)
        throw new ClientError(
          auth ? 'Your session expired. Please sign in again.' : 'Incorrect email or password.',
          401
        )
      if (includeServerMessage && [400, 403, 404, 409, 422].includes(response.status)) {
        const failure = await response
          .clone()
          .json()
          .catch(() => null)
        if (typeof failure?.message === 'string' && failure.message.length <= 1000)
          throw new ClientError(failure.message, response.status)
      }
      if (response.status === 403) throw new ClientError('This account does not have access.', 403)
      if (errorMessages && [400, 409].includes(response.status)) {
        const failure = await response.json().catch(() => null)
        if (typeof failure?.code === 'string' && Object.hasOwn(errorMessages, failure.code))
          throw new ClientError(errorMessages[failure.code], response.status)
      }
      throw new ClientError('Xpert request failed ({{status}}). Please retry later.', response.status, {
        status: response.status
      })
    }
    let value
    try {
      value =
        responseType === 'response'
          ? response
          : responseType === 'text'
            ? await response.text()
            : response.status === 204
              ? null
              : await response.json()
    } catch {
      throw new ClientError('Invalid service response. Check the API URL.', 502)
    }
    if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
    return value
  }
}

Object.assign(
  DesktopService.prototype,
  require('./assistant-configuration.cjs').createAssistantConfigurationMethods(ClientError)
)
Object.assign(DesktopService.prototype, require('./assistant-list.cjs').createAssistantListMethods(ClientError))
Object.assign(DesktopService.prototype, require('./assistant-profile.cjs').createAssistantProfileMethods(ClientError))
Object.assign(DesktopService.prototype, require('./assistant-triggers.cjs').createAssistantTriggerMethods(ClientError))
Object.assign(DesktopService.prototype, require('./catalog.cjs').createCatalogMethods(ClientError))
Object.assign(DesktopService.prototype, require('./plugin-connections.cjs').createPluginConnectionMethods(ClientError))
Object.assign(DesktopService.prototype, require('./plugin-library.cjs').createPluginLibraryMethods(ClientError))
Object.assign(DesktopService.prototype, require('./artifacts.cjs').createArtifactMethods(ClientError))
Object.assign(DesktopService.prototype, require('./usage.cjs').createUsageMethods(ClientError))
Object.assign(DesktopService.prototype, require('./shell/methods.cjs').createShellMethods(ClientError))

module.exports = { DesktopService, ClientError, DEFAULT_CONFIG, parseConfig, webUrl }

Object.assign(DesktopService.prototype, require('./workbench.cjs').createWorkbenchMethods(ClientError))
Object.assign(DesktopService.prototype, require('./bosi.cjs').createBosiMethods(ClientError))
Object.assign(
  DesktopService.prototype,
  require('./assistant-appearance.cjs').createAssistantAppearanceMethods(ClientError)
)

Object.assign(DesktopService.prototype, require('./voice.cjs').createVoiceMethods(ClientError))
