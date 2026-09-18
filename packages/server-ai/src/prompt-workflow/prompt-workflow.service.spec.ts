jest.mock('../xpert-workspace', () => ({
    XpertWorkspaceAccessService: class {},
    XpertWorkspaceBaseService: class<T> {
        protected repository: T

        constructor(repository: T) {
            this.repository = repository
        }

        protected async assertWorkspaceWriteAccess(workspaceId: string) {
            return {
                workspace: {
                    id: workspaceId
                }
            }
        }

        async create(entity: any) {
            return (this.repository as any).save(entity)
        }

        async save(entity: any) {
            return (this.repository as any).save(entity)
        }

        async findOne(id: string) {
            return (this.repository as any).findOne({
                where: {
                    id
                }
            })
        }
    }
}))
jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentUserId: jest.fn()
    }
}))
jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class {}
}))
jest.mock('./prompt-workflow.entity', () => ({
    PromptWorkflow: class {}
}))

import { PromptWorkflowService } from './prompt-workflow.service'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { Xpert } from '../xpert/xpert.entity'
import { PromptWorkflow } from './prompt-workflow.entity'

describe('PromptWorkflowService', () => {
    it('persists, clears and snapshots ordered scenarios while keeping published scenarios stable', async () => {
        const scenarios = [{ id: 'annual', label: 'Annual review', args: 'Review annual results' }]
        const workflow = {
            id: 'workflow-1',
            workspaceId: 'workspace-1',
            name: 'report',
            template: 'Report {{args}}',
            scenarios
        }
        const repository = {
            find: jest.fn(async () => [workflow]),
            findOne: jest.fn(async () => workflow),
            save: jest.fn(async (value) => value)
        }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            {} as XpertWorkspaceAccessService,
            {} as Repository<Xpert>
        )
        const live = await service.resolveRuntimeCommandProfile({ id: 'expert-1', workspaceId: 'workspace-1' })
        expect(live.workspaceCommands[0].scenarios).toEqual(scenarios)
        const updated = [{ id: 'ai', label: 'AI trends', args: 'Latest AI trends' }]
        const profile = {
            version: 1 as const,
            enabled: true,
            commands: [
                {
                    source: 'workspace_prompt_workflow' as const,
                    workflowId: workflow.id,
                    snapshot: { ...workflow, scenarios: updated }
                }
            ]
        }
        expect(
            (
                await service.resolveRuntimeCommandProfile({
                    id: 'expert-1',
                    workspaceId: 'workspace-1',
                    commandProfile: profile
                })
            ).workspaceCommands[0].scenarios
        ).toEqual(updated)
        await service.updateInWorkspace('workspace-1', workflow.id, { scenarios: [] })
        expect(repository.save).toHaveBeenLastCalledWith(expect.objectContaining({ scenarios: [] }))
        await expect(
            service.updateInWorkspace('workspace-1', workflow.id, {
                scenarios: [{ id: 'empty', label: '', args: 'x' }]
            })
        ).rejects.toThrow()
    })
    it('resolves expert-scoped capabilities for live prompts and published snapshots without leaking other experts', async () => {
        const selection = (id: string) => ({
            mode: 'allowlist' as const,
            inheritUnselected: true,
            skills: { ids: [] },
            plugins: { nodeKeys: [id] },
            connectors: { bindingIds: ['connector-1'] }
        })
        const workflow = {
            id: 'workflow-1',
            name: 'report',
            template: '{{args}}',
            workspaceId: 'workspace-1',
            runtimeCapabilities: {
                type: 'expert_scoped_capabilities',
                version: 1,
                experts: [
                    { xpertId: 'expert-1', selection: selection('tool-1') },
                    { xpertId: 'expert-2', selection: selection('tool-2') }
                ]
            }
        }
        const repository = { find: jest.fn(async () => [workflow]) }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            {} as XpertWorkspaceAccessService,
            {} as Repository<Xpert>
        )
        const first = await service.resolveRuntimeCommandProfile({ id: 'expert-1', workspaceId: 'workspace-1' })
        expect(first.workspaceCommands[0].runtimeCapabilities).toEqual(selection('tool-1'))
        const second = await service.resolveRuntimeCommandProfile({
            id: 'expert-2',
            workspaceId: 'workspace-1',
            commandProfile: {
                version: 1,
                enabled: true,
                commands: [{ source: 'workspace_prompt_workflow', workflowId: workflow.id, snapshot: workflow }]
            }
        })
        expect(second.workspaceCommands[0].runtimeCapabilities).toEqual(selection('tool-2'))
        const unconfigured = await service.resolveRuntimeCommandProfile({ id: 'expert-3', workspaceId: 'workspace-1' })
        expect(unconfigured.workspaceCommands[0].runtimeCapabilities).toBeNull()
        expect(workflow.runtimeCapabilities.experts).toHaveLength(2)
    })

    beforeEach(() => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue('user-1')
    })

    it('returns all active workspace prompt workflows when no command profile is configured', async () => {
        const repository = {
            find: jest.fn(async () => [
                {
                    id: 'workflow-review',
                    workspaceId: 'workspace-1',
                    name: 'review',
                    label: 'Review',
                    description: 'Review code',
                    template: 'Review {{args}}',
                    tags: ['code'],
                    archivedAt: null
                }
            ])
        }
        const service = new PromptWorkflowService(repository as any, {} as any, {} as any)

        const result = await service.resolveRuntimeCommandProfile({
            id: 'xpert-1',
            workspaceId: 'workspace-1',
            commandProfile: undefined
        })

        expect(result).toMatchObject({
            hasProfile: false,
            xpertCommands: [],
            workspaceCommands: [
                {
                    sourceType: 'workspace_prompt_workflow',
                    order: 0,
                    workflowId: 'workflow-review',
                    workspaceId: 'workspace-1',
                    name: 'review',
                    label: 'Review',
                    description: 'Review code',
                    template: 'Review {{args}}',
                    tags: ['code'],
                    archivedAt: null
                }
            ],
            preferredSkillEntries: [],
            skillEntries: []
        })
        expect(repository.find).toHaveBeenCalledWith({
            where: {
                workspaceId: 'workspace-1',
                archivedAt: expect.anything(),
                deletedAt: expect.anything()
            },
            order: {
                name: 'ASC'
            }
        })
    })

    it('returns an empty command list when the enabled profile and workspace are both empty', async () => {
        const repository = {
            find: jest.fn(async () => [])
        }
        const service = new PromptWorkflowService(repository as any, {} as any, {} as any)

        await expect(
            service.resolveRuntimeCommandProfile({
                id: 'xpert-1',
                workspaceId: 'workspace-1',
                commandProfile: {
                    version: 1,
                    enabled: true,
                    commands: []
                }
            })
        ).resolves.toEqual({
            hasProfile: true,
            xpertCommands: [],
            workspaceCommands: [],
            preferredSkillEntries: [],
            skillEntries: []
        })
        expect(repository.find).toHaveBeenCalled()
    })

    it('applies live expert scope to both default and configured commands, including published snapshots', async () => {
        const workflows = [
            { id: 'shared', name: 'shared', template: 'shared content' },
            { id: 'assigned', name: 'assigned', template: 'edited content', associatedXpertIds: ['expert-1'] },
            { id: 'other', name: 'other', template: 'other content', associatedXpertIds: ['expert-2'] },
            { id: 'unavailable', name: 'unavailable', template: 'hidden', associatedXpertIds: ['deleted-expert'] },
            { id: 'archived', name: 'archived', template: 'hidden', archivedAt: new Date() }
        ]
        const repository = { find: jest.fn().mockResolvedValue(workflows) }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            {} as XpertWorkspaceAccessService,
            {} as Repository<Xpert>
        )
        const profile = {
            version: 1 as const,
            enabled: true,
            commands: [
                {
                    source: 'workspace_prompt_workflow' as const,
                    workflowId: 'assigned',
                    snapshot: { name: 'assigned', template: 'published content' }
                },
                {
                    source: 'workspace_prompt_workflow' as const,
                    workflowId: 'other',
                    snapshot: { name: 'other', template: 'hidden snapshot' }
                },
                { source: 'workspace_prompt_workflow' as const, workflowId: 'archived' },
                {
                    source: 'workspace_prompt_workflow' as const,
                    workflowId: 'deleted',
                    snapshot: { name: 'deleted', template: 'hidden snapshot' }
                }
            ]
        }
        const result = await service.resolveRuntimeCommandProfile({
            id: 'expert-1',
            workspaceId: 'workspace-1',
            commandProfile: profile
        })
        expect(result.workspaceCommands.map((item) => item.name)).toEqual(['shared', 'assigned'])
        expect(result.workspaceCommands[1].template).toBe('published content')
        const emptyProfile = await service.resolveRuntimeCommandProfile({
            id: 'expert-1',
            workspaceId: 'workspace-1',
            commandProfile: { version: 1, enabled: true, commands: [] }
        })
        expect(emptyProfile.workspaceCommands.map((item) => item.name)).toEqual(['shared', 'assigned'])
        const optedOut = await service.resolveRuntimeCommandProfile({
            id: 'expert-1',
            workspaceId: 'workspace-1',
            commandProfile: {
                version: 1,
                enabled: true,
                commands: [{ source: 'workspace_prompt_workflow', workflowId: 'shared', enabled: false }]
            }
        })
        expect(optedOut.workspaceCommands.map((item) => item.name)).toEqual(['assigned'])
        repository.find.mockResolvedValue(workflows.filter((workflow) => !workflow.archivedAt))
        const defaultProfile = await service.resolveRuntimeCommandProfile({
            id: 'expert-1',
            workspaceId: 'workspace-1'
        })
        expect(defaultProfile.workspaceCommands.map((item) => item.name)).toEqual(['shared', 'assigned'])
    })

    it('clears optional editor fields instead of letting TypeORM silently retain their previous values', async () => {
        const current = {
            id: 'prompt-1',
            workspaceId: 'workspace-1',
            name: 'report',
            template: 'Report',
            description: 'old',
            argsHint: 'old hint',
            runtimeCapabilities: { skills: ['old'] },
            associatedXpertIds: ['expert-1']
        }
        const repository = { findOne: jest.fn().mockResolvedValue(current), save: jest.fn(async (value) => value) }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            {} as XpertWorkspaceAccessService,
            {} as Repository<Xpert>
        )
        await service.updateInWorkspace('workspace-1', 'prompt-1', {
            description: undefined,
            runtimeCapabilities: undefined
        })
        expect(current).toMatchObject({ description: 'old', runtimeCapabilities: { skills: ['old'] } })
        const result = await service.updateInWorkspace('workspace-1', 'prompt-1', {
            description: '',
            argsHint: '',
            runtimeCapabilities: null
        })
        expect(result).toMatchObject({
            description: null,
            argsHint: null,
            runtimeCapabilities: null,
            associatedXpertIds: ['expert-1']
        })
    })

    it('creates a prompt workflow by key when none exists', async () => {
        const repository = {
            findOne: jest.fn(async () => null),
            save: jest.fn(async (entity) => ({
                id: 'workflow-1',
                ...entity
            }))
        }
        const service = new PromptWorkflowService(repository as any, {} as any, {} as any)

        const result = await service.upsertInWorkspaceByKey('workspace-1', '/review', {
            label: 'Review',
            template: 'Review {{args}}.',
            visibility: 'team'
        })

        expect(result).toMatchObject({
            operation: 'created',
            workflow: {
                id: 'workflow-1',
                workspaceId: 'workspace-1',
                name: 'review',
                label: 'Review',
                template: 'Review {{args}}.',
                visibility: 'team',
                archivedAt: null
            }
        })
        expect(repository.findOne).toHaveBeenCalledWith({
            where: {
                workspaceId: 'workspace-1',
                name: 'review',
                deletedAt: expect.anything()
            }
        })
    })

    it('updates and unarchives a prompt workflow by key when one exists', async () => {
        const existing = {
            id: 'workflow-1',
            workspaceId: 'workspace-1',
            name: 'review',
            label: 'Old Review',
            template: 'Old template',
            archivedAt: new Date('2026-05-01T00:00:00.000Z')
        }
        const repository = {
            findOne: jest.fn(async (options) => {
                const where = options?.where
                return where?.id === 'workflow-1' || where?.name === 'review' ? existing : null
            }),
            save: jest.fn(async (entity) => entity)
        }
        const service = new PromptWorkflowService(repository as any, {} as any, {} as any)

        const result = await service.upsertInWorkspaceByKey('workspace-1', 'review', {
            label: 'Review',
            template: 'Review {{args}}.'
        })

        expect(result).toMatchObject({
            operation: 'updated',
            workflow: {
                id: 'workflow-1',
                workspaceId: 'workspace-1',
                name: 'review',
                label: 'Review',
                template: 'Review {{args}}.',
                archivedAt: null
            }
        })
    })

    it('archives a prompt workflow by key', async () => {
        const existing = {
            id: 'workflow-1',
            workspaceId: 'workspace-1',
            name: 'review',
            label: 'Review',
            template: 'Review {{args}}.',
            archivedAt: null
        }
        const repository = {
            findOne: jest.fn(async (options) => {
                const where = options?.where
                return where?.id === 'workflow-1' || where?.name === 'review' ? existing : null
            }),
            save: jest.fn(async (entity) => entity)
        }
        const service = new PromptWorkflowService(repository as any, {} as any, {} as any)

        const result = await service.archiveInWorkspaceByKey('workspace-1', 'review')

        expect(result.operation).toBe('deleted')
        expect(result.workflow.archivedAt).toBeInstanceOf(Date)
        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'workflow-1',
                archivedAt: expect.any(Date)
            })
        )
    })

    it('creates missing template defaults and preserves active or archived names', async () => {
        const existing = [
            {
                name: 'presentation-refine',
                template: 'User refine command',
                archivedAt: null,
                associatedXpertIds: ['user-selected-xpert']
            },
            {
                name: 'presentation-export',
                template: 'Archived user export command',
                archivedAt: new Date('2026-07-01T00:00:00.000Z')
            }
        ]
        const transactionRepository = {
            find: jest.fn(async () => existing),
            create: jest.fn((entity) => entity),
            save: jest.fn(async (entities) =>
                entities.map((entity, index) => ({ id: `workflow-${index + 1}`, ...entity }))
            )
        }
        const manager = {
            getRepository: jest.fn(() => transactionRepository)
        }
        const repository = {
            manager: {
                transaction: jest.fn((run: (value: typeof manager) => Promise<unknown>) => run(manager))
            }
        }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
            Object.create(Repository.prototype) as Repository<Xpert>
        )

        const result = await service.initializeDefaultsInWorkspace(
            'workspace-1',
            [
                { name: 'presentation-create', template: 'Create {{args}}.', visibility: 'team' },
                { name: 'presentation-refine', template: 'Refine {{args}}.', visibility: 'team' },
                { name: 'presentation-export', template: 'Export {{args}}.', visibility: 'team' },
                { name: 'presentation-share', template: 'Share {{args}}.', visibility: 'team' }
            ],
            'template-xpert',
            'template-a'
        )

        expect(result.created.map(({ name }) => name)).toEqual(['presentation-create', 'presentation-share'])
        expect(result.skipped).toEqual(['presentation-refine', 'presentation-export'])
        expect(transactionRepository.save).toHaveBeenCalledTimes(1)
        expect(transactionRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                name: 'presentation-create',
                workspaceId: 'workspace-1',
                associatedXpertIds: ['template-xpert'],
                sourceTemplateId: 'template-a',
                createdById: 'user-1',
                updatedById: 'user-1'
            }),
            expect.objectContaining({
                name: 'presentation-share',
                workspaceId: 'workspace-1',
                associatedXpertIds: ['template-xpert'],
                sourceTemplateId: 'template-a',
                createdById: 'user-1',
                updatedById: 'user-1'
            })
        ])
        expect(existing).toEqual([
            {
                name: 'presentation-refine',
                template: 'User refine command',
                archivedAt: null,
                associatedXpertIds: ['user-selected-xpert']
            },
            {
                name: 'presentation-export',
                template: 'Archived user export command',
                archivedAt: new Date('2026-07-01T00:00:00.000Z')
            }
        ])
    })

    it('adds each installed expert only to active scoped defaults from the same template', async () => {
        const stored = [
            {
                id: 'owned',
                name: 'owned',
                sourceTemplateId: 'template-a',
                associatedXpertIds: ['expert-a'],
                template: 'Edited content'
            },
            { id: 'custom', name: 'custom', associatedXpertIds: ['expert-a'] },
            { id: 'other', name: 'other', sourceTemplateId: 'template-b', associatedXpertIds: ['expert-a'] },
            { id: 'global', name: 'global', sourceTemplateId: 'template-a', associatedXpertIds: [] },
            {
                id: 'archived',
                name: 'archived',
                sourceTemplateId: 'template-a',
                associatedXpertIds: ['expert-a'],
                archivedAt: new Date()
            }
        ]
        const transactionRepository = {
            find: jest.fn(async () => stored),
            update: jest.fn(async (id: string, patch: { associatedXpertIds: string[] }) => {
                Object.assign(stored.find((item) => item.id === id)!, patch)
            }),
            create: jest.fn((entity) => entity),
            save: jest.fn()
        }
        const manager = { getRepository: jest.fn(() => transactionRepository) }
        const repository = {
            manager: { transaction: jest.fn((run: (value: typeof manager) => Promise<unknown>) => run(manager)) }
        }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
            Object.create(Repository.prototype) as Repository<Xpert>
        )
        const inputs = stored.map(({ name }) => ({ name, template: 'Default content' }))
        await service.initializeDefaultsInWorkspace('workspace-1', inputs, 'expert-b', 'template-a')
        await service.initializeDefaultsInWorkspace('workspace-1', inputs, 'expert-b', 'template-a')
        await service.initializeDefaultsInWorkspace('workspace-1', inputs, 'expert-c', 'template-a')
        expect(transactionRepository.update).toHaveBeenCalledTimes(2)
        expect(stored[0]).toMatchObject({
            associatedXpertIds: ['expert-a', 'expert-b', 'expert-c'],
            template: 'Edited content'
        })
        expect(stored.slice(1).map((item) => item.associatedXpertIds)).toEqual([
            ['expert-a'],
            ['expert-a'],
            [],
            ['expert-a']
        ])
        expect(transactionRepository.save).not.toHaveBeenCalled()
    })

    it('creates template defaults once and skips every name on repeated initialization', async () => {
        const stored: Array<{ id: string; name: string; template: string }> = []
        const transactionRepository = {
            find: jest.fn(async () => stored),
            create: jest.fn((entity) => entity),
            save: jest.fn(async (entities: Array<{ name: string; template: string }>) => {
                const created = entities.map((entity, index) => ({
                    id: `workflow-${stored.length + index + 1}`,
                    ...entity
                }))
                stored.push(...created)
                return created
            })
        }
        const manager = {
            getRepository: jest.fn(() => transactionRepository)
        }
        const repository = {
            manager: {
                transaction: jest.fn((run: (value: typeof manager) => Promise<unknown>) => run(manager))
            }
        }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
            Object.create(Repository.prototype) as Repository<Xpert>
        )
        const inputs = [
            { name: 'presentation-create', template: 'Create {{args}}.', visibility: 'team' as const },
            { name: 'presentation-refine', template: 'Refine {{args}}.', visibility: 'team' as const },
            { name: 'presentation-export', template: 'Export {{args}}.', visibility: 'team' as const },
            { name: 'presentation-share', template: 'Share {{args}}.', visibility: 'team' as const }
        ]

        const first = await service.initializeDefaultsInWorkspace('workspace-1', inputs)
        const repeated = await service.initializeDefaultsInWorkspace('workspace-1', inputs)

        expect(first.created.map(({ name }) => name)).toEqual(inputs.map(({ name }) => name))
        expect(first.skipped).toEqual([])
        expect(repeated).toEqual({
            created: [],
            skipped: inputs.map(({ name }) => name)
        })
        expect(transactionRepository.save).toHaveBeenCalledTimes(1)
    })

    it('keeps the template batch atomic when persistence fails', async () => {
        const persisted = [{ id: 'existing', name: 'existing', template: 'Existing command' }]
        const transactionRepository = {
            find: jest.fn(async () => []),
            create: jest.fn((entity) => entity),
            save: jest.fn(async (entities: Array<{ name: string; template: string }>) => {
                persisted.push({ id: 'partial', ...entities[0] })
                throw new Error('batch write failed')
            })
        }
        const manager = {
            getRepository: jest.fn(() => transactionRepository)
        }
        const repository = {
            manager: {
                transaction: jest.fn(async (run: (value: typeof manager) => Promise<unknown>) => {
                    const snapshot = [...persisted]
                    try {
                        return await run(manager)
                    } catch (error) {
                        persisted.splice(0, persisted.length, ...snapshot)
                        throw error
                    }
                })
            }
        }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
            Object.create(Repository.prototype) as Repository<Xpert>
        )

        await expect(
            service.initializeDefaultsInWorkspace('workspace-1', [
                { name: 'presentation-create', template: 'Create {{args}}.' },
                { name: 'presentation-export', template: 'Export {{args}}.' }
            ])
        ).rejects.toThrow('batch write failed')
        expect(persisted).toEqual([{ id: 'existing', name: 'existing', template: 'Existing command' }])
    })

    it('validates the complete template batch before starting a transaction', async () => {
        const transaction = jest.fn()
        const repository = { manager: { transaction } }
        const service = new PromptWorkflowService(
            repository as unknown as Repository<PromptWorkflow>,
            Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
            Object.create(Repository.prototype) as Repository<Xpert>
        )

        await expect(
            service.initializeDefaultsInWorkspace('workspace-1', [
                { name: 'presentation-create', template: 'Create {{args}}.' },
                { name: 'presentation-export', template: ' ' }
            ])
        ).rejects.toThrow('Prompt workflow template is required')
        expect(transaction).not.toHaveBeenCalled()
    })
})
