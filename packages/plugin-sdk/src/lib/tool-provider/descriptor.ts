import type { ZodTypeAny } from 'zod/v3'
import {
  MCP_CAPABILITY_VISIBILITIES,
  MCP_REQUIRED_CONTEXTS,
  MCP_TOOL_IDEMPOTENCY,
  MCP_TOOL_RISKS,
  MCP_TOOL_SIDE_EFFECTS
} from '@xpert-ai/contracts'
import { XPERT_TOOL_METHOD_METADATA, XPERT_TOOL_PROVIDER_METADATA } from './decorators'
import type {
  XpertDecoratedToolDescriptor,
  XpertToolOptions,
  XpertToolProviderDescriptor,
  XpertToolProviderOptions
} from './types'

const PROVIDER_PATTERN = /^[a-z][a-z0-9_]*$/
const MIDDLEWARE_PROVIDER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/
const COMPONENT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SLUG_PATTERN = COMPONENT_KEY_PATTERN
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]+$/

export function describeXpertToolProvider(instance: object): XpertToolProviderDescriptor {
  const target = instance.constructor
  const options = Reflect.getMetadata(XPERT_TOOL_PROVIDER_METADATA, target) as XpertToolProviderOptions | undefined
  if (!options) {
    throw new Error(`Provider '${target.name}' is missing @XpertToolProvider metadata.`)
  }
  validateProviderOptions(options)

  const methods = collectDecoratedMethods(instance)
  const names = new Set<string>()
  const middlewareProviders = new Set((options.middlewares ?? []).map(({ provider }) => provider))
  const appKeys = new Set((options.apps ?? []).map(({ key }) => key))
  const tools = methods.map(({ methodName, options: toolOptions }) => {
    validateToolOptions(toolOptions, methodName)
    if (names.has(toolOptions.name)) {
      throw new Error(`Tool '${toolOptions.name}' is declared more than once by provider '${options.provider}'.`)
    }
    names.add(toolOptions.name)
    const middlewareProvider = resolveMiddlewareProvider(toolOptions, options)
    if (!middlewareProvider && !toolOptions.mcp) {
      throw new Error(`Tool '${toolOptions.name}' is not exposed through Middleware or MCP.`)
    }
    if (middlewareProvider && !middlewareProviders.has(middlewareProvider)) {
      throw new Error(`Tool '${toolOptions.name}' references undeclared Middleware provider '${middlewareProvider}'.`)
    }
    const appKey = toolOptions.mcp && toolOptions.mcp.app?.resourceKey
    if (appKey && !appKeys.has(appKey)) {
      throw new Error(`MCP Tool '${toolOptions.name}' references undeclared App '${appKey}'.`)
    }
    return Object.freeze({ methodName, middlewareProvider, options: toolOptions })
  })
  if (!tools.length) {
    throw new Error(`Provider '${options.provider}' does not declare any @XpertTool methods.`)
  }

  return Object.freeze({
    options: Object.freeze({ ...options }),
    tools: Object.freeze(tools)
  })
}

function collectDecoratedMethods(instance: object) {
  const result: Array<{ methodName: string; options: Readonly<XpertToolOptions> }> = []
  const seen = new Set<string>()
  let prototype: object | null = Object.getPrototypeOf(instance)
  while (prototype && prototype !== Object.prototype) {
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      if (methodName === 'constructor' || seen.has(methodName)) continue
      seen.add(methodName)
      const method = Reflect.get(prototype, methodName)
      if (typeof method !== 'function') continue
      const options = Reflect.getMetadata(XPERT_TOOL_METHOD_METADATA, method) as XpertToolOptions | undefined
      if (options) result.push({ methodName, options })
    }
    prototype = Object.getPrototypeOf(prototype)
  }
  return result
}

function validateProviderOptions(options: XpertToolProviderOptions) {
  if (!PROVIDER_PATTERN.test(options.provider)) {
    throw new Error(`Xpert Tool provider '${options.provider}' must use lowercase snake_case.`)
  }
  if (!COMPONENT_KEY_PATTERN.test(options.componentKey)) {
    throw new Error(`Xpert Tool component key '${options.componentKey}' must use lowercase kebab-case.`)
  }
  if (!options.name?.trim()) throw new Error(`Xpert Tool provider '${options.provider}' requires a name.`)
  if (options.slug && !SLUG_PATTERN.test(options.slug)) {
    throw new Error(`Xpert Tool provider slug '${options.slug}' must use lowercase kebab-case.`)
  }
  const middlewareProviders = new Set<string>()
  for (const definition of options.middlewares ?? []) {
    if (!MIDDLEWARE_PROVIDER_PATTERN.test(definition.provider)) {
      throw new Error(`Middleware provider '${definition.provider}' must be a stable identifier.`)
    }
    if (middlewareProviders.has(definition.provider)) {
      throw new Error(`Middleware provider '${definition.provider}' is declared more than once.`)
    }
    if (definition.meta.name !== definition.provider) {
      throw new Error(`Middleware metadata name must match provider '${definition.provider}'.`)
    }
    middlewareProviders.add(definition.provider)
  }
  if (options.defaultMiddleware && !middlewareProviders.has(options.defaultMiddleware)) {
    throw new Error(`Default Middleware provider '${options.defaultMiddleware}' is not declared.`)
  }
  const appKeys = new Set<string>()
  for (const app of options.apps ?? []) {
    if (!TOOL_NAME_PATTERN.test(app.key) || app.key.length > 191) {
      throw new Error(`MCP App key '${app.key}' is invalid.`)
    }
    if (appKeys.has(app.key)) {
      throw new Error(`MCP App '${app.key}' is declared more than once.`)
    }
    if (!isRelativeHtmlEntry(app.entry)) {
      throw new Error(`MCP App '${app.key}' entry must be a relative HTML path inside the plugin bundle.`)
    }
    appKeys.add(app.key)
  }
}

function validateToolOptions(options: Readonly<XpertToolOptions>, methodName: string) {
  if (!TOOL_NAME_PATTERN.test(options.name) || options.name.length > 191) {
    throw new Error(`Method '${methodName}' declares invalid Tool name '${options.name}'.`)
  }
  if (!options.description?.trim()) throw new Error(`Tool '${options.name}' requires a description.`)
  assertStrictObjectSchema(options.inputSchema, options.name, 'input')
  if (options.mcp && !options.outputSchema) {
    throw new Error(`MCP Tool '${options.name}' requires an outputSchema.`)
  }
  if (options.mcp && options.outputSchema) {
    assertStrictObjectSchema(options.outputSchema, options.name, 'output')
  }
  if (options.mcp && !options.mcp.requiredContext.length) {
    throw new Error(`MCP Tool '${options.name}' requires at least one execution context.`)
  }
  if (options.mcp) {
    const behavior = options.mcp.behavior
    if (
      !includesValue(MCP_TOOL_RISKS, behavior?.risk) ||
      !includesValue(MCP_TOOL_SIDE_EFFECTS, behavior?.sideEffect) ||
      !includesValue(MCP_TOOL_IDEMPOTENCY, behavior?.idempotency)
    ) {
      throw new Error(`MCP Tool '${options.name}' requires valid behavior annotations.`)
    }
    const contexts = new Set(options.mcp.requiredContext)
    if (
      contexts.size !== options.mcp.requiredContext.length ||
      [...contexts].some((context) => !includesValue(MCP_REQUIRED_CONTEXTS, context))
    ) {
      throw new Error(`MCP Tool '${options.name}' declares invalid or duplicate execution context requirements.`)
    }
    if (
      options.mcp.visibility &&
      (!options.mcp.visibility.length ||
        new Set(options.mcp.visibility).size !== options.mcp.visibility.length ||
        options.mcp.visibility.some((visibility) => !includesValue(MCP_CAPABILITY_VISIBILITIES, visibility)))
    ) {
      throw new Error(`MCP Tool '${options.name}' declares invalid visibility.`)
    }
    if (options.mcp.app && options.mcp.visibility && !options.mcp.visibility.includes('app')) {
      throw new Error(`MCP Tool '${options.name}' with an App binding must include app visibility.`)
    }
  }
}

function isRelativeHtmlEntry(entry: string) {
  if (!entry || !entry.endsWith('.html') || entry.startsWith('/') || entry.includes('\\')) return false
  return entry.split('/').every((segment) => segment !== '.' && segment !== '..' && segment.length > 0)
}

function assertStrictObjectSchema(schema: ZodTypeAny, toolName: string, role: 'input' | 'output') {
  if (!schema || typeof Reflect.get(schema, 'parseAsync') !== 'function') {
    throw new Error(`Tool '${toolName}' requires a Zod ${role} schema.`)
  }
  const definition = Reflect.get(schema, '_def')
  if (!definition || Reflect.get(definition, 'unknownKeys') !== 'strict') {
    throw new Error(`Tool '${toolName}' ${role} schema must be a strict Zod object.`)
  }
}

function resolveMiddlewareProvider(tool: Readonly<XpertToolOptions>, provider: Readonly<XpertToolProviderOptions>) {
  if (tool.middleware === false) return undefined
  if (typeof tool.middleware === 'string') return tool.middleware
  if (tool.middleware === true || tool.middleware === undefined) return provider.defaultMiddleware
  return undefined
}

export function getXpertToolMethod(
  instance: object,
  descriptor: XpertDecoratedToolDescriptor
): (input: unknown, context: unknown) => unknown {
  const method = Reflect.get(instance, descriptor.methodName)
  if (typeof method !== 'function') {
    throw new Error(`Decorated Tool method '${descriptor.methodName}' is not callable.`)
  }
  return method.bind(instance) as (input: unknown, context: unknown) => unknown
}

function includesValue(values: readonly string[], value: unknown) {
  return values.some((candidate) => candidate === value)
}
