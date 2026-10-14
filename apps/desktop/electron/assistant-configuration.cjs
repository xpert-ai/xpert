// Configuration writes always use the platform's workspace-authoring check and current organization.
const { modelOptions } = require('./model-options.cjs')
function createAssistantConfigurationMethods(ClientError) {
  function assistant(service, input) {
    const bot = service.bots.find((bot) => bot.id === input?.botId)
    if (!service.profile?.organizationId || !bot)
      throw new ClientError('Select a Bot in the current workspace first.', 403)
    return bot.assistantId || bot.id
  }
  function capabilities(value) {
    if (
      !Array.isArray(value) ||
      value.length > 32 ||
      value.some((key) => typeof key !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(key))
    )
      throw new ClientError('Invalid assistant settings.')
    return [...new Set(value)]
  }
  const conflictMessage =
    'This assistant was changed in Xpert. Reload its settings or review the workflow in Xpert before editing.'
  return {
    async templatePublicationPreview(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/publication`, {
        scope: 'organization',
        method: 'GET',
        retry: false,
        timeout: 180000,
        body: undefined
      })
    },
    async templateUpgradePreview(input) {
      const id = assistant(this, input)
      const query = input.targetTemplateId
        ? `?${new URLSearchParams({ targetTemplateId: String(input.targetTemplateId) })}`
        : ''
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/upgrade${query}`, {
        scope: 'organization',
        method: 'GET',
        retry: false,
        timeout: 180000,
        body: undefined
      })
    },
    async templateUpgradeSources(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/upgrade/sources`, {
        scope: 'organization',
        method: 'GET',
        retry: false,
        timeout: 180000
      })
    },
    async publishAssistantTemplate(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/publication`, {
        scope: 'organization',
        method: 'POST',
        retry: false,
        timeout: 180000,
        body: input.input
      })
    },
    async revokeAssistantTemplate(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/publication`, {
        scope: 'organization',
        method: 'DELETE',
        retry: false,
        timeout: 180000,
        body: undefined
      })
    },
    async applyTemplateUpgrade(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/upgrade`, {
        scope: 'organization',
        method: 'POST',
        retry: false,
        timeout: 180000,
        body: input.input
      })
    },
    async resumeTemplateUpgrade(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/upgrade/resume`, {
        scope: 'organization',
        method: 'POST',
        retry: false,
        timeout: 180000,
        body: { operationId: input.operationId }
      })
    },
    async rollbackTemplateUpgrade(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-lifecycle/upgrade/rollback`, {
        scope: 'organization',
        method: 'POST',
        retry: false,
        timeout: 180000,
        body: { operationId: input.operationId }
      })
    },
    async templateActivity(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-setup/activity`, { scope: 'organization' })
    },
    async readTemplateActivity(input) {
      const id = assistant(this, input)
      if (
        !Array.isArray(input.keys) ||
        input.keys.length > 50 ||
        input.keys.some((key) => typeof key !== 'string' || key.length > 80)
      )
        throw new ClientError('Invalid assistant settings.')
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-setup/activity/read`, {
        scope: 'organization',
        method: 'PUT',
        retry: false,
        body: { keys: input.keys }
      })
    },
    async assistantTemplateSetup(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-setup`, { scope: 'organization' })
    },
    async updateAssistantTemplateSetup(input) {
      const id = assistant(this, input)
      return this.request(`/api/xpert/${encodeURIComponent(id)}/template-setup`, {
        scope: 'organization',
        method: 'PUT',
        retry: false,
        body: input.update
      })
    },
    async updateAssistantTemplateRoutine(input) {
      const id = assistant(this, input)
      if (typeof input.key !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(input.key))
        throw new ClientError('Invalid assistant settings.')
      return this.request(
        `/api/xpert/${encodeURIComponent(id)}/template-setup/routines/${encodeURIComponent(input.key)}`,
        {
          scope: 'organization',
          method: 'PUT',
          retry: false,
          body: input.update
        }
      )
    },
    async assistantConfiguration(input) {
      const id = assistant(this, input)
      const query =
        input.capabilities === undefined
          ? ''
          : `?capabilities=${encodeURIComponent(capabilities(input.capabilities).join(','))}`
      let result
      try {
        result = await this.request(`/api/xpert/${encodeURIComponent(id)}/configuration${query}`, {
          scope: 'organization'
        })
      } catch (error) {
        if (error.status === 403) return { canEdit: false }
        if (error.status === 409) throw new ClientError(conflictMessage, 409)
        throw error
      }
      if (
        typeof result?.revision !== 'string' ||
        typeof result.prompt !== 'string' ||
        !result.setup ||
        !Array.isArray(result.setup.models)
      )
        throw new ClientError('Invalid service response. Check the API URL.', 502)
      return {
        canEdit: true,
        revision: result.revision,
        workspace: result.workspace,
        prompt: result.prompt,
        capabilities: capabilities(result.capabilities),
        modelId: result.modelId,
        realtimeVoice: result.realtimeVoice,
        preflight: {
          canInstall: result.setup.canInstall === true,
          reason: result.setup.reason || '',
          requiresModel: true,
          optionalCapabilities: result.setup.optionalCapabilities,
          defaultModelId: result.setup.defaultModelId,
          realtimeModels: result.setup.realtimeModels?.map(({ voices, defaultVoice, ...model }) => ({
            ...modelOptions([model], this.config?.locale, ClientError)[0],
            voices,
            defaultVoice
          })),
          models: modelOptions(result.setup.models, this.config?.locale, ClientError)
        }
      }
    },
    async saveAssistantConfiguration(input) {
      const id = assistant(this, input)
      if (
        typeof input.revision !== 'string' ||
        !/^[a-f0-9]{64}$/.test(input.revision) ||
        typeof input.prompt !== 'string' ||
        input.prompt.length > 32000 ||
        typeof input.modelId !== 'string' ||
        !input.modelId ||
        input.modelId.length > 1000
      )
        throw new ClientError('Invalid assistant settings.')
      try {
        await this.request(`/api/xpert/${encodeURIComponent(id)}/configuration`, {
          method: 'POST',
          scope: 'organization',
          retry: false,
          timeout: 180000,
          body: {
            revision: input.revision,
            prompt: input.prompt,
            modelId: input.modelId,
            realtimeVoice: input.realtimeVoice,
            capabilities: capabilities(input.capabilities)
          }
        })
      } catch (error) {
        if (error.status === 409) throw new ClientError(conflictMessage, 409)
        if (error.status === 422)
          throw new ClientError(
            'The settings were saved as a draft but could not be published. Check the draft in Xpert before retrying.',
            422
          )
        if (error.status === 503)
          throw new ClientError(
            'The save result is not confirmed yet. Reload the saved settings or check Xpert before retrying.',
            503
          )
        throw error
      }
      return { botId: input.botId }
    }
  }
}
module.exports = { createAssistantConfigurationMethods }
