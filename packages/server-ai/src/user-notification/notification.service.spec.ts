import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import type { ActionNotificationPresentation } from '@xpert-ai/contracts'
import { AnnouncementService } from '../announcement/announcement.service'
import { ActionNotificationSources } from './actions/action-notification.sources'
import { UserNotificationService } from './notification.service'
import { UserNotificationEntity } from './notification.entities'
import { notificationScope } from './notification.scope'
import { OutputDispatch } from './output/output-dispatch'

jest.mock('@xpert-ai/server-core', () => ({ UserOrganization: class {} }))
jest.mock('../chat-conversation/conversation.entity', () => ({ ChatConversation: class {} }))
jest.mock('../announcement/announcement.service', () => ({ AnnouncementService: class {} }))
jest.mock('./notification.entities', () => ({ UserNotificationEntity: class {} }))
jest.mock('./output/output-dispatch', () => ({ OutputDispatch: class {} }))
jest.mock('./notification.scope', () => ({ notificationScope: jest.fn() }))
jest.mock('./notification.outbox', () => ({ enqueueNotification: jest.fn() }))

it('isolates failed action presentations across list, snapshot, count and click without changing pending state', async () => {
    const scope = { tenantId: randomUUID(), userId: randomUUID() }
    jest.mocked(notificationScope).mockReturnValue(scope)
    const rows = ['unavailable', 'healthy'].map((provider) =>
        Object.assign(new UserNotificationEntity(), {
            ...scope,
            id: randomUUID(),
            kind: 'action.required',
            actionState: 'pending',
            readAt: null,
            resolvedAt: null,
            createdAt: new Date(),
            source: { type: 'action', provider, key: randomUUID(), version: '1' }
        })
    )
    const presentation: ActionNotificationPresentation = {
        title: 'Current human action',
        state: 'pending',
        workbench: {
            target: 'project.pipelines',
            organizationId: null,
            projectId: randomUUID(),
            pipelineInstanceId: randomUUID(),
            pipelineRoundId: randomUUID(),
            pipelineNodeId: randomUUID()
        }
    }
    const query = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn(async () => [rows, rows.length])
    }
    const transaction = jest.fn()
    const module = await Test.createTestingModule({
        providers: [
            UserNotificationService,
            ActionNotificationSources,
            {
                provide: DataSource,
                useValue: {
                    transaction,
                    getRepository: () => ({
                        createQueryBuilder: () => query,
                        findBy: async () => rows,
                        findOneBy: async ({ id }: { id: string }) => rows.find((row) => row.id === id)
                    })
                }
            },
            { provide: AnnouncementService, useValue: { list: async () => ({ items: [], total: 0 }) } },
            { provide: QueryBus, useValue: {} },
            { provide: OutputDispatch, useValue: {} }
        ]
    }).compile()
    const service = module.get(UserNotificationService)
    const sources = module.get(ActionNotificationSources)
    let available = false
    sources.register({
        key: 'unavailable',
        resolve: async () => {
            if (!available) throw new Error('Provider failed with private-payload')
            return presentation
        }
    })
    sources.register({ key: 'healthy', resolve: async () => presentation })
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    try {
        const result = await service.list(0, 30, true, false, true)
        expect(result.items.map((item) => item.id)).toEqual([rows[1].id])
        expect(result).toMatchObject({ nextOffset: 2, hasMore: false })
        expect(await service.snapshot('desktop', true, true)).toMatchObject({
            pendingCount: 1,
            notifications: [{ id: rows[1].id }]
        })
        await expect(service.read(rows[0].id)).rejects.toMatchObject({ status: 404 })
        expect(transaction).not.toHaveBeenCalled()
        expect(rows.every((row) => row.actionState === 'pending' && !row.readAt && !row.resolvedAt)).toBe(true)
        expect(warn).toHaveBeenCalled()
        expect(JSON.stringify(warn.mock.calls)).not.toContain('private-payload')
        available = true
        const restored = await service.snapshot('desktop', true, true)
        expect(restored.pendingCount).toBe(2)
        expect(restored.notifications.map((item) => item.id)).toEqual(rows.map((row) => row.id))
    } finally {
        warn.mockRestore()
        await module.close()
    }
})
