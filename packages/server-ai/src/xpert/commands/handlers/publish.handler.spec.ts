jest.mock('../../publication/publication-persistence', () => ({
    XpertPublicationPersistence: class XpertPublicationPersistence {}
}))
import { BadRequestException, ConflictException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { I18nService } from 'nestjs-i18n'

jest.mock('@xpert-ai/server-core', () => ({
    BusinessArea: class BusinessArea {},
    RequestContext: {
        currentUserId: jest.fn(),
        getLanguageCode: jest.fn().mockReturnValue('en')
    }
}))

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../xpert-agent/xpert-agent.service', () => ({
    XpertAgentService: class XpertAgentService {}
}))

jest.mock('../../../prompt-workflow', () => ({
    PromptWorkflowService: class PromptWorkflowService {}
}))

jest.mock('../../types', () => ({
    EventName_XpertPublished: 'xpert.published'
}))

import { BusinessArea, RequestContext } from '@xpert-ai/server-core'
import type { Repository } from 'typeorm'
import {
    AiModelTypeEnum,
    IWorkflowNode,
    IXpertAgent,
    TXpertTeamDraft,
    WorkflowNodeTypeEnum,
    XpertTypeEnum
} from '@xpert-ai/contracts'
import { PromptWorkflowService } from '../../../prompt-workflow'
import { XpertPrincipalService } from '../../xpert-principal.service'
import { Xpert } from '../../xpert.entity'
import { XpertService } from '../../xpert.service'
import { XpertPublishCommand } from '../publish.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'
import { PublicationStore, XpertPublicationPersistence } from '../../publication/publication-persistence'
import { XpertPublishHandler } from './publish.handler'
import { assistantModelCandidates } from '../../assistant-model-selection.util'
import { resolveEffectiveCopilotModel } from '../../../xpert-agent/effective-copilot-model'

describe('XpertPublishHandler', () => {
    it('wires the transactional publication provider through Nest', async () => {
        const moduleRef = await Test.createTestingModule({
            providers: [
                XpertPublishHandler,
                ...[
                    XpertService,
                    I18nService,
                    CommandBus,
                    EventEmitter2,
                    getRepositoryToken(BusinessArea),
                    PromptWorkflowService,
                    XpertPrincipalService,
                    XpertPublicationPersistence
                ].map((provide) => ({ provide, useValue: {} }))
            ]
        }).compile()
        expect(moduleRef.get(XpertPublishHandler)).toBeInstanceOf(XpertPublishHandler)
        await moduleRef.close()
    })

    function createHandler(xpertOverrides: Partial<Xpert> = {}) {
        const xpert = {
            id: 'xpert-1',
            slug: 'support-expert',
            name: 'Support Expert',
            tenantId: 'tenant-1',
            organizationId: null,
            createdById: 'user-1',
            workspaceId: null,
            type: XpertTypeEnum.Agent,
            version: null,
            latest: false,
            draft: {
                team: {},
                nodes: [],
                connections: []
            },
            userGroups: [],
            agent: {
                id: 'agent-1',
                options: {
                    hidden: true
                },
                key: 'Agent_primary'
            },
            agents: [],
            ...xpertOverrides
        } as Xpert

        const xpertService = {
            findOne: jest.fn().mockResolvedValue(xpert),
            assertCanAuthorById: jest.fn().mockResolvedValue(undefined),
            findAll: jest.fn().mockResolvedValue({ items: [xpert] }),
            validate: jest.fn().mockResolvedValue([]),
            validateTagAssociations: jest.fn().mockResolvedValue(undefined),
            save: jest.fn().mockImplementation(async (entity: Xpert) => entity),
            createVersionBackup: jest
                .fn()
                .mockImplementation(async (entity: Xpert) => ({ ...entity, id: 'backup-xpert' })),
            create: jest.fn().mockImplementation(async (entity: Xpert) => ({ ...entity, id: 'backup-xpert' }))
        }
        const storedAgents = new Map([xpert.agent, ...xpert.agents].map((agent) => [agent.id, { ...agent }]))
        const xpertAgentService = {
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn(async (id: string, entity: Partial<IXpertAgent>) => {
                const saved = {
                    ...storedAgents.get(id),
                    // TypeORM skips undefined; only an explicit null clears a persisted binding.
                    ...Object.fromEntries(Object.entries(entity).filter(([, value]) => value !== undefined))
                }
                storedAgents.set(id, saved)
                return saved
            })
        }
        const xpertPrincipalService = {
            ensurePrincipalUser: jest.fn().mockResolvedValue({
                id: 'assistant-user-1',
                tenantId: 'tenant-1'
            })
        }
        const commandBus = {
            execute: jest.fn()
        }
        const eventEmitter = {
            emitAsync: jest.fn()
        }
        const businessAreaRepository = {
            findOne: jest.fn().mockResolvedValue({
                id: 'area-1',
                name: 'Operations',
                tenantId: xpert.tenantId,
                organizationId: xpert.organizationId
            })
        }

        const store = {
            advanceVersion: jest.fn().mockResolvedValue(undefined),
            saveTeam: xpertService.save,
            createBackup: (entity: Partial<Xpert>) => xpertService.createVersionBackup(entity, xpert.id),
            createAgent: xpertAgentService.create,
            updateAgent: xpertAgentService.update,
            deleteAgent: jest.fn()
        }
        const persistence = {
            completeActivation: jest.fn().mockResolvedValue(undefined),
            run: jest.fn(async (_snapshot: Xpert, write: (store: PublicationStore) => Promise<Xpert>) =>
                write(store as unknown as PublicationStore)
            )
        }
        const handler = new XpertPublishHandler(
            xpertService as unknown as XpertService,
            { translate: jest.fn() } as unknown as I18nService,
            commandBus as unknown as CommandBus,
            eventEmitter as unknown as EventEmitter2,
            businessAreaRepository as unknown as Repository<BusinessArea>,
            undefined,
            xpertPrincipalService as unknown as XpertPrincipalService,
            persistence as unknown as XpertPublicationPersistence
        )

        return {
            handler,
            persistence,
            store,
            xpertService,
            xpertAgentService,
            xpertPrincipalService,
            businessAreaRepository,
            commandBus,
            eventEmitter,
            storedAgents,
            xpert
        }
    }

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('application speech-model repair', () => {
        const model = { copilotId: 'speech-provider', model: 'speech', modelType: AiModelTypeEnum.SPEECH2TEXT }
        const published = { draft: null, publishAt: new Date(), version: '1', graph: { nodes: [], connections: [] } }

        it('publishes the selected model from the current graph through the normal authorized transaction', async () => {
            const f = createHandler(published)
            const result = await f.handler.execute(XpertPublishCommand.repairSpeechModel(f.xpert.id, model))
            expect(f.xpertService.assertCanAuthorById).toHaveBeenCalledWith(f.xpert.id)
            expect(f.xpertService.validate).toHaveBeenCalledWith(
                expect.objectContaining({
                    team: expect.objectContaining({
                        features: expect.objectContaining({ speechToText: { enabled: true, copilotModel: model } })
                    })
                }),
                expect.anything()
            )
            expect(f.persistence.run.mock.calls[0][0].draft).toBeNull()
            expect(result.features.speechToText).toEqual({ enabled: true, copilotModel: model })
            expect(result.id).toBe(f.xpert.id)
            expect(result.draft).toBeNull()
        })

        it('refuses an existing draft and leaves it untouched', async () => {
            const draft: TXpertTeamDraft = { team: { title: 'Unreviewed draft' }, nodes: [], connections: [] }
            const f = createHandler({ ...published, draft })
            await expect(f.handler.execute(XpertPublishCommand.repairSpeechModel(f.xpert.id, model))).rejects.toThrow(
                ConflictException
            )
            expect(f.xpert.draft).toEqual(draft)
            expect(f.persistence.run).not.toHaveBeenCalled()
            expect(f.xpertService.save).not.toHaveBeenCalled()
        })

        it('propagates a concurrent-edit rejection without saving or activating the repair', async () => {
            const f = createHandler(published)
            f.persistence.run.mockRejectedValue(new ConflictException('stale'))
            await expect(f.handler.execute(XpertPublishCommand.repairSpeechModel(f.xpert.id, model))).rejects.toThrow(
                ConflictException
            )
            expect(f.xpertService.save).not.toHaveBeenCalled()
            expect(f.eventEmitter.emitAsync).not.toHaveBeenCalled()
        })

        it('rechecks authoring permission and does not overwrite a model repaired by another request', async () => {
            const f = createHandler({
                ...published,
                features: { speechToText: { enabled: true, copilotModel: model } }
            } as Partial<Xpert>)
            await f.handler.execute(XpertPublishCommand.repairSpeechModel(f.xpert.id, { ...model, model: 'other' }))
            expect(f.xpertService.assertCanAuthorById).toHaveBeenCalledWith(f.xpert.id)
            expect(f.persistence.run).not.toHaveBeenCalled()
            f.xpertService.assertCanAuthorById.mockRejectedValue(new Error('denied'))
            await expect(f.handler.execute(XpertPublishCommand.repairSpeechModel(f.xpert.id, model))).rejects.toThrow(
                'denied'
            )
        })
    })

    describe('published model inheritance', () => {
        const previousModel = {
            id: 'old-binding',
            copilotId: 'provider',
            model: 'deepseek',
            modelType: AiModelTypeEnum.LLM
        }
        const assistantModel = {
            id: 'base-binding',
            copilotId: 'provider',
            model: 'doubao',
            modelType: AiModelTypeEnum.LLM
        }
        const updatedAt = new Date('2026-10-01T00:00:00Z')

        function setup(nodeModel: IXpertAgent['copilotModel']) {
            const agent: IXpertAgent = {
                id: 'agent-1',
                key: 'Agent_primary',
                updatedAt,
                copilotModel: previousModel,
                copilotModelId: previousModel.id
            }
            const child: IXpertAgent = { ...agent, id: 'agent-2', key: 'Agent_child' }
            const draft: TXpertTeamDraft = JSON.parse(
                JSON.stringify({
                    team: {
                        agent,
                        copilotModel: assistantModel,
                        options: { modelSelection: { allowedModels: [previousModel, assistantModel] } }
                    },
                    nodes: [agent, child].map((entity) => ({
                        type: 'agent',
                        key: entity.key,
                        position: { x: 0, y: 0 },
                        entity: { ...entity, copilotModel: nodeModel }
                    })),
                    connections: [{ type: 'agent', key: 'primary/child', from: agent.key, to: child.key }]
                })
            )
            return createHandler({ agent, agents: [child], copilotModel: previousModel, draft })
        }

        it.each([undefined, null])(
            'clears inherited primary and child bindings after JSON serialization (%s)',
            async (nodeModel) => {
                const { handler, xpert, storedAgents } = setup(nodeModel)
                await handler.publish(xpert, '1', xpert.draft)

                const primary = storedAgents.get('agent-1')
                const child = storedAgents.get('agent-2')
                for (const agent of [primary, child]) {
                    expect(agent).toMatchObject({ copilotModel: null, copilotModelId: null })
                    expect(resolveEffectiveCopilotModel(xpert, agent, {})).toEqual(assistantModel)
                }
                expect(
                    xpert.graph.nodes.every(
                        (node) =>
                            node.type === 'agent' &&
                            node.entity.copilotModel === null &&
                            node.entity.copilotModelId === null
                    )
                ).toBe(true)
                expect(xpert.agents[0]).toMatchObject({ copilotModel: null, copilotModelId: null })
                const models = assistantModelCandidates({ ...xpert, agent: primary })
                expect(models.map(({ model, default: isDefault }) => [model.model, isDefault])).toEqual([
                    ['doubao', true],
                    ['deepseek', false]
                ])
                expect(xpert.options.modelSelection.allowedModels.map((model) => model.model)).toEqual(['deepseek'])

                // Reopening and publishing a later base-model change must keep inheritance intact.
                xpert.agent = primary
                xpert.agents = [child]
                const nextModel = { ...assistantModel, model: 'qwen' }
                const nextDraft: TXpertTeamDraft = JSON.parse(
                    JSON.stringify({
                        ...xpert.graph,
                        team: { ...xpert, copilotModel: nextModel }
                    })
                )
                await handler.publish(xpert, '1', nextDraft)
                expect(assistantModelCandidates({ ...xpert, agent: storedAgents.get('agent-1') })[0].model.model).toBe(
                    'qwen'
                )
                expect(resolveEffectiveCopilotModel(xpert, storedAgents.get('agent-2'), {})).toEqual(nextModel)
            }
        )

        it('preserves intentional primary and child overrides including model options', async () => {
            const override = { ...previousModel, options: { temperature: 0.2 } }
            const { handler, xpert, storedAgents } = setup(override)
            await handler.publish(xpert, '1', xpert.draft)

            for (const agent of storedAgents.values()) {
                expect(agent.copilotModel).toEqual(override)
                expect(agent.copilotModelId).toBe(override.id)
                expect(resolveEffectiveCopilotModel(xpert, agent, {})).toEqual(override)
            }
            expect(
                assistantModelCandidates({ ...xpert, agent: storedAgents.get('agent-1') }).map(
                    ({ model }) => model.model
                )
            ).toEqual(['deepseek', 'doubao'])
            expect(xpert.options.modelSelection.allowedModels.map((model) => model.model)).toEqual(['doubao'])
        })

        it.each([undefined, 'new-binding'])(
            'replaces stale binding IDs when selecting an explicit model (%s)',
            async (id) => {
                const override = { ...previousModel, id, model: 'qwen' }
                const { handler, xpert, storedAgents } = setup(override)
                await handler.publish(xpert, '1', xpert.draft)

                for (const agent of storedAgents.values()) {
                    expect(agent.copilotModel).toEqual(override)
                    expect(agent.copilotModelId).toBe(id ?? null)
                    expect(resolveEffectiveCopilotModel(xpert, agent, {})).toEqual(override)
                }
            }
        )
    })

    it('publishes through the prototype instance used by Nest forwardRef resolution', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        const { handler, xpert } = createHandler()
        // Mirrors Injector.instantiateClass when the provider uses forwardRef.
        const resolved: XpertPublishHandler = Object.assign(Object.create(XpertPublishHandler.prototype), handler)
        jest.spyOn(resolved, 'publish').mockResolvedValue(xpert)

        await expect(resolved.execute(new XpertPublishCommand('xpert-1', false, null, 'created'))).resolves.toBe(xpert)
    })

    it('rejects stale tag selections before creating a version backup or publishing agents', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        const { handler, xpertService, xpertAgentService, xpert } = createHandler({ version: '1' })
        xpert.draft.team.tags = [{ id: '11111111-1111-4111-8111-111111111111' }]
        xpertService.validateTagAssociations.mockRejectedValue(new BadRequestException('Tag unavailable'))
        const publishSpy = jest.spyOn(handler, 'publish')

        await expect(
            handler.execute(new XpertPublishCommand('xpert-1', true, '', 'release notes'))
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(xpertService.validateTagAssociations).toHaveBeenCalledWith(
            expect.objectContaining({
                id: xpert.id,
                workspaceId: xpert.workspaceId,
                tags: xpert.draft.team.tags
            })
        )
        expect(xpertService.save).not.toHaveBeenCalled()
        expect(xpertService.createVersionBackup).not.toHaveBeenCalled()
        expect(xpertAgentService.create).not.toHaveBeenCalled()
        expect(publishSpy).not.toHaveBeenCalled()
    })

    it('passes the persisted source identity when backing up version tag associations', async () => {
        const { handler, xpertService, xpert, store } = createHandler({ version: '1' })
        xpert.tags = [{ id: '11111111-1111-4111-8111-111111111111', isActive: false }]

        await handler.saveTeamVersion(xpert, '2', store as unknown as PublicationStore)

        expect(xpertService.createVersionBackup).toHaveBeenCalledWith(
            expect.objectContaining({
                tags: xpert.tags,
                version: '1',
                latest: false
            }),
            'xpert-1'
        )
        expect(xpertService.create).not.toHaveBeenCalled()
        expect(store.advanceVersion).toHaveBeenCalledWith('2')
        expect(xpertService.save).not.toHaveBeenCalled()
    })

    it('allows tenant creators to publish without user groups', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        const { handler, xpert } = createHandler()
        const publishResult = { id: 'xpert-1', version: '1' }
        const publishSpy = jest.spyOn(handler, 'publish').mockResolvedValue(publishResult as Xpert)

        const result = await handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))

        expect(result).toBe(publishResult)
        expect(publishSpy.mock.calls[0][0].environmentId).toBeNull()
        expect(publishSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: xpert.id }),
            '1',
            xpert.draft,
            undefined,
            expect.any(Object)
        )
    })

    it('keeps a concrete environment binding after trimming surrounding whitespace', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        const { handler, xpert } = createHandler()
        jest.spyOn(handler, 'publish').mockResolvedValue({ id: 'xpert-1', version: '1' } as Xpert)

        await handler.execute(new XpertPublishCommand('xpert-1', false, '  env-1  ', 'release notes'))

        expect(jest.mocked(handler.publish).mock.calls[0][0].environmentId).toBe('env-1')
    })

    it('passes marketplace metadata into the publish snapshot step', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        const { handler, xpert } = createHandler()
        const publishSpy = jest.spyOn(handler, 'publish').mockResolvedValue({ id: 'xpert-1', version: '1' } as Xpert)
        const marketplace = {
            summary: 'Handles support triage.',
            businessCategories: ['business-operations' as const],
            capabilityTags: ['triage']
        }

        await handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes', marketplace))

        expect(publishSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: xpert.id }),
            '1',
            xpert.draft,
            marketplace,
            expect.any(Object)
        )
    })

    it('assigns an organization business area independently from marketplace metadata', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        const { handler, xpert, businessAreaRepository } = createHandler({ organizationId: 'org-1' })
        jest.spyOn(handler, 'publish').mockResolvedValue({ id: 'xpert-1', version: '1' } as Xpert)

        await handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes', undefined, 'area-1'))

        expect(businessAreaRepository.findOne).toHaveBeenCalledWith({
            where: {
                id: 'area-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            }
        })
        expect(jest.mocked(handler.publish).mock.calls[0][0].businessAreaId).toBe('area-1')
        expect(jest.mocked(handler.publish).mock.calls[0][0].businessArea).toEqual(
            expect.objectContaining({ id: 'area-1', name: 'Operations' })
        )
    })

    it('rejects a business area from a different organization', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        const { handler, businessAreaRepository } = createHandler({ organizationId: 'org-1' })
        businessAreaRepository.findOne.mockResolvedValue(null)

        await expect(
            handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes', undefined, 'area-2'))
        ).rejects.toThrow(BadRequestException)
    })

    it('allows an authorized publisher to publish without a user group', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-2')

        const { handler } = createHandler()

        await expect(
            handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))
        ).resolves.toBeDefined()
    })

    it('does not couple organization-scoped publishing to user groups', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-2')

        const { handler } = createHandler({
            organizationId: 'org-1'
        })

        await expect(
            handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))
        ).resolves.toBeDefined()
    })

    it('ensures the xpert principal user before publishing any runnable xpert', async () => {
        const { handler, xpert, xpertPrincipalService, commandBus } = createHandler({
            userId: null,
            draft: {
                team: {},
                nodes: [
                    {
                        key: 'Schedule_trigger',
                        type: 'workflow',
                        entity: {
                            id: 'schedule-trigger-1',
                            key: 'Schedule_trigger',
                            type: WorkflowNodeTypeEnum.TRIGGER,
                            from: 'schedule',
                            config: {
                                enabled: true,
                                cron: '20 * * * *',
                                task: 'pull'
                            }
                        } as unknown as IWorkflowNode,
                        position: {
                            x: 0,
                            y: 0
                        }
                    }
                ],
                connections: []
            }
        })

        await handler.publish(xpert, '1', xpert.draft)

        expect(xpertPrincipalService.ensurePrincipalUser).toHaveBeenCalled()
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(XpertPublishTriggersCommand))
        expect(xpertPrincipalService.ensurePrincipalUser.mock.invocationCallOrder[0]).toBeLessThan(
            commandBus.execute.mock.invocationCallOrder[0]
        )
    })

    it('ensures the xpert principal user even when no schedule trigger exists', async () => {
        const { handler, xpert, xpertPrincipalService } = createHandler({
            userId: null
        })

        await handler.publish(xpert, '1', xpert.draft)

        expect(xpertPrincipalService.ensurePrincipalUser).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'xpert-1' })
        )
        expect(xpert.userId).toBe('assistant-user-1')
    })

    it('does not recreate an existing xpert principal user', async () => {
        const { handler, xpert, xpertPrincipalService } = createHandler({
            userId: 'assistant-user-existing'
        })

        await handler.publish(xpert, '1', xpert.draft)

        expect(xpertPrincipalService.ensurePrincipalUser).not.toHaveBeenCalled()
    })

    it('finishes interrupted publication without saving or replacing a later user draft', async () => {
        const { handler, xpert, xpertService, xpertPrincipalService, commandBus, eventEmitter } = createHandler({
            publishAt: new Date(),
            version: '1',
            userId: null
        })
        const draft = xpert.draft
        await handler.execute(new XpertPublishCommand(xpert.id, false, undefined, '', undefined, undefined, true))
        expect(xpertPrincipalService.ensurePrincipalUser).toHaveBeenCalledWith(xpert)
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(XpertPublishTriggersCommand))
        expect(eventEmitter.emitAsync).toHaveBeenCalledWith('xpert.published', xpert)
        expect(xpertService.save).not.toHaveBeenCalled()
        expect(xpertService.validate).not.toHaveBeenCalled()
        expect(xpert.draft).toBe(draft)
        expect(xpert.version).toBe('1')
    })

    it('preserves workspace data scope in a published version backup', async () => {
        const { handler, xpert, xpertService, store } = createHandler({
            version: '1',
            workspaceDataScope: 'user'
        })

        await handler.saveTeamVersion(xpert, '2', store as unknown as PublicationStore)

        expect(xpertService.createVersionBackup).toHaveBeenCalledWith(
            expect.objectContaining({
                latest: false,
                workspaceDataScope: 'user'
            }),
            xpert.id
        )
    })

    it('preserves the current environment when publication does not provide an override', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        const { handler } = createHandler({ environmentId: 'kept-environment' })
        const result = await handler.execute(new XpertPublishCommand('xpert-1', false, undefined, 'update'))
        expect(result.environmentId).toBe('kept-environment')
    })

    it('does not mutate the loaded version or draft when a transactional graph save fails', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        const { handler, xpert, store, persistence, commandBus } = createHandler({ version: '1' })
        const draft = structuredClone(xpert.draft)
        store.saveTeam.mockRejectedValueOnce(new Error('tool foreign key'))
        await expect(handler.execute(new XpertPublishCommand(xpert.id, true, undefined, 'update'))).rejects.toThrow(
            'tool foreign key'
        )
        expect(persistence.run).toHaveBeenCalledTimes(1)
        expect(xpert.version).toBe('1')
        expect(xpert.draft).toEqual(draft)
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('reports committed activation failure separately so recovery does not create another version', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
        const { handler, commandBus } = createHandler({ version: '1' })
        commandBus.execute.mockRejectedValue(new Error('trigger unavailable'))
        await expect(
            handler.execute(new XpertPublishCommand('xpert-1', true, undefined, 'update'))
        ).rejects.toMatchObject({
            response: { code: 'XPERT_PUBLICATION_ACTIVATION_PENDING', version: '2' }
        })
    })

    it('rejects activation recovery for a different version or an unpublished Assistant', async () => {
        for (const publishAt of [null, new Date()]) {
            const { handler, persistence, commandBus } = createHandler({ version: '3', publishAt })
            await expect(
                handler.execute(
                    new XpertPublishCommand('xpert-1', false, undefined, '', undefined, undefined, true, '2')
                )
            ).rejects.toThrow()
            expect(persistence.run).not.toHaveBeenCalled()
            expect(commandBus.execute).not.toHaveBeenCalled()
        }
    })

    it('denies command-level publication before reading or writing when authoring access was revoked', async () => {
        const { handler, xpertService, persistence } = createHandler()
        xpertService.assertCanAuthorById.mockRejectedValue(new Error('forbidden'))
        await expect(handler.execute(new XpertPublishCommand('xpert-1', true, undefined, ''))).rejects.toThrow(
            'forbidden'
        )
        expect(xpertService.findOne).not.toHaveBeenCalled()
        expect(persistence.run).not.toHaveBeenCalled()
    })

    it('recovers removed triggers from the durable previous graph without changing versions', async () => {
        const previousGraph = { nodes: [], connections: [] }
        const { handler, commandBus, persistence } = createHandler({
            version: '2',
            publishAt: new Date(),
            options: { pendingPublication: { version: '2', previousGraph } }
        })
        await handler.execute(new XpertPublishCommand('xpert-1', false, undefined, '', undefined, undefined, true, '2'))
        expect(commandBus.execute).toHaveBeenCalledWith(
            expect.objectContaining({ options: { strict: true, previousGraph } })
        )
        expect(persistence.completeActivation).toHaveBeenCalledTimes(1)
        expect(persistence.run).not.toHaveBeenCalled()
    })

    it('does not repeat activation after an acknowledged version has already completed', async () => {
        const { handler, commandBus, persistence } = createHandler({ version: '2', publishAt: new Date() })
        await handler.execute(new XpertPublishCommand('xpert-1', false, undefined, '', undefined, undefined, true, '2'))
        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(persistence.run).not.toHaveBeenCalled()
    })
})
