import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { SuperAdminOrganizationScopeService } from '../shared/super-admin-organization-scope.service'
import { ChatConversationController } from './conversation.controller'
import { ChatConversationService } from './conversation.service'
import { ChatConversationGoalService } from './goal'

describe('ChatConversationController goal routes', () => {
    let controller: ChatConversationController
    let service: { findOneInOrganizationOrTenant: jest.Mock }
    let goalService: {
        clearGoalFromUser: jest.Mock
        getByConversationId: jest.Mock
        patchGoalFromUser: jest.Mock
        setGoalFromUser: jest.Mock
    }
    let organizationScopeService: { run: jest.Mock }

    beforeEach(() => {
        service = {
            findOneInOrganizationOrTenant: jest.fn().mockResolvedValue({
                id: 'scoped-conversation-1',
                threadId: 'thread-1'
            })
        }
        goalService = {
            clearGoalFromUser: jest.fn().mockResolvedValue(null),
            getByConversationId: jest.fn().mockResolvedValue({ id: 'goal-1' }),
            patchGoalFromUser: jest.fn().mockResolvedValue({ id: 'goal-1' }),
            setGoalFromUser: jest.fn().mockResolvedValue({ id: 'goal-1' })
        }
        organizationScopeService = {
            run: jest.fn((_organizationId: string | undefined, handler: () => Promise<unknown>) => handler())
        }

        controller = new ChatConversationController(
            service as unknown as ChatConversationService,
            goalService as unknown as ChatConversationGoalService,
            {} as CommandBus,
            {} as QueryBus,
            organizationScopeService as unknown as SuperAdminOrganizationScopeService
        )
    })

    it('resolves the scoped conversation before reading a goal', async () => {
        await controller.getGoal('requested-conversation-1', 'org-1')

        expect(organizationScopeService.run).toHaveBeenCalledWith('org-1', expect.any(Function))
        expect(service.findOneInOrganizationOrTenant).toHaveBeenCalledWith('requested-conversation-1')
        expect(goalService.getByConversationId).toHaveBeenCalledWith('scoped-conversation-1')
    })

    it('resolves the scoped conversation before patching a goal', async () => {
        await controller.updateGoal('requested-conversation-1', { status: 'paused' }, 'org-1')

        expect(service.findOneInOrganizationOrTenant).toHaveBeenCalledWith('requested-conversation-1')
        expect(goalService.patchGoalFromUser).toHaveBeenCalledWith('scoped-conversation-1', { status: 'paused' })
    })

    it('resolves the scoped conversation before clearing a goal', async () => {
        await controller.clearGoal('requested-conversation-1', 'org-1')

        expect(service.findOneInOrganizationOrTenant).toHaveBeenCalledWith('requested-conversation-1')
        expect(goalService.clearGoalFromUser).toHaveBeenCalledWith('scoped-conversation-1')
    })
})
