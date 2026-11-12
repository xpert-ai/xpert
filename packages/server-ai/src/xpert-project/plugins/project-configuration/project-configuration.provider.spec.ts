import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'
import { AGENT_WORKBENCH_SLOT, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import {
    createRuntimeCapability, DefaultRuntimeCapabilityRegistry, XPERT_RUNTIME_CAPABILITIES_TOKEN,
    type ProjectConfigurationScope, type ProjectConfigurationApi
} from '@xpert-ai/plugin-sdk'
import { parseAutomationAction, scheduleSchema } from './services/configuration-action.schema'
import { ProjectConfigurationPluginModule } from './project-configuration.module'
import { ProjectConfigurationViewProvider } from './project-configuration.provider'

const context: XpertResolvedViewHostContext = {
    hostType: 'agent', hostId: 'assistant', tenantId: 'tenant', organizationId: 'organization', userId: 'user', slots: [],
    runtimeScope: { projectId: 'project', conversationId: null, workspaceFiles: null, dataScopeKey: 'project:project' }
}
const expectedScope: ProjectConfigurationScope = {
    actor: { tenantId: 'tenant', organizationId: 'organization', userId: 'user' },
    projectId: 'project', assistantId: 'assistant'
}
async function fixture() {
    const api = {
        getOverview: jest.fn().mockResolvedValue({ projectId: 'project' }),
        get: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(null),
        listAvailableAssistants: jest.fn().mockResolvedValue(null),
        addAssistant: jest.fn().mockResolvedValue(null),
        removeAssistant: jest.fn().mockResolvedValue(null),
        listMemberCandidates: jest.fn().mockResolvedValue(null),
        addMember: jest.fn().mockResolvedValue(null),
        updateMemberRole: jest.fn().mockResolvedValue(null),
        removeMember: jest.fn().mockResolvedValue(null),
        transferOwnership: jest.fn().mockResolvedValue(null),
        inviteMember: jest.fn().mockResolvedValue(null),
        revokeInvitation: jest.fn().mockResolvedValue(null),
        listSkillCatalog: jest.fn().mockResolvedValue(null),
        installSkill: jest.fn().mockResolvedValue(null),
        setSkillEnabled: jest.fn().mockResolvedValue(null),
        removeSkill: jest.fn().mockResolvedValue(null),
        deleteProject: jest.fn().mockResolvedValue(null),
        listAutomations: jest.fn().mockResolvedValue(null),
        getAutomationOptions: jest.fn().mockResolvedValue(null),
        saveAutomation: jest.fn().mockResolvedValue(null),
        pauseAutomation: jest.fn().mockResolvedValue(null),
        resumeAutomation: jest.fn().mockResolvedValue(null),
        deleteAutomation: jest.fn().mockResolvedValue(null),
        proposeAutomationRunAs: jest.fn().mockResolvedValue(null),
        acceptAutomationRunAs: jest.fn().mockResolvedValue(null),
        updateAutomationConnectors: jest.fn().mockResolvedValue(null),
        listConnectors: jest.fn().mockResolvedValue(null),
        addConnector: jest.fn().mockResolvedValue(null),
        removeConnector: jest.fn().mockResolvedValue(null),
        getConnectorAuthorizationStatus: jest.fn().mockResolvedValue(null),
        cancelConnectorAuthorization: jest.fn().mockResolvedValue(null),
        connectConnector: jest.fn().mockResolvedValue(null),
        updateInstructions: jest.fn(), uploadSkill: jest.fn()
    } satisfies ProjectConfigurationApi
    // An independently-created key models an external SDK copy: only the stable id is shared.
    const capabilities = new DefaultRuntimeCapabilityRegistry().register(
        createRuntimeCapability<ProjectConfigurationApi>('platform.project.configuration'), api)
    @Global()
    @Module({ providers: [{ provide: XPERT_RUNTIME_CAPABILITIES_TOKEN, useValue: capabilities }], exports: [XPERT_RUNTIME_CAPABILITIES_TOKEN] })
    class CapabilityHost {}
    const module = await Test.createTestingModule({ imports: [CapabilityHost, ProjectConfigurationPluginModule] }).compile()
    return { module, api, provider: module.get(ProjectConfigurationViewProvider) }
}

it('mounts the same on-demand View in Project and project-scoped Assistant hosts', async () => {
    const { module, provider } = await fixture()
    const [manifest] = provider.getViewManifests(context, AGENT_WORKBENCH_SLOT)
    expect(manifest.workbench.menu).toEqual({ enabled: true, order: 51 })
    expect(manifest.actions).toContainEqual(expect.objectContaining({ key: 'skill-upload', transport: 'file' }))
    expect(provider.getViewManifests({ ...context, runtimeScope: undefined }, AGENT_WORKBENCH_SLOT)).toEqual([])
    expect(provider.getViewManifests(context, 'detail.sections')).toEqual([])
    expect(provider.getViewManifests({ ...context, hostType: 'project', hostId: 'project' }, 'project.configuration')).toHaveLength(1)
    await module.close()
})
it('assembles without host services, repositories or CQRS and resolves an independently-created capability key', async () => {
    const { module, provider, api } = await fixture()
    expect(await provider.getViewData(context)).toEqual({ item: { projectId: 'project' } })
    expect(api.getOverview).toHaveBeenCalledWith(expectedScope)
    await provider.executeViewAction(context, 'configuration', 'type', {})
    await provider.executeViewAction(context, 'configuration', 'automations', {})
    await provider.executeViewAction(context, 'configuration', 'connectors', {})
    expect(api.get).toHaveBeenCalledWith(expectedScope)
    expect(api.listAutomations).toHaveBeenCalledWith(expectedScope, { page: 1, search: '' })
    expect(api.listConnectors).toHaveBeenCalledWith(expectedScope)
    await module.close()
})
it.each(['type', 'automations', 'connectors', 'instructions'])('rejects a client scope override for %s before calling the host', async (action) => {
    const { module, provider, api } = await fixture()
    await expect(provider.executeViewAction(context, 'configuration', action, { input: { projectId: 'other', content: 'x' } })).rejects.toThrow()
    expect(api.get).not.toHaveBeenCalled()
    expect(api.listAutomations).not.toHaveBeenCalled()
    expect(api.listConnectors).not.toHaveBeenCalled()
    expect(api.updateInstructions).not.toHaveBeenCalled()
    await module.close()
})
it('validates required action inputs and passes content and files through the scoped host API', async () => {
    const { module, provider, api } = await fixture()
    await expect(provider.executeViewAction(context, 'configuration', 'unsupported', {})).rejects.toThrow()
    await expect(provider.executeViewAction(context, 'configuration', 'member-role', { input: { userId: '00000000-0000-4000-8000-000000000001' } })).rejects.toThrow()
    await provider.executeViewAction(context, 'configuration', 'instructions', { input: { content: 'Changed' } })
    expect(api.updateInstructions).toHaveBeenCalledWith(expectedScope, 'Changed')
    const file = { buffer: Buffer.from('archive'), originalname: 'skill.zip' }
    await provider.executeViewFileAction(context, 'configuration', 'skill-upload', {}, file)
    expect(api.uploadSkill).toHaveBeenCalledWith(expectedScope, file)
    await expect(provider.executeViewFileAction(context, 'configuration', 'skill-upload', {}, { buffer: Buffer.alloc(25 * 1024 * 1024 + 1) })).rejects.toThrow()
    expect(api.uploadSkill).toHaveBeenCalledTimes(1)
    api.get.mockRejectedValue(Error('access revoked'))
    await expect(provider.executeViewAction(context, 'configuration', 'type', {})).rejects.toThrow('access revoked')
    await module.close()
})
it('keeps all plugin source imports inside the plugin or public SDK/contracts', () => {
    const root = resolve(__dirname)
    function inspect(directory: string) {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const file = join(directory, entry.name)
            if (entry.isDirectory()) { inspect(file); continue }
            if (!/\.tsx?$/.test(entry.name) || /\.spec\.ts$/.test(entry.name)) continue
            const source = readFileSync(file, 'utf8')
            for (const [, dependency] of source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)) {
                expect(dependency).not.toMatch(/^@xpert-ai\/(?:server|server-core|server-ai)|^@nestjs\/(?:cqrs|typeorm)|^typeorm/)
                if (dependency.startsWith('.')) expect(relative(root, resolve(directory, dependency))).not.toMatch(/^\.\./)
            }
        }
    }
    inspect(root)
})

it('rejects non-project View hosts and missing project context before accessing the API', async () => {
    const { module, provider, api } = await fixture()
    await expect(provider.getViewData({ ...context, hostType: 'other' })).rejects.toThrow()
    await expect(provider.getViewData({ ...context, runtimeScope: undefined })).rejects.toThrow()
    expect(api.getOverview).not.toHaveBeenCalled()
    await module.close()
})
it.each(['Once', 'Weekly', 'Monthly', 'Yearly'])('rejects incomplete %s schedules at the plugin boundary', (frequency) => {
    expect(scheduleSchema.safeParse({ frequency, time: '09:00' }).success).toBe(false)
})
it('requires runtime connector state and accepts Sunday without relaxing schedule bounds', () => {
    expect(() => parseAutomationAction('automation-connectors', { taskId: '00000000-0000-4000-8000-000000000001' })).toThrow()
    expect(scheduleSchema.safeParse({ frequency: 'Weekly', time: '09:00', dayOfWeek: 0 }).success).toBe(true)
    expect(scheduleSchema.safeParse({ frequency: 'Weekly', time: '25:00', dayOfWeek: 7 }).success).toBe(false)
})
