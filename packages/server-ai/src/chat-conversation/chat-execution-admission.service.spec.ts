jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { InjectionToken } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { of } from 'rxjs'
import { ChatExecutionAdmissionService } from './chat-execution-admission.service'
import { ChatCommonHandler } from '../chat/commands/handlers/chat-common.handler'
import { AdmittedChatCommonHandler } from '../chat/commands/handlers/admitted-chat-common.handler'
import { XpertChatHandler } from '../xpert/commands/handlers/chat.handler'
import { AdmittedXpertChatHandler } from '../xpert/commands/handlers/admitted-chat.handler'
import { XpertChatCommand } from '../xpert/commands/chat.command'
import { DataSource } from 'typeorm'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ThreadRunControlService } from './thread-run-control.service'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'

describe('root writer admission', () => {
    afterEach(() => jest.restoreAllMocks())
    it.each([
        [AdmittedChatCommonHandler, ChatCommonHandler],
        [AdmittedXpertChatHandler, XpertChatHandler]
    ])('inherits handler constructor injection (%p)', async (wrapper, base) => {
        expect(Reflect.getMetadata('design:paramtypes', wrapper)).toEqual(
            Reflect.getMetadata('design:paramtypes', base)
        )
        const metadata: Array<{ index: number; param: InjectionToken }> =
            Reflect.getMetadata('self:paramtypes', wrapper) ?? []
        const inherited: InjectionToken[] = Reflect.getMetadata('design:paramtypes', wrapper)
        const dependencies = inherited.map(
            (param, index) => metadata.find((item) => item.index === index)?.param ?? param
        )
        const module = await Test.createTestingModule({
            providers: [
                wrapper,
                { provide: ChatExecutionAdmissionService, useValue: {} },
                ...dependencies.map((provide) => ({ provide, useValue: {} }))
            ]
        }).compile()
        expect(module.get(wrapper)).toBeInstanceOf(base)
        await module.close()
    })
    it('rejects another writer and never enters the graph after a reserved automatic reply is stopped', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const thread = new ChatConversationThread({
            threadId: 'thread',
            status: 'busy',
            runControl: { executionId: 'other', state: 'running' }
        })
        const repo = {
            createQueryBuilder: () => ({
                insert: () => ({ values: () => ({ orIgnore: () => ({ execute: async () => undefined }) }) })
            }),
            findOne: async () => thread
        }
        const manager = { getRepository: () => repo }
        const database = Object.assign(Object.create(DataSource.prototype) as DataSource, {
            getRepository: () => ({
                findOneBy: async () => new ChatConversation({ id: 'conversation', threadId: 'thread' })
            }),
            transaction: async (work: (value: typeof manager) => Promise<unknown>) => work(manager)
        })
        const service = new ChatExecutionAdmissionService(database, Object.create(ThreadRunControlService.prototype))
        const execute = jest.fn(async () => of(undefined))
        const request: XpertChatCommand['request'] = {
            action: 'send',
            conversationId: 'conversation',
            message: { input: { input: 'text' } }
        }
        await expect(service.run(request, { execution: { id: 'new' } }, execute)).rejects.toThrow()
        thread.runControl = null
        thread.status = 'interrupted'
        await expect(service.run(request, { automatic: true, execution: { id: 'new' } }, execute)).rejects.toThrow()
        expect(execute).not.toHaveBeenCalled()
    })
})
