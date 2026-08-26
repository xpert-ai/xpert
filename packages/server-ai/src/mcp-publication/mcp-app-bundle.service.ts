import { MCP_APP_RESOURCE_MIME_TYPE, McpAppCapabilityDescriptor } from '@xpert-ai/contracts'
import {
    LOADED_PLUGINS,
    LoadedPluginRecord,
    normalizePluginName,
    resolveLoadedPluginBundleRoot
} from '@xpert-ai/server-core'
import { GLOBAL_ORGANIZATION_SCOPE, SYSTEM_GLOBAL_SCOPE, resolveTenantGlobalScopeKey } from '@xpert-ai/plugin-sdk'
import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common'
import { readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { McpPublication } from './entities'

const MAX_APP_HTML_BYTES = 2 * 1024 * 1024

@Injectable()
export class McpAppBundleService {
    constructor(
        @Optional()
        @Inject(LOADED_PLUGINS)
        private readonly loadedPlugins: LoadedPluginRecord[] = []
    ) {}

    resourceUri(publication: McpPublication, descriptor: McpAppCapabilityDescriptor) {
        const pluginName = descriptor.source.pluginName ?? 'plugin'
        return `ui://xpert/${publication.id}/${encodeURIComponent(pluginName)}/${encodeURIComponent(
            descriptor.capabilityKey
        )}`
    }

    async read(publication: McpPublication, descriptor: McpAppCapabilityDescriptor) {
        if (!descriptor.entry.endsWith('.html')) {
            throw new BadRequestException('MCP App entry must be an HTML file')
        }
        const pluginName = descriptor.source.pluginName
        if (!pluginName) {
            throw new BadRequestException('MCP App capability is missing its plugin source')
        }
        const plugin = this.resolvePlugin(publication, pluginName)
        const root = resolveLoadedPluginBundleRoot(plugin)
        if (!root) {
            throw new BadRequestException(`Loaded plugin '${pluginName}' has no bundle root`)
        }
        const [realRoot, realEntry] = await Promise.all([realpath(root), realpath(resolve(root, descriptor.entry))])
        const relativeEntry = relative(realRoot, realEntry)
        if (isAbsolute(relativeEntry) || relativeEntry.startsWith('..')) {
            throw new BadRequestException('MCP App entry is outside its plugin root')
        }
        const file = await stat(realEntry)
        if (!file.isFile() || file.size > MAX_APP_HTML_BYTES) {
            throw new BadRequestException(`MCP App HTML must not exceed ${MAX_APP_HTML_BYTES} bytes`)
        }
        return {
            uri: this.resourceUri(publication, descriptor),
            mimeType: MCP_APP_RESOURCE_MIME_TYPE,
            text: await readFile(realEntry, 'utf8'),
            _meta: {
                ui: {
                    ...(descriptor.title ? { title: descriptor.title } : {}),
                    ...(descriptor.description ? { description: descriptor.description } : {}),
                    ...(descriptor.csp ? { csp: descriptor.csp } : {}),
                    ...(descriptor.permissions ? { permissions: descriptor.permissions } : {})
                }
            }
        }
    }

    private resolvePlugin(publication: McpPublication, pluginName: string) {
        const normalizedName = normalizePluginName(pluginName)
        const candidates = this.loadedPlugins.filter(
            (plugin) =>
                [plugin.name, plugin.packageName]
                    .filter((name): name is string => typeof name === 'string')
                    .some((name) => normalizePluginName(name) === normalizedName) &&
                (!plugin.tenantId || plugin.tenantId === publication.tenantId)
        )
        const tenantGlobalScope = resolveTenantGlobalScopeKey(publication.tenantId)
        const organizationScope = publication.organizationId ?? GLOBAL_ORGANIZATION_SCOPE
        const plugin =
            candidates.find((item) => (item.scopeKey ?? item.organizationId) === organizationScope) ??
            candidates.find((item) => (item.scopeKey ?? item.organizationId) === tenantGlobalScope) ??
            candidates.find((item) => (item.scopeKey ?? item.organizationId) === SYSTEM_GLOBAL_SCOPE)
        if (!plugin) {
            throw new BadRequestException(`Loaded plugin '${pluginName}' is not available in this publication scope`)
        }
        return plugin
    }
}
