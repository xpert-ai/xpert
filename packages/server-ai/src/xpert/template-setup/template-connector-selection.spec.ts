import { templateConnectorSelection } from './template-connector-selection'
import {
    WorkflowNodeTypeEnum,
    type AssistantTemplateSetup,
    type IWFNMiddleware,
    type TXpertTeamNode
} from '@xpert-ai/contracts'

const node: TXpertTeamNode = {
    key: 'connector',
    type: 'workflow',
    entity: {
        id: 'connector',
        key: 'connector',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: 'ConnectorMiddleware',
        options: { provider: 'calendar' }
    } as IWFNMiddleware,
    position: { x: 0, y: 0 }
}
const setup = (status: AssistantTemplateSetup['connectors'][number]['status']): AssistantTemplateSetup => ({
    assistantId: 'assistant',
    state: { revision: 1, preferences: {}, connectors: { calendar: { choice: 'binding', bindingId: 'selected' } } },
    connectors: [
        {
            key: 'calendar',
            provider: 'calendar',
            required: false,
            purpose: 'Read',
            permissions: [],
            status,
            options: [{ bindingId: 'selected', label: 'Account', status: 'active', runtimeUsage: 'middleware' }]
        }
    ],
    routines: []
})

describe('template connection selection at runtime', () => {
    it.each(['skipped', 'expired', 'unavailable', 'requires_auth'] as const)(
        'removes optional %s tools without breaking local tools',
        (status) => {
            const result = templateConnectorSelection([node], setup(status))
            expect(result.nodes).toEqual([])
            expect(result.bindingIds).toEqual([])
        }
    )
    it('pins the exact selected connection without mutating the published graph', () => {
        const result = templateConnectorSelection([node], setup('ready'))
        expect(result.bindingIds).toEqual(['selected'])
        expect(result.nodes[0].entity).toMatchObject({ options: { provider: 'calendar', connectorId: 'selected' } })
        expect(node.entity).toMatchObject({ options: { provider: 'calendar' } })
    })
    it('preserves legacy graphs without template declarations', () => {
        expect(templateConnectorSelection([node]).nodes).toEqual([node])
    })
})
