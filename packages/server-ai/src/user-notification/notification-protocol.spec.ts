import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { ACTION_NOTIFICATION_ACCEPT, WORKBENCH_NOTIFICATION_ACCEPT, AGENT_OUTPUT_ACCEPT } from '@xpert-ai/contracts'
import { UserNotificationController } from './notification.controller'
import { UserNotificationService } from './notification.service'
import { NotificationRealtime } from './notification.realtime'
import { OutputPreferences } from './output/output-preferences'

describe('notification Workbench protocol negotiation', () => {
    let app: INestApplication, origin: string
    const service = { snapshot: jest.fn(), list: jest.fn(), read: jest.fn() }
    beforeAll(async () => {
        const module = await Test.createTestingModule({
            controllers: [UserNotificationController],
            providers: [
                { provide: UserNotificationService, useValue: service },
                { provide: NotificationRealtime, useValue: {} },
                { provide: OutputPreferences, useValue: {} }
            ]
        }).compile()
        app = module.createNestApplication({ logger: false })
        await app.listen(0, '127.0.0.1')
        origin = await app.getUrl()
    })
    beforeEach(() => jest.clearAllMocks())
    afterAll(() => app.close())
    it.each([
        [WORKBENCH_NOTIFICATION_ACCEPT, true, true, true],
        [ACTION_NOTIFICATION_ACCEPT, true, true, false],
        [AGENT_OUTPUT_ACCEPT, true, false, false],
        ['application/json', false, false, false]
    ])('only advertises supported targets for %s', async (accept, outputs, actions, views) => {
        const headers = { accept: String(accept) }
        await fetch(`${origin}/user-notifications/sync?client=desktop`, { headers })
        expect(service.snapshot).toHaveBeenCalledWith('desktop', outputs, actions, views)
        await fetch(`${origin}/user-notifications`, { headers })
        expect(service.list).toHaveBeenCalledWith(0, 30, outputs, false, actions, views)
        await fetch(`${origin}/user-notifications/11111111-1111-4111-8111-111111111111/read`, {
            method: 'PUT',
            headers
        })
        expect(service.read).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', views)
    })
})
