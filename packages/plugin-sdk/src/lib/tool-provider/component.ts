import { PLUGIN_COMPONENT_TYPE, type IPluginComponentDefinition } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { describeXpertToolProvider } from './descriptor'
import { resolveXpertMcpExtensions } from './mcp-methods'

export function runtimeToolProviderComponent(provider: object): IPluginComponentDefinition {
  const descriptor = describeXpertToolProvider(provider)
  const options = descriptor.options
  const extensions = resolveXpertMcpExtensions(provider, descriptor)
  // Fingerprint declarations only; never execute resource, prompt or completion handlers.
  const capabilities = {
    ...(extensions?.resources?.length
      ? {
          resources: extensions.resources.map(({ read, ...definition }) => definition)
        }
      : {}),
    ...(extensions?.resourceTemplates?.length
      ? {
          resourceTemplates: extensions.resourceTemplates.map(({ read, complete, ...definition }) => ({
            ...definition,
            supportsCompletion: !!complete
          }))
        }
      : {}),
    ...(extensions?.prompts?.length
      ? {
          prompts: extensions.prompts.map(({ get, complete, ...definition }) => ({
            ...definition,
            hasCompletionHandler: !!complete
          }))
        }
      : {})
  }
  const tools = descriptor.tools.map((tool) => ({
    name: tool.options.name,
    title: tool.options.title ?? null,
    description: tool.options.description,
    middleware: tool.middlewareProvider ?? null,
    mcp: tool.options.mcp
      ? {
          ...(tool.options.mcp.inputSchema
            ? {
                transportInputSchema: JSON.parse(JSON.stringify(zodToJsonSchema(tool.options.mcp.inputSchema)))
              }
            : {}),
          ...(tool.options.mcp.task ? { task: tool.options.mcp.task } : {}),
          behavior: tool.options.mcp.behavior,
          requiredContext: [...tool.options.mcp.requiredContext],
          visibility: [...(tool.options.mcp.visibility ?? ['model'])],
          inputSchema: JSON.parse(JSON.stringify(zodToJsonSchema(tool.options.inputSchema))),
          outputSchema: tool.options.outputSchema
            ? JSON.parse(JSON.stringify(zodToJsonSchema(tool.options.outputSchema)))
            : null
        }
      : null
  }))
  const config = {
    provider: options.provider,
    name: options.name,
    description: options.description ?? null,
    instructions: options.instructions ?? null,
    runtimeDiscovered: true,
    nativeMcp: true,
    toolCount: tools.filter((tool) => !!tool.mcp).length
  }
  const metadata = {
    runtimeDiscovered: true,
    nativeMcp: true,
    toolNames: tools.filter((tool) => !!tool.mcp).map((tool) => tool.name)
  }
  return {
    componentType: PLUGIN_COMPONENT_TYPE.TOOLSET,
    componentKey: options.componentKey,
    config,
    metadata,
    definitionHash: createHash('sha256')
      .update(stableJson({ config, metadata, tools, ...capabilities }))
      .digest('hex')
  }
}

function stableJson(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
}
