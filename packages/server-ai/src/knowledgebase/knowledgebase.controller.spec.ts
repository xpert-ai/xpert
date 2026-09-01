import { KnowledgebasePermission, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { PaginationParams, RequestContext } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FindOperator, FindOptionsWhere } from 'typeorm'
import { Knowledgebase } from './knowledgebase.entity'
import { KnowledgebaseController } from './knowledgebase.controller'
import { KnowledgebaseService } from './knowledgebase.service'

describe('KnowledgebaseController generic CRUD access', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('routes count and pagination through the same owner/shared visibility filter as the main list', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const service = {
            getSafeReadRelations: jest.fn((relations: unknown) => relations),
            findAll: jest.fn().mockResolvedValue({ items: [], total: 2 })
        }
        const controller = new KnowledgebaseController(
            service as unknown as KnowledgebaseService,
            {} as CommandBus,
            {} as QueryBus
        )
        const where: FindOptionsWhere<Knowledgebase> = { type: KnowledgebaseTypeEnum.Standard }
        const pagination: PaginationParams<Knowledgebase> = {
            where,
            take: 20,
            skip: 0,
            order: {},
            withDeleted: false
        }

        await expect(controller.getCount(where)).resolves.toBe(2)
        await expect(controller.pagination(pagination)).resolves.toEqual({ items: [], total: 2 })

        for (const [options] of service.findAll.mock.calls) {
            expect(options).toEqual(
                expect.objectContaining({
                    where: [
                        expect.objectContaining({ type: KnowledgebaseTypeEnum.Standard, createdById: 'user-1' }),
                        expect.objectContaining({
                            type: KnowledgebaseTypeEnum.Standard,
                            permission: expect.anything(),
                            createdById: expect.anything()
                        })
                    ]
                })
            )
        }
        expect(service.findAll.mock.calls[0][0]).toEqual(expect.objectContaining({ take: 1, skip: 0 }))
        expect(service.findAll.mock.calls[1][0]).toEqual(expect.objectContaining({ take: 20, skip: 0 }))
    })

    it('keeps the dedicated public list able to request organization and public knowledgebases', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const service = {
            getSafeReadRelations: jest.fn((relations: unknown) => relations),
            findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const controller = new KnowledgebaseController(
            service as unknown as KnowledgebaseService,
            {} as CommandBus,
            {} as QueryBus
        )

        await controller.findAllByPublic({
            where: { type: KnowledgebaseTypeEnum.Standard },
            take: 20,
            skip: 0,
            order: {},
            withDeleted: false
        })

        expect(service.findAll).toHaveBeenCalledWith({
            take: 20,
            skip: 0,
            order: {},
            withDeleted: false,
            where: expect.objectContaining({
                type: KnowledgebaseTypeEnum.Standard,
                permission: expect.anything(),
                createdById: expect.anything()
            })
        })
        const permission = service.findAll.mock.calls[0][0].where.permission as FindOperator<KnowledgebasePermission>
        expect(permission.value).toEqual([KnowledgebasePermission.Organization, KnowledgebasePermission.Public])
    })

    it('applies owner or shared visibility to every client-supplied OR branch', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const service = {
            getSafeReadRelations: jest.fn((relations: unknown) => relations),
            findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
        }
        const controller = new KnowledgebaseController(
            service as unknown as KnowledgebaseService,
            {} as CommandBus,
            {} as QueryBus
        )

        await controller.findAll({
            where: [
                { type: KnowledgebaseTypeEnum.Standard, createdById: 'victim-user' },
                { name: 'Victim knowledgebase', permission: KnowledgebasePermission.Private }
            ],
            take: 20,
            skip: 0,
            order: {},
            withDeleted: false
        })

        const conditions = service.findAll.mock.calls[0][0].where
        expect(conditions).toHaveLength(4)
        expect(conditions[0]).toEqual(
            expect.objectContaining({ type: KnowledgebaseTypeEnum.Standard, createdById: 'user-1' })
        )
        expect(conditions[1]).toEqual(
            expect.objectContaining({
                type: KnowledgebaseTypeEnum.Standard,
                createdById: expect.anything(),
                permission: expect.anything()
            })
        )
        expect(conditions[2]).toEqual(expect.objectContaining({ name: 'Victim knowledgebase', createdById: 'user-1' }))
        expect(conditions[3]).toEqual(
            expect.objectContaining({
                name: 'Victim knowledgebase',
                createdById: expect.anything(),
                permission: expect.anything()
            })
        )
    })
})
