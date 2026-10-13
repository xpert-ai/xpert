// Explicit public projection: template contents and runtime filesystem locations stay in the host.
exports.projectTemplateReadiness = (value, ClientError) => {
  if (value === undefined) return undefined
  const fail = () => {
    throw new ClientError('Invalid template requirements response.', 502)
  }
  const string = (value) => (typeof value === 'string' && value.length <= 1000 ? value : fail())
  const array = (value) => (Array.isArray(value) && value.length <= 1000 ? value : fail())
  if (!value || typeof value.canInstall !== 'boolean' || typeof value.legacy !== 'boolean') fail()
  return {
    legacy: value.legacy,
    canInstall: value.canInstall,
    manifestVersion: value.manifestVersion === undefined ? undefined : string(value.manifestVersion),
    ...(value.capabilities
      ? {
          capabilities: {
            agents: array(value.capabilities.agents).map((agent) => ({
              key: string(agent.key),
              label: string(agent.label),
              middleware: array(agent.middleware).map((item) => ({
                provider: string(item.provider),
                toolNames: array(item.toolNames).map(string)
              }))
            })),
            skills: array(value.capabilities.skills).map((item) => ({
              pluginName: string(item.pluginName),
              componentKey: string(item.componentKey),
              ...(item.targetAgentKey === undefined ? {} : { targetAgentKey: string(item.targetAgentKey) })
            })),
            seedMemoryCount:
              Number.isSafeInteger(value.capabilities.seedMemoryCount) && value.capabilities.seedMemoryCount >= 0
                ? value.capabilities.seedMemoryCount
                : fail(),
            sandbox: typeof value.capabilities.sandbox === 'boolean' ? value.capabilities.sandbox : fail()
          }
        }
      : {}),
    checks: array(value.checks).map((item) => {
      if (
        !item ||
        ![
          'manifest',
          'memory',
          'skills',
          'files',
          'onboarding',
          'connectors',
          'routines',
          'execution',
          'plugin',
          'resource'
        ].includes(item.kind) ||
        !['ready', 'unsupported', 'missing', 'incompatible', 'pending-configuration'].includes(item.status) ||
        typeof item.required !== 'boolean'
      )
        fail()
      return {
        kind: item.kind,
        key: string(item.key),
        status: item.status,
        required: item.required,
        message: string(item.message),
        pluginName: item.pluginName === undefined ? undefined : string(item.pluginName),
        version: item.version === undefined ? undefined : string(item.version)
      }
    }),
    dependencies: array(value.dependencies).map((item) => ({
      pluginName: string(item.pluginName),
      version: string(item.version),
      ...(item.providers
        ? {
            providers: array(item.providers).map((provider) => ({
              kind: ['middleware', 'sandbox', 'toolset'].includes(provider.kind) ? provider.kind : fail(),
              key: string(provider.key)
            }))
          }
        : {}),
      components: array(item.components).map((component) => ({
        type: string(component.type),
        key: string(component.key),
        hash: string(component.hash)
      }))
    })),
    ...(value.files
      ? {
          files: {
            scope: ['shared', 'user'].includes(value.files.scope) ? value.files.scope : fail(),
            entries: array(value.files.entries).map((entry) => ({
              kind: ['file', 'directory', 'ledger'].includes(entry.kind) ? entry.kind : fail(),
              path: string(entry.path),
              version: entry.version === undefined ? undefined : string(entry.version)
            }))
          }
        }
      : {})
  }
}
