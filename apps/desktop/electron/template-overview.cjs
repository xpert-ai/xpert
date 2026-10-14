// Only declared catalog content crosses IPC; installed memories, bindings and raw DSL stay in the host.
exports.projectTemplateOverview = (value, ClientError) => {
  const fail = () => {
    throw new ClientError('Invalid template overview response.', 502)
  }
  const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : fail())
  const text = (value) => (typeof value === 'string' && value.length <= 262144 ? value : fail())
  const optional = (value) => (value === undefined ? undefined : text(value))
  const list = (value) => (Array.isArray(value) && value.length <= 1000 ? value : fail())
  const strings = (value) => list(value).map(text)
  const bool = (value) => (typeof value === 'boolean' ? value : fail())
  const choice = (value, options) => (options.includes(value) ? value : fail())
  object(value)
  return {
    id: text(value.id),
    title: text(value.title),
    description: text(value.description),
    publisher: text(value.publisher),
    version: optional(value.version),
    instructions: text(value.instructions),
    memories: list(value.memories).map((entry) => {
      object(entry)
      return { title: text(entry.title), content: optional(entry.content) }
    }),
    skills: list(value.skills).map((entry) => {
      object(entry)
      return {
        pluginName: text(entry.pluginName),
        componentKey: text(entry.componentKey),
        targetAgentKey: optional(entry.targetAgentKey)
      }
    }),
    agents: list(value.agents).map((entry) => {
      object(entry)
      return {
        key: text(entry.key),
        label: text(entry.label),
        middleware: list(entry.middleware).map((item) => {
          object(item)
          return { provider: text(item.provider), toolNames: strings(item.toolNames) }
        })
      }
    }),
    ...(value.onboarding === undefined
      ? {}
      : {
          onboarding: (() => {
            const entry = object(value.onboarding)
            return {
              skill: text(entry.skill),
              required: bool(entry.required),
              preferences: strings(entry.preferences),
              completionCriteria: text(entry.completionCriteria)
            }
          })()
        }),
    routines: list(value.routines).map((entry) => {
      object(entry)
      return {
        key: text(entry.key),
        required: bool(entry.required),
        trigger: choice(entry.trigger, ['schedule', 'event']),
        expression: text(entry.expression),
        timezone: choice(entry.timezone, ['user', 'organization']),
        skill: text(entry.skill),
        output: text(entry.output),
        enabled: choice(entry.enabled, [false])
      }
    }),
    integrations: list(value.integrations).map((entry) => {
      object(entry)
      return {
        key: text(entry.key),
        kind: choice(entry.kind, ['connector', 'mcp', 'app', 'toolset']),
        label: text(entry.label),
        description: text(entry.description),
        required: bool(entry.required),
        permissions: strings(entry.permissions)
      }
    }),
    ...(value.files === undefined
      ? {}
      : {
          files: {
            scope: choice(object(value.files).scope, ['user', 'shared']),
            paths: strings(value.files.paths)
          }
        }),
    ...(value.operationPolicy === undefined
      ? {}
      : {
          operationPolicy: {
            default: choice(object(value.operationPolicy).default, ['allow', 'approve', 'deny']),
            rules: list(value.operationPolicy.rules).map((entry) => {
              object(entry)
              return {
                tool: text(entry.tool),
                decision: choice(entry.decision, ['allow', 'approve', 'deny']),
                reason: optional(entry.reason)
              }
            })
          }
        }),
    ...(value.application === undefined
      ? {}
      : {
          application: {
            appName: text(object(value.application).appName),
            pluginName: text(value.application.pluginName)
          }
        })
  }
}
