// Credentials stay in the host. Only scoped ChatKit secrets cross into the renderer.
const { MessageError, normalizeLocale, isSupportedLocale, localizedText } = require('./i18n/index.mjs')
const { parseAppearance } = require('./appearance.cjs')
const DEFAULT_CONFIG = {
  apiUrl: 'http://localhost:3000',
  webUrl: 'http://localhost:4200',
  frameUrl: 'http://localhost:4200/chatkit/index.html',
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
  const frame = webUrl(value.frameUrl || `${web}/chatkit/index.html`)
  if (!['light', 'dark', 'system'].includes(value.theme)) throw new ClientError('Invalid theme settings.')
  if (value.locale !== undefined && !isSupportedLocale(value.locale)) throw new ClientError('Invalid language setting.')
  let appearance
  try {
    appearance = parseAppearance(value.appearance)
  } catch (error) {
    throw new ClientError(error instanceof MessageError ? error.key : 'Invalid theme settings.', 400, error.params)
  }
  return { apiUrl, webUrl: web, frameUrl: frame, theme: value.theme, appearance, locale: normalizeLocale(value.locale) }
}

function parseUser(value) {
  if (!value || typeof value.id !== 'string') throw new ClientError('The service returned invalid user information.')
  return {
    id: value.id,
    avatarUrl: typeof value.imageUrl === 'string' && /^https?:\/\//.test(value.imageUrl) ? value.imageUrl : null,
    tenantId: typeof value.tenantId === 'string' ? value.tenantId : null,
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
        name: [...(locale?.startsWith('zh') ? [item.titleCN] : []), item.title, item.name].find(
          (title) => typeof title === 'string' && title.trim()
        ),
        description: localizedText(item.description, locale),
        avatarEmoji:
          typeof avatar?.emoji?.id === 'string'
            ? { id: avatar.emoji.id, unified: typeof avatar.emoji.unified === 'string' ? avatar.emoji.unified : null }
            : null,
        avatarUrl: typeof avatar?.url === 'string' && /^https?:\/\//.test(avatar.url) ? avatar.url : null
      }
    })
  }
}

class DesktopService {
  constructor({ storage, fetcher = fetch, localLogin } = {}) {
    this.storage = storage || { read: () => null, write: () => {} }
    this.fetcher = fetcher
    this.localLogin = localLogin
    const saved = this.storage.read()
    const savedConfig = saved?.config || DEFAULT_CONFIG
    let appearance
    try {
      appearance = parseAppearance(savedConfig.appearance)
    } catch {
      appearance = parseAppearance()
    }
    try {
      this.config = parseConfig({ ...savedConfig, appearance, locale: normalizeLocale(savedConfig.locale) })
    } catch {
      this.config = parseConfig(DEFAULT_CONFIG)
    }
    this.credentials = saved?.credentials || null
    this.profile = null
    this.bots = []
    this.generation = 0
    this.refreshing = null
  }

  snapshot() {
    return { config: this.config, profile: this.profile, localLoginAvailable: this.canLoginLocal() }
  }

  canLoginLocal() {
    return !!this.localLogin && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(this.config.apiUrl).hostname)
  }

  persist() {
    this.storage.write({ config: this.config, credentials: this.credentials })
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
    const connectionChanged = ['apiUrl', 'webUrl', 'frameUrl'].some((key) => next[key] !== this.config[key])
    if (connectionChanged) this.logout()
    this.config = next
    this.persist()
    return this.snapshot()
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
    return this.profile
  }

  async selectOrganization(id) {
    if (!this.profile?.organizations.some((item) => item.id === id))
      throw new ClientError('You cannot access this workspace.', 403)
    await this.shell?.disable()
    this.generation++
    this.bots = []
    this.profile = { ...this.profile, organizationId: id }
    this.credentials = { ...this.credentials, organizationId: id }
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
    this.bots = items
    return items
  }

  async chatSession(botId) {
    if (!this.bots.some((item) => item.id === botId))
      throw new ClientError('Select a Bot in the current workspace first.', 403)
    const organizationId = this.profile?.organizationId
    const result = await this.request('/api/ai/v1/chatkit/sessions', {
      method: 'POST',
      body: { assistant: { id: botId } }
    })
    if (typeof result?.client_secret !== 'string' || !result.client_secret)
      throw new ClientError('Could not create a ChatKit session.')
    return { secret: result.client_secret, organizationId }
  }

  logout() {
    void this.shell?.disable().catch(() => undefined)
    this.generation++
    this.credentials = null
    this.profile = null
    this.bots = []
    this.persist()
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

  async request(path, { method = 'GET', body, auth = true, token, retry = true, timeout = 20000 } = {}) {
    if (auth && !this.credentials) throw new ClientError('Please sign in first.', 401)
    const generation = this.generation
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Language': this.config.locale
    }
    if (auth || token) headers.Authorization = `Bearer ${token || this.credentials.token}`
    if (auth && this.credentials.tenantId) headers['tenant-id'] = this.credentials.tenantId
    const organizationId = this.profile?.organizationId || this.credentials?.organizationId
    if (auth && organizationId) headers['organization-id'] = organizationId
    let response
    try {
      response = await this.fetcher(`${this.config.apiUrl}${path}`, {
        method,
        headers,
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeout),
        redirect: 'error'
      })
    } catch {
      throw new ClientError(
        method === 'POST' && timeout > 20000
          ? 'The installation result is not available yet. Refresh the catalog or check the workspace before retrying.'
          : 'Cannot connect to Xpert. Check the service URL and network.',
        503
      )
    }
    if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
    if (response.status === 401 && auth && retry) {
      try {
        await this.refresh()
      } catch (error) {
        if (error.status === 401) this.logout()
        throw error
      }
      return this.request(path, { method, body, auth, retry: false, timeout })
    }
    if (!response.ok) {
      if (response.status === 401)
        throw new ClientError(
          auth ? 'Your session expired. Please sign in again.' : 'Incorrect email or password.',
          401
        )
      if (response.status === 403) throw new ClientError('This account does not have access.', 403)
      throw new ClientError('Xpert request failed ({{status}}). Please retry later.', response.status, {
        status: response.status
      })
    }
    let value
    try {
      value = await response.json()
    } catch {
      throw new ClientError('Invalid service response. Check the API URL.', 502)
    }
    if (generation !== this.generation) throw new ClientError('The session changed. Please retry.', 409)
    return value
  }
}

Object.assign(DesktopService.prototype, require('./catalog.cjs').createCatalogMethods(ClientError))
Object.assign(DesktopService.prototype, require('./shell/methods.cjs').createShellMethods(ClientError))

module.exports = { DesktopService, ClientError, DEFAULT_CONFIG, parseConfig, webUrl }
