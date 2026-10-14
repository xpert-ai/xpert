import { Test } from '@nestjs/testing'
import { IXpert, PLUGIN_RESOURCE_INSTALLATION_STATUS } from '@xpert-ai/contracts'
import { InstallAgentPluginTemplateResourcesHandler } from './install-template-resources.handler'
import { InstallAgentPluginTemplateResourcesCommand } from './agent-plugin-template.command'
import { AgentPluginInstallationsService } from '../agent-plugin-installations.service'
import { AgentPluginConnectorService } from '../agent-plugin-connector.service'
import { PluginResourceInstallerService } from '../../plugin-resource/plugin-resource-installer.service'

jest.mock('../agent-plugin-installations.service', () => ({ AgentPluginInstallationsService: class {} }))
jest.mock('../agent-plugin-connector.service', () => ({ AgentPluginConnectorService: class {} }))
jest.mock('../../plugin-resource/plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class {}
}))

describe('Agent template MCP dependency installation', () => {
    const packages = { reference: jest.fn(), registerTemplateMcp: jest.fn() }
    const connectors = { install: jest.fn(), status: jest.fn() }
    const installer = { installComponentsForXpert: jest.fn() }
    const assistant = { id: 'assistant', workspaceId: 'workspace' } as IXpert
    const command = () =>
        new InstallAgentPluginTemplateResourcesCommand(
            assistant,
            [
                {
                    runtimeSource: 'agent-plugin',
                    pluginName: 'portable',
                    rootDir: '/portable',
                    targetAgentKey: 'worker',
                    component: {
                        componentType: 'mcp_server',
                        componentKey: 'selected',
                        definitionHash: 'digest',
                        config: {}
                    }
                }
            ],
            [
                {
                    pluginName: 'portable',
                    version: 'digest',
                    components: [],
                    source: {
                        kind: 'agent-plugin',
                        name: 'example',
                        digest: 'digest',
                        bindingId: 'binding',
                        bindingVersion: 'version'
                    }
                }
            ]
        )
    let handler: InstallAgentPluginTemplateResourcesHandler
    beforeEach(async () => {
        jest.resetAllMocks()
        packages.reference.mockResolvedValue({
            pkg: {
                digest: 'digest',
                descriptor: {
                    servers: [{ key: 'selected', config: { url: 'https://mcp.example.test/' } }],
                    extension: {
                        connectors: {
                            selected: { type: 'existing', provider: 'notion' },
                            unselected: { type: 'existing', provider: 'slack' }
                        }
                    }
                }
            }
        })
        connectors.install.mockResolvedValue({ selected: { provider: 'notion', connectorId: 'connector' } })
        connectors.status.mockResolvedValue('needs_auth')
        installer.installComponentsForXpert.mockResolvedValue({
            installations: [
                {
                    id: 'installation',
                    pluginName: 'portable',
                    componentType: 'mcp_server',
                    componentKey: 'selected',
                    runtimeId: 'toolset',
                    status: PLUGIN_RESOURCE_INSTALLATION_STATUS.READY
                }
            ],
            pendingAuth: []
        })
        handler = (
            await Test.createTestingModule({
                providers: [
                    InstallAgentPluginTemplateResourcesHandler,
                    { provide: AgentPluginInstallationsService, useValue: packages },
                    { provide: AgentPluginConnectorService, useValue: connectors },
                    { provide: PluginResourceInstallerService, useValue: installer }
                ]
            }).compile()
        ).get(InstallAgentPluginTemplateResourcesHandler)
    })
    it('binds only selected MCP servers, keeps Agent targeting and reports per-user authorization separately', async () => {
        const input = command()
        const result = await handler.execute(input)
        expect(Object.keys(connectors.install.mock.calls[0][2])).toEqual(['selected'])
        expect(installer.installComponentsForXpert.mock.calls[0][1][0]).toMatchObject({
            targetAgentKey: 'worker',
            portableServer: {
                url: 'https://mcp.example.test/',
                type: 'http',
                auth: { type: 'connector', connectorId: 'connector' }
            }
        })
        expect(input.components[0].portableServer).toBeUndefined()
        expect(packages.registerTemplateMcp).toHaveBeenCalledWith(
            { bindingId: 'binding', version: 'version' },
            'workspace',
            ['toolset'],
            expect.any(Object)
        )
        expect(result.pendingAuth[0].status).toBe(PLUGIN_RESOURCE_INSTALLATION_STATUS.PENDING_AUTH)
        expect(result.installations[0].status).toBe(PLUGIN_RESOURCE_INSTALLATION_STATUS.READY)
    })
    it('rejects revoked packages before creating any connector or runtime resource', async () => {
        packages.reference.mockResolvedValue(null)
        await expect(handler.execute(command())).rejects.toThrow()
        expect(connectors.install).not.toHaveBeenCalled()
        expect(installer.installComponentsForXpert).not.toHaveBeenCalled()
    })
    it('installs anonymous MCP without creating an authorization binding', async () => {
        packages.reference.mockResolvedValue({
            pkg: {
                digest: 'digest',
                descriptor: { servers: [{ key: 'selected', config: { url: 'https://mcp.example.test/' } }] }
            }
        })
        const result = await handler.execute(command())
        expect(connectors.install).not.toHaveBeenCalled()
        expect(result.pendingAuth).toEqual([])
    })
})
