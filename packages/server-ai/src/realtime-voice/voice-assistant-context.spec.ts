import { IXpert, IWFNMiddleware, WorkflowNodeTypeEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { voiceAssistantContext, voiceDelegationInput, voiceInstructions } from './voice-assistant-context'

describe('published voice capability context', () => {
    const registry = {
        get: jest.fn(() => ({
            meta: {
                name: 'WebTools',
                label: { en_US: 'Web tools' },
                description: { en_US: 'Search and fetch web pages' }
            },
            getToolNames: () => ['web_search', 'web_fetch'],
            createMiddleware: jest.fn()
        }))
    }
    const middleware: IWFNMiddleware = {
        id: 'web',
        key: 'web',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        title: 'Network',
        provider: 'WebTools',
        options: { secret: 'must-not-enter-prompt' },
        tools: { web_fetch: { enabled: false } }
    }
    const assistant: IXpert = {
        name: 'Published Assistant',
        slug: 'published-assistant',
        type: XpertTypeEnum.Agent,
        agent: { key: 'main' },
        graph: {
            nodes: [
                { key: 'main', type: 'agent', position: { x: 0, y: 0 }, entity: { key: 'main' } },
                { key: 'web', type: 'workflow', position: { x: 0, y: 0 }, entity: middleware },
                {
                    key: 'unconnected',
                    type: 'workflow',
                    position: { x: 0, y: 0 },
                    entity: { ...middleware, provider: 'SecretTools' }
                }
            ],
            connections: [{ type: 'workflow', key: 'connection', from: 'main', to: 'web' }]
        }
    }
    it('advertises connected enabled tools without instantiating middleware or exposing options', () => {
        const context = voiceAssistantContext(assistant, registry)
        expect(context.capabilities).toEqual([
            { name: 'WebTools', description: 'Search and fetch web pages', tools: ['web_search'] }
        ])
        const prompt = voiceInstructions(context, [], [])
        expect(prompt).toContain('delegate_task')
        expect(prompt).toContain('web_search')
        expect(prompt).not.toContain('web_fetch')
        expect(prompt).not.toContain('SecretTools')
        expect(prompt).not.toContain('must-not-enter-prompt')
    })
    it('does not advertise a missing provider or entirely disabled middleware', () => {
        expect(
            voiceAssistantContext(assistant, {
                get: () => {
                    throw new Error('uninstalled')
                }
            }).capabilities
        ).toEqual([])
        const disabled = structuredClone(assistant)
        const node = disabled.graph.nodes[1]
        const disabledMiddleware: IWFNMiddleware = { ...middleware, tools: { web_fetch: false, web_search: false } }
        if (node.type === 'workflow') node.entity = disabledMiddleware
        expect(voiceAssistantContext(disabled, registry).capabilities).toEqual([])
    })
    it('retains current request and context as delimited data, including interrupted speech', () => {
        const context = [
            { role: 'user', text: 'Only use official sources' },
            { role: 'assistant', text: 'Let me check', interrupted: true }
        ]
        const input = voiceDelegationInput('Find the release notes', context)
        expect(JSON.parse(input.slice(input.indexOf('\n') + 1))).toEqual({
            request: 'Find the release notes',
            recentConversation: context
        })
        expect(input).toContain('actually invoke the search tool')
    })
})
