import { IUser, IXpert } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Brackets, EntityManager, Repository, WhereExpressionBuilder } from 'typeorm'
import { ConnectorService } from '../connector/connector.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { XpertProject } from './entities/project.entity'
import { XpertProjectService } from './project.service'
import { XpertProjectAccessService } from './services/project-access.service'
import { XpertProjectContentService } from './services/project-content.service'
import { XpertProjectTaskService } from './services'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'
import { GetOwnedStorageFileQuery } from '../file-understanding/queries'

describe('XpertProjectService collaboration access', () => {
    beforeEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('requires both Project/Xpert binding access and published Xpert run access', async () => {
        const project = { id: 'project-1' } as XpertProject
        const accessService = {
            assertCanUseXpert: jest.fn().mockResolvedValue({ project, role: 'member' })
        }
        const publishedXpertAccess = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
        }
        const service = createService(
            {} as Repository<XpertProject>,
            accessService as unknown as XpertProjectAccessService,
            publishedXpertAccess as unknown as PublishedXpertAccessService
        )

        await expect(service.assertRuntimeAccess(project.id, 'xpert-1')).resolves.toBe(project)

        expect(accessService.assertCanUseXpert).toHaveBeenCalledWith(project.id, 'xpert-1')
        expect(publishedXpertAccess.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
    })

    it('lists Projects only through owner or active membership and returns the database count', async () => {
        const queryBuilder = {
            leftJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            setParameters: jest.fn().mockReturnThis(),
            skip: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'project-1' }], 7])
        }
        const repository = { createQueryBuilder: jest.fn().mockReturnValue(queryBuilder) }
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' } as IUser)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = createService(repository as unknown as Repository<XpertProject>)

        await expect(
            service.findAllMy({ take: 10, skip: 0, order: {}, where: {}, withDeleted: false })
        ).resolves.toEqual({
            items: [{ id: 'project-1' }],
            total: 7
        })

        expect(queryBuilder.leftJoin).toHaveBeenCalledWith(
            'project.memberships',
            'membership',
            'membership.userId = :userId AND membership.deletedAt IS NULL'
        )
        const accessBoundary = queryBuilder.andWhere.mock.calls[0][0]
        expect(accessBoundary).toBeInstanceOf(Brackets)
        const expression = { where: jest.fn().mockReturnThis(), orWhere: jest.fn().mockReturnThis() }
        accessBoundary.whereFactory(expression as unknown as WhereExpressionBuilder)
        expect(expression.where).toHaveBeenCalledWith('project.ownerId = :userId')
        expect(expression.orWhere).toHaveBeenCalledWith('membership.userId = :userId')
    })

    it('stores the current published Xpert when a historical version is selected', async () => {
        const legacy = {
            id: 'xpert-v1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            workspaceId: 'workspace-1',
            type: 'agent',
            slug: 'demo',
            latest: false
        } as IXpert
        const current = { ...legacy, id: 'xpert-current', latest: true }
        const project = {
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            xperts: []
        } as XpertProject
        const repository = { save: jest.fn(async (entity: XpertProject) => entity) }
        const accessService = { assertCanManage: jest.fn().mockResolvedValue({ project }) }
        const publishedXpertAccess = {
            getAccessiblePublishedXpert: jest.fn(async (id: string) => (id === legacy.id ? legacy : current))
        }
        const bindingService = {
            resolveCurrent: jest.fn().mockResolvedValue(current),
            normalize: jest.fn(async (entity: XpertProject) => entity),
            contains: jest.fn().mockReturnValue(false)
        }
        const service = createService(
            repository as unknown as Repository<XpertProject>,
            accessService as unknown as XpertProjectAccessService,
            publishedXpertAccess as unknown as PublishedXpertAccessService,
            bindingService as unknown as XpertProjectXpertBindingService
        )
        jest.spyOn(service, 'findOne').mockResolvedValue(project)

        await expect(service.addXpert(project.id, legacy.id)).resolves.toBe(project)

        expect(project.xperts).toEqual([current])
        expect(repository.save).toHaveBeenCalledWith(project)
    })

    it('notifies the scheduler when a Project Xpert is removed', async () => {
        const project = {
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            xperts: [{ id: 'xpert-current' }]
        } as XpertProject
        const repository = { save: jest.fn(async (entity: XpertProject) => entity) }
        const accessService = { assertCanManage: jest.fn().mockResolvedValue({ project }) }
        const bindingService = {
            resolveCurrentById: jest.fn().mockResolvedValue({ id: 'xpert-current' }),
            isSameXpert: jest.fn().mockReturnValue(true)
        }
        const eventEmitter = { emitAsync: jest.fn().mockResolvedValue([]) }
        const service = createService(
            repository as unknown as Repository<XpertProject>,
            accessService as unknown as XpertProjectAccessService,
            undefined,
            bindingService as unknown as XpertProjectXpertBindingService,
            undefined,
            undefined,
            eventEmitter as unknown as EventEmitter2
        )
        jest.spyOn(service, 'findOne').mockResolvedValue(project)

        await service.removeXpert(project.id, 'xpert-old')

        expect(eventEmitter.emitAsync).toHaveBeenCalledWith('xpert-project.xpert-removed', {
            tenantId: project.tenantId,
            organizationId: project.organizationId,
            projectId: project.id,
            xpertIds: ['xpert-old', 'xpert-current']
        })
    })

    it('authorizes new Project attachments through the owned StorageFile query', async () => {
        const existing = { id: 'storage-existing' }
        const canonical = { id: 'storage-new', createdById: 'user-1' }
        const project = { id: 'project-1', attachments: [existing] } as XpertProject
        const repository = { save: jest.fn() }
        const queryBus = { execute: jest.fn().mockResolvedValue(canonical) }
        const service = createService(repository as never, undefined, undefined, undefined, queryBus as never)
        jest.spyOn(service, 'findOne').mockResolvedValue(project)

        await service.addAttachments(project.id, [existing.id, canonical.id])

        expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetOwnedStorageFileQuery))
        expect((queryBus.execute.mock.calls[0][0] as GetOwnedStorageFileQuery).storageFileId).toBe(canonical.id)
        expect(project.attachments).toEqual([existing, canonical])
        expect(repository.save).toHaveBeenCalledWith(project)
    })

    it('cleans Project Connector bindings before deleting the Project', async () => {
        const projectRepository = {
            delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] })
        }
        const manager = {
            getRepository: jest.fn().mockReturnValue(projectRepository)
        }
        const repository = {
            manager: {
                transaction: jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
                    callback(manager as unknown as EntityManager)
                )
            }
        }
        const connectorService = {
            deleteProjectBindings: jest.fn().mockResolvedValue(undefined)
        }
        const service = createService(
            repository as unknown as Repository<XpertProject>,
            undefined,
            undefined,
            undefined,
            undefined,
            connectorService as unknown as ConnectorService
        )
        jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'project-1', tenantId: 'tenant-1' } as XpertProject)

        await service.deleteProject('project-1')

        expect(connectorService.deleteProjectBindings).toHaveBeenCalledWith(
            { projectId: 'project-1', tenantId: 'tenant-1' },
            manager
        )
        expect(projectRepository.delete).toHaveBeenCalledWith({
            id: 'project-1',
            tenantId: 'tenant-1',
            organizationId: expect.anything()
        })
        expect(connectorService.deleteProjectBindings.mock.invocationCallOrder[0]).toBeLessThan(
            projectRepository.delete.mock.invocationCallOrder[0]
        )
    })

    it('cleans Project Connector bindings before soft-deleting the Project', async () => {
        const project = { id: 'project-1', tenantId: 'tenant-1' } as XpertProject
        const projectRepository = {
            softRemove: jest.fn().mockResolvedValue(project)
        }
        const manager = {
            getRepository: jest.fn().mockReturnValue(projectRepository)
        }
        const repository = {
            manager: {
                transaction: jest.fn(async (callback: (entityManager: EntityManager) => Promise<unknown>) =>
                    callback(manager as unknown as EntityManager)
                )
            }
        }
        const connectorService = {
            deleteProjectBindings: jest.fn().mockResolvedValue(undefined)
        }
        const service = createService(
            repository as unknown as Repository<XpertProject>,
            undefined,
            undefined,
            undefined,
            undefined,
            connectorService as unknown as ConnectorService
        )
        jest.spyOn(service, 'findOne').mockResolvedValue(project)

        await service.softRemoveProject(project.id)

        expect(connectorService.deleteProjectBindings).toHaveBeenCalledWith(
            { projectId: project.id, tenantId: project.tenantId },
            manager
        )
        expect(projectRepository.softRemove).toHaveBeenCalledWith(project)
        expect(connectorService.deleteProjectBindings.mock.invocationCallOrder[0]).toBeLessThan(
            projectRepository.softRemove.mock.invocationCallOrder[0]
        )
    })
})

function createService(
    repository: Repository<XpertProject>,
    accessService: XpertProjectAccessService = {} as XpertProjectAccessService,
    publishedXpertAccess: PublishedXpertAccessService = {} as PublishedXpertAccessService,
    xpertBindingService: XpertProjectXpertBindingService = {
        resolveCurrent: async (xpert: IXpert) => xpert,
        normalize: async (project: XpertProject) => project,
        contains: (project: XpertProject, xpert: IXpert) =>
            project.xperts?.some((linkedXpert) => linkedXpert.id === xpert.id) ?? false
    } as unknown as XpertProjectXpertBindingService,
    queryBus: QueryBus = {} as QueryBus,
    connectorService: ConnectorService = {} as ConnectorService,
    eventEmitter: EventEmitter2 = {} as EventEmitter2
) {
    return new XpertProjectService(
        repository,
        {} as CommandBus,
        queryBus,
        {} as XpertProjectTaskService,
        {} as XpertWorkspaceAccessService,
        {} as XpertWorkspaceService,
        accessService,
        { initialize: jest.fn() } as unknown as XpertProjectContentService,
        publishedXpertAccess,
        connectorService,
        eventEmitter,
        xpertBindingService
    )
}
