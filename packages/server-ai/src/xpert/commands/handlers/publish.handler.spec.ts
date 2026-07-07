import { BadRequestException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { I18nService } from 'nestjs-i18n'

jest.mock('@xpert-ai/server-core', () => ({
    RequestContext: {
        currentUserId: jest.fn(),
        getLanguageCode: jest.fn().mockReturnValue('en')
    }
}))

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../xpert-agent', () => ({
    XpertAgentService: class XpertAgentService {}
}))

jest.mock('../../../prompt-workflow', () => ({
    PromptWorkflowService: class PromptWorkflowService {}
}))

jest.mock('../../types', () => ({
    EventName_XpertPublished: 'xpert.published'
}))

import { RequestContext } from '@xpert-ai/server-core'
import { IWorkflowNode, WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { XpertAgentService } from '../../../xpert-agent'
import { XpertPrincipalService } from '../../xpert-principal.service'
import { Xpert } from '../../xpert.entity'
import { XpertService } from '../../xpert.service'
import { XpertPublishCommand } from '../publish.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'
import { XpertPublishHandler } from './publish.handler'

describe('XpertPublishHandler', () => {
    function createHandler(xpertOverrides: Partial<Xpert> = {}) {
        const xpert = {
            id: 'xpert-1',
            slug: 'support-expert',
            name: 'Support Expert',
            tenantId: 'tenant-1',
            organizationId: null,
            createdById: 'user-1',
            workspaceId: null,
            type: XpertTypeEnum.Agent,
            version: null,
            latest: false,
            draft: {
                team: {},
                nodes: [],
                connections: []
            },
            userGroups: [],
            agent: {
                id: 'agent-1',
                options: {
                    hidden: true
                },
                key: 'Agent_primary'
            },
            agents: [],
            ...xpertOverrides
        } as Xpert

        const xpertService = {
            findOne: jest.fn().mockResolvedValue(xpert),
            findAll: jest.fn().mockResolvedValue({ items: [xpert] }),
            save: jest.fn().mockImplementation(async (entity: Xpert) => entity)
        }
        const xpertPrincipalService = {
            ensurePrincipalUser: jest.fn().mockResolvedValue({
                id: 'assistant-user-1',
                tenantId: 'tenant-1'
            })
        }
        const commandBus = {
            execute: jest.fn()
        }
        const eventEmitter = {
            emitAsync: jest.fn()
        }

        const handler = new XpertPublishHandler(
            xpertService as unknown as XpertService,
            {} as unknown as XpertAgentService,
            { translate: jest.fn() } as unknown as I18nService,
            commandBus as unknown as CommandBus,
            eventEmitter as unknown as EventEmitter2,
            undefined,
            xpertPrincipalService as unknown as XpertPrincipalService
        )

        return { handler, xpertService, xpertPrincipalService, commandBus, eventEmitter, xpert }
    }

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('allows tenant creators to publish without user groups', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        const { handler, xpert } = createHandler()
        const publishResult = { id: 'xpert-1', version: '1' }
        const publishSpy = jest.spyOn(handler, 'publish').mockResolvedValue(publishResult as Xpert)

        const result = await handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))

        expect(result).toBe(publishResult)
        expect(publishSpy).toHaveBeenCalledWith(xpert, '1', xpert.draft, undefined)
    })

    it('passes marketplace metadata into the publish snapshot step', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')

        const { handler, xpert } = createHandler()
        const publishSpy = jest.spyOn(handler, 'publish').mockResolvedValue({ id: 'xpert-1', version: '1' } as Xpert)
        const marketplace = {
            summary: 'Handles support triage.',
            businessCategories: ['customer-service' as const],
            capabilityTags: ['triage']
        }

        await handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes', marketplace))

        expect(publishSpy).toHaveBeenCalledWith(xpert, '1', xpert.draft, marketplace)
    })

    it('still requires a user group when the publisher is not the creator', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-2')

        const { handler } = createHandler()

        await expect(handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))).rejects.toThrow(
            BadRequestException
        )
    })

    it('still requires a user group for organization-scoped xperts when the publisher is not the creator', async () => {
        ;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-2')

        const { handler } = createHandler({
            organizationId: 'org-1'
        })

        await expect(handler.execute(new XpertPublishCommand('xpert-1', false, '', 'release notes'))).rejects.toThrow(
            BadRequestException
        )
    })

    it('ensures the xpert principal user before publishing enabled schedule triggers', async () => {
        const { handler, xpert, xpertPrincipalService, commandBus } = createHandler({
            userId: null,
            draft: {
                team: {},
                nodes: [
                    {
                        key: 'Schedule_trigger',
                        type: 'workflow',
                        entity: {
                            id: 'schedule-trigger-1',
                            key: 'Schedule_trigger',
                            type: WorkflowNodeTypeEnum.TRIGGER,
                            from: 'schedule',
                            config: {
                                enabled: true,
                                cron: '20 * * * *',
                                task: 'pull'
                            }
                        } as unknown as IWorkflowNode,
                        position: {
                            x: 0,
                            y: 0
                        }
                    }
                ],
                connections: []
            }
        })

        await handler.publish(xpert, '1', xpert.draft)

        expect(xpertPrincipalService.ensurePrincipalUser).toHaveBeenCalled()
        expect(commandBus.execute).toHaveBeenCalledWith(expect.any(XpertPublishTriggersCommand))
        expect(xpertPrincipalService.ensurePrincipalUser.mock.invocationCallOrder[0]).toBeLessThan(
            commandBus.execute.mock.invocationCallOrder[0]
        )
    })
})
