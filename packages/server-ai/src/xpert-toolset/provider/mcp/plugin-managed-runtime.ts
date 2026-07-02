import { loaded as loadedPlugins, resolveLoadedPluginBundleRoot } from '@xpert-ai/server-core'
import type { IXpertToolset, TMCPSchema, TMCPServer } from '@xpert-ai/contracts'
import type { LoadedPluginRecord } from '@xpert-ai/server-core'
import { GLOBAL_ORGANIZATION_SCOPE, SYSTEM_GLOBAL_SCOPE, resolveTenantGlobalScopeKey } from '@xpert-ai/plugin-sdk'
import { resolve } from 'node:path'

type PluginManagedToolsetOptions = {
    pluginManaged?: boolean
    pluginName?: string
    componentKey?: string
}

export type PluginRuntimePaths = {
    pluginRoot: string
    pluginData: string
}

const PLUGIN_ROOT_PATTERN = /\$\{PLUGIN_ROOT\}|\$PLUGIN_ROOT|\$\{XPERT_PLUGIN_ROOT\}|\$XPERT_PLUGIN_ROOT/g
const PLUGIN_DATA_PATTERN = /\$\{PLUGIN_DATA\}|\$PLUGIN_DATA|\$\{XPERT_PLUGIN_DATA\}|\$XPERT_PLUGIN_DATA/g

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizePluginName(pluginName: string) {
    if (!pluginName.includes('@')) return pluginName
    const lastAt = pluginName.lastIndexOf('@')
    return lastAt > 0 ? pluginName.slice(0, lastAt) : pluginName
}

function safePathSegment(value: string) {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function readPluginManagedOptions(toolset: Partial<IXpertToolset>): PluginManagedToolsetOptions | null {
    const options = toolset.options
    if (!isObject(options) || options.pluginManaged !== true || typeof options.pluginName !== 'string') {
        return null
    }
    return {
        pluginManaged: true,
        pluginName: options.pluginName,
        componentKey: typeof options.componentKey === 'string' ? options.componentKey : undefined
    }
}

function matchesPlugin(plugin: LoadedPluginRecord, pluginName: string) {
    const normalized = normalizePluginName(pluginName)
    const candidates = [plugin.name, plugin.packageName, plugin.instance?.meta?.name]
        .filter((value): value is string => typeof value === 'string' && !!value)
        .map((value) => normalizePluginName(value))
    return candidates.includes(normalized)
}

function findLoadedPlugin(pluginName: string, organizationId?: string | null, tenantId?: string | null) {
    const candidates = (loadedPlugins ?? []).filter((plugin) => matchesPlugin(plugin, pluginName))
    const organizationScopeKey =
        organizationId && organizationId !== GLOBAL_ORGANIZATION_SCOPE
            ? organizationId
            : resolveTenantGlobalScopeKey(tenantId)
    const globalScopeKey = resolveTenantGlobalScopeKey(tenantId)
    return (
        candidates.find((plugin) => (plugin.scopeKey ?? plugin.organizationId) === organizationScopeKey) ??
        (organizationId && organizationId !== GLOBAL_ORGANIZATION_SCOPE
            ? candidates.find((plugin) => (plugin.scopeKey ?? plugin.organizationId) === globalScopeKey)
            : null) ??
        candidates.find((plugin) => (plugin.scopeKey ?? plugin.organizationId) === SYSTEM_GLOBAL_SCOPE) ??
        null
    )
}

function buildPluginDataPath(toolset: Partial<IXpertToolset>, pluginName: string, componentKey?: string) {
    return resolve(
        process.cwd(),
        '.xpertai-plugin-data',
        safePathSegment(toolset.tenantId ?? 'tenant'),
        safePathSegment(toolset.workspaceId ?? 'workspace'),
        safePathSegment(normalizePluginName(pluginName)),
        safePathSegment(componentKey ?? 'mcp')
    )
}

export function getPluginManagedMcpOptions(toolset: Partial<IXpertToolset>): PluginManagedToolsetOptions | null {
    return readPluginManagedOptions(toolset)
}

export function resolvePluginManagedRuntimePaths(toolset: Partial<IXpertToolset>): PluginRuntimePaths | null {
    const options = readPluginManagedOptions(toolset)
    if (!options) {
        return null
    }

    const loadedPlugin = findLoadedPlugin(options.pluginName, toolset.organizationId, toolset.tenantId)
    const pluginRoot = loadedPlugin ? resolveLoadedPluginBundleRoot(loadedPlugin) : null
    if (!pluginRoot) {
        return null
    }

    return {
        pluginRoot,
        pluginData: buildPluginDataPath(toolset, options.pluginName, options.componentKey)
    }
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function replaceStaleRuntimePluginRoot(value: string, pluginName: string, pluginRoot: string) {
    const pluginPath = normalizePluginName(pluginName).split('/').map(escapeRegExp).join('[\\\\/]')
    const runtimePluginRootPattern = new RegExp(
        `[^\\s"'\\]]*?@runtime__[^\\s"'\\]]*?[\\\\/]node_modules[\\\\/]${pluginPath}`,
        'g'
    )
    return value.replace(runtimePluginRootPattern, () => pluginRoot)
}

function replacePluginRuntimeVariables(value: string, pluginName: string, paths: PluginRuntimePaths) {
    return replaceStaleRuntimePluginRoot(value, pluginName, paths.pluginRoot)
        .replace(PLUGIN_ROOT_PATTERN, () => paths.pluginRoot)
        .replace(PLUGIN_DATA_PATTERN, () => paths.pluginData)
}

function resolveStringArray(value: string[] | undefined, pluginName: string, paths: PluginRuntimePaths) {
    return value?.map((item) => replacePluginRuntimeVariables(item, pluginName, paths))
}

function resolveStringMap(value: Record<string, string> | undefined, pluginName: string, paths: PluginRuntimePaths) {
    if (!value) {
        return undefined
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, replacePluginRuntimeVariables(item, pluginName, paths)])
    )
}

function resolvePluginManagedServer(server: TMCPServer, pluginName: string, paths: PluginRuntimePaths): TMCPServer {
    return {
        ...server,
        ...(server.command ? { command: replacePluginRuntimeVariables(server.command, pluginName, paths) } : {}),
        ...(server.url ? { url: replacePluginRuntimeVariables(server.url, pluginName, paths) } : {}),
        ...(server.args ? { args: resolveStringArray(server.args, pluginName, paths) } : {}),
        ...(server.env ? { env: resolveStringMap(server.env, pluginName, paths) } : {}),
        ...(server.headers ? { headers: resolveStringMap(server.headers, pluginName, paths) } : {}),
        ...(server.initScripts
            ? { initScripts: replacePluginRuntimeVariables(server.initScripts, pluginName, paths) }
            : {})
    }
}

export function resolvePluginManagedMcpSchema(toolset: Partial<IXpertToolset>, schema: TMCPSchema): TMCPSchema {
    const options = readPluginManagedOptions(toolset)
    if (!options) {
        return schema
    }

    const paths = resolvePluginManagedRuntimePaths(toolset)
    if (!paths) {
        return schema
    }

    const resolveServers = (servers?: Record<string, TMCPServer>) => {
        if (!servers) {
            return undefined
        }
        return Object.fromEntries(
            Object.entries(servers).map(([name, server]) => [
                name,
                resolvePluginManagedServer(server, options.pluginName, paths)
            ])
        )
    }

    return {
        ...schema,
        ...(schema.servers ? { servers: resolveServers(schema.servers) } : {}),
        ...(schema.mcpServers ? { mcpServers: resolveServers(schema.mcpServers) } : {})
    }
}
