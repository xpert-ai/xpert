import { RolesEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatConversationPublicDTO } from './chat-conversation-public.dto'
import { assertSafeChatConversationRelations } from '../conversation-relations'

describe('application conversation presentation', () => {
    afterEach(() => jest.restoreAllMocks())
    it('returns business identity without persisted execution configuration', () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.APP_USER } })
        const source = {
            id: 'conversation', threadId: 'thread', title: 'Business task', xpertId: 'assistant',
            projectId: 'project', parameters: { env: { private: 'internal' } }
        }
        const dto = new ChatConversationPublicDTO(source)
        expect(dto).toMatchObject({ id: 'conversation', threadId: 'thread', title: 'Business task' })
        expect(JSON.stringify(dto)).not.toMatch(/parameters|private|internal/)
        expect(() => assertSafeChatConversationRelations(['xpert.agent'])).toThrow()
        expect(() => assertSafeChatConversationRelations(['executions'])).toThrow()
        expect(() => assertSafeChatConversationRelations(['project', 'xpert'])).not.toThrow()
    })
    it('preserves the regular platform DTO behavior', () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } })
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        const source = { title: 'Task', parameters: { input: 'Hello' } }
        expect(new ChatConversationPublicDTO(source)).toMatchObject(source)
        expect(() => assertSafeChatConversationRelations(['executions'])).not.toThrow()
    })
})
