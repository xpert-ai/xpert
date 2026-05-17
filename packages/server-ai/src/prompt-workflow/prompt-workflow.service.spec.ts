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
jest.mock('../xpert/xpert.entity', () => ({
    Xpert: class {}
}))
jest.mock('./prompt-workflow.entity', () => ({
    PromptWorkflow: class {}
}))

import { PromptWorkflowService } from './prompt-workflow.service'

describe('PromptWorkflowService', () => {
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
})
