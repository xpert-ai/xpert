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

    it('uses an explicitly enabled empty command profile as an empty whitelist', async () => {
        const repository = {
            find: jest.fn()
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
        expect(repository.find).not.toHaveBeenCalled()
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
            { name: 'presentation-refine', template: 'User refine command', archivedAt: null },
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

        const result = await service.initializeDefaultsInWorkspace('workspace-1', [
            { name: 'presentation-create', template: 'Create {{args}}.', visibility: 'team' },
            { name: 'presentation-refine', template: 'Refine {{args}}.', visibility: 'team' },
            { name: 'presentation-export', template: 'Export {{args}}.', visibility: 'team' },
            { name: 'presentation-share', template: 'Share {{args}}.', visibility: 'team' }
        ])

        expect(result.created.map(({ name }) => name)).toEqual(['presentation-create', 'presentation-share'])
        expect(result.skipped).toEqual(['presentation-refine', 'presentation-export'])
        expect(transactionRepository.save).toHaveBeenCalledTimes(1)
        expect(transactionRepository.save).toHaveBeenCalledWith([
            expect.objectContaining({
                name: 'presentation-create',
                workspaceId: 'workspace-1',
                createdById: 'user-1',
                updatedById: 'user-1'
            }),
            expect.objectContaining({
                name: 'presentation-share',
                workspaceId: 'workspace-1',
                createdById: 'user-1',
                updatedById: 'user-1'
            })
        ])
        expect(existing).toEqual([
            { name: 'presentation-refine', template: 'User refine command', archivedAt: null },
            {
                name: 'presentation-export',
                template: 'Archived user export command',
                archivedAt: new Date('2026-07-01T00:00:00.000Z')
            }
        ])
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
