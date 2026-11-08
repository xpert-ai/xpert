const command = 'artifact.use-grants.manage'
const actions = new Set([
  'group-grant-targets',
  'group-grants',
  'group-grant-offer',
  'group-grant-revoke',
  'group-grant-analysis-options'
])
const uuid = (value) => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)

/** The host owns login credentials. The remote receives only the domain response. */
function createArtifactGrantMethods(ClientError) {
  return {
    async manageArtifactGrant({ botId, hostId, viewKey, payload } = {}) {
      const bot = this.bots.find((item) => item.id === botId)
      if (!bot || (bot.assistantId || bot.id) !== hostId) throw new ClientError('Unsupported operation.', 403)
      if (
        !uuid(hostId) ||
        typeof viewKey !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,200}$/.test(viewKey) ||
        !payload ||
        Object.keys(payload).some((key) => !['actionKey', 'input'].includes(key)) ||
        !actions.has(payload.actionKey) ||
        !uuid(payload.input?.artifactId)
      )
        throw new ClientError('Unsupported operation.', 400)
      const generation = this.generation
      const current = () => {
        if (generation !== this.generation) throw new ClientError('The workspace changed. Please retry.', 409)
      }
      const artifact = await this.request(`/api/artifacts/${payload.input.artifactId}`)
      current()
      if (!uuid(artifact?.projectId)) throw new ClientError('Unsupported operation.', 403)
      const viewProjectId = artifact.projectId
      const view = `/api/view-hosts/agent/${hostId}/views/${encodeURIComponent(viewKey)}`
      const manifest = await this.request(`${view}/manifest`, { viewProjectId })
      current()
      if (
        manifest?.key !== viewKey ||
        manifest.visible === false ||
        manifest.source?.plugin !== artifact.pluginName ||
        !manifest.clientCommands?.some((item) => item.key === command) ||
        !manifest.actions?.some((item) => item.key === payload.actionKey)
      )
        throw new ClientError('Unsupported operation.', 403)
      // The server resolves the exact Assistant/Project and checks source management again.
      const result = await this.request(`${view}/actions/${payload.actionKey}`, {
        method: 'POST',
        viewProjectId,
        body: { input: payload.input }
      })
      current()
      return result
    }
  }
}
module.exports = { createArtifactGrantMethods }
