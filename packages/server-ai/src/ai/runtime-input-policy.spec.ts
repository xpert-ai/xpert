import { IApiPrincipal, RolesEnum, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { applyRuntimeInputPolicy, assertRuntimeInputPolicy } from './runtime-input-policy'

describe('managed application run admission', () => {
    beforeEach(() =>
        jest
            .spyOn(RequestContext, 'currentUser')
            .mockReturnValue({ role: { name: RolesEnum.APP_USER } } as ReturnType<typeof RequestContext.currentUser>)
    )
    afterEach(() => jest.restoreAllMocks())
    const request = {
        assistant_id: 'assigned-assistant',
        input: { action: 'send', message: { input: { input: 'Hello' } } }
    }
    it('rejects configuration overrides for a technical credential despite incidental edit permission', () => {
        const principal: IApiPrincipal = {
            id: 'technical',
            tenantId: 'tenant',
            type: UserType.COMMUNICATION,
            principalType: 'api_key',
            apiKeyUserId: 'technical',
            resourceScope: { kind: 'assistant', xpertId: 'assistant' },
            apiKey: { token: 'fixture', tenantId: 'tenant', userId: 'technical' }
        }
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue(principal)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        expect(() => assertRuntimeInputPolicy({ ...request, config: { configurable: { isDraft: true } } })).toThrow()
        expect(() => assertRuntimeInputPolicy(request)).not.toThrow()
    })
    it('accepts a business message', () => expect(() => assertRuntimeInputPolicy(request)).not.toThrow())
    it('accepts native regeneration of a restored conversation without a Project', () => {
        const result = assertRuntimeInputPolicy({
            assistant_id: 'assigned-assistant',
            input: {
                input: { input: 'Hello' },
                retry: true,
                id: 'message',
                executionId: 'execution',
                conversationId: 'conversation',
                projectId: null,
                projectSelection: { mode: 'none' }
            },
            context: { projectId: null },
            on_disconnect: 'continue'
        })
        expect(result.input).toMatchObject({ retry: true, executionId: 'execution', projectId: undefined })
        expect(result.context).toEqual({ projectId: undefined })
    })
    it('accepts ChatKit transport recovery without execution overrides', () =>
        expect(() =>
            assertRuntimeInputPolicy({
                ...request,
                on_disconnect: 'continue',
                stream_resumable: true
            })
        ).not.toThrow())
    it.each([
        { config: { configurable: { model: 'other' } } },
        { input: { action: 'send', environmentId: 'other' } },
        { input: { action: 'resume', patch: { agentKey: 'other' } } },
        { input: { action: 'send', isDraft: true } },
        { input: { ...request.input, unexpected: true } },
        { input: { action: 'send', message: { input: { input: 'Hello', model: 'other' } } } },
        { input: { input: { input: 'Hello', runtimeResources: { plugins: [] } } } },
        { input: { input: { input: 'Hello' }, state: { human: { model: 'other' } } } },
        { input: { input: { input: 'Hello' }, state: { agent: { prompt: 'other' } } } },
        { stream_mode: ['debug'] },
        { stream_subgraphs: true },
        { role: 'ADMIN' }
    ])('rejects unsafe runtime overrides %j', (override) =>
        expect(() => assertRuntimeInputPolicy({ ...request, ...override })).toThrow()
    )
    it('accepts the ChatKit business state while discarding all client runtime context except authorized Project scope', () => {
        const human = { input: 'Hello', runtimeCapabilities: { skills: { workspaceId: 'other', ids: ['other'] } } }
        const result = applyRuntimeInputPolicy({
            assistant_id: 'assigned-assistant',
            on_disconnect: 'continue',
            input: {
                id: 'message',
                input: human,
                state: { human },
                projectSelection: { mode: 'existing', projectId: 'project' }
            },
            context: {
                projectId: 'project',
                env: { model: 'other', api_key: 'override' },
                desktopShellGrantId: 'other',
                view: { selectedRecord: 'record' }
            }
        })
        expect(result.context).toEqual({ projectId: 'project' })
        expect(result.input).toEqual({
            id: 'message',
            input: { input: 'Hello' },
            state: { human: { input: 'Hello' } },
            projectSelection: { mode: 'existing', projectId: 'project' }
        })
    })
    it('retains existing behavior with authoring permission', () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as ReturnType<
            typeof RequestContext.currentUser
        >)
        jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true)
        expect(() => assertRuntimeInputPolicy({ ...request, config: { recursion_limit: 20 } })).not.toThrow()
    })
})
