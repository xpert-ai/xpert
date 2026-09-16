import { SetMetadata } from '@nestjs/common'
import { MCP_REQUIRED_CONTEXTS } from '@xpert-ai/contracts'
import type { McpResourceDefinition } from '../mcp/resource'
import type { McpResourceTemplateDefinition } from '../mcp/resource-template'
import type { McpPromptDefinition } from '../mcp/prompt'
import type { McpCompletionHandler } from '../mcp/completion'
import type { XpertToolProviderDescriptor, XpertToolProviderInstance } from './types'
import { collectProviderMethods } from './provider-methods'

export type XpertResourceOptions = Omit<McpResourceDefinition, 'read'>
export type XpertResourceTemplateOptions = Omit<McpResourceTemplateDefinition, 'read' | 'complete'> & {
  /** Optional instance method implementing McpCompletionHandler. */
  completionMethod?: string
}
export type XpertPromptOptions = Omit<McpPromptDefinition, 'get' | 'complete'> & {
  completionMethod?: string
}

type McpMethod =
  | { kind: 'resource'; options: Readonly<XpertResourceOptions> }
  | { kind: 'resource-template'; options: Readonly<XpertResourceTemplateOptions> }
  | { kind: 'prompt'; options: Readonly<XpertPromptOptions> }
export type XpertDecoratedMcpDescriptor = McpMethod & { methodName: string }
const MCP_METHOD_METADATA = 'XPERT_MCP_METHOD_METADATA'

/** The decorated method receives ResourceReadContext and returns McpResourceReadResult. */
export const XpertResource = (options: XpertResourceOptions): MethodDecorator =>
  SetMetadata(MCP_METHOD_METADATA, { kind: 'resource', options: Object.freeze({ ...options }) } satisfies McpMethod)

/** The decorated method receives URI arguments and ResourceReadContext. */
export const XpertResourceTemplate = (options: XpertResourceTemplateOptions): MethodDecorator =>
  SetMetadata(MCP_METHOD_METADATA, {
    kind: 'resource-template',
    options: Object.freeze({ ...options })
  } satisfies McpMethod)

/** The decorated method receives prompt arguments and ToolExecutionContext. */
export const XpertPrompt = (options: XpertPromptOptions): MethodDecorator =>
  SetMetadata(MCP_METHOD_METADATA, { kind: 'prompt', options: Object.freeze({ ...options }) } satisfies McpMethod)

export function describeXpertMcpMethods(instance: object): readonly XpertDecoratedMcpDescriptor[] {
  const result: XpertDecoratedMcpDescriptor[] = []
  for (const { methodName, method } of collectProviderMethods(instance)) {
    const metadata = Reflect.getMetadata(MCP_METHOD_METADATA, method) as McpMethod | undefined
    if (!metadata) continue
    const { options } = metadata
    if (!/^[A-Za-z0-9_-]{1,191}$/.test(options.key)) throw new Error(`Invalid MCP capability key '${options.key}'.`)
    const contexts = options.requiredContext ?? []
    if (
      new Set(contexts).size !== contexts.length ||
      contexts.some((context) => !MCP_REQUIRED_CONTEXTS.includes(context))
    ) {
      throw new Error(`MCP capability '${options.key}' declares invalid execution contexts.`)
    }
    if (metadata.kind === 'resource' && !metadata.options.uri?.trim()) {
      throw new Error(`Resource '${options.key}' requires a URI.`)
    }
    if (metadata.kind === 'resource-template' && !metadata.options.uriTemplate?.trim()) {
      throw new Error(`Resource template '${options.key}' requires a URI template.`)
    }
    if (metadata.kind === 'prompt' && !metadata.options.name?.trim()) {
      throw new Error(`Prompt '${options.key}' requires a name.`)
    }
    if (metadata.kind !== 'resource' && metadata.options.completionMethod) {
      callable(instance, metadata.options.completionMethod)
    }
    result.push(Object.freeze({ ...metadata, methodName }))
  }
  return Object.freeze(result)
}

/** One catalog for runtime publication and fingerprinting; legacy declarations remain supported. */
export function resolveXpertMcpExtensions(instance: object, descriptor?: XpertToolProviderDescriptor) {
  const legacy =
    'getMcpExtensions' in instance && typeof instance.getMcpExtensions === 'function'
      ? (instance as XpertToolProviderInstance).getMcpExtensions?.()
      : undefined
  const resources = [...(legacy?.resources ?? [])]
  const resourceTemplates = [...(legacy?.resourceTemplates ?? [])]
  const prompts = [...(legacy?.prompts ?? [])]
  for (const definition of descriptor?.mcpMethods ?? describeXpertMcpMethods(instance)) {
    const method = callable(instance, definition.methodName)
    switch (definition.kind) {
      case 'resource':
        resources.push({ ...definition.options, read: method as McpResourceDefinition['read'] })
        break
      case 'resource-template': {
        const { completionMethod, ...options } = definition.options
        resourceTemplates.push({
          ...options,
          read: method as McpResourceTemplateDefinition['read'],
          ...(completionMethod ? { complete: callable(instance, completionMethod) as McpCompletionHandler } : {})
        })
        break
      }
      case 'prompt': {
        const { completionMethod, ...options } = definition.options
        prompts.push({
          ...options,
          get: method as McpPromptDefinition['get'],
          ...(completionMethod ? { complete: callable(instance, completionMethod) as McpCompletionHandler } : {})
        })
        break
      }
    }
  }
  assertUnique(resources, (item) => item.key, 'resource key')
  assertUnique(resources, (item) => item.uri, 'resource URI')
  assertUnique(resourceTemplates, (item) => item.key, 'resource template key')
  assertUnique(resourceTemplates, (item) => item.uriTemplate, 'resource template URI')
  assertUnique(prompts, (item) => item.key, 'prompt key')
  assertUnique(prompts, (item) => item.name, 'prompt name')
  return { resources, resourceTemplates, prompts }
}

function callable(instance: object, name: string) {
  // Match discovery semantics: accessors and non-method overrides are not executable handlers.
  const method = collectProviderMethods(instance).find((item) => item.methodName === name)?.method
  if (typeof method !== 'function') throw new Error(`MCP method '${name}' is not callable.`)
  return method.bind(instance) as (...args: never[]) => unknown
}

function assertUnique<T>(items: readonly T[], key: (item: T) => string, label: string) {
  const seen = new Set<string>()
  for (const item of items) {
    const value = key(item)
    if (seen.has(value)) throw new Error(`MCP ${label} '${value}' is declared more than once.`)
    seen.add(value)
  }
}
