import { ToolMessage } from '@langchain/core/messages'
import { JSONValue, PLUGIN_COMPONENT_TYPE, TAgentMiddlewareMeta, TSandboxConfigurable } from '@xpert-ai/contracts'
import {
    collectPluginBundleComponents,
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    readPluginBundleManifest,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS,
    GLOBAL_ORGANIZATION_SCOPE,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    SandboxBackendProtocol,
    SYSTEM_GLOBAL_SCOPE,
    resolveTenantGlobalScopeKey,
    resolveSandboxBackend
} from '@xpert-ai/plugin-sdk'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

export const PLUGIN_HOOKS_MIDDLEWARE_NAME = 'pluginHooksMiddleware'

type HookRef = {
    pluginName: string
    componentKey: string
    events?: string[]
}

type PluginHooksMiddlewareOptions = {
    hooks?: HookRef[]
}

type RuntimeHookCommand = {
    pluginName: string
    componentKey: string
    event: string
    matcher: string
    command: string
    pluginRoot: string
    pluginData: string
}

type HookExecutionContext = {
    phase: string
    toolName?: string
    runtime?: unknown
}

@Injectable()
@AgentMiddlewareStrategy(PLUGIN_HOOKS_MIDDLEWARE_NAME)
export class PluginHooksMiddleware implements IAgentMiddlewareStrategy<PluginHooksMiddlewareOptions> {
    readonly #logger = new Logger(PluginHooksMiddleware.name)

    readonly meta: TAgentMiddlewareMeta = {
        name: PLUGIN_HOOKS_MIDDLEWARE_NAME,
        label: {
            en_US: 'Plugin Hooks',
            zh_Hans: '插件 Hooks'
        },
        icon: {
            type: 'svg',
            value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M7 2h2v4H7V2Zm8 0h2v4h-2V2ZM6 8h12v2h2v4h-2v2a6 6 0 0 1-12 0v-2H4v-4h2V8Zm2 2v6a4 4 0 0 0 8 0v-6H8Zm3 10h2v2h-2v-2Z"/></svg>'
        },
        description: {
            en_US: 'Runs plugin-provided lifecycle and tool-use hooks for this agent.',
            zh_Hans: '为当前智能体运行插件提供的生命周期和工具调用 Hooks。'
        },
        features: ['sandbox'],
        configSchema: {
            type: 'object',
            properties: {
                hooks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            pluginName: { type: 'string' },
                            componentKey: { type: 'string' },
                            events: { type: 'array', items: { type: 'string' } }
                        }
                    }
                }
            }
        }
    }

    constructor(
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {}

    async createMiddleware(
        options: PluginHooksMiddlewareOptions,
        context: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        const { commands, blocked } = await this.resolveCommands(options, context)

        return {
            name: PLUGIN_HOOKS_MIDDLEWARE_NAME,
            beforeAgent: async (_state, runtime) => {
                await this.emitBlocked(blocked, context, 'SessionStart')
                await this.runMatchingCommands(commands, context, {
                    phase: 'SessionStart',
                    runtime
                })
            },
            wrapToolCall: async (request, handler) => {
                const toolName = request.toolCall.name
                await this.emitBlocked(blocked, context, 'PreToolUse')
                const preToolAllowed = await this.runMatchingCommands(commands, context, {
                    phase: 'PreToolUse',
                    toolName,
                    runtime: request.runtime
                })
                if (!preToolAllowed) {
                    return new ToolMessage({
                        name: toolName,
                        content: `Plugin hook blocked tool call '${toolName}'.`,
                        tool_call_id: request.toolCall.id ?? ''
                    })
                }

                const result = await handler(request)
                await this.runMatchingCommands(commands, context, {
                    phase: 'PostToolUse',
                    toolName,
                    runtime: request.runtime
                })
                return result
            }
        }
    }

    private async resolveCommands(options: PluginHooksMiddlewareOptions, context: IAgentMiddlewareContext) {
        const hookRefs = (options?.hooks ?? []).filter(isHookRef)
        const commands: RuntimeHookCommand[] = []
        const blocked: HookRef[] = []

        for (const hookRef of hookRefs) {
            const pluginRoot = this.resolveLoadedPluginRoot(hookRef.pluginName, context)
            if (!pluginRoot) {
                blocked.push(hookRef)
                continue
            }

            const component = this.findHookComponent(hookRef, pluginRoot)
            if (!component) {
                blocked.push(hookRef)
                continue
            }
            const pluginData = await this.ensurePluginDataDir(context, hookRef)
            commands.push(...this.parseHookCommands(component.config, hookRef, pluginRoot, pluginData))
        }

        return { commands, blocked }
    }

    private findHookComponent(hookRef: HookRef, pluginRoot: string) {
        const manifestResult = readPluginBundleManifest(pluginRoot)
        if (!manifestResult) {
            return null
        }
        return (
            collectPluginBundleComponents(pluginRoot, manifestResult.manifest).find(
                (component) =>
                    component.componentType === PLUGIN_COMPONENT_TYPE.HOOK &&
                    component.componentKey === hookRef.componentKey
            ) ?? null
        )
    }

    private parseHookCommands(
        config: JSONValue | null | undefined,
        hookRef: HookRef,
        pluginRoot: string,
        pluginData: string
    ) {
        if (!isObjectValue(config)) {
            return []
        }
        const hooksRoot = isObjectValue(Reflect.get(config, 'hooks')) ? Reflect.get(config, 'hooks') : config
        if (!isObjectValue(hooksRoot)) {
            return []
        }

        const enabledEvents = new Set((hookRef.events ?? []).filter((event) => !!event.trim()))
        const commands: RuntimeHookCommand[] = []
        for (const [event, entries] of Object.entries(hooksRoot)) {
            if (enabledEvents.size && !enabledEvents.has(event)) {
                continue
            }
            if (!Array.isArray(entries)) {
                continue
            }
            for (const entry of entries) {
                if (!isObjectValue(entry)) {
                    continue
                }
                const matcher = readStringField(entry, 'matcher') ?? '*'
                const hookCommands = Reflect.get(entry, 'hooks')
                if (!Array.isArray(hookCommands)) {
                    continue
                }
                for (const hookCommand of hookCommands) {
                    if (!isObjectValue(hookCommand) || readStringField(hookCommand, 'type') !== 'command') {
                        continue
                    }
                    const command = readStringField(hookCommand, 'command')
                    if (!command) {
                        continue
                    }
                    commands.push({
                        pluginName: normalizePluginName(hookRef.pluginName),
                        componentKey: hookRef.componentKey,
                        event,
                        matcher,
                        command,
                        pluginRoot,
                        pluginData
                    })
                }
            }
        }
        return commands
    }

    private async runMatchingCommands(
        commands: RuntimeHookCommand[],
        context: IAgentMiddlewareContext,
        execution: HookExecutionContext
    ) {
        const matching = commands.filter(
            (command) => command.event === execution.phase && this.matches(command, execution.toolName)
        )
        for (const command of matching) {
            const ok = await this.executeCommand(command, context, execution)
            if (!ok && execution.phase === 'PreToolUse') {
                return false
            }
        }
        return true
    }

    private async executeCommand(
        command: RuntimeHookCommand,
        context: IAgentMiddlewareContext,
        execution: HookExecutionContext
    ) {
        const backend = resolveSandboxBackend(readSandboxConfig(execution.runtime))
        if (!backend) {
            await context.runtime.emitMiddlewareEvent?.({
                middlewareName: PLUGIN_HOOKS_MIDDLEWARE_NAME,
                title: 'Plugin hook blocked',
                phase: execution.phase,
                status: 'fail',
                message: 'Sandbox backend is not available for plugin hook execution.',
                data: {
                    pluginName: command.pluginName,
                    componentKey: command.componentKey
                }
            })
            return false
        }

        const shellCommand = this.buildShellCommand(command)
        await context.runtime.emitMiddlewareEvent?.({
            middlewareName: PLUGIN_HOOKS_MIDDLEWARE_NAME,
            title: 'Plugin hook',
            phase: execution.phase,
            status: 'running',
            data: {
                pluginName: command.pluginName,
                componentKey: command.componentKey,
                command: command.command
            }
        })
        const result = await this.executeInSandbox(backend, shellCommand)
        const ok = result.exitCode === 0
        await context.runtime.emitMiddlewareEvent?.({
            middlewareName: PLUGIN_HOOKS_MIDDLEWARE_NAME,
            title: 'Plugin hook',
            phase: execution.phase,
            status: ok ? 'success' : 'fail',
            message: ok ? undefined : result.output,
            data: {
                pluginName: command.pluginName,
                componentKey: command.componentKey,
                output: result.output
            }
        })
        return ok
    }

    private async executeInSandbox(backend: SandboxBackendProtocol, shellCommand: string) {
        try {
            return await backend.execute(shellCommand, DEFAULT_SANDBOX_SHELL_EXECUTION_OPTIONS)
        } catch (error) {
            return {
                exitCode: 1,
                output: error instanceof Error ? error.message : String(error)
            }
        }
    }

    private buildShellCommand(command: RuntimeHookCommand) {
        const pluginRoot = shellQuote(command.pluginRoot)
        const pluginData = shellQuote(command.pluginData)
        const expandedCommand = command.command
            .replace(/\$\{PLUGIN_ROOT\}|\$PLUGIN_ROOT|\$\{XPERT_PLUGIN_ROOT\}|\$XPERT_PLUGIN_ROOT/g, pluginRoot)
            .replace(/\$\{PLUGIN_DATA\}|\$PLUGIN_DATA|\$\{XPERT_PLUGIN_DATA\}|\$XPERT_PLUGIN_DATA/g, pluginData)
        return [
            `XPERT_PLUGIN_ROOT=${pluginRoot}`,
            `XPERT_PLUGIN_DATA=${pluginData}`,
            `PLUGIN_ROOT=${pluginRoot}`,
            `PLUGIN_DATA=${pluginData}`,
            expandedCommand
        ].join(' ')
    }

    private matches(command: RuntimeHookCommand, toolName?: string) {
        if (command.matcher === '*') {
            return true
        }
        if (!toolName) {
            return false
        }
        if (command.matcher.endsWith('*')) {
            return toolName.startsWith(command.matcher.slice(0, -1))
        }
        return command.matcher === toolName
    }

    private async emitBlocked(blocked: HookRef[], context: IAgentMiddlewareContext, phase: string) {
        for (const item of blocked) {
            await context.runtime.emitMiddlewareEvent?.({
                middlewareName: PLUGIN_HOOKS_MIDDLEWARE_NAME,
                title: 'Plugin hook blocked',
                phase,
                status: 'fail',
                message: 'Plugin hook is unavailable.',
                data: item
            })
        }
    }

    private resolveLoadedPluginRoot(pluginName: string, context: IAgentMiddlewareContext) {
        const normalized = normalizePluginName(pluginName)
        const organizationId = context.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
        const organizationScopeKey =
            organizationId === GLOBAL_ORGANIZATION_SCOPE
                ? resolveTenantGlobalScopeKey(context.tenantId)
                : organizationId
        const globalScopeKey = resolveTenantGlobalScopeKey(context.tenantId)
        const candidates = this.loadedPlugins.filter((item) => {
            const names = [item.name, item.packageName].filter((value): value is string => !!value)
            return names.some((name) => normalizePluginName(name) === normalized)
        })
        const record =
            candidates.find((item) => (item.scopeKey ?? item.organizationId) === organizationScopeKey) ??
            (organizationId !== GLOBAL_ORGANIZATION_SCOPE
                ? candidates.find((item) => (item.scopeKey ?? item.organizationId) === globalScopeKey)
                : null) ??
            candidates.find((item) => (item.scopeKey ?? item.organizationId) === SYSTEM_GLOBAL_SCOPE)
        return record ? resolveLoadedPluginBundleRoot(record) : null
    }

    private async ensurePluginDataDir(context: IAgentMiddlewareContext, hookRef: HookRef) {
        const pluginData = resolve(
            process.cwd(),
            '.xpertai-plugin-data',
            safePathSegment(context.tenantId),
            safePathSegment(context.workspaceId ?? 'workspace'),
            safePathSegment(normalizePluginName(hookRef.pluginName)),
            safePathSegment(hookRef.componentKey)
        )
        await mkdir(pluginData, { recursive: true })
        return pluginData
    }
}

function readSandboxConfig(runtime: unknown): TSandboxConfigurable | null {
    if (!isObjectValue(runtime)) {
        return null
    }
    const configurable = Reflect.get(runtime, 'configurable')
    if (!isObjectValue(configurable)) {
        return null
    }
    const sandbox = Reflect.get(configurable, 'sandbox')
    if (!isObjectValue(sandbox)) {
        return null
    }
    const provider = Reflect.get(sandbox, 'provider')
    const workingDirectory = Reflect.get(sandbox, 'workingDirectory')
    return {
        ...(typeof provider === 'string' ? { provider } : {}),
        ...(typeof workingDirectory === 'string' ? { workingDirectory } : {}),
        ...(Reflect.has(sandbox, 'backend') ? { backend: Reflect.get(sandbox, 'backend') } : {}),
        ...(readNullableStringField(sandbox, 'environmentId') !== undefined
            ? { environmentId: readNullableStringField(sandbox, 'environmentId') }
            : {}),
        ...(readNullableStringField(sandbox, 'containerId') !== undefined
            ? { containerId: readNullableStringField(sandbox, 'containerId') }
            : {})
    }
}

function isObjectValue(value: unknown): value is object {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readStringField(value: object, key: string): string | undefined {
    const field = Reflect.get(value, key)
    return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

function readNullableStringField(value: object, key: string): string | null | undefined {
    const field = Reflect.get(value, key)
    if (field === null) {
        return null
    }
    return typeof field === 'string' ? field : undefined
}

function isHookRef(value: unknown): value is HookRef {
    if (!isObjectValue(value)) {
        return false
    }
    const pluginName = Reflect.get(value, 'pluginName')
    const componentKey = Reflect.get(value, 'componentKey')
    const events = Reflect.get(value, 'events')
    return (
        typeof pluginName === 'string' &&
        !!pluginName.trim() &&
        typeof componentKey === 'string' &&
        !!componentKey.trim() &&
        (typeof events === 'undefined' || (Array.isArray(events) && events.every((event) => typeof event === 'string')))
    )
}

function safePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function shellQuote(value: string) {
    return `'${value.replace(/'/g, `'\\''`)}'`
}
