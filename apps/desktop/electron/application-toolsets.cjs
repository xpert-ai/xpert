const { localizedText } = require('./i18n/index.mjs')

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const text = (value) => (typeof value === 'string' ? value : '')
const scalar = (value) =>
  ['string', 'boolean'].includes(typeof value) || (typeof value === 'number' && Number.isFinite(value))
const fieldTypes = new Set(['secret-input', 'text-input', 'select', 'boolean', 'int', 'number'])
const required = (value, ClientError) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 256)
    throw new ClientError('Invalid tool configuration. Refresh settings and try again.', 400)
  return value.trim()
}

function applicationToolsets(value, locale, ClientError) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new ClientError('Invalid installation check response.', 502)
  const items = value.map((item) => {
    if (!object(item) || !Array.isArray(item.options) || typeof item.providerAvailable !== 'boolean')
      throw new ClientError('Invalid installation check response.', 502)
    return {
      key: required(item.key, ClientError),
      pluginName: required(item.pluginName, ClientError),
      provider: required(item.provider, ClientError),
      instanceName: text(item.instanceName),
      label: localizedText(item.label, locale) || item.provider,
      providerAvailable: item.providerAvailable,
      options: item.options.map((option) => ({
        id: required(option?.id, ClientError),
        name: text(option?.name),
        workspaceName: text(option?.workspaceName)
      })),
      ...(item.configuredToolsetId ? { configuredToolsetId: required(item.configuredToolsetId, ClientError) } : {})
    }
  })
  if (new Set(items.map((item) => item.key)).size !== items.length)
    throw new ClientError('Invalid installation check response.', 502)
  return items
}

function selectedApplicationToolsets(input, requirements, ClientError) {
  const selections = input ?? []
  if (
    !Array.isArray(selections) ||
    selections.length > 100 ||
    selections.some(
      (item) =>
        !object(item) ||
        typeof item.key !== 'string' ||
        typeof item.toolsetId !== 'string' ||
        Object.keys(item).some((key) => !['key', 'toolsetId'].includes(key)) ||
        !requirements.some((requirement) => requirement.key === item.key)
    ) ||
    new Set(selections.map((item) => item.key)).size !== selections.length
  )
    throw new ClientError('Invalid tool configuration. Refresh settings and try again.', 400)
  return requirements.map((requirement) => {
    const selected = selections.find((item) => item.key === requirement.key)?.toolsetId
    const id = requirement.configuredToolsetId || selected
    if (
      !requirement.providerAvailable ||
      !id ||
      !requirement.options.some((option) => option.id === id) ||
      (requirement.configuredToolsetId && selected && selected !== id)
    )
      throw new ClientError('Select or configure the tools required for installation.', 400)
    return { key: requirement.key, toolsetId: id }
  })
}

module.exports = { applicationToolsets, selectedApplicationToolsets }

// Scope, provider, target Workspace and managed IDs always come from fresh host preflight.
// Existing secrets never cross IPC; only edited credential fields are accepted from the form.
module.exports.createApplicationToolsetMethods = function (ClientError) {
  const appInput = (setup) => ({ pluginName: setup.application.pluginName, appName: setup.application.appName })
  async function context(service, input) {
    const setup = await service.applicationSetup(input)
    if (!setup.canConfigure || ['ready', 'initializing'].includes(setup.application.status))
      throw new ClientError('Application setup changed. Refresh settings before continuing.', 409)
    const requirement = setup.toolsetRequirements.find((item) => item.key === input?.key)
    if (!requirement?.providerAvailable)
      throw new ClientError('Install the required tool provider plugin in Xpert, then refresh settings.', 400)
    return { setup, requirement }
  }
  const request = (service, path, options) => service.request(path, { scope: 'organization', ...options })
  async function metadata(service, requirement) {
    const base = `/api/xpert-toolset/builtin-provider/${encodeURIComponent(requirement.provider)}`
    const [fields, tools, existing, storedCredentials] = await Promise.all([
      request(service, `${base}/credentials-schema`),
      request(service, `${base}/tools`),
      requirement.configuredToolsetId
        ? request(
            service,
            `/api/xpert-toolset/${encodeURIComponent(requirement.configuredToolsetId)}?data=${encodeURIComponent(JSON.stringify({ relations: ['tools'] }))}`
          )
        : null,
      requirement.configuredToolsetId
        ? request(service, `/api/xpert-toolset/${encodeURIComponent(requirement.configuredToolsetId)}/credentials`)
        : {}
    ])
    const credentials = storedCredentials ?? {}
    if (
      !Array.isArray(fields) ||
      !Array.isArray(tools) ||
      !object(credentials) ||
      (requirement.configuredToolsetId && !object(existing)) ||
      fields.some((field) => !object(field) || !text(field.name) || !text(field.type)) ||
      tools.some((tool) => !text(tool?.identity?.name)) ||
      new Set(fields.map((field) => field.name)).size !== fields.length ||
      new Set(tools.map((tool) => tool.identity.name)).size !== tools.length
    )
      throw new ClientError('Invalid tool configuration. Refresh settings and try again.', 502)
    if (existing && (existing.id !== requirement.configuredToolsetId || existing.type !== requirement.provider))
      throw new ClientError('Application setup changed. Refresh settings before continuing.', 409)
    return { fields, tools, existing, credentials, base }
  }
  function enabled(existing, name) {
    if (!existing) return false
    const tool = existing.tools?.find((item) => item.name === name)
    if (typeof tool?.disabled === 'boolean') return !tool.disabled
    if (typeof tool?.enabled === 'boolean') return tool.enabled
    return existing.options?.disableToolDefault !== true
  }
  return {
    async applicationToolsetSetup(input) {
      const { requirement } = await context(this, input)
      const { fields, tools, existing, credentials } = await metadata(this, requirement)
      const supported = fields.every((field) => fieldTypes.has(field.type))
      return {
        name: text(existing?.name) || requirement.instanceName || requirement.label,
        supported,
        fields: supported
          ? fields.map((field) => {
              const value = credentials[field.name] ?? field.default
              return {
                name: field.name,
                type: field.type,
                required: field.required === true,
                label: localizedText(field.label, this.config.locale) || field.name,
                help: localizedText(field.help, this.config.locale),
                placeholder: localizedText(field.placeholder, this.config.locale),
                hasValue:
                  credentials[field.name] !== undefined &&
                  credentials[field.name] !== null &&
                  credentials[field.name] !== '',
                ...(field.type !== 'secret-input' && scalar(value) ? { value } : {}),
                options: Array.isArray(field.options)
                  ? field.options.map((option) => ({
                      value: required(option.value, ClientError),
                      label: localizedText(option.label, this.config.locale)
                    }))
                  : []
              }
            })
          : [],
        tools: tools.map((tool) => ({
          name: tool.identity.name,
          label: localizedText(tool.identity.label, this.config.locale) || tool.identity.name,
          enabled: enabled(existing, tool.identity.name)
        }))
      }
    },
    async saveApplicationToolset(input) {
      const { setup, requirement } = await context(this, input)
      const { fields, tools, existing, credentials: current, base } = await metadata(this, requirement)
      const name = required(input?.name, ClientError)
      if (
        !fields.every((field) => fieldTypes.has(field.type)) ||
        !object(input?.credentials) ||
        Object.keys(input.credentials).some((key) => !fields.some((field) => field.name === key)) ||
        !Array.isArray(input?.tools) ||
        !input.tools.length ||
        new Set(input.tools).size !== input.tools.length ||
        input.tools.some((name) => !tools.some((tool) => tool.identity.name === name))
      )
        throw new ClientError('Complete the tool configuration and enable at least one tool.', 400)
      const credentials = { ...current }
      for (const field of fields) {
        const value = Object.hasOwn(input.credentials, field.name)
          ? input.credentials[field.name]
          : (current[field.name] ?? field.default)
        const missing = value === undefined || value === null || value === ''
        if (
          (missing && field.required) ||
          (!missing &&
            (!scalar(value) ||
              (['secret-input', 'text-input', 'select'].includes(field.type) && typeof value !== 'string') ||
              (field.type === 'boolean' && typeof value !== 'boolean') ||
              (['int', 'number'].includes(field.type) &&
                (typeof value !== 'number' || (field.type === 'int' && !Number.isInteger(value)))) ||
              (field.type === 'select' && !field.options?.some((option) => option.value === value))))
        )
          throw new ClientError('Complete the tool configuration and enable at least one tool.', 400)
        if (value !== undefined) credentials[field.name] = value
      }
      const prepared = await request(this, '/api/plugin-applications/prepare', {
        method: 'POST',
        body: appInput(setup),
        retry: false,
        includeServerMessage: true
      })
      if (
        !prepared?.workspaceId ||
        !['configuring', 'failed', 'degraded'].includes(prepared.status) ||
        (existing && existing.workspaceId !== prepared.workspaceId)
      )
        throw new ClientError('Application setup changed. Refresh settings before continuing.', 409)
      const result = await request(this, `${base}/instance`, {
        method: 'POST',
        retry: false,
        body: {
          workspaceId: prepared.workspaceId,
          name,
          credentials,
          ...(existing ? { id: existing.id } : {}),
          options: { ...(existing?.options || {}), disableToolDefault: true },
          tools: tools.map((tool) => {
            const previous = existing?.tools?.find((item) => item.name === tool.identity.name)
            return {
              ...(previous?.id ? { id: previous.id } : {}),
              name: tool.identity.name,
              label: tool.identity.label,
              schema: tool.schema,
              enabled: input.tools.includes(tool.identity.name),
              disabled: !input.tools.includes(tool.identity.name)
            }
          })
        }
      })
      const toolsetId = required(result?.id, ClientError)
      if (prepared.canDiscardConfiguration)
        await request(this, '/api/plugin-applications/bind-toolset', {
          method: 'POST',
          body: { ...appInput(setup), key: requirement.key, toolsetId },
          retry: false,
          includeServerMessage: true
        })
      return { key: requirement.key, toolsetId }
    },
    async discardApplicationConfiguration(input) {
      const setup = await this.applicationSetup(input)
      if (
        !setup.canConfigure ||
        !setup.canDiscardConfiguration ||
        ['ready', 'initializing'].includes(setup.application.status)
      )
        throw new ClientError('Application setup changed. Refresh settings before continuing.', 409)
      await request(this, '/api/plugin-applications/discard-configuration', {
        method: 'POST',
        body: appInput(setup),
        retry: false,
        includeServerMessage: true
      })
      return this.applicationSetup(input)
    }
  }
}
