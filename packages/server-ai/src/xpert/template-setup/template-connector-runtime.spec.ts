import { AgentMiddlewareRegistry, type AgentMiddlewareRuntimeApi } from '@xpert-ai/plugin-sdk'
import {
    type IWFNMiddleware,
    type AssistantTemplateSetup,
    type TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { createAgentMiddlewareEntries } from '../../shared/agent/middleware'
import { templateConnectorSelection } from './template-connector-selection'
import { getConnectorMiddlewareScope } from '../../shared/agent/connector-runtime'

const node = (key: string, provider: string): TXpertTeamNode => ({
    key,
    type: 'workflow',
    position: { x: 0, y: 0 },
    entity: {
        id: key,
        key,
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider,
        options: { provider: 'fixture' }
    } as IWFNMiddleware
})
const setup = (status: 'ready' | 'expired'): AssistantTemplateSetup => ({
    assistantId: 'assistant',
    state: { revision: 1, preferences: {}, connectors: { sync: { choice: 'binding', bindingId: 'selected' } } },
    connectors: [
        {
            key: 'sync',
            provider: 'fixture',
            required: false,
            purpose: 'Sync',
            permissions: [],
            status,
            options: [{ bindingId: 'selected', label: 'Fixture', status: 'active', runtimeUsage: 'middleware' }]
        }
    ],
    routines: []
})

describe('template selection to runtime tool construction', () => {
    const registry = Object.create(AgentMiddlewareRegistry.prototype) as AgentMiddlewareRegistry
    afterEach(() => jest.restoreAllMocks())
    it('passes the same selected binding into both tool construction and credential scope', async () => {
        const createMiddleware = jest.fn(() => ({ name: 'Fixture' }))
        jest.spyOn(registry, 'get').mockReturnValue({
            meta: { name: 'fixture', label: { en_US: 'Fixture' } },
            createMiddleware
        })
        const selected = templateConnectorSelection([node('sync', 'ConnectorMiddleware')], setup('ready'))
        const scope = getConnectorMiddlewareScope(selected.nodes, [{ bindingId: 'selected', provider: 'fixture' }])
        const entries = await createAgentMiddlewareEntries(selected.nodes, registry, {
            tenantId: 'tenant',
            userId: 'user',
            tools: new Map(),
            runtime: {} as AgentMiddlewareRuntimeApi
        })
        expect(createMiddleware).toHaveBeenCalledWith(
            { provider: 'fixture', connectorId: 'selected' },
            expect.any(Object)
        )
        expect(scope.connectorBindingIds).toEqual(['selected'])
        expect(entries.map((entry) => entry.key)).toEqual(['sync'])
    })
    it('does not construct expired connector tools and retains following middleware keys', async () => {
        const createMiddleware = jest.fn(() => ({ name: 'Files' }))
        const get = jest
            .spyOn(registry, 'get')
            .mockReturnValue({ meta: { name: 'files', label: { en_US: 'Files' } }, createMiddleware })
        const selected = templateConnectorSelection(
            [node('sync', 'ConnectorMiddleware'), node('files', 'SandboxFile')],
            setup('expired')
        )
        const entries = await createAgentMiddlewareEntries(selected.nodes, registry, {
            tenantId: 'tenant',
            userId: 'user',
            tools: new Map(),
            runtime: {} as AgentMiddlewareRuntimeApi
        })
        expect(get).toHaveBeenCalledTimes(1)
        expect(get).toHaveBeenCalledWith('SandboxFile')
        expect(entries.map((entry) => entry.key)).toEqual(['files'])
    })
})
