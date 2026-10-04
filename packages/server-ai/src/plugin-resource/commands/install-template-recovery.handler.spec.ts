jest.mock('@nestjs/typeorm', () => ({
    ...jest.requireActual('@nestjs/typeorm'),
    TypeOrmModule: {
        forFeature: () => ({}),
        forFeatureAsync: () => ({}),
        forRoot: () => ({}),
        forRootAsync: () => ({})
    }
}))

jest.mock('../../xpert/dto', () => ({
    XpertDraftDslDTO: class XpertDraftDslDTO {
        constructor(value: unknown) {
            Object.assign(this, value)
        }
    }
}))

jest.mock('../../environment', () => ({
    EnvironmentService: class EnvironmentService {}
}))

jest.mock('../../xpert/xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
}))

jest.mock('../../xpert/template-workspace-initializer.service', () => ({
    XpertTemplateWorkspaceInitializer: class XpertTemplateWorkspaceInitializer {}
}))

jest.mock('../../xpert-toolset/xpert-toolset.entity', () => ({
    XpertToolset: class XpertToolset {}
}))

jest.mock('../../xpert-workspace', () => ({
    XpertWorkspaceAccessService: class XpertWorkspaceAccessService {}
}))

jest.mock('../plugin-resource-installer.service', () => ({
    PluginResourceInstallerService: class PluginResourceInstallerService {}
}))

jest.mock('../../xpert-template/capabilities/assistant-capability.service', () => ({
    AssistantCapabilityService: class AssistantCapabilityService {}
}))

import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { NotFoundException } from '@nestjs/common'
import { AiModelTypeEnum, IXpert, LanguagesEnum, TXpertTeamDraft, XpertTypeEnum } from '@xpert-ai/contracts'
import { EnvironmentService } from '../../environment'
import { XpertImportCommand } from '../../xpert/commands/import.command'
import { XpertPublishCommand } from '../../xpert/commands/publish.command'
import { XpertService } from '../../xpert/xpert.service'
import { XpertTemplateWorkspaceInitializer } from '../../xpert/template-workspace-initializer.service'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { AssistantCapabilityService } from '../../xpert-template/capabilities/assistant-capability.service'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace'
import { PluginResourceInstallerService, PluginResourceInstallResult } from '../plugin-resource-installer.service'
import { PluginTemplateInstallCommand } from './install-template.command'
import { PluginTemplateInstallHandler } from './install-template.handler'

const templateId = 'example-assistant'
const workspaceId = 'workspace-1'
const modules: TestingModule[] = []
afterEach(async () => {
    await Promise.all(modules.splice(0).map((module) => module.close()))
})

function command(bootstrap?: PluginTemplateInstallCommand['bootstrap']) {
    return new PluginTemplateInstallCommand(
        templateId,
        workspaceId,
        LanguagesEnum.English,
        {
            workspaceDataScope: 'user',
            copilotModel: {
                copilotId: 'copilot-1',
                model: 'model-1',
                modelType: AiModelTypeEnum.LLM
            }
        },
        true,
        undefined,
        [],
        bootstrap
    )
}

async function createFixture() {
    const draft: TXpertTeamDraft = {
        team: { name: 'Example', type: XpertTypeEnum.Agent, agent: { key: 'primary' } },
        nodes: [{ key: 'primary', type: 'agent', position: { x: 0, y: 0 }, entity: { key: 'primary' } }],
        connections: []
    }
    const xpert: IXpert & { publishAt?: Date } = {
        id: 'xpert-1',
        name: 'Example',
        slug: 'example',
        type: XpertTypeEnum.Agent,
        workspaceId,
        options: { templateSource: { templateId, templateKey: templateId } },
        draft
    }
    const checkpoint = jest.fn(async (_value: { id: string }) => undefined)
    const workspaceAccess = { assertCanAuthor: jest.fn(async (_id: string) => undefined) }
    const templates = {
        getTemplateDetail: jest.fn(async () => ({ id: templateId, export_data: JSON.stringify(draft) }))
    }
    const installer = {
        installComponentsForXpert: jest.fn(
            async (): Promise<PluginResourceInstallResult> => ({ installations: [], pendingAuth: [] })
        )
    }
    const initialize = jest.fn(async () => undefined)
    const environment = { getDefaultByWorkspace: jest.fn(async () => ({ id: 'environment-1' })) }
    const commands = {
        execute: jest.fn(async (input: unknown): Promise<IXpert> => {
            if (input instanceof XpertImportCommand) return { ...xpert, draft }
            if (input instanceof XpertPublishCommand) return { ...xpert, draft: null, version: '1' }
            throw new Error('Unexpected command')
        })
    }
    const xperts = {
        getSandboxProviders: jest.fn(async () => []),
        findOneByIdWithinTenant: jest.fn(async (_id: string) => xpert),
        delete: jest.fn(async (_id: string) => undefined)
    }
    const capabilities = { prepareInstallation: jest.fn(async () => undefined) }
    const module = await Test.createTestingModule({
        providers: [
            PluginTemplateInstallHandler,
            { provide: PluginResourceInstallerService, useValue: installer },
            { provide: XpertWorkspaceAccessService, useValue: workspaceAccess },
            { provide: XpertTemplateService, useValue: templates },
            { provide: XpertTemplateWorkspaceInitializer, useValue: { initializeByTemplateId: initialize } },
            { provide: EnvironmentService, useValue: environment },
            { provide: CommandBus, useValue: commands },
            { provide: XpertService, useValue: xperts },
            { provide: getRepositoryToken(XpertToolset), useValue: {} },
            { provide: AssistantCapabilityService, useValue: capabilities }
        ]
    }).compile()
    modules.push(module)
    return {
        handler: module.get(PluginTemplateInstallHandler),
        xpert,
        checkpoint,
        workspaceAccess,
        templates,
        installer,
        initialize,
        environment,
        commands,
        xperts,
        capabilities
    }
}

describe('resumable template installation', () => {
    it('checkpoints the imported ID before installing resources', async () => {
        const f = await createFixture()
        await f.handler.execute(command({ onImported: f.checkpoint }))
        expect(f.checkpoint).toHaveBeenCalledWith({ id: 'xpert-1' })
        expect(f.checkpoint.mock.invocationCallOrder[0]).toBeLessThan(
            f.installer.installComponentsForXpert.mock.invocationCallOrder[0]
        )
        expect(f.commands.execute.mock.calls.filter(([input]) => input instanceof XpertImportCommand)).toHaveLength(1)
    })

    it.each(['checkpoint', 'resources', 'environment', 'publish', 'initialize'] as const)(
        'retains the imported Assistant after a %s failure and resumes without a second import',
        async (stage) => {
            const f = await createFixture()
            const error = new Error('retryable failure')
            if (stage === 'checkpoint') f.checkpoint.mockRejectedValueOnce(error)
            if (stage === 'resources') f.installer.installComponentsForXpert.mockRejectedValueOnce(error)
            if (stage === 'environment') f.environment.getDefaultByWorkspace.mockRejectedValueOnce(error)
            if (stage === 'initialize') f.initialize.mockRejectedValueOnce(error)
            if (stage === 'publish') {
                f.commands.execute.mockImplementationOnce(async () => f.xpert).mockRejectedValueOnce(error)
            }
            await expect(f.handler.execute(command({ onImported: f.checkpoint }))).rejects.toThrow(error)
            expect(f.xperts.delete).not.toHaveBeenCalled()
            // Publishing succeeded before workspace initialization failed.
            if (stage === 'initialize') {
                f.xpert.publishAt = new Date()
                f.xpert.draft = null
            }
            await f.handler.execute(command({ resumeXpertId: f.xpert.id, onImported: f.checkpoint }))
            expect(f.commands.execute.mock.calls.filter(([input]) => input instanceof XpertImportCommand)).toHaveLength(
                1
            )
            expect(f.xperts.findOneByIdWithinTenant).toHaveBeenCalledWith('xpert-1')
            expect(f.initialize).toHaveBeenLastCalledWith(templateId, workspaceId, LanguagesEnum.English, 'xpert-1')
            expect(f.xperts.delete).not.toHaveBeenCalled()
        }
    )

    it('repairs an incomplete draft in place using the original model and data scope', async () => {
        const f = await createFixture()
        f.xpert.draft = null
        await f.handler.execute(command({ resumeXpertId: f.xpert.id, onImported: f.checkpoint }))
        const imports = f.commands.execute.mock.calls
            .map(([input]) => input)
            .filter((input): input is XpertImportCommand => input instanceof XpertImportCommand)
        expect(imports).toHaveLength(1)
        expect(imports[0].options).toMatchObject({
            targetXpertId: 'xpert-1',
            normalizeCopilotModels: false,
            workspaceDataScope: 'user',
            templateId,
            sourceTemplateId: templateId,
            language: LanguagesEnum.English
        })
        expect(f.installer.installComponentsForXpert).toHaveBeenCalledWith(
            expect.objectContaining({ draft: expect.objectContaining({ nodes: expect.any(Array) }) }),
            []
        )
    })

    it.each([false, true])(
        'does not reimport or republish a published Assistant (later draft: %s)',
        async (hasDraft) => {
            const f = await createFixture()
            f.xpert.publishAt = new Date()
            if (!hasDraft) f.xpert.draft = null
            const draft = f.xpert.draft
            await expect(
                f.handler.execute(command({ resumeXpertId: f.xpert.id, onImported: f.checkpoint }))
            ).resolves.toEqual({
                installations: [],
                pendingAuth: [],
                xpert: f.xpert
            })
            expect(f.commands.execute).not.toHaveBeenCalled()
            expect(f.installer.installComponentsForXpert).not.toHaveBeenCalled()
            expect(f.xpert.draft).toBe(draft)
            expect(f.initialize).toHaveBeenCalledTimes(1)
        }
    )

    it.each(['workspace', 'template', 'missing-source'] as const)(
        'rejects a changed %s before checkpoints or mutations',
        async (scope) => {
            const f = await createFixture()
            if (scope === 'workspace') f.xpert.workspaceId = 'workspace-2'
            if (scope === 'template')
                f.xpert.options = {
                    templateSource: { templateId: 'different-template', templateKey: 'different-template' }
                }
            if (scope === 'missing-source') f.xpert.options = {}
            await expect(
                f.handler.execute(command({ resumeXpertId: f.xpert.id, onImported: f.checkpoint }))
            ).rejects.toThrow()
            expect(f.checkpoint).not.toHaveBeenCalled()
            expect(f.commands.execute).not.toHaveBeenCalled()
            expect(f.installer.installComponentsForXpert).not.toHaveBeenCalled()
            expect(f.xperts.delete).not.toHaveBeenCalled()
        }
    )

    it('propagates tenant-scoped lookup failure without creating a replacement', async () => {
        const f = await createFixture()
        f.xperts.findOneByIdWithinTenant.mockRejectedValueOnce(new NotFoundException('not found in current tenant'))
        await expect(
            f.handler.execute(command({ resumeXpertId: 'inaccessible', onImported: f.checkpoint }))
        ).rejects.toThrow('not found in current tenant')
        expect(f.checkpoint).not.toHaveBeenCalled()
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('checks workspace author permission before accessing the recovery target', async () => {
        const f = await createFixture()
        f.workspaceAccess.assertCanAuthor.mockRejectedValueOnce(new Error('access denied'))
        await expect(
            f.handler.execute(command({ resumeXpertId: f.xpert.id, onImported: f.checkpoint }))
        ).rejects.toThrow('access denied')
        expect(f.xperts.findOneByIdWithinTenant).not.toHaveBeenCalled()
        expect(f.templates.getTemplateDetail).not.toHaveBeenCalled()
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('still rolls back ordinary non-resumable installations on failure', async () => {
        const f = await createFixture()
        f.installer.installComponentsForXpert.mockRejectedValueOnce(new Error('installation failed'))
        await expect(f.handler.execute(command())).rejects.toThrow('installation failed')
        expect(f.xperts.delete).toHaveBeenCalledWith('xpert-1')
    })
})
