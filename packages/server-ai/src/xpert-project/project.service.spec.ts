import { IUser, IXpert } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Brackets, Repository, WhereExpressionBuilder } from 'typeorm'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { XpertProject } from './entities/project.entity'
import { XpertProjectService } from './project.service'
import { XpertProjectAccessService } from './services/project-access.service'
import { XpertProjectTaskService } from './services'
import { XpertProjectXpertBindingService } from './services/project-xpert-binding.service'

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
    } as unknown as XpertProjectXpertBindingService
) {
    return new XpertProjectService(
        repository,
        {} as CommandBus,
        {} as QueryBus,
        {} as XpertProjectTaskService,
        {} as XpertWorkspaceAccessService,
        {} as XpertWorkspaceService,
        accessService,
        publishedXpertAccess,
        xpertBindingService
    )
}
