import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { KDocumentSourceType, KnowledgebasePermission } from '@xpert-ai/contracts'
import type { IKnowledgeDocument } from '@xpert-ai/contracts'

import { Knowledgebase } from '../persistence/knowledgebase.entity'

import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries'
import { VolumeSubtreeClient } from '../../shared/volume/volume-subtree'
import {
    KnowledgebaseRepositoryMock,
    QueryBusMock,
    WorkspaceAccessServiceMock,
    KnowledgebaseTaskServiceMock,
    KnowledgeDocumentServiceMock,
    KnowledgeWorkAreaResolverMock,
    runInRequestContext,
    createService
} from '../testing/knowledgebase-service.fixture'

describe('Knowledgebase task', () => {
    beforeEach(() => jest.clearAllMocks())
    afterEach(() => jest.restoreAllMocks())
    it('rejects a task conversation before creating the task when conversation access fails', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: null,
            createdById: 'user-1',
            status: 'ready'
        } as Knowledgebase
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn()
        }
        const queryBus: jest.Mocked<QueryBusMock> = {
            execute: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            queryBus,
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.createTask('kb-1', {
                    taskType: 'ingest',
                    conversationId: 'victim-conversation'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(AssertChatConversationAccessQuery))
        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('rejects an authorized conversation from a different knowledgebase scope', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            queryBus: {
                execute: jest.fn().mockResolvedValue({
                    id: 'conversation-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-2'
                })
            },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.createTask('kb-1', {
                    taskType: 'ingest',
                    conversationId: 'conversation-1'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('creates a task from canonical documents and drops client-controlled ownership fields', async () => {
        const knowledgebase = {
            id: 'kb-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            status: 'ready'
        } as Knowledgebase
        const document = { id: 'doc-1', knowledgebaseId: 'kb-1' }
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue(knowledgebase),
            delete: jest.fn()
        }
        const workspaceAccessService: jest.Mocked<WorkspaceAccessServiceMock> = {
            assertCan: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } })
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
            findOne: jest.fn().mockResolvedValue({ id: 'task-1', documents: [document] }),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const documentService: KnowledgeDocumentServiceMock = {
            findAll: jest.fn().mockResolvedValue({ items: [document], total: 1 }),
            findAncestors: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            queryBus: {
                execute: jest.fn().mockResolvedValue({
                    id: 'conversation-1',
                    tenantId: 'tenant-1',
                    organizationId: 'org-1'
                })
            },
            xpertService: { updateXpert: jest.fn() },
            workspaceAccessService,
            taskService,
            documentService
        })

        await runInRequestContext(() =>
            service.createTask('kb-1', {
                id: 'client-task-id',
                tenantId: 'victim-tenant',
                organizationId: 'victim-org',
                executionId: 'victim-execution',
                taskType: 'ingest',
                status: 'pending',
                conversationId: 'conversation-1',
                documents: [{ id: 'doc-1' } as never],
                steps: []
            })
        )

        expect(workspaceAccessService.assertCan).toHaveBeenCalledWith('workspace-1', 'write')
        expect(documentService.findAll).toHaveBeenCalledWith({
            where: {
                id: expect.anything(),
                knowledgebaseId: 'kb-1'
            }
        })
        expect(taskService.createTask).toHaveBeenCalledWith('kb-1', {
            taskType: 'ingest',
            status: 'pending',
            context: undefined,
            conversationId: 'conversation-1',
            documents: [document]
        })
        expect(taskService.createTask.mock.calls[0][1]).not.toEqual(
            expect.objectContaining({
                id: expect.anything(),
                tenantId: expect.anything(),
                organizationId: expect.anything(),
                executionId: expect.anything()
            })
        )
    })

    it('rejects nested conversation and file relations on task reads', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.getTask('kb-1', 'task-1', {
                    relations: ['conversation.messages.fileAssets']
                } as never)
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.findOneByOptions).not.toHaveBeenCalled()
    })

    it('rejects another organization member reading a private unscoped knowledgebase task', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'victim-user',
                permission: KnowledgebasePermission.Private
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(runInRequestContext(() => service.getTask('kb-1', 'task-1'))).rejects.toBeInstanceOf(
            ForbiddenException
        )

        expect(taskService.findOneByOptions).not.toHaveBeenCalled()
    })

    it('allows shared unscoped task reads but keeps task writes owner-only', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'victim-user',
                permission: KnowledgebasePermission.Organization,
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const task = { id: 'task-1', knowledgebaseId: 'kb-1' }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn().mockResolvedValue(task),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(runInRequestContext(() => service.getTask('kb-1', 'task-1'))).resolves.toBe(task)
        await expect(
            runInRequestContext(() => service.createTask('kb-1', { taskType: 'ingest' }))
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('canonicalizes uploaded task context files and drops client-controlled storage ownership', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                permission: KnowledgebasePermission.Private,
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
            findOne: jest.fn().mockResolvedValue({ id: 'task-1', documents: [] }),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const knowledgeWorkAreaResolver: jest.Mocked<KnowledgeWorkAreaResolverMock> = {
            getFilesPath: jest.fn().mockReturnValue('files'),
            resolve: jest.fn().mockResolvedValue({ volume: {} })
        }
        const parentFolder = {
            id: 'folder-1',
            knowledgebaseId: 'kb-1',
            name: 'reports',
            sourceType: KDocumentSourceType.FOLDER
        } as IKnowledgeDocument
        const documentService: KnowledgeDocumentServiceMock = {
            findAll: jest.fn(),
            findAncestors: jest.fn().mockResolvedValue([parentFolder]),
            findOne: jest.fn().mockResolvedValue(parentFolder),
            save: jest.fn()
        }
        const readFile = jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'reports/plan.pdf',
            fileUrl: 'https://files.example.test/reports/plan.pdf',
            mimeType: 'application/pdf'
        })
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService,
            documentService,
            knowledgeWorkAreaResolver
        })

        await runInRequestContext(() =>
            service.createTask('kb-1', {
                taskType: 'ingest',
                context: {
                    documents: [
                        {
                            id: 'preview-doc-1',
                            name: 'plan.pdf',
                            type: 'pdf',
                            filePath: 'files/reports/plan.pdf',
                            fileUrl: 'https://attacker.example.test/file.pdf',
                            storageFileId: 'victim-storage-file',
                            tenantId: 'victim-tenant',
                            organizationId: 'victim-org',
                            parent: { id: 'folder-1' } as IKnowledgeDocument,
                            draft: {
                                parserId: '',
                                parserConfig: {},
                                type: 'pdf',
                                name: 'attacker.pdf',
                                filePath: '/etc/passwd',
                                fileUrl: 'https://attacker.example.test/file.pdf'
                            }
                        }
                    ]
                }
            })
        )

        expect(readFile).toHaveBeenCalledWith('files', 'reports/plan.pdf', { metadataOnly: true })
        const savedDocument = taskService.createTask.mock.calls[0][1].context.documents[0]
        expect(savedDocument).toMatchObject({
            id: 'preview-doc-1',
            filePath: 'files/reports/plan.pdf',
            fileUrl: 'https://files.example.test/reports/plan.pdf',
            mimeType: 'application/pdf',
            parent: { id: parentFolder.id }
        })
        expect(documentService.findOne).toHaveBeenCalledWith('folder-1')
        expect(documentService.findAncestors).toHaveBeenCalledWith('folder-1')
        expect(savedDocument).not.toHaveProperty('storageFileId')
        expect(savedDocument).not.toHaveProperty('tenantId')
        expect(savedDocument).not.toHaveProperty('organizationId')
        expect(savedDocument).not.toHaveProperty('draft')
    })

    it('resolves only folder parents from the selected knowledgebase', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn(),
            delete: jest.fn()
        }
        const parentFolder = {
            id: 'folder-1',
            knowledgebaseId: 'kb-1',
            sourceType: KDocumentSourceType.FOLDER
        } as IKnowledgeDocument
        const documentService: KnowledgeDocumentServiceMock = {
            findAll: jest.fn(),
            findAncestors: jest.fn().mockResolvedValue([parentFolder]),
            findOne: jest.fn().mockResolvedValue(parentFolder),
            save: jest.fn()
        }
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            documentService
        })

        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'folder-1')).resolves.toEqual([parentFolder])

        documentService.findOne.mockResolvedValueOnce({ ...parentFolder, knowledgebaseId: 'kb-2' })
        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'folder-2')).rejects.toBeInstanceOf(
            BadRequestException
        )

        documentService.findOne.mockResolvedValueOnce({ ...parentFolder, sourceType: KDocumentSourceType.FILE })
        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'file-1')).rejects.toBeInstanceOf(
            BadRequestException
        )

        documentService.findOne.mockResolvedValueOnce(parentFolder)
        documentService.findAncestors.mockResolvedValueOnce([
            { ...parentFolder, id: 'foreign-root', knowledgebaseId: 'kb-2' },
            parentFolder
        ])
        await expect(service.resolveKnowledgebaseFolderAncestors('kb-1', 'folder-1')).rejects.toBeInstanceOf(
            BadRequestException
        )
    })

    it.each([
        ['an absolute path', { filePath: '/etc/passwd' }],
        ['a traversal path', { filePath: 'files/../../etc/passwd' }],
        ['a remote URL without a managed file', { fileUrl: 'https://attacker.example.test/file.pdf' }]
    ])('rejects task context documents using %s', async (_label, document) => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                permission: KnowledgebasePermission.Private,
                status: 'ready'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn(),
            update: jest.fn()
        }
        const knowledgeWorkAreaResolver: jest.Mocked<KnowledgeWorkAreaResolverMock> = {
            getFilesPath: jest.fn().mockReturnValue('files'),
            resolve: jest.fn().mockResolvedValue({ volume: {} })
        }
        jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockRejectedValue(new ForbiddenException())
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            taskService,
            knowledgeWorkAreaResolver
        })

        await expect(
            runInRequestContext(() =>
                service.createTask('kb-1', {
                    taskType: 'ingest',
                    context: { documents: [document] }
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.createTask).not.toHaveBeenCalled()
    })

    it('previews only the canonical managed knowledgebase file', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                permission: KnowledgebasePermission.Private
            } as Knowledgebase),
            delete: jest.fn()
        }
        const knowledgeWorkAreaResolver: jest.Mocked<KnowledgeWorkAreaResolverMock> = {
            getFilesPath: jest.fn().mockReturnValue('files'),
            resolve: jest.fn().mockResolvedValue({ volume: {} })
        }
        jest.spyOn(VolumeSubtreeClient.prototype, 'readFile').mockResolvedValue({
            filePath: 'reports/plan.pdf',
            fileUrl: 'https://files.example.test/reports/plan.pdf',
            mimeType: 'application/pdf'
        })
        const service = createService({
            repository,
            commandBus: { execute: jest.fn() },
            xpertService: { updateXpert: jest.fn() },
            knowledgeWorkAreaResolver
        })
        const transformDocuments = jest.spyOn(service, 'transformDocuments').mockResolvedValue([
            {
                chunks: [{ pageContent: 'managed content', metadata: {} }]
            }
        ])

        await expect(runInRequestContext(() => service.previewFile('kb-1', 'files/reports/plan.pdf'))).resolves.toEqual(
            [{ pageContent: 'managed content', metadata: {} }]
        )

        expect(transformDocuments).toHaveBeenCalledWith('kb-1', expect.anything(), false, [
            expect.objectContaining({
                filePath: 'files/reports/plan.pdf',
                type: 'pdf',
                fileUrl: 'https://files.example.test/reports/plan.pdf',
                mimeType: 'application/pdf'
            })
        ])
    })

    it('rejects source document ids that are not owned by the selected task', async () => {
        const repository: jest.Mocked<KnowledgebaseRepositoryMock> = {
            findOne: jest.fn().mockResolvedValue({
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                workspaceId: null,
                createdById: 'user-1',
                status: 'ready',
                pipelineId: 'pipeline-1'
            } as Knowledgebase),
            delete: jest.fn()
        }
        const commandBus = { execute: jest.fn() }
        const taskService: KnowledgebaseTaskServiceMock = {
            createTask: jest.fn(),
            findOne: jest.fn(),
            findOneByOptions: jest.fn().mockResolvedValue({
                id: 'task-1',
                knowledgebaseId: 'kb-1',
                documents: [{ id: 'doc-1' }],
                context: { documents: [{ id: 'preview-doc-1' }] }
            }),
            update: jest.fn()
        }
        const service = createService({
            repository,
            commandBus,
            xpertService: { updateXpert: jest.fn() },
            taskService
        })

        await expect(
            runInRequestContext(() =>
                service.processTask('kb-1', 'task-1', {
                    stage: 'prod',
                    sources: { source: { documents: ['victim-document'] } }
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(taskService.update).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})
