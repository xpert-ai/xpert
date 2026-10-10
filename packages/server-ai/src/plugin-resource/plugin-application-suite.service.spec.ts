import type {
    IXpert,
    PluginMarketplaceAppAssistantSuite,
    PluginTemplateApplicationSummary,
    TXpertTeamDraft
} from '@xpert-ai/contracts'
import { NotFoundException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { PluginApplicationSuiteService } from './plugin-application-suite.service'
import { XpertService } from '../xpert/xpert.service'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'
import type { PluginTemplateInstallCommand } from './commands/install-template.command'

jest.mock('@xpert-ai/plugin-sdk', () => ({ RequestContext: { getLanguageCode: () => 'en-US' } }))
jest.mock('../xpert/xpert.service', () => ({ XpertService: class XpertService {} }))
jest.mock('../xpert-template/xpert-template.service', () => ({ XpertTemplateService: class XpertTemplateService {} }))
jest.mock('./plugin-application-installation.entity', () => ({
    PluginApplicationInstallation: class PluginApplicationInstallation {}
}))

const pluginName = '@example/automotive-app'
const suite: PluginMarketplaceAppAssistantSuite = {
    version: '2',
    coordinatorAgentKey: 'Agent_Coordinator',
    roles: [{ key: 'quality', templateKey: 'quality', primaryAgentKey: 'Agent_Quality' }],
    standaloneAssistants: [{ key: 'master_data', templateKey: 'master-data', primaryAgentKey: 'Agent_MasterData' }]
}
const application: PluginTemplateApplicationSummary = {
    id: `${pluginName}:automotive-app`,
    pluginName,
    appName: 'automotive-app',
    scope: 'organization',
    displayName: 'Automotive App',
    assistantTemplateKey: 'coordinator',
    config: {
        scope: 'organization',
        assistantTemplateKey: 'coordinator',
        assistantSuite: suite,
        workspace: { mode: 'dedicated', name: 'Automotive Workspace', sharing: 'organization' }
    }
}
async function harness(definitionSuite = suite) {
    const installation = Object.assign(new PluginApplicationInstallation(), {
        id: 'installation-001',
        tenantId: 'tenant-001',
        organizationId: 'org-001',
        workspaceId: 'workspace-001',
        resourceRefs: {}
    })
    const teams = new Map<string, IXpert>()
    let sequence = 0
    const definitions = [
        { templateKey: 'coordinator', primaryAgentKey: definitionSuite.coordinatorAgentKey },
        ...definitionSuite.roles,
        ...(definitionSuite.standaloneAssistants ?? [])
    ]
    const bus = {
        execute: jest.fn(async (command: PluginTemplateInstallCommand) => {
            const definition = definitions.find((entry) => `${pluginName}:${entry.templateKey}` === command.templateId)
            if (!definition) throw new Error('Unexpected template')
            const id = `assistant-${++sequence}`
            const assistant = {
                id,
                name: command.basic.name,
                title: command.basic.title,
                tenantId: installation.tenantId,
                organizationId: installation.organizationId,
                workspaceId: command.workspaceId,
                agent: { key: definition.primaryAgentKey },
                latest: command.publish,
                publishAt: command.publish ? new Date() : null,
                options: {
                    templateSource: { pluginName, templateKey: definition.templateKey, templateId: command.templateId }
                },
                draft: { team: { name: id, agent: { key: definition.primaryAgentKey } }, nodes: [], connections: [] }
            } as IXpert
            teams.set(id, assistant)
            return { xpert: { id } }
        })
    }
    const xperts = {
        getTeam: jest.fn(async (id: string) => {
            const team = teams.get(id)
            if (!team) throw new NotFoundException()
            return team
        }),
        validateName: jest.fn(async () => true),
        saveDraft: jest.fn(async (id: string, draft: TXpertTeamDraft) => {
            teams.get(id).draft = draft
        }),
        publish: jest.fn(async (id: string) => {
            const team = teams.get(id)
            team.graph = structuredClone({ nodes: team.draft.nodes, connections: team.draft.connections })
            team.draft = null
            team.publishAt = new Date()
            team.latest = true
        }),
        delete: jest.fn(async (id: string) => {
            teams.delete(id)
        })
    }
    const templates = { getTemplateDetail: jest.fn(async (_templateId: string) => ({ pluginName })) }
    const repo = { save: jest.fn(async (value: PluginApplicationInstallation) => value) }
    const module = await Test.createTestingModule({
        providers: [
            PluginApplicationSuiteService,
            { provide: CommandBus, useValue: bus },
            { provide: XpertService, useValue: xperts },
            { provide: XpertTemplateService, useValue: templates },
            { provide: getRepositoryToken(PluginApplicationInstallation), useValue: repo }
        ]
    }).compile()
    const service = module.get(PluginApplicationSuiteService)
    return { service, installation, teams, bus, xperts, templates, repo }
}

describe('application suite standalone Assistant provisioning', () => {
    it('validates all template provenance before creating resources', async () => {
        const h = await harness()
        await h.service.validate(application)
        expect(h.templates.getTemplateDetail.mock.calls.map((call) => call[0])).toEqual([
            `${pluginName}:coordinator`,
            `${pluginName}:quality`,
            `${pluginName}:master-data`
        ])
        h.templates.getTemplateDetail.mockResolvedValueOnce({ pluginName: '@example/other-app' })
        await expect(h.service.validate(application)).rejects.toThrow('application_suite_template_provenance_mismatch')
        expect(h.bus.execute).not.toHaveBeenCalled()
    })
    it('publishes independent Assistants without delegation, and retries without duplicates', async () => {
        const h = await harness()
        const coordinator = await h.service.ensure(application, h.installation, h.installation.workspaceId)
        expect(h.teams.size).toBe(3)
        const standaloneId = h.installation.resourceRefs['role:master_data']
        expect(h.teams.get(standaloneId).publishAt).toBeTruthy()
        expect(h.teams.get(standaloneId).workspaceId).toBe(coordinator.workspaceId)
        expect(coordinator.graph.nodes.filter((node) => node.type === 'xpert').map((node) => node.key)).toEqual([
            h.installation.resourceRefs['role:quality']
        ])
        expect(coordinator.graph.connections).toHaveLength(1)
        await expect(h.service.healthy(application, h.installation)).resolves.toBe(true)
        await h.service.ensure(application, h.installation, h.installation.workspaceId)
        expect(h.bus.execute).toHaveBeenCalledTimes(3)
        expect(coordinator.graph.connections).toHaveLength(1)
    })
    it('upgrades a role-only installation by adding the missing standalone Assistant', async () => {
        const h = await harness()
        const old = {
            ...application,
            config: {
                ...application.config,
                assistantSuite: { ...suite, version: '1', standaloneAssistants: undefined }
            }
        }
        const coordinator = await h.service.ensure(old, h.installation, h.installation.workspaceId)
        const originalId = coordinator.id
        const qualityId = h.installation.resourceRefs['role:quality']
        coordinator.description = 'Human-owned configuration'
        await expect(h.service.healthy(application, h.installation)).resolves.toBe(false)
        await h.service.ensure(application, h.installation, h.installation.workspaceId)
        expect(h.installation.xpertId).toBe(originalId)
        expect(h.installation.resourceRefs['role:quality']).toBe(qualityId)
        expect(coordinator.description).toBe('Human-owned configuration')
        expect(h.bus.execute).toHaveBeenCalledTimes(3)
        expect(h.installation.resourceRefs['suite:version']).toBe('2')
    })
    it('detects and repairs deleted standalone Assistants without replacing business roles', async () => {
        const h = await harness()
        await h.service.ensure(application, h.installation, h.installation.workspaceId)
        h.teams.delete(h.installation.resourceRefs['role:master_data'])
        await expect(h.service.healthy(application, h.installation)).resolves.toBe(false)
        await h.service.ensure(application, h.installation, h.installation.workspaceId)
        expect(h.bus.execute).toHaveBeenCalledTimes(4)
        await expect(h.service.healthy(application, h.installation)).resolves.toBe(true)
    })
    it('retains owned partial resources and resumes without duplicates after publication fails', async () => {
        const h = await harness()
        const old = {
            ...application,
            config: {
                ...application.config,
                assistantSuite: { ...suite, version: '1', standaloneAssistants: undefined }
            }
        }
        await h.service.ensure(old, h.installation, h.installation.workspaceId)
        const refs = { ...h.installation.resourceRefs }
        const existingIds = [...h.teams.keys()]
        h.xperts.publish.mockRejectedValueOnce(new Error('publish_failed'))
        await expect(h.service.ensure(application, h.installation, h.installation.workspaceId)).rejects.toThrow(
            'publish_failed'
        )
        expect(h.installation.resourceRefs).toMatchObject(refs)
        expect([...h.teams.keys()]).toEqual(expect.arrayContaining(existingIds))
        expect(h.xperts.delete).not.toHaveBeenCalled()
        const ids = [...h.teams.keys()]
        await expect(h.service.healthy(application, h.installation)).resolves.toBe(false)
        await h.service.ensure(application, h.installation, h.installation.workspaceId)
        expect([...h.teams.keys()]).toEqual(ids)
        await expect(h.service.healthy(application, h.installation)).resolves.toBe(true)
    })
    it.each(['tenantId', 'organizationId', 'workspaceId'] as const)(
        'rejects a standalone Assistant with mismatched %s',
        async (field) => {
            const h = await harness()
            await h.service.ensure(application, h.installation, h.installation.workspaceId)
            h.teams.get(h.installation.resourceRefs['role:master_data'])[field] = 'other-scope'
            await expect(h.service.healthy(application, h.installation)).resolves.toBe(false)
            await expect(h.service.ensure(application, h.installation, h.installation.workspaceId)).rejects.toThrow(
                'application_suite_scope_mismatch'
            )
            expect(h.xperts.delete).not.toHaveBeenCalled()
        }
    )
    it('publishes nested dependencies before callers and checks their bindings on repair', async () => {
        const nestedSuite: PluginMarketplaceAppAssistantSuite = {
            ...suite,
            coordinatorRoleKeys: ['quality'],
            roles: [
                { ...suite.roles[0], externalRoleKeys: ['writer'] },
                { key: 'writer', templateKey: 'writer', primaryAgentKey: 'Agent_Writer', externalRoleKeys: ['images'] },
                { key: 'images', templateKey: 'images', primaryAgentKey: 'Agent_Images' }
            ]
        }
        const nested = { ...application, config: { ...application.config, assistantSuite: nestedSuite } }
        const h = await harness(nestedSuite)
        const coordinator = await h.service.ensure(nested, h.installation, h.installation.workspaceId)
        const refs = { ...h.installation.resourceRefs }
        expect(h.xperts.publish.mock.calls.map(([id]) => id)).toEqual([
            refs['role:images'],
            refs['role:writer'],
            refs['role:quality'],
            refs['role:master_data'],
            coordinator.id
        ])
        expect(coordinator.graph.connections.map((edge) => edge.to)).toEqual([refs['role:quality']])
        const writer = h.teams.get(refs['role:writer'])
        expect(writer.graph.connections.map((edge) => edge.to)).toEqual([refs['role:images']])
        writer.graph.connections[0].required = false
        await expect(h.service.healthy(nested, h.installation)).resolves.toBe(false)
        await h.service.ensure(nested, h.installation, h.installation.workspaceId)
        expect(h.installation.resourceRefs).toEqual(refs)
        await expect(h.service.healthy(nested, h.installation)).resolves.toBe(true)
        writer.organizationId = 'other'
        await expect(h.service.healthy(nested, h.installation)).resolves.toBe(false)
    })
    it('repairs an entry-only installation in place', async () => {
        const h = await harness()
        const coordinator = await h.service.ensure(application, h.installation, h.installation.workspaceId)
        h.teams.delete(h.installation.resourceRefs['role:quality'])
        h.teams.delete(h.installation.resourceRefs['role:master_data'])
        coordinator.graph = { nodes: [], connections: [] }
        coordinator.slug = 'keep-original-slug'
        coordinator.environmentId = 'keep-environment'
        h.installation.resourceRefs = { assistant: coordinator.id }
        const repaired = await h.service.ensure(application, h.installation, h.installation.workspaceId)
        expect(repaired.id).toBe(coordinator.id)
        expect(repaired.slug).toBe('keep-original-slug')
        expect(repaired.draft).toBeNull()
        expect(h.xperts.publish).toHaveBeenLastCalledWith(coordinator.id, false, 'keep-environment', expect.any(String))
        expect(h.teams.size).toBe(3)
        await expect(h.service.healthy(application, h.installation)).resolves.toBe(true)
    })
})
