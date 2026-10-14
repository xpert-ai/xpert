import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { NotFoundException } from '@nestjs/common'
import { LanguagesEnum, TXpertTeamDraft, TemplateUpgradeInput } from '@xpert-ai/contracts'
import { TemplateUpgradeService } from './template-upgrade.service'
import { TemplateUpgradeEntity } from './template-upgrade.entity'
import { TemplateAuthoring } from './template-authoring'
import { XpertService } from '../xpert.service'
import { XpertTemplateService } from '../../xpert-template/xpert-template.service'
import { portableDraft, portableTemplateSchema } from '../../xpert-template/lifecycle/portable-template'
import { sectionHashes } from '../../xpert-template/lifecycle/template-baseline'
import {
    PrepareAssistantDefinitionCommand,
    ReconcileTemplateSkillReferencesCommand,
    InstallAssistantDefinitionDependenciesCommand
} from '../../plugin-resource/template-installation/template-readiness.command'
import { XpertPublishCommand } from '../commands/publish.command'

const content = () =>
    portableTemplateSchema.parse({
        presentation: { title: 'Office', description: '', starters: [] },
        instructions: {
            primary: 'primary',
            agents: [{ key: 'primary', name: 'office', title: 'Office', description: '', prompt: 'Original' }]
        },
        runtime: { sandbox: false, middleware: [], connections: [] },
        definition: { metadata: { schemaVersion: 2 } }
    })
describe('template upgrade durable workflow', () => {
    let service: TemplateUpgradeService, draft: TXpertTeamDraft, revision: string, row: TemplateUpgradeEntity | null
    let publishFailure: boolean, installed: boolean
    const authoring = { load: jest.fn() },
        xperts = { saveDraft: jest.fn() },
        templates = { getTemplateDetail: jest.fn() }
    const commands = { execute: jest.fn() }
    const repository = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() }
    const database = { getRepository: () => repository, transaction: async (run) => run({ query: jest.fn() }) }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                TemplateUpgradeService,
                { provide: TemplateAuthoring, useValue: authoring },
                { provide: DataSource, useValue: database },
                { provide: XpertService, useValue: xperts },
                { provide: XpertTemplateService, useValue: templates },
                { provide: CommandBus, useValue: commands }
            ]
        }).compile()
        service = module.get(TemplateUpgradeService)
    })
    beforeEach(() => {
        jest.clearAllMocks()
        row = null
        revision = 'initial'
        publishFailure = false
        installed = false
        draft = portableDraft(content())
        draft.team.id = 'assistant'
        draft.team.copilotModel = { copilotId: 'local-model', model: 'local' }
        draft.team.options.templateSource = {
            templateId: 'source',
            templateKey: 'source',
            baseline: sectionHashes(content())
        }
        const incoming = content()
        incoming.instructions.agents[0].prompt = 'Updated'
        templates.getTemplateDetail.mockResolvedValue({
            id: 'source',
            name: 'Office',
            type: 'agent',
            category: 'assistant',
            pluginVersion: '1.1.0',
            export_data: JSON.stringify(portableDraft(incoming))
        })
        authoring.load.mockImplementation(async () => ({
            revision,
            draft: structuredClone(draft),
            xpert: {
                id: 'assistant',
                tenantId: 'tenant',
                organizationId: 'org',
                workspaceId: 'workspace',
                publishAt: new Date(),
                options: draft.team.options,
                draft: installed ? null : draft,
                agent: { key: 'primary', id: 'agent', updatedAt: new Date('2026-10-14') },
                agents: []
            }
        }))
        repository.findOne.mockImplementation(async () => row)
        repository.create.mockImplementation((value) => ({ ...value, id: 'operation' }))
        repository.save.mockImplementation(async (value) => {
            row = structuredClone(value)
            return structuredClone(row)
        })
        xperts.saveDraft.mockImplementation(async (_id, value) => {
            draft = structuredClone(value)
            revision += '-saved'
            installed = false
        })
        commands.execute.mockImplementation(async (command) => {
            if (command instanceof ReconcileTemplateSkillReferencesCommand) return command.draft
            if (command instanceof PrepareAssistantDefinitionCommand)
                return { definition: { template: { schemaVersion: 2 } }, locks: [] }
            if (command instanceof InstallAssistantDefinitionDependenciesCommand) return undefined
            if (command instanceof XpertPublishCommand) {
                if (publishFailure) throw new Error('publication unavailable')
                installed = true
                revision += '-published'
            }
        })
    })
    const input = async (): Promise<TemplateUpgradeInput> => {
        const preview = await service.preview('assistant', LanguagesEnum.English)
        return { revision: preview.revision, sourceHash: preview.sourceHash, choices: { instructions: 'replace' } }
    }
    it('requires explicit decisions and rejects stale previews before mutation', async () => {
        const valid = await input()
        await expect(
            service.apply('assistant', LanguagesEnum.English, { ...valid, choices: {} })
        ).rejects.toMatchObject({ status: 400 })
        await expect(
            service.apply('assistant', LanguagesEnum.English, { ...valid, revision: 'stale' })
        ).rejects.toMatchObject({ status: 409 })
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })
    it('keeps identity/model and can publish or roll back a durable draft', async () => {
        const operation = await service.apply('assistant', LanguagesEnum.English, await input())
        expect(operation).toMatchObject({ state: 'draft', canResume: true, canRollback: true })
        expect(draft.team.id).toBe('assistant')
        expect(draft.team.copilotModel.model).toBe('local')
        expect((await service.resume('assistant', operation.id)).state).toBe('published')
        expect((await service.rollback('assistant', operation.id)).state).toBe('rolled-back')
        expect(draft.nodes[0].entity).toMatchObject({ prompt: 'Original', updatedAt: new Date('2026-10-14') })
    })
    it('persists a publishing failure and resumes exactly the saved operation', async () => {
        const operation = await service.apply('assistant', LanguagesEnum.English, await input())
        publishFailure = true
        await expect(service.resume('assistant', operation.id)).rejects.toThrow('publication unavailable')
        expect(row.state).toBe('failed')
        expect((await service.preview('assistant', LanguagesEnum.English)).operation.canResume).toBe(true)
        publishFailure = false
        expect((await service.resume('assistant', operation.id)).state).toBe('published')
        const calls = commands.execute.mock.calls.length
        expect((await service.resume('assistant', operation.id)).state).toBe('published')
        expect(commands.execute).toHaveBeenCalledTimes(calls)
    })
    it('refuses recovery after a later local edit without overwriting it', async () => {
        const operation = await service.apply('assistant', LanguagesEnum.English, await input())
        revision = 'user-edit'
        xperts.saveDraft.mockClear()
        await expect(service.rollback('assistant', operation.id)).rejects.toMatchObject({ status: 409 })
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })
    it('retains rollback controls when the source publication is withdrawn', async () => {
        await service.apply('assistant', LanguagesEnum.English, await input())
        templates.getTemplateDetail.mockRejectedValue(new NotFoundException())
        expect((await service.preview('assistant', LanguagesEnum.English)).operation.canRollback).toBe(true)
    })
    it('checks authoring permission before reading the source or changing anything', async () => {
        authoring.load.mockRejectedValue(new Error('forbidden'))
        await expect(service.preview('assistant', LanguagesEnum.English)).rejects.toThrow('forbidden')
        expect(templates.getTemplateDetail).not.toHaveBeenCalled()
        expect(xperts.saveDraft).not.toHaveBeenCalled()
    })
})
