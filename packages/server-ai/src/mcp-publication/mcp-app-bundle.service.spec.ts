import { MCP_APP_RESOURCE_MIME_TYPE, McpAppCapabilityDescriptor } from '@xpert-ai/contracts'
import { LoadedPluginRecord } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpAppBundleService } from './mcp-app-bundle.service'
import { McpPublication } from './entities'

describe('McpAppBundleService', () => {
    const temporaryDirectories: string[] = []

    afterEach(() => {
        for (const directory of temporaryDirectories.splice(0)) {
            rmSync(directory, { recursive: true, force: true })
        }
    })

    it('loads the organization-scoped HTML bundle with MCP App metadata', async () => {
        const systemRoot = createPluginRoot('<main>system</main>')
        const organizationRoot = createPluginRoot('<main>organization</main>')
        const service = new McpAppBundleService([
            loadedPlugin(systemRoot, 'system'),
            loadedPlugin(organizationRoot, 'organization-1')
        ])

        await expect(service.read(publication(), descriptor())).resolves.toEqual({
            uri: 'ui://xpert/publication-1/%40xpert-ai%2Fplugin-app/dashboard',
            mimeType: MCP_APP_RESOURCE_MIME_TYPE,
            text: '<main>organization</main>',
            _meta: {
                ui: {
                    title: 'Dashboard',
                    csp: { connectDomains: ['https://api.example.test'] },
                    permissions: { clipboardWrite: true }
                }
            }
        })
    })

    it('rejects a symlink that escapes the loaded plugin root', async () => {
        const root = createPluginRoot('<main>safe</main>')
        const outside = mkdtempSync(join(tmpdir(), 'xpert-mcp-app-outside-'))
        temporaryDirectories.push(outside)
        const outsideEntry = join(outside, 'escape.html')
        writeFileSync(outsideEntry, '<main>outside</main>')
        symlinkSync(outsideEntry, join(root, 'apps', 'escape.html'))
        const service = new McpAppBundleService([loadedPlugin(root, 'organization-1')])

        await expect(service.read(publication(), descriptor({ entry: 'apps/escape.html' }))).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it('rejects HTML bundles larger than the host limit', async () => {
        const root = createPluginRoot('x'.repeat(2 * 1024 * 1024 + 1))
        const service = new McpAppBundleService([loadedPlugin(root, 'organization-1')])

        await expect(service.read(publication(), descriptor())).rejects.toThrow(
            'MCP App HTML must not exceed 2097152 bytes'
        )
    })

    function createPluginRoot(html: string) {
        const root = mkdtempSync(join(tmpdir(), 'xpert-mcp-app-'))
        temporaryDirectories.push(root)
        mkdirSync(join(root, '.xpertai-plugin'), { recursive: true })
        mkdirSync(join(root, 'apps'), { recursive: true })
        writeFileSync(
            join(root, '.xpertai-plugin', 'plugin.json'),
            JSON.stringify({ name: '@xpert-ai/plugin-app', version: '1.0.0' })
        )
        writeFileSync(join(root, 'apps', 'index.html'), html)
        return root
    }

    function loadedPlugin(root: string, organizationId: string): LoadedPluginRecord {
        return {
            tenantId: 'tenant-1',
            organizationId,
            name: '@xpert-ai/plugin-app',
            packageName: '@xpert-ai/plugin-app',
            instance: {},
            ctx: {},
            baseDir: root
        }
    }

    function publication() {
        return Object.assign(new McpPublication(), {
            id: 'publication-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        })
    }

    function descriptor(overrides: Partial<McpAppCapabilityDescriptor> = {}): McpAppCapabilityDescriptor {
        return {
            descriptorVersion: 1,
            capabilityType: 'app',
            capabilityKey: 'dashboard',
            title: 'Dashboard',
            source: { toolsetId: 'toolset-1', pluginName: '@xpert-ai/plugin-app' },
            requiredContext: [],
            visibility: ['app'],
            entry: 'apps/index.html',
            csp: { connectDomains: ['https://api.example.test'] },
            permissions: { clipboardWrite: true },
            ...overrides
        }
    }
})
